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

async function begin(document: IntegrityDocument): Promise<ClientSession> {
  const session = await document.$model().db.startSession();
  session.startTransaction();
  sessions.set(document, session);
  document.$session(session);
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

export async function beginTodoIntegrityWrite(document: IntegrityDocument): Promise<void> {
  if (document.categoryId == null) return;
  const session = await begin(document);
  try {
    await lockCategory(document, document.categoryId, session);
  } catch (error) {
    await abort(document);
    throw error;
  }
}

export async function beginCategoryIntegrityDelete(document: IntegrityDocument): Promise<void> {
  const session = await begin(document);
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
