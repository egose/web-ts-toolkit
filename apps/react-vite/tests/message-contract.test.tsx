/// <reference types="node" />

import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredSessionToken, setStoredSessionToken } from '../src/storage';
import type { Message, MessageActionsResponse, SessionData } from '../src/types';

const senderId = '111111111111111111111111';
const receiverId = '222222222222222222222222';
const messageId = '333333333333333333333333';
const session: SessionData = {
  token: 'message-contract-token',
  user: { id: receiverId, email: 'receiver@example.test', displayName: 'Receiver' },
  organizations: [],
};
const message: Message = {
  _id: messageId,
  templateCd: 'approval-request',
  type: 'approval',
  fromUser: senderId,
  toUser: receiverId,
  toRoles: [],
  senderContent: { title: 'Request sent', long: 'Please approve the budget.', short: 'Request sent' },
  receiverContent: { title: 'Budget approval', long: 'Please approve the budget.', short: 'Review the budget' },
  documents: [],
  paymentSession: null,
  paymentCd: '',
  payload: { requestTitle: 'Budget approval', status: 'pending' },
  display: {},
  actionState: 'active',
  actionCd: null,
  actionAttemptId: null,
  createdAt: '2026-10-18T12:00:00.000Z',
  updatedAt: '2026-10-18T12:00:00.000Z',
};
const actions: MessageActionsResponse = {
  uiTemplate: 'card',
  actions: [{ actionCd: 'approve', name: 'Approve request', variant: 'success', isDefault: true }],
};
const pendingNotification = {
  message: `message "${messageId}" action committed but sender notification is pending`,
  actionAttemptId: '44444444-4444-4444-8444-444444444444',
};

interface CapturedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

// Wire fixtures deliberately have the host's mixed contracts: GET /messages is
// enveloped, package routes are bare JSON. No API, adapter, or Axios mock is used.
const responses = new Map<string, Array<{ status: number; body: unknown }>>();
const requests: CapturedRequest[] = [];
const unexpectedRequests: string[] = [];
const queryClients: QueryClient[] = [];
let server: Server;
let api: typeof import('../src/api');
let MessagesPage: typeof import('../src/pages/messages-page').MessagesPage;

function respond(method: string, path: string, body: unknown, status = 200) {
  const key = `${method} /api${path}`;
  const queue = responses.get(key) ?? [];
  queue.push({ status, body });
  responses.set(key, queue);
}

