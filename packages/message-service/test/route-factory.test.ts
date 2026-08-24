import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionConflictError,
  ActionNotificationPendingError,
  ActionNotAllowedError,
  ActionNotFoundError,
  ActionRetryableError,
  MessageArchivedError,
  MessageNotFoundError,
  TemplateNotFoundError,
} from '../src/message-service';
import { createMessageRoutes } from '../src/route-factory';
import type { MessageUser } from '../src/types/message';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const OVERLONG_ROUTE_VALUE = 'x'.repeat(129);

const servers: Array<{ close: (callback?: (error?: Error) => void) => void }> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

async function createTestClient(
  options: { getUser?: () => MessageUser | undefined; getPermissions?: () => Record<string, boolean> } = {},
) {
  const getModel = vi.fn(() => ({}) as never);
  const getUser = vi.fn(options.getUser ?? (() => ({ _id: 'u1' })));
  const getPermissions = vi.fn(options.getPermissions ?? (() => ({})));
  const { router, service } = createMessageRoutes({
    getModel,
    getUser,
    getPermissions,
  });

  const app = express();
  app.use(express.json());
  app.use(router.original);

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const started = app.listen(0, () => resolve(started));
  });
  servers.push(server);

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    service,
    getModel,
    getUser,
    getPermissions,
    endpoints: router.getEndpoints(),
    async request(path: string, init?: RequestInit) {
      const response = await fetch(`${baseUrl}${path}`, init);
      const text = await response.text();
      return {
        status: response.status,
        body:
          text && response.headers.get('content-type')?.includes('application/json')
            ? (JSON.parse(text) as unknown)
            : text,
      };
    },
  };
}

