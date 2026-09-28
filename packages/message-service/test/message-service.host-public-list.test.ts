import express from 'express';
import mongoose from 'mongoose';
import type { AddressInfo } from 'node:net';
import { afterAll, expect, it } from 'vitest';
import { createMessageRouteGroup, registerMessageModels } from '../../../apps/nodejs/src/messages';
import { UserModel, type AppRequest } from '../../../apps/nodejs/src/models';
import { getMongoReplicaSetUri, stopMongoReplicaSet } from './support/mongodb-fixture';

afterAll(stopMongoReplicaSet);

it('shipped Node host lists public DTOs with populated parties and keeps stored diagnostics', async () => {
  await mongoose.connect(await getMongoReplicaSetUri(), { dbName: `public_host_${new mongoose.Types.ObjectId()}` });
  let server: ReturnType<typeof express.application.listen> | undefined;
  try {
    registerMessageModels();
    const sender = await UserModel.create({ email: 'sender@example.test', displayName: 'Sender' });
    const receiver = await UserModel.create({ email: 'receiver@example.test', displayName: 'Receiver' });
    await UserModel.collection.updateOne({ _id: sender._id }, { $set: { password: 'HOST_USER_SECRET' } }); // pragma: allowlist secret
    const Message = mongoose.model('Message');
    const stored = await Message.create({
      templateCd: 'host-list',
      fromUser: sender._id,
      toUser: receiver._id,
      receiverContent: { title: 'Useful title', long: 'Body', short: 'Summary' },
      actionState: 'retryable',
      actionCd: 'approve',
      actionAttemptId: 'business-attempt',
      actionOwnerToken: 'HOST_OWNER_SECRET',
      actionFailureMessage: 'HOST_DIAGNOSTIC_SECRET',
      clientRequestId: 'HOST_REQUEST_SECRET',
      clientRequestOwnerId: String(sender._id),
      clientRequestItemIndex: 0,
    });
    const app = express();
    app.use((req, _res, next) => {
      (req as AppRequest).currentUserId = String(receiver._id);
      next();
    });
    app.use(createMessageRouteGroup().router);
    server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      success: true,
      data: [
        {
          _id: String(stored._id),
          receiverContent: { title: 'Useful title' },
          actionAttemptId: 'business-attempt',
          fromUser: { _id: String(sender._id), email: 'sender@example.test', displayName: 'Sender' },
          toUser: { _id: String(receiver._id), email: 'receiver@example.test', displayName: 'Receiver' },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('SECRET');
    expect(body.data[0]).not.toHaveProperty('actionOwnerToken');
    expect(body.data[0]).not.toHaveProperty('clientRequestId');
    expect(await Message.findById(stored._id)).toMatchObject({
      actionOwnerToken: 'HOST_OWNER_SECRET',
      actionFailureMessage: 'HOST_DIAGNOSTIC_SECRET',
    });
    expect(await UserModel.collection.findOne({ _id: sender._id })).toHaveProperty('password', 'HOST_USER_SECRET');
  } finally {
    if (server)
      await new Promise<void>((resolve, reject) => server!.close((error) => (error ? reject(error) : resolve())));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}, 30_000);