function renderMessagesPage() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  queryClients.push(client);
  render(
    <QueryClientProvider client={client}>
      <MessagesPage session={session} />
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  // Node 26's existing localStorage global shadows jsdom's in Vitest. Use the
  // environment's real browser storage rather than Node's file-backed storage.
  const { jsdom } = globalThis as unknown as { jsdom: { window: Window } };
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  server = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', request.headers.origin ?? '*');
    response.setHeader('access-control-allow-credentials', 'true');
    if (request.method === 'OPTIONS') {
      response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      response.setHeader('access-control-allow-headers', request.headers['access-control-request-headers'] ?? '');
      response.writeHead(204).end();
      return;
    }

    let text = '';
    request.setEncoding('utf8');
    for await (const chunk of request) text += chunk;
    const method = request.method!;
    const path = request.url!;
    requests.push({ method, path, headers: request.headers, body: text ? JSON.parse(text) : undefined });
    const key = `${method} ${new URL(path, 'http://localhost').pathname}`;
    const next = responses.get(key)?.shift();
    if (!next) unexpectedRequests.push(key);
    response.setHeader('content-type', 'application/json');
    response.writeHead(next?.status ?? 500).end(JSON.stringify(next ? next.body : { message: 'Unexpected request' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('VITE_API_BASE_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);
  api = await import('../src/api');
  ({ MessagesPage } = await import('../src/pages/messages-page'));
});

beforeEach(() => {
  responses.clear();
  requests.length = 0;
  unexpectedRequests.length = 0;
  setStoredSessionToken(session.token!);
});

afterEach(() => {
  cleanup();
  queryClients.splice(0).forEach((client) => client.clear());
  clearStoredSessionToken();
  expect(unexpectedRequests).toEqual([]);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe('message caller HTTP contracts', () => {
  it('retains the host list envelope, populated parties, pagination, and session header', async () => {
    const listed: Message = { ...message, fromUser: { _id: senderId }, toUser: { _id: receiverId } };
    respond('GET', '/messages', { success: true, data: [listed] });

    expect(await api.listMessages({ limit: 5, skip: 2 })).toEqual([listed]);
    expect(requests).toHaveLength(1);
    const url = new URL(requests[0].path, 'http://localhost');
    expect(url.pathname).toBe('/api/messages');
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '5', skip: '2' });
    expect(requests[0].headers['x-session-token']).toBe(session.token);
  });

  it('returns bare public DTOs from creation and sends the submitted payload', async () => {
    const payload = {
      toUserEmail: session.user.email,
      requestTitle: 'Budget approval',
      requestDetails: 'Please approve the budget.',
      clientRequestId: 'new-1',
    };
    respond('POST', '/messages/new/approval-request', [message]);

    expect(await api.createMessageFromTemplate('approval-request', payload)).toEqual([message]);
    expect(requests).toMatchObject([{ method: 'POST', path: '/api/messages/new/approval-request', body: payload }]);
    expect(requests[0].headers['x-session-token']).toBe(session.token);
  });

  it('also returns the public archive shape on completed creation replay', async () => {
    const archived: Message = {
      ...message,
      actionCd: 'approve',
      actionAttemptId: pendingNotification.actionAttemptId,
      archivedBy: receiverId,
      archivedAt: '2026-10-18T12:01:00.000Z',
      actionNotificationState: 'sent',
    };
    respond('POST', '/messages/new/approval-request', [archived]);

    expect(await api.createMessageFromTemplate('approval-request', { clientRequestId: 'completed-1' })).toEqual([
      archived,
    ]);
  });

  it.each(['sender', 'receiver'] as const)('returns bare action metadata for the %s view', async (usertype) => {
    const metadata: MessageActionsResponse = {
      ...actions,
      actions: [
        {
          ...actions.actions[0],
          confirmation: { title: 'Approve', message: 'Confirm approval?', documents: true },
          payload: { category: 'budget' },
        },
      ],
    };
    respond('GET', `/messages/${messageId}/actions/${usertype}`, metadata);

    expect(await api.getMessageActions(messageId, usertype)).toEqual(metadata);
    expect(requests[0].path).toBe(`/api/messages/${messageId}/actions/${usertype}`);
  });

  it.each([
    { label: 'object with business data', result: { message: 'Approved', data: { approved: true } } },
    { label: 'array', result: ['approved'] },
    { label: 'string', result: 'approved' },
    { label: 'number', result: 1 },
    { label: 'boolean', result: false },
    { label: 'null', result: null },
  ])('returns the bare $label handler result and forwards action input', async ({ result }) => {
    respond('POST', `/messages/${messageId}/action/approve`, result);

    expect(await api.executeMessageAction(messageId, 'approve', { notes: 'Within budget' })).toEqual(result);
    expect(requests).toMatchObject([
      { method: 'POST', path: `/api/messages/${messageId}/action/approve`, body: { notes: 'Within budget' } },
    ]);
  });

  it('accepts the bare 202 pending-notification body without retrying the committed action', async () => {
    respond('POST', `/messages/${messageId}/action/approve`, pendingNotification, 202);

    expect(await api.executeMessageAction(messageId, 'approve')).toEqual(pendingNotification);
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({});
  });

  it('preserves an HTTP authorization failure as an Axios rejection', async () => {
    respond('POST', `/messages/${messageId}/action/approve`, { message: 'action not allowed' }, 403);

    await expect(api.executeMessageAction(messageId, 'approve')).rejects.toMatchObject({
      response: { status: 403, data: { message: 'action not allowed' } },
    });
    expect(requests).toHaveLength(1);
  });
});

describe('MessagesPage through the actual adapter and HTTP transport', () => {
  it.each([
    { status: 200, result: { approved: true }, notice: 'Action completed' },
    { status: 200, result: { approved: true, message: 'Request approved' }, notice: 'Request approved' },
    { status: 202, result: pendingNotification, notice: pendingNotification.message },
  ])('exposes an authorized action and presents its $status outcome', async ({ status, result, notice }) => {
    // A populated party may contain just its ID, without email/displayName.
    respond('GET', '/messages', { success: true, data: [{ ...message, fromUser: { _id: senderId } }] });
    respond('GET', `/messages/${messageId}/actions/receiver`, actions);
    respond('POST', `/messages/${messageId}/action/approve`, result, status);
    respond('GET', '/messages', { success: true, data: [] });
    renderMessagesPage();

    fireEvent.click(await screen.findByRole('button', { name: /Budget approval/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve request' }));

    expect(await screen.findByText(notice)).toBeInTheDocument();
    expect(await screen.findByText('No received messages')).toBeInTheDocument();
    if (status === 202) expect(screen.queryByText('Action completed')).not.toBeInTheDocument();
    await waitFor(() => expect(requests.filter((request) => request.method === 'POST')).toHaveLength(1));
    expect(requests.find((request) => request.method === 'POST')).toMatchObject({
      path: `/api/messages/${messageId}/action/approve`,
      headers: { 'x-session-token': session.token },
      body: {},
    });
    expect(requests.filter((request) => request.path === '/api/messages')).toHaveLength(2);
  });
});
