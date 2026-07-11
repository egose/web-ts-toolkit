import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { startLocalServer } from '@web-ts-toolkit/express-runtime';
import { createApp } from './app';
import { databaseName, port } from './domain';
import { registerMessageModels, registerMessageTemplates } from './messages';
import { seedDemoData, seedDemoMessages } from './session';

async function start() {
  const mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri(), { dbName: databaseName });

  registerMessageModels();
  registerMessageTemplates();
  await seedDemoData();
  await seedDemoMessages();

  const app = createApp();

  startLocalServer(app, {
    port,
    onListening: () => {
      console.log(`org-access example API listening on http://localhost:${port}`);
      console.log(
        'Demo users: owner@example.com, ada@example.com, maya@example.com, sam@example.com, nora@example.com, leo@example.com, alice@example.com, bob@example.com, carol@example.com, dave@example.com, eve@example.com',
      );
    },
    onShutdown: async () => {
      await mongoose.disconnect();
      await mongoServer.stop();
    },
  });
}

void start();