describe('createMessageRoutes', () => {
  it('maps TemplateNotFoundError from createMessage to 404', async () => {
    const { service, request } = await createTestClient();
    service.createMessage = vi.fn(async () => {
      throw new TemplateNotFoundError('missing-template');
    });

    const response = await request('/new/missing-template', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'template "missing-template" not found' });
  });

  it('maps invalid clientRequestId from createMessage to 400', async () => {
    const { service, request } = await createTestClient();
    service.createMessage = vi.fn(async () => []);

    const response = await request('/new/svc-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientRequestId: 123 }),
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'clientRequestId must be a string when provided' });
    expect(service.createMessage).not.toHaveBeenCalled();
  });

  it('forwards payment compensation failure hooks to the route service', () => {
    const onPaymentCompensationFailure = vi.fn();
    const { service } = createMessageRoutes({
      getModel: vi.fn(() => ({}) as never),
      onPaymentCompensationFailure,
    });

    expect(
      (service as unknown as { onPaymentCompensationFailure?: typeof onPaymentCompensationFailure })
        .onPaymentCompensationFailure,
    ).toBe(onPaymentCompensationFailure);
  });

  it('requires authentication before create route side effects', async () => {
    const { service, getModel, request } = await createTestClient({ getUser: () => undefined });
    service.createMessage = vi.fn(async () => []);

    const response = await request('/new/svc-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientRequestId: 'request-1' }),
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'authentication required' });
    expect(service.createMessage).not.toHaveBeenCalled();
    expect(getModel).not.toHaveBeenCalled();
  });

  it('requires authentication before listing actions or loading a message', async () => {
    const { service, getModel, request } = await createTestClient({ getUser: () => undefined });
    service.getActions = vi.fn(async () => ({ uiTemplate: 'request', actions: [] }));

    const response = await request(`/${MESSAGE_ID}/actions/sender`);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'authentication required' });
    expect(service.getActions).not.toHaveBeenCalled();
    expect(getModel).not.toHaveBeenCalled();
  });

  it('requires authentication before action route side effects', async () => {
    const { service, getModel, request } = await createTestClient({ getUser: () => undefined });
    service.findMessageOrThrow = vi.fn(async () => ({ templateCd: 'svc-test' }) as never);
    service.handleAction = vi.fn(async () => ({ ok: true }));

    const response = await request(`/${MESSAGE_ID}/action/approve`, { method: 'POST' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ message: 'authentication required' });
    expect(service.findMessageOrThrow).not.toHaveBeenCalled();
    expect(service.handleAction).not.toHaveBeenCalled();
    expect(getModel).not.toHaveBeenCalled();
  });

  it('validates templateCd and clientRequestId before createMessage lookup', async () => {
    const { service, request } = await createTestClient();
    service.createMessage = vi.fn(async () => []);

    const invalidTemplate = await request('/new/bad!', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const overlongTemplate = await request(`/new/${OVERLONG_ROUTE_VALUE}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const emptyClientRequestId = await request('/new/svc-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientRequestId: '   ' }),
    });

    expect(invalidTemplate.status).toBe(400);
    expect(invalidTemplate.body).toEqual({
      message: 'templateCd must be a non-empty string of at most 128 letters, digits, dots, underscores, and hyphens',
    });
    expect(overlongTemplate.status).toBe(400);
    expect(emptyClientRequestId.status).toBe(400);
    expect(emptyClientRequestId.body).toEqual({
      message: 'clientRequestId must be a non-empty string after trimming whitespace',
    });
    expect(service.createMessage).not.toHaveBeenCalled();
  });

  it('validates action list parameters before getActions lookup', async () => {
    const { service, request } = await createTestClient();
    service.getActions = vi.fn(async () => ({ uiTemplate: 'request', actions: [] }));

    const invalidId = await request('/not-an-object-id/actions/sender');
    const invalidUsertype = await request(`/${MESSAGE_ID}/actions/admin`);

    expect(invalidId.status).toBe(400);
    expect(invalidId.body).toEqual({ message: 'id must be a 24-character hex ObjectId' });
    expect(invalidUsertype.status).toBe(400);
    expect(invalidUsertype.body).toEqual({ message: 'usertype must be "sender" or "receiver"' });
    expect(service.getActions).not.toHaveBeenCalled();
  });

  it('validates action route parameters before message lookup', async () => {
    const { service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => ({ templateCd: 'svc-test' }) as never);

    const invalidId = await request('/not-an-object-id/action/approve', { method: 'POST' });
    const invalidAction = await request(`/${MESSAGE_ID}/action/bad.action`, { method: 'POST' });
    const overlongAction = await request(`/${MESSAGE_ID}/action/${OVERLONG_ROUTE_VALUE}`, { method: 'POST' });

    expect(invalidId.status).toBe(400);
    expect(invalidId.body).toEqual({ message: 'id must be a 24-character hex ObjectId' });
    expect(invalidAction.status).toBe(400);
    expect(invalidAction.body).toEqual({
      message: 'actionCd must be a non-empty string of at most 128 letters, digits, underscores, and hyphens',
    });
    expect(overlongAction.status).toBe(400);
    expect(service.findMessageOrThrow).not.toHaveBeenCalled();
  });

  it('maps Mongoose CastError from route lookups to 400', async () => {
    const { service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => {
      const error = new Error('Cast to ObjectId failed') as Error & { name: string };
      error.name = 'CastError';
      throw error;
    });

    const response = await request(`/${MESSAGE_ID}/action/approve`, { method: 'POST' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'id must be a valid ObjectId' });
  });

  it('maps ActionNotAllowedError to 403', async () => {
    const { service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => ({ templateCd: 'svc-test' }) as never);
    service.handleAction = vi.fn(async () => {
      throw new ActionNotAllowedError();
    });

    const response = await request(`/${MESSAGE_ID}/action/approve`, { method: 'POST' });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'not allowed' });
  });

  it('maps ActionNotFoundError to 404', async () => {
    const { service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => ({ templateCd: 'svc-test' }) as never);
    service.handleAction = vi.fn(async () => {
      throw new ActionNotFoundError('svc-test', 'approve');
    });

    const response = await request(`/${MESSAGE_ID}/action/approve`, { method: 'POST' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'action "approve" not found in template "svc-test"' });
  });

  it('maps action lifecycle conflicts and retryable failures to 409', async () => {
    const { service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => ({ _id: MESSAGE_ID, templateCd: 'svc-test' }) as never);
    service.handleAction = vi
      .fn()
      .mockRejectedValueOnce(new ActionConflictError(MESSAGE_ID))
      .mockRejectedValueOnce(new ActionRetryableError(MESSAGE_ID, 'attempt-1'));

    const conflictResponse = await request(`/${MESSAGE_ID}/action/approve`, { method: 'POST' });
    const retryableResponse = await request(`/${MESSAGE_ID}/action/approve`, { method: 'POST' });

    expect(conflictResponse.status).toBe(409);
    expect(conflictResponse.body).toEqual({ message: `message "${MESSAGE_ID}" already has an action in progress` });
    expect(retryableResponse.status).toBe(409);
    expect(retryableResponse.body).toEqual({
      message: `message "${MESSAGE_ID}" action attempt "attempt-1" failed before commit and may be retried`,
    });
  });

  it('maps committed notification-pending actions to 202', async () => {
    const { service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => ({ _id: MESSAGE_ID, templateCd: 'svc-test' }) as never);
    service.handleAction = vi.fn(async () => {
      throw new ActionNotificationPendingError(MESSAGE_ID, 'attempt-1', { ok: true });
    });

    const response = await request(`/${MESSAGE_ID}/action/approve`, { method: 'POST' });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: `message "${MESSAGE_ID}" action committed but sender notification is pending`,
      actionAttemptId: 'attempt-1',
    });
  });

  it('maps MessageArchivedError to 410', async () => {
    const { service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => ({ templateCd: 'svc-test' }) as never);
    service.handleAction = vi.fn(async () => {
      throw new MessageArchivedError('msg-1');
    });

    const response = await request(`/${MESSAGE_ID}/action/approve`, { method: 'POST' });

    expect(response.status).toBe(410);
    expect(response.body).toEqual({ message: 'message "msg-1" is archived' });
  });

  it('maps MessageNotFoundError to 404', async () => {
    const { service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => {
      throw new MessageNotFoundError('msg-1');
    });

    const response = await request(`/${MESSAGE_ID}/action/approve`, { method: 'POST' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'message not found' });
  });

  it('does not execute actions via GET and documents POST as the sole action mutation route', async () => {
    const { endpoints, service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => ({ templateCd: 'svc-test' }) as never);
    service.handleAction = vi.fn(async () => ({ ok: true }));

    const getResponse = await request(`/${MESSAGE_ID}/action/approve`);
    const postResponse = await request(`/${MESSAGE_ID}/action/approve`, { method: 'POST' });

    expect(getResponse.status).toBe(404);
    expect(postResponse.status).toBe(200);
    expect(service.handleAction).toHaveBeenCalledTimes(1);
    expect(endpoints).toEqual(
      expect.arrayContaining([
        { method: 'POST', path: '/new/:templateCd' },
        { method: 'GET', path: '/:id/actions/:usertype' },
        { method: 'POST', path: '/:id/action/:actionCd' },
      ]),
    );
    expect(endpoints).not.toContainEqual({ method: 'GET', path: '/:id/action/:actionCd' });
  });

  it('uses custom request extractors for successful service argument mapping', async () => {
    const user = { _id: 'custom-user', roles: ['approver'] };
    const permissions = { 'message.approve': true };
    const { service, getPermissions, request } = await createTestClient({
      getUser: () => user,
      getPermissions: () => permissions,
    });
    service.createMessage = vi.fn(async () => [{ _id: MESSAGE_ID }]);
    service.getActions = vi.fn(async () => ({ uiTemplate: 'approval', actions: [] }));
    service.findMessageOrThrow = vi.fn(async () => ({ templateCd: 'svc-test' }) as never);
    service.handleAction = vi.fn(async () => ({ ok: true }));

    await request('/new/svc-test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientRequestId: 'request-1', amount: 10 }),
    });
    await request(`/${MESSAGE_ID}/actions/receiver`);
    await request(`/${MESSAGE_ID}/action/approve`, { method: 'POST' });

    expect(service.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        templateCd: 'svc-test',
        user,
        roles: ['approver'],
        permissions,
        payload: { amount: 10 },
        payerUser: user,
        clientRequestId: 'request-1',
      }),
    );
    expect(service.getActions).toHaveBeenCalledWith(MESSAGE_ID, 'receiver', {
      permissions,
      user,
      isAdmin: false,
    });
    expect(service.handleAction).toHaveBeenCalledWith(
      'svc-test',
      'approve',
      expect.objectContaining({ user, permissions }),
    );
    expect(getPermissions).toHaveBeenCalled();
  });
});
