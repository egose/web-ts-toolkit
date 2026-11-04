import {
  createAccessRuntime,
  type OperationAccess,
  type SubOperationAccess,
  type PermissionSchema,
} from '@web-ts-toolkit/access-router';
// @error removed-root-type
import type { RouteVariantAccess } from '@web-ts-toolkit/access-router';
// @error removed-advanced-type
import type { RouteVariantAccess as AdvancedFlatType } from '@web-ts-toolkit/access-router/advanced';

const api = createAccessRuntime();
// @error flat-basic-list
const a: OperationAccess = { basicList: true };
// @error flat-advanced-list
const b: OperationAccess = { advancedList: true };
// @error flat-basic-read
const c: OperationAccess = { basicRead: true };
// @error flat-advanced-read
const d: OperationAccess = { advancedRead: true };
// @error flat-basic-create
const e: OperationAccess = { basicCreate: true };
// @error flat-advanced-create
const f: OperationAccess = { advancedCreate: true };
// @error flat-basic-update
const g: OperationAccess = { basicUpdate: true };
// @error flat-advanced-update
const h: OperationAccess = { advancedUpdate: true };
// @error flat-basic-upsert
const i: OperationAccess = { basicUpsert: true };
// @error flat-advanced-upsert
const j: OperationAccess = { advancedUpsert: true };
// @error flat-basic-count
const k: OperationAccess = { basicCount: true };
// @error flat-advanced-count
const l: OperationAccess = { advancedCount: true };
// @error flat-basic-distinct
const m: OperationAccess = { basicDistinct: true };
// @error flat-advanced-distinct
const n: OperationAccess = { advancedDistinct: true };
// @error dynamic-sub-basic-list
const o: SubOperationAccess = { basicList: true };
// @error dynamic-sub-advanced-list
const p: SubOperationAccess = { advancedList: true };
// @error dynamic-sub-basic-read
const q: SubOperationAccess = { basicRead: true };
// @error dynamic-sub-advanced-read
const r: SubOperationAccess = { advancedRead: true };
// @error dynamic-sub-basic-update
const s: SubOperationAccess = { basicUpdate: false };
// @error flat-model-path
api.setModelOption('Task', 'operationAccess.basicRead', true);
// @error flat-default-path
api.setDefaultModelOption('operationAccess.advancedList', true);
// @error flat-data-path
api.runtime.setDataOption('TaskData', 'operationAccess.basicRead', true);
// @error member-is-validation-only
api.setModelOption('Task', 'operationAccess.read.root', { default: true });
// @error sub-member-is-validation-only
api.setDefaultModelOption('operationAccess.subs.comments.read.basic', { default: true });
// @error data-member-is-validation-only
api.runtime.setDataOption('TaskData', 'operationAccess.subs.comments.read.root', { root: true });
// @error outer-default-is-validation-only
const t: OperationAccess = { default: { root: true } };
// @error recursive-rules-not-supported
const u: OperationAccess = { read: { default: { basic: true } } };
// @error field-policy-remains-separate
const v: PermissionSchema = { name: { read: { basic: true } } };
// @error model-whole-object-rejects-flat
api.setModelOptions('Task', { operationAccess: { basicRead: true } });
// @error defaults-whole-object-rejects-flat
api.setDefaultModelOptions({ operationAccess: { advancedRead: true } });
// @error data-whole-object-rejects-flat
api.runtime.setDataOptions('TaskData', { operationAccess: { basicList: true } });
const structurallyOldRules = { read: true, basicRead: true };
// @error structural-flat-keys-not-just-excess-properties
api.setModelOptions('Task', { operationAccess: structurallyOldRules });
const model = api.createRouter('Task', {});
const data = api.createDataRouter('TaskData', {});
// @error fluent-whole-object-rejects-flat
model.operationAccess({ read: true, basicRead: true });
// @error fluent-sub-object-rejects-flat
data.operationAccess({ subs: { comments: { advancedRead: true } } });
