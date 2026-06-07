import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionNotAllowedError,
  ActionNotFoundError,
  MessageArchivedError,
  MessageNotFoundError,
  TemplateNotFoundError,
} from '../src/message-service';
import { createMessageRoutes } from '../src/route-factory';

const servers: Array<{ close: () => void }> = [];

afterEach(() => {
  while (servers.length > 0) {
    servers.pop()?.close();
  }
});

async function createTestClient() {
  const { router, service } = createMessageRoutes({
    getModel: () => ({}) as never,
    getUser: () => ({ _id: 'u1' }),
    getPermissions: () => ({}),
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
    async request(path: string, init?: RequestInit) {
      const response = await fetch(`${baseUrl}${path}`, init);
      return {
        status: response.status,
        body: await response.json(),
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

  it('maps ActionNotAllowedError to 403', async () => {
    const { service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => ({ templateCd: 'svc-test' }) as never);
    service.handleAction = vi.fn(async () => {
      throw new ActionNotAllowedError();
    });

    const response = await request('/msg-1/action/approve');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'not allowed' });
  });

  it('maps ActionNotFoundError to 404', async () => {
    const { service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => ({ templateCd: 'svc-test' }) as never);
    service.handleAction = vi.fn(async () => {
      throw new ActionNotFoundError('svc-test', 'approve');
    });

    const response = await request('/msg-1/action/approve');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'action "approve" not found in template "svc-test"' });
  });

  it('maps MessageArchivedError to 410', async () => {
    const { service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => ({ templateCd: 'svc-test' }) as never);
    service.handleAction = vi.fn(async () => {
      throw new MessageArchivedError('msg-1');
    });

    const response = await request('/msg-1/action/approve');

    expect(response.status).toBe(410);
    expect(response.body).toEqual({ message: 'message "msg-1" is archived' });
  });

  it('maps MessageNotFoundError to 404', async () => {
    const { service, request } = await createTestClient();
    service.findMessageOrThrow = vi.fn(async () => {
      throw new MessageNotFoundError('msg-1');
    });

    const response = await request('/msg-1/action/approve');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'message not found' });
  });
});
