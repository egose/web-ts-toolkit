import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  cleanupPackedConsumerTempRoots,
  containsDisallowedPublishedValue,
  installPackedConsumer,
  packageRoot,
  preparePackedWorkspace,
  rootPackageJson,
  run,
  testVersion,
  type PackageJson,
} from './support/packed-consumer-harness';

const publicRuntimeExports = [
  'MESSAGE_MODEL_NAME',
  'MESSAGE_ARCHIVE_MODEL_NAME',
  'MESSAGE_REQUEST_MODEL_NAME',
  'MessageContentSchema',
  'BaseMessageFields',
  'MessageSchema',
  'buildMessageSchema',
  'MessageArchiveSchema',
  'buildMessageArchiveSchema',
  'MessageRequestSchema',
  'buildMessageRequestSchema',
  'interpolateTemplate',
  'interpolateMessageContent',
  'resolveUiTemplate',
  'filterActions',
  'isActionAllowed',
  'hasExplicitPermissionGrant',
  'isValidMessageUserId',
  'requireMessageUserId',
  'TemplateRegistry',
  'TemplateRegistryValidationError',
  'defaultRegistry',
  'includesAction',
  'NoopEmailProvider',
  'NoopPaymentProvider',
  'MessageService',
  'GENERIC_NOTIFICATION_TEMPLATE_CD',
  'ActionTemplateMismatchError',
  'ActionConflictError',
  'ActionNotificationPendingError',
  'InvalidMessageUserError',
  'MessageArchivedError',
  'MessageNotFoundError',
  'TemplateNotFoundError',
  'ActionNotFoundError',
  'ActionNotAllowedError',
  'ActionRetryableError',
  'InvalidClientRequestIdError',
  'InvalidMessageServiceOptionError',
  'InvalidPaginationValueError',
  'MAX_MESSAGE_SERVICE_TIMEOUT_MS',
  'ClientRequestPendingError',
  'ClientRequestFailedError',
  'ClientRequestInconsistentStateError',
  'MessageTransactionRequiredError',
  'MessageModelResolutionError',
  'PaymentSessionCompensationError',
  'PaymentSessionCompensationAggregateError',
  'createMessageRoutes',
  'serializePublicMessage',
] as const;

