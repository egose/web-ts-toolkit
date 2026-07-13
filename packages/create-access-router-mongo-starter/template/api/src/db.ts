import mongoose from 'mongoose';
import { DB_NAME } from './config';

export async function startDB(): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to your .env (local dev) or deployment environment.');
  }

  await mongoose.connect(uri, { dbName: DB_NAME });
  console.log('✓ MongoDB connected');
}

export async function stopDB(): Promise<void> {
  await mongoose.disconnect();
}
