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
  'filterActions',
  'isActionAllowed',
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
  'InvalidPaginationValueError',
  'ClientRequestPendingError',
  'ClientRequestFailedError',
  'ClientRequestInconsistentStateError',
  'MessageTransactionRequiredError',
  'MessageModelResolutionError',
  'PaymentSessionCompensationError',
  'createMessageRoutes',
] as const;

function readQuickStartExample(): string {
  const readme = readFileSync(path.resolve(packageRoot, 'README.md'), 'utf8');
  const quickStart = readme.match(/## Quick Start\n\n```typescript\n([\s\S]*?)\n```/);
  if (!quickStart) {
    throw new Error('README Quick Start TypeScript block not found');
  }
  return quickStart[1];
}

function writeConsumerFiles(consumerDir: string): void {
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
void service;
void user;
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
  InvalidMessageUserError,
  InvalidPaginationValueError,
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
  includesAction,
  interpolateTemplate,
  isActionAllowed,
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
  type MessageRoutesOptions,
  type MessageSchemaConfig,
  type MessageServiceModelNames,
  type MessageServiceOptions,
  type MessageTemplate,
  type MessageType,
  type MessageUser,
  type PaymentCompensationFailureEvent,
  type PaymentProvider,
  type PrepareContext,
  type PrepareResult,
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
  InvalidMessageUserError,
  InvalidPaginationValueError,
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
  PaymentSessionCompensationError,
  TemplateNotFoundError,
  TemplateRegistryValidationError,
  buildMessageArchiveSchema,
  buildMessageRequestSchema,
  buildMessageSchema,
  createMessageRoutes,
  defaultRegistry,
  filterActions,
  includesAction,
  interpolateTemplate,
  isActionAllowed,
];
type DeclaredTypes = [ActionConfirmation, ActionContext, EmailDeliveryFailureEvent, EmailDeliveryFailureStage, EmailNotifier, EmailProvider, IBaseMessage, IMessage, IMessageArchive, IMessageContent, IMessageMethods, InterpolatedAction, InterpolatedContent, InterpolationResult, MessageAction, MessageRoutesOptions, MessageSchemaConfig, MessageServiceModelNames, MessageServiceOptions, MessageType, MessageUser, PaymentCompensationFailureEvent, PaymentProvider, PrepareContext, PrepareResult, SenderNotificationContent, UiTemplate, UserId, Usertype];

registry.register(template);
void service;
void error;
void ids;
void runtimeValues;
void (undefined as unknown as DeclaredTypes);
`,
  );
  writeFileSync(path.resolve(consumerDir, 'readme-quick-start.ts'), `${readQuickStartExample()}\n`);
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
        include: ['readme-quick-start.ts'],
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
  }, 30_000);

  it('loads ESM and CommonJS package-name imports from a freshly installed tarball', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);

    run('node', ['consumer.mjs'], consumerDir);
    run('node', ['consumer.cjs'], consumerDir);
    run('node', ['dual-package-state.cjs'], consumerDir);
  }, 60_000);

  it('compiles the README quick start and serves authenticated routes from the packed package', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-readme.json', '--noEmit'], consumerDir);
    run('node', ['quick-start-runtime.mjs'], consumerDir);
  }, 60_000);

  it('compiles strict NodeNext ESM/CommonJS and Bundler declaration consumers with skipLibCheck disabled', () => {
    const consumerDir = installPackedConsumer();
    writeConsumerFiles(consumerDir);

    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-nodenext.json', '--noEmit'], consumerDir);
    run('pnpm', ['exec', 'tsc', '-p', 'tsconfig-bundler.json', '--noEmit'], consumerDir);
  }, 60_000);

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

  it('leaves package source fixtures outside the release-like tarball', () => {
    const packed = preparePackedWorkspace();
    const stageDir = path.resolve(packed.tempRoot, '_web-ts-toolkit_message-service');

    expect(existsSync(path.resolve(packageRoot, 'test', 'support'))).toBe(true);
    expect(existsSync(path.resolve(stageDir, 'test'))).toBe(false);
    expect(packed.contents['@web-ts-toolkit/message-service'].some((entry) => entry.includes('/test/'))).toBe(false);
  });
});