function readQuickStartExample(): string {
  const readme = readFileSync(path.resolve(packageRoot, 'README.md'), 'utf8');
  const quickStart = readme.match(/## Quick Start\n\n```typescript\n([\s\S]*?)\n```/);
  if (!quickStart) {
    throw new Error('README Quick Start TypeScript block not found');
  }
  return quickStart[1];
}

function readReadmeTypescriptBlocks(): string[] {
  const readme = readFileSync(path.resolve(packageRoot, 'README.md'), 'utf8');
  return [...readme.matchAll(/```typescript\n([\s\S]*?)\n```/g)].map((match) => match[1]);
}

function writeConsumerFiles(consumerDir: string): void {
  const publicExample = readReadmeTypescriptBlocks().find((block) =>
    block.includes('export async function publicInbox'),
  );
  if (!publicExample) throw new Error('README publicInbox example missing');
  writeFileSync(path.resolve(consumerDir, 'readme-public-message.ts'), publicExample);
  const publicTypes = `
import { serializePublicMessage, MessageService as ReadService, type InterpolatedAction as ReadAction, type UiTemplate as ReadUiTemplate, type PublicMessageDto, type PublicMessageParty, type PublicMessageSource } from '@web-ts-toolkit/message-service';
import type { IMessage as PublicActive, IMessageArchive as PublicArchive } from '@web-ts-toolkit/message-service';
declare const publicActive: PublicActive;
declare const publicArchive: PublicArchive;
const activeDto: PublicMessageDto = serializePublicMessage(publicActive);
const archiveDto: PublicMessageDto = serializePublicMessage(publicArchive);
const dtoId: string = activeDto._id;
const dtoDate: string = activeDto.createdAt;
const attemptId: string | null = archiveDto.actionAttemptId;
const archiveDate: string | undefined = archiveDto.archivedAt;
const publicParty: PublicMessageParty = { _id: 'user', displayName: 'User', email: 'user@example.test' };
const populatedSource: PublicMessageSource = { ...publicActive, fromUser: publicParty };
serializePublicMessage(populatedSource);
// @ts-expect-error operational diagnostics are not public DTO fields
activeDto.actionFailureMessage;
// @ts-expect-error worker ownership is private
archiveDto.actionOwnerToken;
// @ts-expect-error request bookkeeping is private
activeDto.clientRequestId;
// @ts-expect-error arbitrary populated user secrets are not declared
publicParty.password;
// @ts-expect-error public dates are serialized strings
const rawDate: Date = activeDto.createdAt;
void [dtoId, dtoDate, attemptId, archiveDate, rawDate];
declare const readService: ReadService;
async function authoritativeActions(): Promise<{ uiTemplate: ReadUiTemplate; actions: ReadAction[] } | null> {
  // The deprecated supplied copy remains type-compatible, but is ignored at runtime.
  await readService.getActions(String(publicActive._id), 'receiver', {
    user: { _id: 'receiver' }, message: publicActive, populate: ['fromUser', 'toUser'],
  });
  return readService.getActions(String(publicArchive._id), 'sender', {
    user: { _id: 'sender' }, message: publicArchive, populate: { path: 'fromUser', select: 'displayName' },
  });
}
void authoritativeActions;
`;
  const cleanupTypes = `
import {
  MessageService as CleanupService,
  createMessageRoutes as cleanupRoutes,
  buildMessageSchema as cleanupSchema,
  type MessageTransactionCleanupFailureEvent,
  type MessageTransactionCleanupFailureObserver,
} from '@web-ts-toolkit/message-service';
const cleanupObserver: MessageTransactionCleanupFailureObserver = async (event) => {
  const stage: 'endSession' = event.stage;
  const operation: 'createBatch' | 'actionArchive' | 'directArchive' = event.operation;
  if (event.outcome === 'failed') {
    const primary: unknown = event.originalError;
    void primary;
  } else {
    const absent: undefined = event.originalError;
    void absent;
  }
  void stage;
  void operation;
};
const cleanupService = new CleanupService({ onTransactionCleanupFailure: cleanupObserver });
cleanupSchema({ onTransactionCleanupFailure: cleanupObserver });
cleanupRoutes({ getModel: (name) => { throw new Error(name); }, onTransactionCleanupFailure: cleanupObserver });
cleanupRoutes({ service: cleanupService });
// @ts-expect-error injection cannot silently discard a construction observer
cleanupRoutes({ service: cleanupService, onTransactionCleanupFailure: cleanupObserver });
const cleanupEvent: MessageTransactionCleanupFailureEvent = {
  operation: 'createBatch', stage: 'endSession', outcome: 'committed', error: new Error('cleanup'),
};
// @ts-expect-error failed diagnostics must include the primary transaction error
const incompleteCleanup: MessageTransactionCleanupFailureEvent = { operation: 'directArchive', stage: 'endSession', outcome: 'failed', error: null };
void cleanupEvent;
void incompleteCleanup;
`;
  writeFileSync(
    path.resolve(consumerDir, 'consumer.mjs'),
    `import { MessageService, TemplateRegistry, buildMessageSchema } from '@web-ts-toolkit/message-service';

const registry = new TemplateRegistry();
const schema = buildMessageSchema();
const service = new MessageService({ getModel: (name) => { throw new Error(name); }, registry });

if (typeof MessageService !== 'function') throw new Error('missing MessageService');
if (typeof registry.register !== 'function') throw new Error('missing TemplateRegistry');
if (!schema.methods.isReceiver) throw new Error('missing schema methods');
if (typeof service.createMessage !== 'function') throw new Error('missing service method');
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'consumer.cjs'),
    `const mod = require('@web-ts-toolkit/message-service');

const registry = new mod.TemplateRegistry();
const schema = mod.buildMessageSchema();
const service = new mod.MessageService({ getModel: (name) => { throw new Error(name); }, registry });

if (typeof mod.MessageService !== 'function') throw new Error('missing MessageService');
if (typeof registry.register !== 'function') throw new Error('missing TemplateRegistry');
if (!schema.methods.isReceiver) throw new Error('missing schema methods');
if (typeof service.createMessage !== 'function') throw new Error('missing service method');
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.mts'),
    `import { MessageService, TemplateRegistry, buildMessageSchema, type IMessage, type IMessageArchive, type MessageTemplate, type MessageUser, type UserId } from '@web-ts-toolkit/message-service';

const registry = new TemplateRegistry();
const template: MessageTemplate = {
  templateCd: 'consumer-template',
  type: 'request',
  description: 'Consumer template',
  senderContent: { title: 'S', long: 'S', short: 'S' },
  receiverContent: { title: 'R', long: 'R', short: 'R' },
  uiTemplate: 'default-message',
  prepareMessage: async ({ user }) => ({ fromUser: user._id, toRoles: ['reviewer'], payload: {} }),
  actions: [],
};
const service = new MessageService({ getModel: (name) => { throw new Error(name); }, registry });
const user: MessageUser = { _id: 'user-1', roles: ['reviewer'] };
declare const active: IMessage;
declare const archive: IMessageArchive;
const userId: UserId = user._id;

registry.register(template);
buildMessageSchema();
void active.archive('approve', userId, registry);
// @ts-expect-error archive documents do not expose active lifecycle archive()
archive.archive('approve', userId, registry);
// MSGF-13: action-list identity is required; registry views are readonly.
async function requiredActionUser(): Promise<void> {
  // @ts-expect-error user is required for action listings
  await service.getActions('507f1f77bcf86cd799439011', 'receiver', {}); // pragma: allowlist secret
}
const registered = registry.find('consumer-template');
if (registered) {
  // @ts-expect-error frozen registry content views are readonly
  registered.senderContent.title = 'mutated';
  // @ts-expect-error frozen registry action arrays are readonly
  registered.actions.push({ actionCd: 'x', name: 'X', variant: 'primary', sender: false, receiver: true, runHandler: async () => null });
}
// MSGF-06 replay contract: idempotent createMessage replays current
// active/archive records, so the declared return includes IMessageArchive.
type ReplayResult = Awaited<ReturnType<typeof service.createMessage>>;
type ReplayIncludesArchive = Extract<ReplayResult[number], IMessageArchive> extends never ? 'missing' : 'present';
const replayContract: ReplayIncludesArchive = 'present';
async function replayNarrowing(): Promise<string | null> {
  const replay: ReplayResult = await service.createMessage({ templateCd: 'consumer-template', user });
  const first = replay[0];
  if (first && 'archivedAt' in first) {
    const archived: IMessageArchive = first;
    return String(archived.archivedAt);
  }
  return null;
}
void service;
void user;
void replayContract;
void replayNarrowing;
void requiredActionUser;
void registered;
${cleanupTypes}
${publicTypes}
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'consumer.nodenext.cts'),
    `import messageService = require('@web-ts-toolkit/message-service');
import type { MessageTemplate } from '@web-ts-toolkit/message-service';

const registry = new messageService.TemplateRegistry();
const template: MessageTemplate = {
  templateCd: 'consumer-cjs-template',
  type: 'request',
  description: 'Consumer CJS template',
  senderContent: { title: 'S', long: 'S', short: 'S' },
  receiverContent: { title: 'R', long: 'R', short: 'R' },
  uiTemplate: 'default-message',
  prepareMessage: async ({ user }) => ({ fromUser: user._id, toRoles: ['reviewer'], payload: {} }),
  actions: [],
};

registry.register(template);
messageService.buildMessageRequestSchema();
${cleanupTypes}
${publicTypes}
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'consumer.bundler.ts'),
    `import {
  ActionConflictError,
  ActionNotAllowedError,
  ActionNotificationPendingError,
  ActionNotFoundError,
  ActionRetryableError,
  ActionTemplateMismatchError,
  BaseMessageFields,
  ClientRequestFailedError,
  ClientRequestInconsistentStateError,
  ClientRequestPendingError,
  GENERIC_NOTIFICATION_TEMPLATE_CD,
  InvalidClientRequestIdError,
  InvalidMessageServiceOptionError,
  InvalidMessageUserError,
  InvalidPaginationValueError,
  MAX_MESSAGE_SERVICE_TIMEOUT_MS,
  MESSAGE_ARCHIVE_MODEL_NAME,
  MESSAGE_MODEL_NAME,
  MESSAGE_REQUEST_MODEL_NAME,
  MessageArchivedError,
  MessageArchiveSchema,
  MessageContentSchema,
  MessageModelResolutionError,
  MessageNotFoundError,
  MessageRequestSchema,
  MessageSchema,
  MessageService,
  MessageTransactionRequiredError,
  NoopEmailProvider,
  NoopPaymentProvider,
  PaymentSessionCompensationAggregateError,
  PaymentSessionCompensationError,
  TemplateNotFoundError,
  TemplateRegistry,
  TemplateRegistryValidationError,
  buildMessageArchiveSchema,
  buildMessageRequestSchema,
  buildMessageSchema,
  createMessageRoutes,
  defaultRegistry,
  filterActions,
  hasExplicitPermissionGrant,
  includesAction,
  interpolateMessageContent,
  interpolateTemplate,
  isActionAllowed,
  isValidMessageUserId,
  requireMessageUserId,
  resolveUiTemplate,
  type ActionConfirmation,
  type ActionContext,
  type EmailDeliveryFailureEvent,
  type EmailDeliveryFailureStage,
  type EmailNotifier,
  type EmailProvider,
  type IBaseMessage,
  type IMessage,
  type IMessageArchive,
  type IMessageContent,
  type IMessageMethods,
  type InterpolatedAction,
  type InterpolatedContent,
  type InterpolationResult,
  type MessageAction,
  type MessageRoutesBehaviorOptions,
  type MessageRoutesConstructionOptions,
  type MessageRoutesInjectionOptions,
  type MessageRoutesOptions,
  type MessageSchemaConfig,
  type MessageServiceModelNames,
  type MessageServiceOptions,
  type MessageTemplate,
  type MessageType,
  type MessageUser,
  type PaymentCompensationFailureEvent,
  type PaymentProvider,
  type PaymentSessionCompensationFailure,
  type PrepareContext,
  type PrepareResult,
  type RegisteredMessageAction,
  type RegisteredMessageTemplate,
  type RegisteredUiTemplate,
  type SenderNotificationContent,
  type UiTemplate,
  type UserId,
  type Usertype,
} from '@web-ts-toolkit/message-service';

const registry = new TemplateRegistry();
const template: MessageTemplate = {
  templateCd: 'consumer-bundler-template',
  type: 'notification',
  description: 'Bundler consumer template',
  senderContent: { title: 'S', long: 'S', short: 'S' },
  receiverContent: { title: 'R', long: 'R', short: 'R' },
  uiTemplate: { receiver: 'message' },
  prepareMessage: async () => null,
  actions: [],
};
const service = new MessageService({ getModel: (name) => { throw new Error(name); }, registry });
const error = new ActionNotAllowedError();
const ids = [MESSAGE_MODEL_NAME, MESSAGE_ARCHIVE_MODEL_NAME, MESSAGE_REQUEST_MODEL_NAME, GENERIC_NOTIFICATION_TEMPLATE_CD];
const runtimeValues = [
  ActionConflictError,
  ActionNotificationPendingError,
  ActionNotFoundError,
  ActionRetryableError,
  ActionTemplateMismatchError,
  BaseMessageFields,
  ClientRequestFailedError,
  ClientRequestInconsistentStateError,
  ClientRequestPendingError,
  InvalidClientRequestIdError,
  InvalidMessageServiceOptionError,
  InvalidMessageUserError,
  InvalidPaginationValueError,
  MAX_MESSAGE_SERVICE_TIMEOUT_MS,
  MessageArchivedError,
  MessageArchiveSchema,
  MessageContentSchema,
  MessageModelResolutionError,
  MessageNotFoundError,
  MessageRequestSchema,
  MessageSchema,
  MessageTransactionRequiredError,
  NoopEmailProvider,
  NoopPaymentProvider,
  PaymentSessionCompensationAggregateError,
  PaymentSessionCompensationError,
  TemplateNotFoundError,
  TemplateRegistryValidationError,
  buildMessageArchiveSchema,
  buildMessageRequestSchema,
  buildMessageSchema,
  createMessageRoutes,
  defaultRegistry,
  filterActions,
  hasExplicitPermissionGrant,
  includesAction,
  interpolateMessageContent,
  interpolateTemplate,
  isActionAllowed,
  isValidMessageUserId,
  requireMessageUserId,
  resolveUiTemplate,
];
type DeclaredTypes = [ActionConfirmation, ActionContext, EmailDeliveryFailureEvent, EmailDeliveryFailureStage, EmailNotifier, EmailProvider, IBaseMessage, IMessage, IMessageArchive, IMessageContent, IMessageMethods, InterpolatedAction, InterpolatedContent, InterpolationResult, MessageAction, MessageRoutesBehaviorOptions, MessageRoutesConstructionOptions, MessageRoutesInjectionOptions, MessageRoutesOptions, MessageSchemaConfig, MessageServiceModelNames, MessageServiceOptions, MessageType, MessageUser, PaymentCompensationFailureEvent, PaymentProvider, PaymentSessionCompensationFailure, PrepareContext, PrepareResult, RegisteredMessageAction, RegisteredMessageTemplate, RegisteredUiTemplate, SenderNotificationContent, UiTemplate, UserId, Usertype];
// MSGF-06 replay contract: the published createMessage return includes archived records.
type BundlerReplay = Awaited<ReturnType<MessageService['createMessage']>>;
type BundlerReplayHasArchive = Extract<BundlerReplay[number], IMessageArchive> extends never ? 'missing' : 'present';
const bundlerReplayContract: BundlerReplayHasArchive = 'present';
// MSGF-11 composition contract: strict consumers express both paths and
// reject ambiguous configs at compile time.
const constructionOpts: MessageRoutesConstructionOptions = {
  getModel: (name) => { throw new Error(name); },
  registry,
};
const suppliedService = new MessageService({ getModel: (name) => { throw new Error(name); }, registry });
const injectionOpts: MessageRoutesInjectionOptions = { service: suppliedService };
const behaviorOpts: MessageRoutesBehaviorOptions = { adminPermissionKey: 'is.admin' };
// @ts-expect-error MSGF-11: service cannot be combined with construction options
const ambiguousOpts: MessageRoutesOptions = { service: suppliedService, getModel: (name) => { throw new Error(name); } };
const validOpts: MessageRoutesOptions = injectionOpts;

registry.register(template);
// MSGF-13: strict consumers reject missing action-list users and writes to
// frozen registry structure; valid usage compiles.
async function bundlerRequiredUser(): Promise<void> {
  // @ts-expect-error user is required for action listings
  await service.getActions('507f1f77bcf86cd799439011', 'receiver', {}); // pragma: allowlist secret
}
const bundlerRegistered = registry.find('consumer-bundler-template');
if (bundlerRegistered) {
  // @ts-expect-error frozen registry content views are readonly
  bundlerRegistered.receiverContent.title = 'mutated';
  const readonlyCheck: RegisteredMessageTemplate | undefined = bundlerRegistered;
  const readonlyAction: RegisteredMessageAction | undefined = bundlerRegistered.actions[0];
  void readonlyCheck;
  void readonlyAction;
}
// MSGF-13: shared principal contract is a runtime export.
if (!isValidMessageUserId('user-1')) throw new Error('expected valid user id');
if (typeof requireMessageUserId !== 'function') throw new Error('missing requireMessageUserId');
// MSGF-13: typed provider example has no implicit-any errors.
async function bundlerProviderExample(): Promise<void> {
  const { NoopPaymentProvider: BundlerNoop } = await import('@web-ts-toolkit/message-service');
  const provider = new BundlerNoop();
  await provider.expireSession('session_123');
}
void service;
void bundlerReplayContract;
void constructionOpts;
void injectionOpts;
void behaviorOpts;
void bundlerRequiredUser;
void bundlerRegistered;
void bundlerProviderExample;
void ambiguousOpts;
void validOpts;
void error;
void ids;
void runtimeValues;
void (undefined as unknown as DeclaredTypes);
${cleanupTypes}
${publicTypes}
`,
  );
  for (const format of ['mjs', 'cjs']) {
    writeFileSync(
      path.resolve(consumerDir, `public-message.${format}`),
      `
${format === 'cjs' ? "const mod = require('@web-ts-toolkit/message-service');" : "import * as mod from '@web-ts-toolkit/message-service';"}
${format === 'cjs' ? "const mongoose = require('mongoose'); const assert = require('node:assert/strict');" : "import mongoose from 'mongoose'; import assert from 'node:assert/strict';"}
const Model = mongoose.model('PackedPublic', mod.buildMessageSchema());
const doc = new Model({
  templateCd: 'public', receiverContent: { title: 'Business', long: 'Body', short: 'Summary' },
  actionOwnerToken: 'PRIVATE_TOKEN', actionFailureMessage: 'PRIVATE_DIAGNOSTIC',
  clientRequestId: 'PRIVATE_REQUEST', paymentSession: 'business-payment',
  createdAt: new Date(), updatedAt: new Date(),
});
const dto = mod.serializePublicMessage(doc);
assert.equal(dto._id, String(doc._id));
assert.equal(dto.receiverContent.title, 'Business');
assert.equal(dto.paymentSession, 'business-payment');
assert.equal(dto.createdAt, doc.createdAt.toISOString());
assert.equal(JSON.stringify(dto).includes('PRIVATE'), false);
assert.equal(doc.actionOwnerToken, 'PRIVATE_TOKEN');
assert.equal(typeof doc.archive, 'function');
const archive = mod.serializePublicMessage({
  ...doc.toObject(), archivedAt: new Date(), archivedBy: { _id: doc._id, secret: 'PRIVATE_USER' }, // pragma: allowlist secret
  fromUser: { _id: doc._id, displayName: 'Sender', password: 'PRIVATE_PASSWORD' }, // pragma: allowlist secret
  actionAttemptId: 'business-attempt', actionNotificationState: 'failed', actionNotificationError: 'PRIVATE_NOTIFICATION',
});
assert.deepEqual(archive.fromUser, { _id: String(doc._id), displayName: 'Sender' });
assert.equal(archive.archivedBy, String(doc._id));
assert.equal(archive.actionAttemptId, 'business-attempt');
assert.equal(archive.actionNotificationState, 'failed');
assert.equal(JSON.stringify(archive).includes('PRIVATE'), false);
`,
    );
    writeFileSync(
      path.resolve(consumerDir, `transaction-cleanup.${format}`),
      `
(async () => {
  const assert = (await import('node:assert/strict')).default;
  const mongoose = (await import('mongoose')).default;
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const mod = ${format === 'cjs' ? "require('@web-ts-toolkit/message-service')" : "await import('@web-ts-toolkit/message-service')"};
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const connection = await mongoose.createConnection(replSet.getUri()).asPromise();
  const events = [];
  const cleanupError = new Error('packed cleanup rejected');
  const observer = async (event) => { events.push(event); throw new Error('packed observer rejected'); };
  try {
    const Message = connection.model(mod.MESSAGE_MODEL_NAME, mod.buildMessageSchema({ onTransactionCleanupFailure: observer }));
    const Archive = connection.model(mod.MESSAGE_ARCHIVE_MODEL_NAME, mod.buildMessageArchiveSchema());
    const Request = connection.model(mod.MESSAGE_REQUEST_MODEL_NAME, mod.buildMessageRequestSchema());
    await Promise.all([Message.init(), Archive.init(), Request.init()]);
    const start = connection.startSession.bind(connection);
    connection.startSession = async () => {
      const session = await start();
      const end = session.endSession.bind(session);
      session.endSession = async () => { await end(); throw cleanupError; };
      return session;
    };
    const registry = new mod.TemplateRegistry();
    const receiver = new mongoose.Types.ObjectId();
    let prepared = 0;
    let expired = 0;
    let notified = 0;
    registry.register({
      templateCd: 'packed-cleanup', type: 'request', description: 'Packed cleanup', paymentCd: 'pay',
      senderContent: { title: 'S', long: 'S', short: 'S' }, receiverContent: { title: 'R', long: 'R', short: 'R' },
      uiTemplate: 'default-message',
      prepareMessage: async ({ user }) => ({ fromUser: user._id, toUser: receiver, payload: {} }),
      actions: [{ actionCd: 'approve', name: 'Approve', variant: 'success', sender: false, receiver: true,
        runHandler: async () => 'approved',
        senderNotification: async () => { notified++; return { title: 'Approved', long: 'Approved' }; },
      }],
    });
    const { service } = mod.createMessageRoutes({
      getModel: (name) => connection.model(name), registry, onTransactionCleanupFailure: observer,
      paymentProvider: { createSession: async () => 'packed-payment-' + (++prepared), expireSession: async () => { expired++; }, refundPayment: async () => {} },
    });
    assert.throws(() => mod.createMessageRoutes({ service, onTransactionCleanupFailure: observer }), mod.InvalidMessageServiceOptionError);
    const input = { templateCd: 'packed-cleanup', user: { _id: new mongoose.Types.ObjectId() }, clientRequestId: 'packed-key' };
    const [message] = await service.createMessage(input);
    const [replay] = await service.createMessage(input);
    assert.equal(String(message._id), String(replay._id));
    assert.equal(prepared, 1);
    assert.equal(expired, 0);
    assert.equal((await Request.findOne({ clientRequestId: 'packed-key' })).state, 'completed');
    assert.equal(await service.handleAction('packed-cleanup', 'approve', { message, user: { _id: receiver } }), 'approved');
    assert.equal(notified, 1);
    assert.equal((await Archive.findById(message._id)).actionNotificationState, 'sent');
    assert.equal(await Message.countDocuments({ _id: message._id }), 0);
    const [direct] = await service.createMessage({ ...input, clientRequestId: undefined });
    await direct.archive('approve', receiver, registry);
    assert.equal((await Archive.findById(direct._id)).actionNotificationState, 'none');
    assert.equal(await Message.countDocuments({ _id: direct._id }), 0);
    assert.deepEqual(events.map(({ operation, outcome }) => [operation, outcome]), [
      ['createBatch', 'committed'], ['actionArchive', 'committed'], ['directArchive', 'committed'],
    ]);
    for (const event of events) {
      assert.equal(event.stage, 'endSession');
      assert.equal(event.error, cleanupError);
      assert.equal('originalError' in event, false);
    }
    // MSGR-04 installed ESM/CJS contracts reuse the real MongoDB lifecycle above.
    const readOptions = { user: { _id: receiver }, message };
    assert.deepEqual(await service.getActions(String(message._id), 'receiver', readOptions), {
      uiTemplate: 'default-message', actions: [],
    });
    assert.equal(await service.getActions(String(new mongoose.Types.ObjectId()), 'receiver', readOptions), null);
    const staleArchive = await service.findMessageOrThrow(String(message._id));
    await Archive.updateOne({ _id: message._id }, { $set: { toUser: new mongoose.Types.ObjectId() } });
    assert.equal(await service.getActions(String(message._id), 'receiver', { ...readOptions, message: staleArchive }), null);
    await assert.rejects(service.handleAction('packed-cleanup', 'approve', {
      message: staleArchive, user: { _id: receiver },
    }), mod.ActionNotAllowedError);
    await Archive.updateOne({ _id: message._id }, { $set: { actionNotificationState: 'failed', actionAttemptId: 'current-attempt' } });
    await assert.rejects(service.handleAction('removed', 'removed', {
      message: staleArchive, user: input.user,
    }), (error) => error instanceof mod.ActionNotificationPendingError && error.actionAttemptId === 'current-attempt');
    const User = connection.model('PackedReadUser', new mongoose.Schema({ displayName: String }));
    await User.create({ _id: input.user._id, displayName: 'Sender' });
    const populated = await service.findMessageOrThrow(String(message._id), { populate: { path: 'fromUser', model: User } });
    assert.equal(populated.isSender(input.user), true);
    await User.deleteMany({});
    const missing = await service.findMessageOrThrow(String(message._id), { populate: { path: 'fromUser', model: User } });
    assert.equal(missing.isSender(input.user), false);
    assert.equal(missing.isSender({ _id: 'null' }), false);
    await Archive.deleteOne({ _id: message._id });
    await assert.rejects(service.handleAction('removed', 'removed', {
      message: staleArchive, user: input.user,
    }), mod.MessageNotFoundError);
  } finally {
    await connection.dropDatabase();
    await connection.close();
    await replSet.stop();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
`,
    );
  }
  writeFileSync(path.resolve(consumerDir, 'readme-quick-start.ts'), `${readQuickStartExample()}\n`);
  // MSGF-13: compile primary standalone snippets against the packed package
  // with explicit host fixtures. The quick start above covers the mount flow;
  // these cover the typed provider and create/action shapes.
  writeFileSync(
    path.resolve(consumerDir, 'readme-providers.ts'),
    `import { type PaymentProvider, type UserId } from '@web-ts-toolkit/message-service';

async function createCheckoutSession(
  user: UserId,
  code: string,
  priceArgs?: Record<string, unknown>,
): Promise<string> {
  void user;
  void code;
  void priceArgs;
  return 'session_123';
}

async function expireCheckoutSession(sessionId: string): Promise<void> {
  void sessionId;
}

class StripePaymentProvider implements PaymentProvider {
  async createSession(user: UserId, code: string, priceArgs?: Record<string, unknown>): Promise<string | null> {
    return createCheckoutSession(user, code, priceArgs);
  }
  async expireSession(sessionId: string): Promise<void> {
    await expireCheckoutSession(sessionId);
  }
  async refundPayment(sessionId: string): Promise<void> {
    void sessionId;
  }
}

export function buildProvider(): PaymentProvider {
  return new StripePaymentProvider();
}
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'readme-create-action.ts'),
    `import mongoose from 'mongoose';
import {
  MessageService,
  TemplateRegistry,
  type IMessage,
  type MessageTemplate,
} from '@web-ts-toolkit/message-service';

const registry = new TemplateRegistry();
const template: MessageTemplate = {
  templateCd: 'welcome.request',
  type: 'request',
  description: 'Welcome request',
  senderContent: { title: 'Welcome {{name}}', long: 'Sent to reviewers', short: 'Sent' },
  receiverContent: { title: 'Review {{name}}', long: 'Please review this request', short: 'Review' },
  uiTemplate: 'default-message',
  prepareMessage: async ({ user, payload }) => ({
    fromUser: user._id,
    toRoles: ['reviewer'],
    payload,
    templateData: { name: String(payload.name ?? '') },
  }),
  actions: [
    {
      actionCd: 'approve',
      name: 'Approve',
      variant: 'primary',
      sender: false,
      receiver: true,
      runHandler: async ({ actionAttemptId }) => ({ actionAttemptId }),
    },
  ],
};
registry.register(template);

const service = new MessageService({ getModel: (name) => { throw new Error(name); }, registry });

export async function createAndList(): Promise<void> {
  const senderId = new mongoose.Types.ObjectId();
  const reviewerId = new mongoose.Types.ObjectId();
  const created = await service.createMessage({
    templateCd: 'welcome.request',
    user: { _id: senderId },
    payload: { name: 'Ada' },
  });
  const message = created[0] as IMessage;
  void message.receiverContent.title;
  const listed = await service.getActions(String(message._id), 'receiver', {
    user: { _id: reviewerId, roles: ['reviewer'] },
  });
  void listed?.actions.map((action) => action.actionCd);
}
`,
  );
  // MSGF-13: executable README create/action flow against real persistence
  // (packed imports only), asserting rendered values — not merely a 200.
  writeFileSync(
    path.resolve(consumerDir, 'readme-create-action-runtime.mjs'),
    `import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  buildMessageArchiveSchema,
  buildMessageRequestSchema,
  buildMessageSchema,
  MESSAGE_ARCHIVE_MODEL_NAME,
  MESSAGE_MODEL_NAME,
  MESSAGE_REQUEST_MODEL_NAME,
  MessageService,
  TemplateRegistry,
} from '@web-ts-toolkit/message-service';

const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
const uri = replSet.getUri();
const connection = await mongoose.createConnection(uri, { dbName: 'readme_contract' }).asPromise();
try {
  const Message = connection.model(MESSAGE_MODEL_NAME, buildMessageSchema());
  const MessageArchive = connection.model(MESSAGE_ARCHIVE_MODEL_NAME, buildMessageArchiveSchema());
  const MessageRequest = connection.model(MESSAGE_REQUEST_MODEL_NAME, buildMessageRequestSchema());
  await Promise.all([Message.init(), MessageArchive.init(), MessageRequest.init()]);

  const registry = new TemplateRegistry();
  registry.register({
    templateCd: 'welcome.request',
    type: 'request',
    description: 'Welcome request',
    senderContent: { title: 'Welcome {{name}}', long: 'Sent to reviewers', short: 'Sent' },
    receiverContent: { title: 'Review {{name}}', long: 'Please review this request', short: 'Review' },
    uiTemplate: 'default-message',
    prepareMessage: async ({ user, payload }) => ({
      fromUser: user._id,
      toRoles: ['reviewer'],
      payload,
      templateData: { name: String(payload.name ?? '') },
    }),
    actions: [
      {
        actionCd: 'approve',
        name: 'Approve',
        variant: 'primary',
        sender: false,
        receiver: true,
        runHandler: async ({ actionAttemptId }) => ({ actionAttemptId }),
      },
    ],
  });

  const getModel = (name) => {
    if (name === MESSAGE_MODEL_NAME) return Message;
    if (name === MESSAGE_ARCHIVE_MODEL_NAME) return MessageArchive;
    if (name === MESSAGE_REQUEST_MODEL_NAME) return MessageRequest;
    throw new Error('unknown model ' + name);
  };
  const service = new MessageService({ getModel, registry });

  const senderId = new mongoose.Types.ObjectId();
  const reviewerId = new mongoose.Types.ObjectId();
  const created = await service.createMessage({
    templateCd: 'welcome.request',
    user: { _id: senderId },
    payload: { name: 'Ada' },
  });
  if (created.length !== 1) throw new Error('expected one created message');
  const message = created[0];
  if ('archivedAt' in message) throw new Error('expected an active message');
  if (message.receiverContent.title !== 'Review Ada') throw new Error('unexpected rendered title: ' + message.receiverContent.title);
  if (message.senderContent.title !== 'Welcome Ada') throw new Error('unexpected sender title: ' + message.senderContent.title);

  const listed = await service.getActions(String(message._id), 'receiver', {
    user: { _id: reviewerId, roles: ['reviewer'] },
  });
  if (!listed || listed.actions.map((a) => a.actionCd).join(',') !== 'approve') throw new Error('expected approve action');

  const handled = await service.handleAction('welcome.request', 'approve', {
    message,
    user: { _id: reviewerId, roles: ['reviewer'] },
  });
  if (!handled || typeof handled.actionAttemptId !== 'string') throw new Error('expected handler attempt id');

  const archived = await service.findMessage(String(message._id));
  if (!archived || !('archivedAt' in archived)) throw new Error('expected archived message after action');
} finally {
  await connection.dropDatabase();
  await connection.close();
  await replSet.stop();
}
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'quick-start-runtime.mjs'),
    `import express from 'express';
import { createMessageRoutes, TemplateRegistry } from '@web-ts-toolkit/message-service';

const registry = new TemplateRegistry();
registry.register({
  templateCd: 'runtime.quick-start',
  type: 'request',
  description: 'Runtime quick start',
  senderContent: { title: 'S', long: 'S', short: 'S' },
  receiverContent: { title: 'R', long: 'R', short: 'R' },
  uiTemplate: 'default-message',
  prepareMessage: async ({ user }) => ({ fromUser: user._id, toRoles: ['reviewer'], payload: {} }),
  actions: [],
});

function resolvedQuery(value) {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.populate = () => query;
  return query;
}

const message = {
  _id: '507f1f77bcf86cd799439011',
  templateCd: 'runtime.quick-start',
  payload: {},
  isSender: () => false,
  isReceiver: (user) => user._id === 'user-1',
};

const { router } = createMessageRoutes({
  registry,
  getModel: () => ({ findById: () => resolvedQuery(message) }),
});
const app = express();
app.use(express.json());
app.use('/api/messages', (req, res, next) => {
  if (req.get('authorization') !== 'Bearer ok') {
    res.status(401).json({ message: 'authentication required' });
    return;
  }
  req.user = { _id: 'user-1', roles: ['reviewer'] };
  next();
}, router.original);

const server = app.listen(0);
try {
  const { port } = server.address();
  const unauthenticated = await fetch(` +
      '`http://127.0.0.1:${port}/api/messages/507f1f77bcf86cd799439011/actions/receiver`' +
      `);
  if (unauthenticated.status !== 401) throw new Error('expected auth rejection');
  const authenticated = await fetch(` +
      '`http://127.0.0.1:${port}/api/messages/507f1f77bcf86cd799439011/actions/receiver`' +
      `, {
    headers: { authorization: 'Bearer ok' },
  });
  if (authenticated.status !== 200) throw new Error(` +
      '`expected successful authenticated route, got ${authenticated.status}`' +
      `);
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'route-service-reuse.mjs'),
    `import express from 'express';
