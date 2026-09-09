import type { ClientSession, Model } from 'mongoose';

interface IntegrityDocument {
  _id: unknown;
  categoryId?: unknown;
  $model(name?: string): Model<unknown>;
  $session(session: ClientSession): unknown;
}

const sessions = new WeakMap<object, ClientSession>();

export class IntegrityConflictError extends Error {
  readonly statusCode = 409;

  constructor() {
    super('Resource conflict.');
    this.name = 'IntegrityConflictError';
  }
}

async function bindSession(document: IntegrityDocument, session: ClientSession, options?: unknown): Promise<void> {
  sessions.set(document, session);
  document.$session(session);
  if (typeof options === 'object' && options !== null) {
    (options as Record<string, unknown>).session = session;
  }
}

async function begin(document: IntegrityDocument, options?: unknown): Promise<ClientSession> {
  const existing = sessions.get(document);
  if (existing) {
    await bindSession(document, existing, options);
    return existing;
  }
  const session = await document.$model().db.startSession();
  session.startTransaction();
  await bindSession(document, session, options);
  return session;
}

async function abort(document: object): Promise<void> {
  const session = sessions.get(document);
  if (!session) return;
  sessions.delete(document);
  try {
    await session.abortTransaction();
  } finally {
    await session.endSession();
  }
}

async function lockCategory(document: IntegrityDocument, categoryId: unknown, session: ClientSession): Promise<void> {
  if (categoryId == null) return;
  const category = await document
    .$model('Category')
    .findOneAndUpdate(
      { _id: categoryId },
      { $inc: { integrityVersion: 1 } },
      { new: true, projection: { _id: 1 }, session },
    );
  if (!category) throw new IntegrityConflictError();
}

export async function beginTodoIntegrityWrite(document: IntegrityDocument, options?: unknown): Promise<void> {
  if (document.categoryId == null) return;
  const session = await begin(document, options);
  try {
    await lockCategory(document, document.categoryId, session);
  } catch (error) {
    await abort(document);
    throw error;
  }
}

export async function beginCategoryIntegrityDelete(document: IntegrityDocument, options?: unknown): Promise<void> {
  const session = await begin(document, options);
  try {
    await lockCategory(document, document._id, session);
    const referenced = await document.$model('Todo').exists({ categoryId: document._id }).session(session);
    if (referenced) throw new IntegrityConflictError();
  } catch (error) {
    await abort(document);
    throw error;
  }
}

export async function commitIntegrityWrite(document: object): Promise<void> {
  const session = sessions.get(document);
  if (!session) return;
  sessions.delete(document);
  try {
    await session.commitTransaction();
  } finally {
    await session.endSession();
  }
}

export async function abortIntegrityWrite(document: object): Promise<void> {
  await abort(document);
}
