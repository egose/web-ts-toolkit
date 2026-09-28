import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  MESSAGE_MODEL_NAME,
  MESSAGE_ARCHIVE_MODEL_NAME,
  MESSAGE_REQUEST_MODEL_NAME,
} from '@web-ts-toolkit/message-service';
import { afterEach, expect, it, vi } from 'vitest';
import { startExampleServer } from '../src/server';
import { registerMessageModels } from '../src/messages';
import { UserModel } from '../src/models';
import { clearSession } from '../src/session';

afterEach(() => vi.restoreAllMocks());

it('authenticates the shipped host workflow, scopes replay, archives once, and lists public DTOs', async () => {
  const server = await startExampleServer({ port: 0, host: '127.0.0.1', signals: false });
  const tokens: string[] = [];
  try {
    const baseUrl = `http://127.0.0.1:${(server.server.address() as AddressInfo).port}`;
    const request = async (path: string, token?: string, body?: Record<string, unknown>) => {
      const response = await fetch(`${baseUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { 'x-session-token': token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    };
    const login = async (email: string) => {
      const response = await request('/api/auth/login', undefined, { email });
      expect(response.status).toBe(200);
      expect(response.body.data.token).toEqual(expect.any(String));
      tokens.push(response.body.data.token);
      return response.body.data as { token: string; user: { id: string; email: string; displayName: string } };
    };
    const sender = await login('smoke-sender@example.test');
    const receiver = await login('smoke-receiver@example.test');
    const outsider = await login('smoke-outsider@example.test');
    expect((await request('/api/auth/session', receiver.token)).body.data.user.id).toBe(receiver.user.id);

    const Message = mongoose.model(MESSAGE_MODEL_NAME);
    const Archive = mongoose.model(MESSAGE_ARCHIVE_MODEL_NAME);
    const Reservation = mongoose.model(MESSAGE_REQUEST_MODEL_NAME);
    registerMessageModels(); // Registration is safe to repeat, retaining compiled models.
    expect(mongoose.model(MESSAGE_REQUEST_MODEL_NAME)).toBe(Reservation);
    const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
    expect(hello.setName).toEqual(expect.any(String));
    const payload = {
      clientRequestId: 'HOST_REQUEST_SECRET',
      toUserEmail: receiver.user.email,
      subject: 'Useful subject',
      body: 'Useful body',
    };
    const createPath = '/api/messages/new/direct-message';
    const scope = {
      clientRequestId: payload.clientRequestId,
      clientRequestOwnerId: sender.user.id,
      templateCd: 'direct-message',
    };
    expect((await request(createPath, undefined, payload)).status).toBe(401);
    expect((await request(createPath, 'invalid-session', payload)).status).toBe(401);
    expect(await Reservation.countDocuments(scope)).toBe(0);

    const created = await request(createPath, sender.token, payload);
    expect(created.status).toBe(200);
    expect(created.body).toHaveLength(1);
    const id = created.body[0]._id as string;
    expect(created.body[0]).toMatchObject({
      fromUser: sender.user.id,
      toUser: receiver.user.id,
      receiverContent: { title: payload.subject },
      payload: { read: false },
    });
    expect(JSON.stringify(created.body)).not.toContain('SECRET');
    const replay = await request(createPath, sender.token, { ...payload, subject: 'Ignored replay payload' });
    expect(replay).toEqual(created);
    expect(await Message.countDocuments(scope)).toBe(1);
    expect(await Reservation.countDocuments(scope)).toBe(1);
    expect(await Reservation.findOne(scope)).toMatchObject({ state: 'completed', itemCount: 1 });
    const indexes = await Reservation.collection.indexes();
    expect(indexes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: { clientRequestOwnerId: 1, templateCd: 1, clientRequestId: 1 },
          unique: true,
        }),
      ]),
    );

    // The same request ID belongs to a different batch for another user/template.
    const otherOwner = await request(createPath, outsider.token, payload);
    expect(otherOwner.status).toBe(200);
    expect(otherOwner.body[0]._id).not.toBe(id);
    const otherTemplate = await request('/api/messages/new/system-announcement', sender.token, {
      clientRequestId: payload.clientRequestId,
      title: 'Scoped announcement',
      body: 'Batch body',
    });
    expect(otherTemplate.status).toBe(200);
    expect(otherTemplate.body.length).toBeGreaterThan(1);
    expect(
      await request('/api/messages/new/system-announcement', sender.token, {
        clientRequestId: payload.clientRequestId,
        title: 'Ignored',
        body: 'Ignored',
      }),
    ).toEqual(otherTemplate);
    expect(await Reservation.countDocuments({ clientRequestId: payload.clientRequestId })).toBe(3);
    expect(await Message.countDocuments({ ...scope, templateCd: 'system-announcement' })).toBe(
      otherTemplate.body.length,
    );

    await UserModel.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(sender.user.id) },
      {
        $set: { password: 'HOST_USER_SECRET' }, // pragma: allowlist secret
      },
    );
    await Message.updateOne(
      { _id: id },
      {
        $set: {
          actionOwnerToken: 'HOST_OWNER_SECRET',
          actionFailureMessage: 'HOST_DIAGNOSTIC_SECRET',
        },
      },
    );
    const list = await request('/api/messages', receiver.token);
    expect(list.status).toBe(200);
    const listed = list.body.data.find((message: { _id: string }) => message._id === id);
    expect(listed).toMatchObject({
      _id: id,
      receiverContent: { title: payload.subject },
      fromUser: { _id: sender.user.id, email: sender.user.email, displayName: sender.user.displayName },
      toUser: { _id: receiver.user.id, email: receiver.user.email, displayName: receiver.user.displayName },
    });
    expect(JSON.stringify(list.body)).not.toContain('SECRET');
    for (const field of [
      'actionOwnerToken',
      'actionFailureMessage',
      'clientRequestId',
      'clientRequestOwnerId',
      'clientRequestItemIndex',
    ]) {
      expect(listed).not.toHaveProperty(field);
    }
    expect(await Message.findById(id)).toMatchObject({
      actionOwnerToken: 'HOST_OWNER_SECRET',
      actionFailureMessage: 'HOST_DIAGNOSTIC_SECRET',
    });
    expect(await UserModel.collection.findOne({ _id: new mongoose.Types.ObjectId(sender.user.id) })).toHaveProperty(
      'password',
      'HOST_USER_SECRET',
    );

    const actionPath = `/api/messages/${id}/action/mark-read`;
    expect((await request(actionPath, undefined, {})).status).toBe(401);
    expect((await request(actionPath, outsider.token, {})).status).toBe(403);
    expect(await Archive.countDocuments({ _id: id })).toBe(0);
    expect((await request(`/api/messages/${id}/actions/receiver`, receiver.token)).body.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ actionCd: 'mark-read' })]),
    );
    const action = await request(actionPath, receiver.token, {});
    expect(action.status).toBe(200);
    expect(action.body).toMatchObject({ read: true });
    expect(await Message.findById(id)).toBeNull();
    expect(await Archive.countDocuments({ _id: id })).toBe(1);
    const archived = await Archive.findById(id);
    expect(archived).toMatchObject({ actionCd: 'mark-read', payload: { read: true } });
    const actionReplay = await request(actionPath, receiver.token, {});
    expect(actionReplay.status).toBe(410); // Already archived; the handler must not run again.
    expect(await Archive.countDocuments({ _id: id })).toBe(1);
    expect((await Archive.findById(id))!.toObject()).toEqual(archived!.toObject());
    const archivedReplay = await request(createPath, sender.token, payload);
    expect(archivedReplay.status).toBe(200);
    expect(archivedReplay.body).toHaveLength(1);
    expect(archivedReplay.body[0]).toMatchObject({ _id: id, actionCd: 'mark-read', payload: { read: true } });
    expect(JSON.stringify(archivedReplay.body)).not.toContain('SECRET');
    expect(await Message.countDocuments(scope)).toBe(0);
    expect(await Reservation.countDocuments(scope)).toBe(1);
    expect((await request('/api/messages', receiver.token)).body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ _id: id })]),
    );
  } finally {
    tokens.forEach(clearSession);
    await server.shutdown();
  }
  expect(server.server.listening).toBe(false);
  expect(mongoose.connection.readyState).toBe(0);
}, 60_000);

it('cleans up the real replica set and connection after HTTP listen failure', async () => {
  const occupied = createServer();
  await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
  const stop = vi.spyOn(MongoMemoryReplSet.prototype, 'stop');
  try {
    await expect(
      startExampleServer({
        port: (occupied.address() as AddressInfo).port,
        host: '127.0.0.1',
        signals: false,
      }),
    ).rejects.toMatchObject({ code: 'EADDRINUSE' });
    expect(mongoose.connection.readyState).toBe(0);
    expect(stop).toHaveBeenCalled();
    expect(stop.mock.instances.every((replicaSet) => replicaSet.state === 'stopped')).toBe(true);
  } finally {
    await new Promise<void>((resolve, reject) => occupied.close((error) => (error ? reject(error) : resolve())));
  }
}, 60_000);

it('drains HTTP before disconnect and stops the replica set even when disconnect rejects', async () => {
  const server = await startExampleServer({ port: 0, host: '127.0.0.1', signals: false });
  const stop = vi.spyOn(MongoMemoryReplSet.prototype, 'stop');
  const disconnect = mongoose.disconnect.bind(mongoose);
  const failure = new Error('injected disconnect failure after real cleanup');
  const disconnectSpy = vi.spyOn(mongoose, 'disconnect').mockImplementation(async () => {
    expect(server.server.listening).toBe(false);
    expect(stop).not.toHaveBeenCalled();
    await disconnect();
    throw failure;
  });
  await expect(server.shutdown()).rejects.toBe(failure);
  await expect(server.shutdown()).rejects.toBe(failure);
  expect(disconnectSpy).toHaveBeenCalledTimes(1);
  expect(mongoose.connection.readyState).toBe(0);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(stop.mock.instances[0].state).toBe('stopped');
}, 60_000);