import {
  InvalidMessageServiceOptionError,
  MessageService,
  TemplateRegistry,
  createMessageRoutes,
} from '@web-ts-toolkit/message-service';

const registry = new TemplateRegistry();
registry.register({
  templateCd: 'packed.route-reuse',
  type: 'request',
  description: 'Packed route reuse',
  senderContent: { title: 'S', long: 'S', short: 'S' },
  receiverContent: { title: 'R', long: 'R', short: 'R' },
  uiTemplate: 'default-message',
  prepareMessage: async ({ user }) => ({ fromUser: user._id, toRoles: ['reviewer'], payload: {} }),
  actions: [],
});

function resolvedQuery(value) {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.populate = () => query;
  return query;
}

const message = {
  _id: '507f1f77bcf86cd799439011',
  templateCd: 'packed.route-reuse',
  payload: {},
  isSender: () => false,
  isReceiver: (user) => user._id === 'user-1',
};

// Injected path reuses the exact supplied service.
const supplied = new MessageService({
  getModel: () => ({ findById: () => resolvedQuery(message) }),
  registry,
});
const injected = createMessageRoutes({ service: supplied });
if (injected.service !== supplied) throw new Error('injected routes did not reuse the exact service');

// Conflicting options are rejected, not silently ignored.
let rejected = false;
try {
  createMessageRoutes({ service: supplied, getModel: () => ({}) });
} catch (error) {
  if (error instanceof InvalidMessageServiceOptionError) rejected = true;
}
if (!rejected) throw new Error('ambiguous service + getModel config was not rejected');

