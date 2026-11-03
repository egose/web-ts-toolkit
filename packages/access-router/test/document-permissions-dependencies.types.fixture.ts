/** Focused declaration contract. Compile against dist, never source/deep runtime imports. */
import { createAccessRuntime } from '../dist/index.js';
import type {
  ExtendedModelRouterOptions,
  DefaultModelRouterOptions,
  ModelDocPermissionsAccessRecord,
  ModelDocPermissionsDefinition,
  ModelDocPermissionsDescriptor,
  ModelDocPermissionsHook,
  ModelRouter,
  ModelRouterOptions,
} from '../dist/index.js';
import type {
  ModelDocPermissionsDescriptor as AdvancedDescriptor,
  ModelDocPermissionsDefinition as AdvancedDefinition,
  ModelDocPermissionsAccessRecord as AdvancedAccessRecord,
} from '../dist/advanced.js';

interface Model {
  name: string;
  ownerId: string;
  nested: { owner: string };
}

const sync: ModelDocPermissionsHook = function (_doc, permissions, context) {
  const operation: string = context.operation;
  const allowed: boolean = permissions.has('reader');
  void [operation, allowed, this.macl];
  return { owner: true };
};
const asyncHook: ModelDocPermissionsHook = async function (...args) {
  return sync.apply(this, args);
};
const descriptor: ModelDocPermissionsDescriptor<Model> = { get: sync, dependsOn: ['ownerId', 'nested'] };
const definition: ModelDocPermissionsDefinition<Model> = descriptor;
const advanced: AdvancedDescriptor<Model> = descriptor;
const advancedDefinition: AdvancedDefinition<Model> = definition;
const accesses: ModelDocPermissionsAccessRecord<Model> = {
  default: descriptor,
  read: sync,
  list: asyncHook,
  update: { get: asyncHook, dependsOn: [] },
  audit: descriptor,
};
const direct: ModelRouterOptions<Model> = { docPermissions: definition };
const bare: ModelRouterOptions<Model> = { docPermissions: asyncHook };
const mapped: ModelRouterOptions<Model> = { docPermissions: accesses };
const advancedAccesses: AdvancedAccessRecord<Model> = accesses;
const inferred: ModelRouterOptions<Model> = {
  docPermissions: {
    dependsOn: ['ownerId'],
    get(_doc, permissions, context) {
      void [this.macl, context.operation];
      return { owner: permissions.has('owner') };
    },
  },
};
const inferredMap: ModelRouterOptions<Model> = {
  docPermissions: {
    default: sync,
    audit: {
      dependsOn: ['nested'],
      async get(_doc, permissions, context) {
        void [this.macl, context.operation];
        return { owner: permissions.has('owner') };
      },
    },
  },
};
const extended: ExtendedModelRouterOptions<Model> = {
  'docPermissions.read': descriptor,
  'docPermissions.default': asyncHook,
  'docPermissions.audit': descriptor,
};

// Dependency names must not infer an otherwise untyped model as only { ownerId }.
// Other declared output fields remain valid without supplying a model generic.
const api = createAccessRuntime();
api.setModelOptions('Untyped', {
  docPermissions: { read: { dependsOn: ['ownerId'], get: sync } },
  permissionSchema: { salary: true, bonus: true },
});

declare const router: ModelRouter<Model>;
router.docPermissions(sync).docPermissions(descriptor).docPermissions(accesses);
router.docPermissions('read', descriptor).docPermissions('audit', { get: asyncHook, dependsOn: ['ownerId'] });
router.docPermissions('read', undefined);
router.set('docPermissions.default', descriptor).set('docPermissions.audit', descriptor);
router.setOption('docPermissions.read', descriptor);
router.set('docPermissions.read', undefined);
router.setOptions({ docPermissions: { default: sync, audit: descriptor } });

// @ts-expect-error dependency keys are persisted-model-aware
const unknown: ModelDocPermissionsDescriptor<Model> = { get: sync, dependsOn: ['missing'] };
// @ts-expect-error nested paths declare their whole persisted container
const dotted: ModelDocPermissionsDescriptor<Model> = { get: sync, dependsOn: ['nested.owner'] };
// @ts-expect-error descriptor getters remain callable
const malformed: ModelDocPermissionsDefinition<Model> = { get: false };
// @ts-expect-error descriptor spelling is get, not getter
const misspelled: ModelDocPermissionsDefinition<Model> = { getter: sync, dependsOn: ['ownerId'] };
// @ts-expect-error model-aware access definitions reject unknown dependencies
router.docPermissions('audit', { get: sync, dependsOn: ['missing'] });
// @ts-expect-error dotted setters retain model-aware dependency keys
router.set('docPermissions.audit', { get: sync, dependsOn: ['missing'] });
// @ts-expect-error the removed option has no typed model surface
const removed: ModelRouterOptions<Model> = { alwaysSelectFields: ['ownerId'] };
// @ts-expect-error the removed option is not inherited from model defaults
const removedDefault: DefaultModelRouterOptions = { alwaysSelectFields: ['ownerId'] };
// @ts-expect-error the removed fluent setter is absent
router.alwaysSelectFields(['ownerId']);
// @ts-expect-error the removed dotted setter is absent
router.set('alwaysSelectFields.read', ['ownerId']);
// @ts-expect-error bulk fluent options cannot resurrect the removed option
router.setOptions({ alwaysSelectFields: ['ownerId'] });

void [
  advanced,
  advancedDefinition,
  advancedAccesses,
  direct,
  bare,
  mapped,
  inferred,
  inferredMap,
  extended,
  unknown,
  dotted,
  malformed,
  misspelled,
  removed,
  removedDefault,
];
