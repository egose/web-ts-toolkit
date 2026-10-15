/** Installed root/advanced contract: finite named signatures, including undefined + extra arguments. */
import {
  createAccessRuntime,
  type AccessRouterRequest,
  type DataFieldOptions,
  type OutputPlanningOptions,
  type PopulatePlanningOptions,
} from '@web-ts-toolkit/access-router';
import type {
  DataRequest,
  ModelRequest,
  DataFieldOptions as AdvancedDataOptions,
  PopulatePlanningOptions as AdvancedPopulateOptions,
  OperationAccess,
  PermissionSchema,
} from '@web-ts-toolkit/access-router/advanced';
import mongoose from 'mongoose';

type Row = { name: string; internalNote: string; contacts: { email: string }[] };
declare const req: ModelRequest & DataRequest;
const core: NonNullable<AccessRouterRequest['macl']> = req.macl;
const dataCore: NonNullable<AccessRouterRequest['dacl']> = req.dacl;
const api = createAccessRuntime();
const schema: PermissionSchema<keyof Row> = {
  name: true,
  contacts: { read: true, sub: { email: { read: true } } },
};
const router = api.createRouter(mongoose.model<Row>('HelperTypes', new mongoose.Schema({ name: String })), {
  permissionSchema: schema,
});
const dataRouter = api.createDataRouter<Row>('DataTypes', { data: [], permissionSchema: schema });
// @ts-expect-error scopes contain field rules, never route variants
const badChild: PermissionSchema = { contacts: { sub: { email: { basicRead: true } } } };
// @ts-expect-error sub field rules do not become operation guards
const badOperation: OperationAccess = { sub: { email: true } };
void [badChild, badOperation];
const model = router.getService(req);
const publicModel = router.getPublicService(req);
const data = dataRouter.getService(req);
const dataOptions: DataFieldOptions = { scopePath: ['contacts'] };
const advancedDataOptions: AdvancedDataOptions = dataOptions;
const populateOptions: PopulatePlanningOptions = { scopePath: ['contacts'] };
const advancedPopulateOptions: AdvancedPopulateOptions = populateOptions;
const output: OutputPlanningOptions<Row> = {
  authorization: { outputFields: { mode: 'grant', paths: ['internalNote'] } },
};
// @ts-expect-error obsolete raw plan builders no longer expose arbitrary internalFetch/baseFields
model.buildVirtualPlan({ internalFetch: { baseFields: ['internalNote'] } });
// @ts-expect-error scoped fetch uses genSelect with named scopePath
model.buildSubVirtualPlan('contacts', {}, 'read', 'read', 'read');

for (const service of [model, publicModel]) {
  for (const method of ['genSelect', 'genQuerySelect'] as const) {
    service[method]('read');
    service[method]('read', ['name']);
    service[method]('read', undefined, undefined);
    service[method]('read', ['name', 'internalNote'], output);
    service[method]('read', ['email'], { scopePath: ['contacts'] });
    // @ts-expect-error positional skipChecks was removed
    service[method]('read', ['name'], true);
    // @ts-expect-error false is also removed, not a request-mode option
    service[method]('read', ['name'], false);
    // @ts-expect-error positional scope arrays were removed
    service[method]('read', ['name'], ['contacts', 'sub']);
    // @ts-expect-error explicit undefined must not restore an extra positional scope
    service[method]('read', undefined, undefined, ['contacts', 'sub']);
    // @ts-expect-error even a trailing undefined argument is removed
    service[method]('read', undefined, undefined, undefined);
    // @ts-expect-error no extra argument after named options
    service[method]('read', undefined, output, []);
  }
  for (const method of ['pickAllowedFields', 'trimOutputFields'] as const) {
    service[method]({}, 'read');
    service[method]({}, 'read', undefined);
    service[method]({}, 'read', output);
    // @ts-expect-error arbitrary baseFields are removed
    service[method]({}, 'read', ['internalNote']);
    // @ts-expect-error boolean options are not named options
    service[method]({}, 'read', false);
    // @ts-expect-error no trailing argument, including undefined
    service[method]({}, 'read', undefined, undefined);
    // @ts-expect-error undefined options do not restore extra baseFields
    service[method]({}, 'read', undefined, ['internalNote']);
  }
  service.genAllowedFields({}, 'read');
  service.genAllowedFields(null, 'read', undefined);
  service.genAllowedFields({}, 'read', { ...output, purpose: 'output' });
  // @ts-expect-error supplied named options require purpose: output
  service.genAllowedFields({}, 'read', {});
  // @ts-expect-error no arbitrary baseFields
  service.genAllowedFields({}, 'read', ['internalNote']);
  // @ts-expect-error explicit undefined plus extra must fail
  service.genAllowedFields({}, 'read', undefined, []);
  service.genPopulate();
  service.genPopulate('read', 'contacts.friend', populateOptions);
  // @ts-expect-error populate scope is named too
  service.genPopulate('read', 'contacts.friend', ['contacts', 'sub']);
  // @ts-expect-error no trailing arguments after undefined
  service.genPopulate('read', undefined, undefined, []);
  // @ts-expect-error genPopulate is request-only even with pretyped output options
  service.genPopulate('read', 'friend', output);
}