// Convenience path still constructs a working router with auth mapping.
const { router } = createMessageRoutes({
  registry,
  getModel: () => ({ findById: () => resolvedQuery(message) }),
});
const app = express();
app.use(express.json());
app.use('/api/messages', (req, res, next) => {
  if (req.get('authorization') !== 'Bearer ok') {
    res.status(401).json({ message: 'authentication required' });
    return;
  }
  req.user = { _id: 'user-1', roles: ['reviewer'] };
  next();
}, router.original);
const injectedApp = express();
injectedApp.use(express.json());
injectedApp.use('/api/injected', (req, res, next) => {
  req.user = { _id: 'user-1', roles: ['reviewer'] };
  next();
}, injected.router.original);

const server = app.listen(0);
const server2 = injectedApp.listen(0);
try {
  const { port } = server.address();
  const unauthenticated = await fetch('http://127.0.0.1:' + port + '/api/messages/507f1f77bcf86cd799439011/actions/receiver');
  if (unauthenticated.status !== 401) throw new Error('expected convenience auth rejection');
  const { port: port2 } = server2.address();
  const injectedOk = await fetch('http://127.0.0.1:' + port2 + '/api/injected/507f1f77bcf86cd799439011/actions/receiver');
  if (injectedOk.status !== 200) throw new Error('expected injected route success, got ' + injectedOk.status);
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await new Promise((resolve, reject) => server2.close((error) => error ? reject(error) : resolve()));
}
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'dual-package-state.cjs'),
    `const cjs = require('@web-ts-toolkit/message-service');

(async () => {
  const esm = await import('@web-ts-toolkit/message-service');
  const template = {
    templateCd: 'dual-package-state',
    type: 'notification',
    description: 'Dual package state',
    senderContent: { title: 'S', long: 'S', short: 'S' },
    receiverContent: { title: 'R', long: 'R', short: 'R' },
    uiTemplate: 'default-message',
    prepareMessage: async () => null,
    actions: [],
  };

  esm.defaultRegistry.register(template);
  if (!cjs.defaultRegistry.has('dual-package-state')) throw new Error('defaultRegistry split between ESM and CJS');
  if (!(new esm.ActionNotAllowedError() instanceof cjs.ActionNotAllowedError)) throw new Error('ESM error failed CJS instanceof');
  if (!(new cjs.ActionConflictError('507f1f77bcf86cd799439011') instanceof esm.ActionConflictError)) throw new Error('CJS error failed ESM instanceof'); // pragma: allowlist secret
  if (!(new esm.TemplateRegistryValidationError('bad') instanceof cjs.TemplateRegistryValidationError)) throw new Error('registry error failed cross-format instanceof');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-nodenext.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          skipLibCheck: false,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          types: ['node'],
        },
        include: ['consumer.nodenext.mts', 'consumer.nodenext.cts'],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-bundler.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          skipLibCheck: false,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          types: ['node'],
        },
        include: ['consumer.bundler.ts'],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.resolve(consumerDir, 'tsconfig-readme.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          skipLibCheck: false,
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          esModuleInterop: true,
          types: ['node'],
        },
        include: [
          'readme-quick-start.ts',
          'readme-providers.ts',
          'readme-create-action.ts',
          'readme-public-message.ts',
        ],
      },
      null,
      2,
    )}\n`,
  );
}

