import mongoose, { type HydratedDocument } from 'mongoose';
import { describe, expect, it, vi } from 'vitest';

import { newDocumentPlugin } from '../dist/plugins/new-document.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

type User = {
  email: string;
};

const createUserModel = (fn: (document: HydratedDocument<User>) => void | Promise<void>) => {
  const schema = new mongoose.Schema<User>({
    email: { type: String, required: true },
  });

  schema.plugin(newDocumentPlugin<User>, { fn });

  return mongoose.model<User>(`NewDocumentPluginUser${mongoose.modelNames().length}`, schema);
};

describe('newDocumentPlugin', () => {
  it('runs the function after a new document is saved', async () => {
    const fn = vi.fn(async (user: HydratedDocument<User>) => {
      expect(user.isNew).toBe(false);
      expect(await user.constructor.findById(user._id)).not.toBeNull();
    });
    const User = createUserModel(fn);

    const user = await User.create({ email: 'new@example.com' });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(user);
  });

  it('does not run the function when an existing document is saved', async () => {
    const fn = vi.fn();
    const User = createUserModel(fn);

    const user = await User.create({ email: 'first@example.com' });
    user.email = 'updated@example.com';
    await user.save();

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