for (const method of ['genSelect', 'genQuerySelect'] as const) {
  core[method]<Row>('HelperTypes', 'read');
  core[method]<Row>('HelperTypes', 'read', undefined, undefined);
  core[method]<Row>('HelperTypes', 'read', ['name', 'internalNote'], output);
  // @ts-expect-error Core removes booleans too
  core[method]('HelperTypes', 'read', ['name'], false);
  // @ts-expect-error Core removes positional arrays too
  core[method]('HelperTypes', 'read', ['name'], []);
  // @ts-expect-error finite Core arity, including explicit undefined
  core[method]('HelperTypes', 'read', undefined, undefined, undefined);
  // @ts-expect-error positional definition scope is removed
  core[method]('HelperTypes', 'read', undefined, undefined, ['contacts', 'sub']);
}
for (const method of ['pickAllowedFields', 'trimOutputFields'] as const) {
  core[method]('HelperTypes', {}, 'read');
  core[method]('HelperTypes', {}, 'read', undefined);
  core[method]<{}, Row>('HelperTypes', {}, 'read', output);
  // @ts-expect-error no Core baseFields authority
  core[method]('HelperTypes', {}, 'read', ['internalNote']);
  // @ts-expect-error no extra argument after an explicit undefined
  core[method]('HelperTypes', {}, 'read', undefined, undefined);
}
core.genAllowedFields('HelperTypes', null, 'read');
core.genAllowedFields<Row>('HelperTypes', {}, 'read', { purpose: 'output', ...output });
// @ts-expect-error Core supplied options require purpose
core.genAllowedFields('HelperTypes', {}, 'read', {});
// @ts-expect-error Core baseFields was removed
core.genAllowedFields('HelperTypes', {}, 'read', ['internalNote']);
// @ts-expect-error Core extra arguments were removed
core.genAllowedFields('HelperTypes', {}, 'read', undefined, []);
core.genPopulate('HelperTypes');
core.genPopulate('HelperTypes', 'read', 'contacts.friend', advancedPopulateOptions);
// @ts-expect-error Core positional populate scope was removed
core.genPopulate('HelperTypes', 'read', 'contacts.friend', ['contacts', 'sub']);
// @ts-expect-error Core extra undefined argument was removed
core.genPopulate('HelperTypes', 'read', undefined, undefined, undefined);

for (const method of ['genSelect', 'genQuerySelect'] as const) {
  data[method]('read');
  data[method]('read', undefined, undefined);
  data[method]('read', ['email'], advancedDataOptions);
  // @ts-expect-error data booleans were removed, though historically ignored
  data[method]('read', ['name'], true);
  // @ts-expect-error data positional scope is now named
  data[method]('read', ['name'], ['contacts', 'sub']);
  // @ts-expect-error undefined plus extra is still removed
  data[method]('read', undefined, undefined, ['contacts', 'sub']);
  // @ts-expect-error no model output authorization, even from a typed variable
  data[method]('read', undefined, output);
}
for (const method of ['genAllowedFields', 'pickAllowedFields', 'trimOutputFields'] as const) {
  data[method]({}, 'read');
  data[method]({}, 'read', undefined);
  data[method]({}, 'read', dataOptions);
  // @ts-expect-error data baseFields elevation has no supported replacement
  data[method]({}, 'read', ['internalNote']);
  // @ts-expect-error booleans do not become data options
  data[method]({}, 'read', false);
  // @ts-expect-error any trailing argument fails
  data[method]({}, 'read', undefined, undefined);
  // @ts-expect-error model policies are not data authority
  data[method]({}, 'read', output);
}
dataCore.genSelect('DataTypes', 'read');
dataCore.genSelect('DataTypes', 'read', undefined, undefined);
dataCore.genSelect('DataTypes', 'read', ['email'], dataOptions);
// @ts-expect-error DataCore skipChecks removed
dataCore.genSelect('DataTypes', 'read', undefined, false);
// @ts-expect-error DataCore undefined plus extra rejected
dataCore.genSelect('DataTypes', 'read', undefined, undefined, []);
for (const method of ['genAllowedFields', 'pickAllowedFields'] as const) {
  dataCore[method]('DataTypes', {}, 'read');
  dataCore[method]('DataTypes', {}, 'read', dataOptions);
  // @ts-expect-error DataCore baseFields removed
  dataCore[method]('DataTypes', {}, 'read', []);
  // @ts-expect-error DataCore finite arity
  dataCore[method]('DataTypes', {}, 'read', undefined, undefined);
  // @ts-expect-error DataCore is request-only
  dataCore[method]('DataTypes', {}, 'read', output);
}
