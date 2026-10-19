import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import {
  ClientRequestFailedError,
  MessageService,
  MESSAGE_MODEL_NAME,
  MESSAGE_ARCHIVE_MODEL_NAME,
  MESSAGE_REQUEST_MODEL_NAME,
} from '@web-ts-toolkit/message-service';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/errors';
import { UserModel } from '../src/models';
import { startExampleServer } from '../src/server';
import { clearSession } from '../src/session';

type Login = { token: string; user: { id: string; email: string; displayName: string } };
type TemplateCase = {
  templateCd: string;
  input: Record<string, unknown>;
  stored: Record<string, unknown>;
  limits: Record<string, number>;
  emailField?: string;
  content: (actor: string, recipient: string) => { senderContent: { long: string }; receiverContent: { long: string } };
};

const recipientEmail = 'validation-recipient@example.test';
const templates: TemplateCase[] = [
  {
    templateCd: 'team-invitation',
    input: { inviteeEmail: recipientEmail, organizationName: 'Research Team' },
    stored: { inviteeEmail: recipientEmail, organizationName: 'Research Team' },
    limits: { organizationName: 80 },
    emailField: 'inviteeEmail',
    content: (actor) => ({
      senderContent: { long: `You invited ${recipientEmail} to join Research Team.` },
      receiverContent: { long: `${actor} invited you to join Research Team.` },
    }),
  },
  {
    templateCd: 'task-assignment',
    input: {
      toUserEmail: recipientEmail,
      taskTitle: 'Review notes',
      taskDescription: 'Review the meeting notes.',
      dueDate: '2026-11-01',
    },
    stored: {
      taskTitle: 'Review notes',
      taskDescription: 'Review the meeting notes.',
      dueDate: '2026-11-01',
      status: 'pending',
    },
    limits: { taskTitle: 200, taskDescription: 2000 },
    emailField: 'toUserEmail',
    content: (actor, recipient) => ({
      senderContent: { long: `You assigned "Review notes" to ${recipient}.` },
      receiverContent: { long: `${actor} assigned you "Review notes". Due: 2026-11-01` },
    }),
  },
  {
    templateCd: 'approval-request',
    input: {
      toUserEmail: recipientEmail,
      requestTitle: 'Travel budget',
      requestDetails: 'Conference travel.',
      amount: 125,
    },
    stored: { requestTitle: 'Travel budget', requestDetails: 'Conference travel.', amount: 125, status: 'pending' },
    limits: { requestTitle: 200, requestDetails: 2000 },
    emailField: 'toUserEmail',
    content: (actor, recipient) => ({
      senderContent: { long: `You requested approval for "Travel budget" from ${recipient}.` },
      receiverContent: { long: `${actor} requests approval for "Travel budget". Amount: $125\n\nConference travel.` },
    }),
  },
  {
    templateCd: 'direct-message',
    input: { toUserEmail: recipientEmail, subject: 'Meeting notes', body: 'Please review.' },
    stored: { subject: 'Meeting notes', body: 'Please review.', read: false },
    limits: { subject: 200, body: 5000 },
    emailField: 'toUserEmail',
    content: (actor, recipient) => ({
      senderContent: { long: `You sent "Meeting notes" to ${recipient}.` },
      receiverContent: { long: `From ${actor}:\n\nPlease review.` },
    }),
  },
  {
    templateCd: 'system-announcement',
    input: { title: 'Maintenance', body: 'Please save your work.', priority: 'high' },
    stored: { title: 'Maintenance', body: 'Please save your work.', priority: 'high' },
    limits: { title: 200, body: 5000 },
    content: () => ({
      senderContent: { long: 'Your announcement "Maintenance" has been broadcast.' },
      receiverContent: { long: 'Please save your work.' },
    }),
  },
];

