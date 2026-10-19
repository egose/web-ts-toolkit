import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMessageSchema,
  type EmailDeliveryFailureEvent,
  type EmailRecipientResolver,
  type EmailRecipientResolverContext,
  type MessageSchemaConfig,
} from '../src/index';
import { getMongoReplicaSetUri, stopMongoReplicaSet } from './support/mongodb-fixture';

describe('MSGA-05 email recipient resolvers with MongoDB', () => {
  const connections: mongoose.Connection[] = [];

  async function connection() {
    const created = await mongoose
      .createConnection(await getMongoReplicaSetUri(), {
        dbName: `msga05_email_${new mongoose.Types.ObjectId()}`,
      })
      .asPromise();
    connections.push(created);
    return created;
  }

  async function fixture(config: MessageSchemaConfig = {}) {
    const owningConnection = await connection();
    const notifier = vi.fn(async () => undefined);
    const Message = owningConnection.model(
      'Message',
      buildMessageSchema({ connection: owningConnection, emailNotifier: notifier, ...config }),
    );
    await Message.init();
    return { connection: owningConnection, Message, notifier };
  }

  function fields(
    recipientId: mongoose.Types.ObjectId | null = new mongoose.Types.ObjectId(),
    title = ' Email Title ',
  ) {
    return {
      templateCd: 'msga05-contact',
      toUser: recipientId,
      receiverContent: { title, long: 'Long email body', short: 'Short' },
      payload: { contactPurpose: 'review' },
      display: { category: 'account' },
    };
  }

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const current of connections.splice(0)) {
      await current.dropDatabase();
      await current.close();
    }
  });

  afterAll(stopMongoReplicaSet);

  it('resolves a nested address and preferences on the document connection, independently of schema-check connection', async () => {
    const schemaCheckConnection = await connection();
    const owningConnection = await connection();
    const contactSchema = new mongoose.Schema({ contact: { email: String, notifications: Boolean } });
    const OtherContact = schemaCheckConnection.model('Contact', contactSchema.clone());
    const Contact = owningConnection.model('Contact', contactSchema);
    const recipientId = new mongoose.Types.ObjectId();
    await OtherContact.create({ _id: recipientId, contact: { email: 'wrong@app.test', notifications: true } });
    await Contact.create({ _id: recipientId, contact: { email: 'nested@app.test', notifications: true } });
    const contexts: EmailRecipientResolverContext[] = [];
    const resolver: EmailRecipientResolver = async (context) => {
      contexts.push(context);
      const LocalContact = context.connection.model<{ contact?: { email?: string; notifications?: boolean } }>(
        'Contact',
      );
      const contact = await LocalContact.findById(context.recipientId).select('contact').lean();
      return contact?.contact?.notifications ? contact.contact.email : null;
    };
    const notifier = vi.fn(async () => undefined);
    const Message = owningConnection.model(
      'Message',
      buildMessageSchema({
        connection: schemaCheckConnection,
        emailNotifier: notifier,
        emailRecipientResolver: resolver,
      }),
    );
    await Message.init();
    const globalModelSpy = vi.spyOn(mongoose, 'model').mockImplementation(() => {
      throw new Error('global model registry must not be used');
    });

    const message = await Message.create(fields(recipientId));

    expect(contexts).toHaveLength(1);
    expect(contexts[0].connection === owningConnection).toBe(true);
    expect(contexts[0].recipientId).toEqual(recipientId);
    expect(contexts[0].message._id).toEqual(message._id);
    expect(contexts[0].message).toMatchObject({
      templateCd: 'msga05-contact',
      payload: { contactPurpose: 'review' },
      display: { category: 'account' },
      receiverContent: { title: ' Email Title ' },
    });
    expect(await Message.exists({ _id: message._id })).not.toBeNull();
    expect(notifier).toHaveBeenCalledExactlyOnceWith('nested@app.test', 'Email Title', 'Long email body');
    expect(globalModelSpy).not.toHaveBeenCalled();
    expect(owningConnection.modelNames()).not.toContain('User');

    await Contact.updateOne({ _id: recipientId }, { $set: { 'contact.notifications': false } });
    await Message.create(fields(recipientId));
    expect(contexts).toHaveLength(2);
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(await Message.countDocuments()).toBe(2);
  });

  it('retains the default User.email adapter on the owning connection when the resolver is omitted', async () => {
    const schemaCheckConnection = await connection();
    const owningConnection = await connection();
    const User = owningConnection.model('User', new mongoose.Schema({ email: String }));
    const OtherUser = schemaCheckConnection.model('User', new mongoose.Schema({ email: String }));
    const recipientId = new mongoose.Types.ObjectId();
    await OtherUser.create({ _id: recipientId, email: 'wrong@app.test' });
    await User.create({ _id: recipientId, email: 'default@app.test' });
    const notifier = vi.fn();
    const observer = vi.fn();
    const Message = owningConnection.model(
      'Message',
      buildMessageSchema({
        connection: schemaCheckConnection,
        emailNotifier: notifier,
        onEmailDeliveryFailure: observer,
      }),
    );
    const globalModelSpy = vi.spyOn(mongoose, 'model').mockImplementation(() => {
      throw new Error('global model registry must not be used');
    });

    await Message.create(fields(recipientId));
    const noEmail = await User.create({});
    const emptyEmail = await User.create({ email: '' });
    for (const missingAddressId of [new mongoose.Types.ObjectId(), noEmail._id, emptyEmail._id]) {
      await Message.create(fields(missingAddressId));
    }

    expect(notifier).toHaveBeenCalledExactlyOnceWith('default@app.test', 'Email Title', 'Long email body');
    expect(await Message.countDocuments()).toBe(4);
    expect(observer).not.toHaveBeenCalled();
    expect(globalModelSpy).not.toHaveBeenCalled();
  });

  it('uses an external directory without any local User and preserves bound resolver/provider receivers', async () => {
    const recipientId = new mongoose.Types.ObjectId();
    const directory = {
      addresses: new Map([[String(recipientId), ' external@app.test ']]),
      resolve(context: EmailRecipientResolverContext) {
        return this.addresses.get(String(context.recipientId));
      },
    };
    const provider = {
      deliveries: [] as string[][],
      async sendNotification(address: string, title: string, body: string) {
        this.deliveries.push([address, title, body]);
      },
    };
    const { connection: owningConnection, Message } = await fixture({
      userModelName: 'NoDummyUser',
      emailRecipientResolver: directory.resolve.bind(directory),
      emailNotifier: provider.sendNotification.bind(provider),
    });

    await Message.create({
      ...fields(recipientId),
      receiverContent: { title: ' External ', long: 'L', short: 'Longer summary' },
    });

    expect(owningConnection.modelNames()).toEqual(['Message']);
    expect(provider.deliveries).toEqual([[' external@app.test ', 'External', 'Longer summary']]);
  });

  it('passes opaque String recipient IDs after host schema casting without requiring User registration', async () => {
    const owningConnection = await connection();
    const resolver = vi.fn<EmailRecipientResolver>(({ recipientId, message, connection }) => {
      expect(recipientId).toBe('oidc|Acme:Reviewer');
      expect(message.toUser).toBe(recipientId);
      expect(connection === owningConnection).toBe(true);
      return 'reviewer@app.test';
    });
    const notifier = vi.fn();
    const schema = buildMessageSchema({ emailRecipientResolver: resolver, emailNotifier: notifier });
    schema.add({ toUser: { type: String, trim: true, default: null } });
    const Message = owningConnection.model('Message', schema);

    const message = await Message.create({ ...fields(), toUser: ' oidc|Acme:Reviewer ' });

    expect((await Message.collection.findOne({ _id: message._id }))?.toUser).toBe('oidc|Acme:Reviewer');
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledExactlyOnceWith('reviewer@app.test', 'Email Title', 'Long email body');
    expect(owningConnection.modelNames()).toEqual(['Message']);
  });

  it.each([null, undefined, ''])('skips a missing address (%s) without failure or fallback lookup', async (address) => {
    const resolver = vi.fn(() => address);
    const observer = vi.fn();
    const { Message, notifier } = await fixture({ emailRecipientResolver: resolver, onEmailDeliveryFailure: observer });

    const message = await Message.create(fields());

    expect(await Message.countDocuments({ _id: message._id })).toBe(1);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(notifier).not.toHaveBeenCalled();
    expect(observer).not.toHaveBeenCalled();
  });

  it.each([
    ['recipientLookup', 'throw'],
    ['recipientLookup', 'reject'],
    ['notifier', 'throw'],
    ['notifier', 'reject'],
  ] as const)('observes %s %s and swallows the observer failure after persistence', async (stage, failureMode) => {
    const primaryError = new Error(`${stage} unavailable`);
    const fail = (error: Error) => {
      if (failureMode === 'throw') throw error;
      return Promise.reject(error);
    };
    const resolver = vi.fn(() => {
      if (stage === 'recipientLookup') return fail(primaryError);
      return 'resolved@app.test';
    });
    const notifier = vi.fn(() => fail(primaryError));
    const failures: EmailDeliveryFailureEvent[] = [];
    const observer = vi.fn((event: EmailDeliveryFailureEvent) => {
      failures.push(event);
      return fail(new Error('observer unavailable'));
    });
    const { Message } = await fixture({
      emailRecipientResolver: resolver,
      emailNotifier: notifier,
      onEmailDeliveryFailure: observer,
    });
    const input = fields();

    const message = await Message.create(input);

    expect(await Message.countDocuments({ _id: message._id })).toBe(1);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledTimes(stage === 'notifier' ? 1 : 0);
    expect(failures).toEqual([
      { stage, error: primaryError, messageId: message._id, recipientId: input.toUser, title: 'Email Title' },
    ]);
    expect(observer).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('never resolves session-bound writes (transaction committed: %s)', async (commit) => {
    const resolver = vi.fn(() => 'session@app.test');
    const { connection: owningConnection, Message, notifier } = await fixture({ emailRecipientResolver: resolver });
    const session = await owningConnection.startSession();
    try {
      const write = session.withTransaction(async () => {
        await Message.create([fields()], { session });
        if (!commit) throw new Error('rollback');
      });
      if (commit) await write;
      else await expect(write).rejects.toThrow('rollback');
    } finally {
      await session.endSession();
    }

    expect(await Message.countDocuments()).toBe(commit ? 1 : 0);
    expect(resolver).not.toHaveBeenCalled();
    expect(notifier).not.toHaveBeenCalled();
  });

  it('skips sessions outside transactions and does not resolve on a later session-free update', async () => {
    const resolver = vi.fn(() => 'session@app.test');
    const { connection: owningConnection, Message, notifier } = await fixture({ emailRecipientResolver: resolver });
    const session = await owningConnection.startSession();
    const message = new Message(fields());
    try {
      await message.save({ session });
      message.$session(null);
      message.set('receiverContent.title', 'Updated');
      await message.save();
    } finally {
      await session.endSession();
    }

    expect(await Message.countDocuments()).toBe(1);
    expect(resolver).not.toHaveBeenCalled();
    expect(notifier).not.toHaveBeenCalled();
  });

  it('does not resolve again on hydrated saves or query updates', async () => {
    const resolver = vi.fn(() => 'once@app.test');
    const { Message, notifier } = await fixture({ emailRecipientResolver: resolver });
    const message = await Message.create(fields());
    message.set('receiverContent.title', 'Updated');
    await message.save();
    const reread = await Message.findById(message._id).orFail();
    reread.set('receiverContent.title', 'Rehydrated');
    await reread.save();
    await Message.updateOne({ _id: message._id }, { $set: { 'receiverContent.title': 'Query updated' } });

    expect(resolver).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledTimes(1);
  });

  it.each(['excluded', 'blank title', 'missing recipient', 'missing title'])(
    'does not run custom lookup or delivery for %s',
    async (reason) => {
      const resolver = vi.fn(() => 'skipped@app.test');
      const observer = vi.fn();
      const { Message, notifier } = await fixture({
        emailRecipientResolver: resolver,
        emailNotificationExclusions: [' email title '],
        onEmailDeliveryFailure: observer,
      });
      const input = fields(null, 'Allowed');
      if (reason !== 'missing recipient') input.toUser = new mongoose.Types.ObjectId();
      if (reason === 'excluded') input.receiverContent.title = ' EMAIL Title ';
      if (reason === 'blank title') input.receiverContent.title = '   ';
      if (reason === 'missing title') input.receiverContent.title = '';

      await Message.create(input);

      expect(await Message.countDocuments()).toBe(1);
      expect(resolver).not.toHaveBeenCalled();
      expect(notifier).not.toHaveBeenCalled();
      expect(observer).not.toHaveBeenCalled();
    },
  );

  it.each([null, undefined])('does not run custom lookup when emailNotifier is %s', async (emailNotifier) => {
    const resolver = vi.fn(() => 'disabled@app.test');
    const observer = vi.fn();
    const { Message } = await fixture({
      emailNotifier,
      emailRecipientResolver: resolver,
      onEmailDeliveryFailure: observer,
    });

    await Message.create(fields());

    expect(await Message.countDocuments()).toBe(1);
    expect(resolver).not.toHaveBeenCalled();
    expect(observer).not.toHaveBeenCalled();
  });
});
