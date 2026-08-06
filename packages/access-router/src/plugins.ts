import { Schema } from 'mongoose';
import { getModelOption } from './options';

interface Options {
  virtualPermissionField?: string;
  modelName: string;
}

export function permissionsPlugin(schema: Schema, options: Options): void {
  if (!options?.modelName) return;

  schema.virtual(options?.virtualPermissionField || 'permissions').get(function (this: {
    _doc: Record<string, unknown>;
  }) {
    const docPermissionField = getModelOption(options.modelName, 'documentPermissionField');
    return this._doc[docPermissionField as string];
  });
}
