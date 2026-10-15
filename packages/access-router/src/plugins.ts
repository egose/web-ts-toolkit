import { Schema } from 'mongoose';
import { getModelOption } from './options';

interface Options {
  /** Hydrated-document getter alias; defaults to `permissions`. */
  virtualPermissionField?: string;
  /** Registered model whose documentPermissionField setting supplies the metadata slot. */
  modelName: string;
}

/**
 * Optional Mongoose getter alias for existing document permission metadata. Defaults
 * to `doc.permissions`, reading `_doc[documentPermissionField]` (usually `_permissions`).
 * Option lookup uses the active runtime, or the default runtime outside managed execution.
 * This plugin neither computes grants nor enables field enforcement: routers/services
 * already enforce operationAccess and permissionSchema without it. It is separate from
 * the package's computed `virtuals` output API and is unnecessary for lean output.
 */
export function permissionsPlugin(schema: Schema, options: Options): void {
  if (!options?.modelName) return;

  schema.virtual(options?.virtualPermissionField || 'permissions').get(function (this: {
    _doc: Record<string, unknown>;
  }) {
    const docPermissionField = getModelOption(options.modelName, 'documentPermissionField');
    return this._doc[docPermissionField as string];
  });
}