const invalidCases = templates.flatMap((template) => {
  const required = Object.keys(template.limits).filter((field) => field !== 'taskDescription');
  if (template.emailField) required.push(template.emailField);
  return [
    ...required.map((field) => {
      const payload = { ...template.input };
      delete payload[field];
      return { templateCd: template.templateCd, reason: `missing ${field}`, payload };
    }),
    ...required.map((field) => ({
      templateCd: template.templateCd,
      reason: `blank ${field}`,
      payload: { ...template.input, [field]: ' \t ' },
    })),
    ...Object.entries(template.limits).map(([field, max]) => ({
      templateCd: template.templateCd,
      reason: `oversized ${field}`,
      payload: { ...template.input, [field]: 'x'.repeat(max + 1) },
    })),
    ...(template.emailField
      ? [
          {
            templateCd: template.templateCd,
            reason: 'invalid email',
            payload: { ...template.input, [template.emailField]: 'not-an-email' },
          },
        ]
      : []),
  ];
});
invalidCases.push(
  {
    templateCd: 'task-assignment',
    reason: 'non-string description',
    payload: { ...templates[1].input, taskDescription: 12 },
  },
  { templateCd: 'task-assignment', reason: 'non-string due date', payload: { ...templates[1].input, dueDate: 12 } },
  { templateCd: 'approval-request', reason: 'non-number amount', payload: { ...templates[2].input, amount: '125' } },
  { templateCd: 'direct-message', reason: 'non-string subject', payload: { ...templates[3].input, subject: 12 } },
  {
    templateCd: 'system-announcement',
    reason: 'invalid priority',
    payload: { ...templates[4].input, priority: 'urgent' },
  },
);

let server: Awaited<ReturnType<typeof startExampleServer>>;
let baseUrl: string;
let sender: Login;
let recipient: Login;
let Message: mongoose.Model<unknown>;
let Archive: mongoose.Model<unknown>;
let Reservation: mongoose.Model<unknown>;
const getModel = vi.fn((name: string) => mongoose.model(name) as mongoose.Model<unknown>);
const service = new MessageService({ getModel });

