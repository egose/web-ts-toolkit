import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
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

  const shutdown = async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });

  app.listen(port, () => {
    console.log(`org-access example API listening on http://localhost:${port}`);
    console.log(
      'Demo users: owner@example.com, ada@example.com, maya@example.com, sam@example.com, nora@example.com, leo@example.com, alice@example.com, bob@example.com, carol@example.com, dave@example.com, eve@example.com',
    );
  });
}

void start();
