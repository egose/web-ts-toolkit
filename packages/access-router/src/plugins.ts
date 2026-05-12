import { getModelOption } from './options';

interface Options {
  virtualPermissionField?: string;
  modelName: string;
}

export function permissionsPlugin(schema, options: Options) {
  if (!options?.modelName) return;

  schema.virtual(options?.virtualPermissionField || 'permissions').get(function () {
    const docPermissionField = getModelOption(options.modelName, 'documentPermissionField');
    return this._doc[docPermissionField];
  });
}