async function post(path: string, body: Record<string, unknown>, token = sender?.token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-session-token': token } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

function directCreate(templateCd: string, payload: Record<string, unknown>, clientRequestId?: string) {
  return service.createMessage({
    templateCd,
    user: { _id: sender.user.id, displayName: 'Trusted actor', roles: ['authenticated'] },
    payload,
    clientRequestId,
  });
}

async function counts() {
  return {
    messages: await Message.countDocuments(),
    archives: await Archive.countDocuments(),
    reservations: await Reservation.countDocuments(),
    users: await UserModel.countDocuments(),
  };
}

beforeAll(async () => {
  server = await startExampleServer({ port: 0, host: '127.0.0.1', signals: false });
  baseUrl = `http://127.0.0.1:${(server.server.address() as AddressInfo).port}`;
  for (const email of ['validation-sender@example.test', recipientEmail]) {
    const login = await post('/api/auth/login', { email });
    expect(login.status).toBe(200);
    if (!sender) sender = login.body.data;
    else recipient = login.body.data;
  }
  Message = mongoose.model(MESSAGE_MODEL_NAME);
  Archive = mongoose.model(MESSAGE_ARCHIVE_MODEL_NAME);
  Reservation = mongoose.model(MESSAGE_REQUEST_MODEL_NAME);
  expect((await mongoose.connection.db!.admin().command({ hello: 1 })).setName).toEqual(expect.any(String));
}, 60_000);

afterEach(() => {
  vi.restoreAllMocks();
  getModel.mockClear();
});

afterAll(async () => {
  clearSession(sender?.token);
  clearSession(recipient?.token);
  await server?.shutdown();
});

describe.each(['HTTP', 'direct'] as const)('MSGA-09 %s template preparation', (transport) => {
  const create = async (templateCd: string, payload: Record<string, unknown>, clientRequestId?: string) => {
    if (transport === 'direct') {
      return (await directCreate(templateCd, payload, clientRequestId)).map((message) => message.toObject());
    }
    const result = await post(`/api/messages/new/${templateCd}`, {
      ...payload,
      ...(clientRequestId === undefined ? {} : { clientRequestId }),
    });
    expect(result.status).toBe(200);
    return result.body;
  };

  const expectFailure = async (
    templateCd: string,
    payload: Record<string, unknown>,
    status: number,
    message: string,
    clientRequestId?: string,
  ) => {
    if (transport === 'direct') {
      const error = await directCreate(templateCd, payload, clientRequestId).catch((error: unknown) => error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ statusCode: status, message });
    } else {
      expect(
        await post(`/api/messages/new/${templateCd}`, { ...payload, ...(clientRequestId ? { clientRequestId } : {}) }),
      ).toEqual({
        status,
        body: { message },
      });
    }
  };

  it.each(invalidCases)(
    'rejects $templateCd: $reason before recipient lookup or effects',
    async ({ templateCd, payload }) => {
      const before = await counts();
      const lookup = vi.spyOn(UserModel, 'findOne');
      const broadcast = vi.spyOn(UserModel, 'find');
      const persist = vi.spyOn(Message, 'create');
      await expectFailure(templateCd, payload, 400, 'Invalid message payload.');
      // HTTP session authentication legitimately reads the actor by _id, never by email.
      expect(lookup.mock.calls.filter(([filter]) => Object.hasOwn(filter ?? {}, 'email'))).toEqual([]);
      expect(broadcast).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
      expect(getModel).not.toHaveBeenCalled();
      expect(await counts()).toEqual(before);
    },
  );

  it.each(templates)('normalizes $templateCd and keeps trusted rendering/persisted data sources', async (template) => {
    const payload = {
      ...Object.fromEntries(
        Object.entries(template.input).map(([field, value]) => [
          field,
          typeof value === 'string' && field !== 'priority'
            ? `  ${field === template.emailField ? value.toUpperCase() : value}  `
            : value,
        ]),
      ),
      templateData: { senderName: 'UNTRUSTED', body: 'UNTRUSTED' },
      senderName: 'UNTRUSTED',
      inviterName: 'UNTRUSTED',
      status: 'approved',
      read: true,
    };
    const original = structuredClone(payload);
    const lookup = vi.spyOn(UserModel, 'findOne');
    const messages = await create(template.templateCd, payload);
    expect(messages.length).toBeGreaterThan(0);
    if (template.emailField) {
      expect(messages).toHaveLength(1);
      expect(lookup).toHaveBeenCalledWith({ email: recipientEmail });
      expect(String(messages[0].toUser)).toBe(recipient.user.id);
    } else {
      const eligible = await UserModel.find({ _id: { $ne: sender.user.id } });
      expect(messages.map((message: { toUser: unknown }) => String(message.toUser)).sort()).toEqual(
        eligible.map((user) => String(user._id)).sort(),
      );
    }
    const actor = transport === 'direct' ? 'Trusted actor' : sender.user.id;
    for (const message of messages) {
      expect(message).toMatchObject(template.content(actor, recipient.user.displayName));
      expect(message.payload).toEqual(template.stored);
      const stored = await Message.findById(message._id).lean();
      expect(stored).toMatchObject({ payload: template.stored });
      expect(JSON.stringify(stored)).not.toContain('UNTRUSTED');
    }
    expect(payload).toEqual(original);
  });

  it.each(templates)('accepts $templateCd size limits after trimming', async (template) => {
    const payload = { ...template.input };
    for (const [field, max] of Object.entries(template.limits)) payload[field] = ` ${'x'.repeat(max)} `;
    const messages = await create(template.templateCd, payload);
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      for (const [field, max] of Object.entries(template.limits)) {
        expect(message.payload[field]).toBe('x'.repeat(max));
      }
    }
  });

  it.each([
    {
      templateCd: 'task-assignment',
      payload: { toUserEmail: recipientEmail, taskTitle: 'Task' },
      expected: { taskDescription: '', dueDate: '', status: 'pending' },
    },
    {
      templateCd: 'approval-request',
      payload: { toUserEmail: recipientEmail, requestTitle: 'Request', requestDetails: 'Details' },
      expected: { status: 'pending' },
    },
    { templateCd: 'system-announcement', payload: { title: 'Title', body: 'Body' }, expected: { priority: 'normal' } },
    {
      templateCd: 'system-announcement',
      payload: { title: 'Title', body: 'Body', priority: 'low' },
      expected: { priority: 'low' },
    },
  ])('retains optional/default values for $templateCd: $expected', async ({ templateCd, payload, expected }) => {
    const messages = await create(templateCd, payload);
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) expect(message.payload).toMatchObject(expected);
  });

  it.each(templates.filter((template) => template.emailField))(
    'rejects missing $templateCd recipients with 404',
    async (template) => {
      const before = await counts();
      await expectFailure(
        template.templateCd,
        { ...template.input, [template.emailField!]: 'absent-recipient@example.test' },
        404,
        'Message recipient not found.',
      );
      expect(await counts()).toEqual(before);
    },
  );

  it.each(['invalid', 'missing-recipient'] as const)(
    'keeps a failed %s reservation; corrected same-key conflicts, new-key succeeds',
    async (failure) => {
      const clientRequestId = `msga09-${transport}-${failure}`;
      const scope = { clientRequestId, clientRequestOwnerId: sender.user.id, templateCd: 'direct-message' };
      const valid = templates[3].input;
      const payload =
        failure === 'invalid'
          ? { ...valid, subject: '   ' }
          : { ...valid, toUserEmail: 'absent-recipient@example.test' };
      const before = await counts();
      const lookup = vi.spyOn(UserModel, 'findOne');
      const persist = vi.spyOn(Message, 'create');
      await expectFailure(
        'direct-message',
        payload,
        failure === 'invalid' ? 400 : 404,
        failure === 'invalid' ? 'Invalid message payload.' : 'Message recipient not found.',
        clientRequestId,
      );
      if (failure === 'invalid') {
        expect(lookup.mock.calls.filter(([filter]) => Object.hasOwn(filter ?? {}, 'email'))).toEqual([]);
      }
      expect(persist).not.toHaveBeenCalled();
      const failed = (await Reservation.findOne(scope).lean())!;
      expect(failed).toMatchObject({ state: 'failed', itemCount: null });
      expect(await Message.countDocuments(scope)).toBe(0);
      expect(await counts()).toEqual({ ...before, reservations: before.reservations + 1 });

      lookup.mockClear();
      if (transport === 'direct') {
        await expect(directCreate('direct-message', valid, clientRequestId)).rejects.toBeInstanceOf(
          ClientRequestFailedError,
        );
      } else {
        expect(await post('/api/messages/new/direct-message', { ...valid, clientRequestId })).toEqual({
          status: 409,
          body: { message: `clientRequestId "${clientRequestId}" previously failed; retry with a new clientRequestId` },
        });
      }
      expect(lookup.mock.calls.filter(([filter]) => Object.hasOwn(filter ?? {}, 'email'))).toEqual([]);
      expect(await Reservation.findOne(scope).lean()).toEqual(failed);
      expect(await counts()).toEqual({ ...before, reservations: before.reservations + 1 });
      const messages = await create('direct-message', valid, `${clientRequestId}-corrected`);
      expect(messages).toHaveLength(1);
      expect(String(messages[0].toUser)).toBe(recipient.user.id);
      expect(await Reservation.findOne({ ...scope, clientRequestId: `${clientRequestId}-corrected` })).toMatchObject({
        state: 'completed',
        itemCount: 1,
      });
      expect(await Reservation.findOne(scope).lean()).toEqual(failed);
      lookup.mockClear();
      // Completed keys replay the first batch without parsing a changed (even invalid) payload.
      expect(await create('direct-message', { subject: ' ' }, `${clientRequestId}-corrected`)).toEqual(messages);
      expect(lookup.mock.calls.filter(([filter]) => Object.hasOwn(filter ?? {}, 'email'))).toEqual([]);
      expect(await counts()).toEqual({
        ...before,
        messages: before.messages + 1,
        reservations: before.reservations + 2,
      });
    },
  );
});

it('MSGA-09 rejects an announcement with no eligible recipients through HTTP and the direct service', async () => {
  await UserModel.deleteMany({ _id: { $ne: sender.user.id } });
  const before = await counts();
  const payload = { title: 'Title', body: 'Body' };
  expect(await post('/api/messages/new/system-announcement', payload)).toEqual({
    status: 404,
    body: { message: 'Message recipient not found.' },
  });
  await expect(directCreate('system-announcement', payload)).rejects.toMatchObject({
    name: 'AppError',
    statusCode: 404,
    message: 'Message recipient not found.',
  });
  expect(await counts()).toEqual(before);
});
