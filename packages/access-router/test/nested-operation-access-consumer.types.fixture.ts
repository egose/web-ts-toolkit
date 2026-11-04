import {
  createAccessRuntime,
  type GuardHook,
  type OperationAccess,
  type OperationAccessContext,
  type OperationAccessPaths,
  type OperationAccessRule,
  type OperationAccessVariants,
  type OperationAccessSetter,
  type SubOperationAccess,
} from '@web-ts-toolkit/access-router';
import type {
  OperationAccessContext as AdvancedContext,
  OperationAccessRule as AdvancedRule,
  OperationAccessVariants as AdvancedVariants,
} from '@web-ts-toolkit/access-router/advanced';

const api = createAccessRuntime();
const guard: GuardHook = async function (permissions) {
  return this.method === 'GET' && permissions.has('canRead');
};
const contexts: OperationAccessContext[] = ['basic', 'advanced', 'root'];
const variants: OperationAccessVariants = { default: 'canRead other', basic: true, advanced: ['canRead'], root: guard };
const rules: OperationAccessRule[] = [true, 'canRead', ['canRead'], guard, variants];
const field: SubOperationAccess = {
  read: variants,
  list: true,
  create: variants,
  update: guard,
  delete: false,
  download: 'canDownload',
};
const access: OperationAccess = {
  default: false,
  new: variants,
  list: variants,
  read: variants,
  create: variants,
  update: variants,
  upsert: variants,
  delete: variants,
  count: variants,
  distinct: variants,
  subs: { comments: field, attachments: 'canRead' },
};
const paths: OperationAccessPaths = {
  read: variants,
  'read.root': guard,
  'read.default': 'canRead',
  'subs.comments': field,
  'subs.comments.read': variants,
  'subs.comments.read.advanced': false,
};
const advanced: [AdvancedContext, AdvancedRule, AdvancedVariants] = ['root', rules[0]!, variants];
declare const dynamicField: string;

api.setModelOptions('Task', { operationAccess: access, permissionSchema: { name: { read: true } } });
api.setDefaultModelOptions({ operationAccess: access });
api.runtime.setDataOptions('TaskData', { operationAccess: access }); // Existing broad data assignments stay valid.
for (const context of contexts) {
  api.setModelOption('Task', `operationAccess.read.${context}`, guard);
  api.setDefaultModelOption(`operationAccess.read.${context}`, 'canRead');
  api.runtime.setDataOption('TaskData', `operationAccess.read.${context}`, ['canRead']);
  api.setModelOption('Task', `operationAccess.subs.comments.read.${context}`, false);
  api.setDefaultModelOption(`operationAccess.subs.comments.read.${context}`, true);
  api.runtime.setDataOption('TaskData', `operationAccess.subs.comments.read.${context}`, undefined);
}
api.setModelOption('Task', 'operationAccess.read', variants);
api.setDefaultModelOption('operationAccess.new', variants);
api.runtime.setDataOption('TaskData', 'operationAccess.delete', variants);
api.setModelOption('Task', 'operationAccess.subs.comments', field);
api.setDefaultModelOption('operationAccess.subs.comments.create', variants);
api.runtime.setDataOption('TaskData', 'operationAccess.subs.comments.read', variants);
api.setModelOption('Task', 'operationAccess.read.default', undefined);
for (const operation of ['new', 'list', 'read', 'create', 'update', 'upsert', 'delete', 'count', 'distinct'] as const) {
  api.setModelOption('Task', `operationAccess.${operation}`, variants);
  api.setDefaultModelOption(`operationAccess.${operation}.default`, guard);
  api.runtime.setDataOption('TaskData', `operationAccess.${operation}.root`, undefined);
}
api.setModelOption('Task', `operationAccess.subs.${dynamicField}.update`, variants);
api.setDefaultModelOption(`operationAccess.subs.${dynamicField}.delete.root`, guard);

const model = api.createRouter('Task', { operationAccess: access });
const data = api.createDataRouter('TaskData', { operationAccess: access });
const setters: OperationAccessSetter<unknown>[] = [model.operationAccess, data.operationAccess];
for (const router of [model, data]) {
  router.operationAccess(access);
  router.operationAccess('read', variants);
  router.operationAccess('read.root', false);
  router.operationAccess('subs.comments.read', variants);
  router.operationAccess('subs.comments.read.basic', undefined);
  router.operationAccess('download', 'canDownload');
  router.operationAccess('advancedDownload', false);
}
model.set('operationAccess.read.root', false);
model.setOption('operationAccess.subs.comments.read.default', guard);
data.set('operationAccess.read', variants);
data.setOption('operationAccess.subs.comments.read.root', false);
void [contexts, paths, advanced, setters];
