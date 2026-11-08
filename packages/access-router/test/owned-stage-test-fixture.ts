/** Package-private tests use actual registered receivers, never authority recovered from a DTO. */
import mongoose from 'mongoose';
import { afterEach, vi } from 'vitest';
import { Core } from '../src/core';
import type { AuthorizationMode, ModelRequest, ModelRouterOptions } from '../src/interfaces';
import Permission from '../src/permission';
import { AccessRuntime } from '../src/runtime';
import { runWithRuntime } from '../src/runtime-context';
import { Service } from '../src/services/service';
import { PublicService } from '../src/services/public-service';
import { PERMISSIONS } from '../src/symbols';
import { captureModelAuthorizationConfiguration } from '../src/acl/model-output-planning';
import { createServiceExecution, getServiceExecutors, readServiceExecution } from '../src/acl/service-execution';
import { resolveServiceAuthorization, type ResolveServiceAuthorizationInput } from '../src/acl/service-authorization';
import { createDocumentStage, resolveDocumentStage } from '../src/acl/document-stage';
import { closeOutputPublication, outputPublicationFor, type OutputPublication } from '../src/acl/output-publication';
import { planAuthorizedModelProjection } from '../src/acl/output-projection';

export const sourceModes = ['isolated', 'trusted'] as const;
export const quietOutput = { includePermissions: false, includeFieldPermissions: false, includeCount: false };
export const stageAccess = (operation = 'read', effective = operation) => ({
  operation,
  rowAccess: effective,
  virtualAccess: effective,
  outputAccess: effective,
  docPermissionsAccess: effective,
});

let serial = 0;
const publications = new Set<OutputPublication>();

export function ownedStageFixture(
  options: {
    mode?: AuthorizationMode;
    operation?: string;
    effective?: string;
    schema?: mongoose.SchemaDefinition;
    omitStoredPaths?: readonly string[];
    modelOptions?: ModelRouterOptions;
    configuration?: Partial<ResolveServiceAuthorizationInput['configuration']>;
    authorization?: unknown;
    maxHookConcurrency?: number;
    select?: string[];
  } = {},
) {
  const extraPaths = Object.fromEntries(
    (options.configuration?.catalog?.paths ?? [])
      .map((path) => path.split('.')[0])
      .filter((path) => !['children', 'branch', 'meta'].includes(path))
      .map((path) => [path, mongoose.Schema.Types.Mixed]),
  );
  const definition: mongoose.SchemaDefinition = {
    _id: String,
    name: String,
    owner: Boolean,
    ownerId: String,
    hidden: mongoose.Schema.Types.Mixed,
    value: mongoose.Schema.Types.Mixed,
    payload: mongoose.Schema.Types.Mixed,
    when: Date,
    first: String,
    second: String,
    children: [
      new mongoose.Schema({ _id: String, name: String, value: String, label: String, hidden: String }, { _id: false }),
    ],
    branch: new mongoose.Schema({ value: mongoose.Schema.Types.Mixed, sibling: String }, { _id: false }),
    meta: {
      safe: String,
      permissions: mongoose.Schema.Types.Mixed,
      child: { safe: String, permissions: mongoose.Schema.Types.Mixed },
    },
    ...extraPaths,
    ...options.schema,
  };
  for (const path of options.omitStoredPaths ?? []) delete definition[path];
  const model = mongoose.model(`Oar07aFixture${++serial}`, new mongoose.Schema(definition, { versionKey: false }));
  const runtime = new AccessRuntime();
  runtime.setGlobalOptions({
    logger: { warn: vi.fn() },
    requestComplexity: { maxHookConcurrency: options.maxHookConcurrency ?? 1 },
  });
  runtime.registerModelInstance(model.modelName, model);
  runtime.setModelOptions(model.modelName, {
    operationAccess: true,
    baseFilter: true,
    readAuthorizationMode: options.mode ?? 'isolated',
    listAuthorizationMode: options.mode ?? 'isolated',
    permissionSchema: { name: true, value: true, hidden: false },
    modelPermissionPrefix: 'doc:',
    stripPermissionsField: true,
    hydration: { find: 'lean', findOne: 'lean', publicList: 'lean', publicRead: 'lean' },
    ...options.modelOptions,
  });
  const request = {
    actor: 'original',
    _permissions: { reader: true, admin: false },
    [PERMISSIONS]: new Permission({ reader: true, admin: false }),
    query: {},
    params: {},
    get: () => undefined,
  } as unknown as ModelRequest;
  const adapter = {
    mongooseModel: model,
    find: vi.fn(async () => [] as any[]),
    findOne: vi.fn(async () => null as any),
    countDocuments: vi.fn(async () => 0),
  };
  const services = runWithRuntime(runtime, () => {
    request.macl = new Core(request);
    return {
      direct: new (class extends Service {
        protected createModelAdapter() {
          return adapter;
        }
      })(request, model.modelName),
      public: new (class extends PublicService {
        protected createModelAdapter() {
          return adapter;
        }
      })(request, model.modelName),
    };
  });
  const access = stageAccess(options.operation, options.effective ?? options.operation);
  const execution = createServiceExecution(services.direct, access, options.authorization);
  const state = readServiceExecution(services.direct, execution);
  const binding = getServiceExecutors(services.direct).binding();
  const configuration = {
    ...captureModelAuthorizationConfiguration(runtime, model.modelName),
    ...options.configuration,
  };
  const input: ResolveServiceAuthorizationInput = {
    binding,
    access,
    configuration,
    requestPermissions: request[PERMISSIONS]!,
    authorization: options.authorization,
    readResponse: access.operation === 'read',
    listResponse: access.operation === 'list',
  };
  const ownCall = (overrides: Partial<ResolveServiceAuthorizationInput> = {}) => {
    const call = resolveServiceAuthorization({ ...input, ...overrides });
    publications.add(outputPublicationFor(call));
    return call;
  };
  const call = options.configuration ? ownCall() : state.authorization;
  publications.add(state.publication);
  const plan = planAuthorizedModelProjection({
    authorization: call,
    binding,
    requestedSelect: options.select ?? ['-_id'],
  });
  const args = { receivingModelName: model.modelName, request, plan, ...access };
  const stage = async (source: Record<string, unknown>, facts: Readonly<Record<string, boolean>> = {}) => {
    const result = createDocumentStage(call, binding, source);
    await resolveDocumentStage(result, () => facts);
    return result;
  };
  return {
    model,
    runtime,
    request,
    adapter,
    ...services,
    binding,
    input,
    configuration,
    execution,
    call,
    plan,
    args,
    ownCall,
    stage,
  };
}

afterEach(async () => {
  // Poisoned owners legitimately reject close; assertions inspect those failures in the test body.
  for (const publication of publications) await closeOutputPublication(publication).catch(() => {});
  publications.clear();
  mongoose.deleteModel(/^Oar07aFixture/);
});