afterAll(() => {
  cleanupPackedConsumerTempRoots();
});

describe('MessageService packed-package consumer harness', () => {
  it('packs a release-like manifest and file set using the repository publish transformation', () => {
    const packed = preparePackedWorkspace();
    const manifest = packed.manifests['@web-ts-toolkit/message-service'];
    const packageJson = JSON.parse(
      readFileSync(path.resolve(packed.tempRoot, '_web-ts-toolkit_message-service', 'package.json'), 'utf8'),
    ) as PackageJson;

    expect(packageJson).toEqual(manifest);
    expect(manifest.version).toBe(testVersion);
    expect(manifest.license).toBe(rootPackageJson.license);
    expect(manifest.repository).toEqual({ ...rootPackageJson.repository, directory: 'packages/message-service' });
    expect(manifest.main).toBe('./index.js');
    expect(manifest.module).toBe('./index.mjs');
    expect(manifest.types).toBe('./index.d.ts');
    expect(manifest.exports).toMatchObject({
      '.': {
        types: {
          import: './index.d.mts',
          require: './index.d.ts',
          default: './index.d.ts',
        },
        import: './index.mjs',
        require: './index.js',
        default: './index.js',
      },
    });
    expect(manifest.dependencies).toMatchObject({
      '@web-ts-toolkit/express-json-router': testVersion,
      '@web-ts-toolkit/utils': testVersion,
      handlebars: '^4.7.8',
    });
    expect(manifest.peerDependencies).toMatchObject({ express: '>=5.0.0', mongoose: '>=8.0.0' });
    expect(manifest.devDependencies).toBeUndefined();
    expect(manifest.scripts).toBeUndefined();
    expect(containsDisallowedPublishedValue(manifest)).toBe(false);
    expect(manifest.license).toBe('Apache-2.0');
    for (const file of [
      'package/LICENSE',
      'package/README.md',
      'package/package.json',
      'package/index.js',
      'package/index.mjs',
      'package/index.d.ts',
      'package/index.d.mts',
    ]) {
      expect(packed.contents['@web-ts-toolkit/message-service']).toContain(file);
    }
    for (const declaration of ['index.d.ts', 'index.d.mts']) {
      const text = readFileSync(path.resolve(packed.tempRoot, '_web-ts-toolkit_message-service', declaration), 'utf8');
      expect(text).toContain('@deprecated Ignored. The requested id is always re-read from storage; omit this option.');
      expect(text).toContain(
        'Presentation population for eligible active conditions, after relationship authorization.',
      );
    }
  }, 30_000);

  it('loads ESM and CommonJS package-name imports from a freshly installed tarball', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);

    run('node', ['consumer.mjs'], consumerDir);
    run('node', ['consumer.cjs'], consumerDir);
    run('node', ['public-message.mjs'], consumerDir);
    run('node', ['public-message.cjs'], consumerDir);
    run('node', ['dual-package-state.cjs'], consumerDir);
  }, 60_000);

  it('compiles the README quick start and serves authenticated routes from the packed package', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);

    // MSGF-13: primary README snippets use prepareMessage/templateData,
    // router.original, and valid shapes.
    const blocks = readReadmeTypescriptBlocks();
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    const joined = blocks.join('\n');
    expect(joined).toContain('prepareMessage');
    expect(joined).toContain('templateData');
    expect(joined).toContain('router.original');
    expect(joined).not.toContain('prepare: async');

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-readme.json', '--noEmit'], consumerDir);
    run('node', ['quick-start-runtime.mjs'], consumerDir);
  }, 60_000);

  it('executes the README create/action flow against real persistence from the packed package', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);

    run('node', ['readme-create-action-runtime.mjs'], consumerDir);
  }, 120_000);

  it('compiles strict NodeNext ESM/CommonJS and Bundler declaration consumers with skipLibCheck disabled', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json', '--noEmit'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json', '--noEmit'], consumerDir);
  }, 120_000);

  it('preserves real-MongoDB cleanup outcomes, observers and authoritative reads through packed ESM and CommonJS APIs', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);
    run('node', ['transaction-cleanup.mjs'], consumerDir);
    run('node', ['transaction-cleanup.cjs'], consumerDir);
  }, 120_000);

  it('keeps documented runtime exports present in the installed package', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);
    const keys = JSON.parse(
      run(
        'node',
        ['-e', "console.log(JSON.stringify(Object.keys(require('@web-ts-toolkit/message-service')).sort()))"],
        consumerDir,
      ),
    ) as string[];

    for (const exportName of publicRuntimeExports) {
      expect(keys).toContain(exportName);
    }
  }, 60_000);

  it('reuses an injected service and rejects ambiguous configs from the packed package', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);

    run('node', ['route-service-reuse.mjs'], consumerDir);
  }, 60_000);

  it('leaves package source fixtures outside the release-like tarball', () => {
    const packed = preparePackedWorkspace();
    const stageDir = path.resolve(packed.tempRoot, '_web-ts-toolkit_message-service');

    expect(existsSync(path.resolve(packageRoot, 'test', 'support'))).toBe(true);
    expect(existsSync(path.resolve(stageDir, 'test'))).toBe(false);
    expect(packed.contents['@web-ts-toolkit/message-service'].some((entry) => entry.includes('/test/'))).toBe(false);
  });
});
