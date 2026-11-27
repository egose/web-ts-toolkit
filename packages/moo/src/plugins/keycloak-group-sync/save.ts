import { createHash } from 'node:crypto';

import type { ClientSession, Connection, Document, SaveOptions, Schema, SchemaType, mongo } from 'mongoose';

import { type KeycloakGroupSyncConfig, readGroupSyncPath, validateGroupSyncOrgName } from './planner';
import { reconcileKeycloakGroups } from './reconcile';

type StoredOrg = Record<string, unknown> & { _id: unknown };
type OrgModel = {
  db: Connection;
  collection: {
    collectionName: string;
    findOne(filter: Record<string, unknown>, options: mongo.FindOneOptions): Promise<StoredOrg | null>;
    updateOne(
      filter: Record<string, unknown>,
      update: mongo.Document[],
      options: mongo.UpdateOptions,
    ): Promise<mongo.UpdateResult>;
  };
};
type OrgDocument = Document<unknown> & {
  constructor: OrgModel;
  $isNew: boolean;
  // Only Document.save() sets the save-in-progress flag. Mongoose 8's
  // bulkSave() also runs save hooks and sets $op to 'save' during validation.
  $__: { saving?: boolean | Error | null; saveOptions?: SaveOptions | null };
  $__setValue(path: string, value: unknown): void;
};

type SingleNestedType = SchemaType & { $isSingleNested?: boolean };

const rawGet = { getters: false };
const exactCollation = { locale: 'simple' };

function ancestorPaths(path: string): string[] {
  const segments = path.split('.');
  return segments.slice(1).map((_, index) => segments.slice(0, index + 1).join('.'));
}

function overlaps(path: string, protectedPath: string): boolean {
  return path === protectedPath || path.startsWith(`${protectedPath}.`) || protectedPath.startsWith(`${path}.`);
}

function projectionFor(paths: readonly string[]): Record<string, 1> {
  return { _id: 1, ...Object.fromEntries(paths.filter((path) => !path.startsWith('_id.')).map((path) => [path, 1])) };
}

/** Reflect the raw write without running setters or making the binding dirty. */
function reflectBinding(document: OrgDocument, snapshot: StoredOrg, path: string): void {
  const value = readGroupSyncPath(snapshot, path);
  if (value === undefined) return;

  let scope = document;
  let relativeStart = 0;
  for (const ancestor of ancestorPaths(path)) {
    const relative = ancestor.slice(relativeStart);
    const type = scope.schema.path(relative) as SingleNestedType | undefined;
    const child = scope.get(relative, undefined, rawGet) as unknown;
    if (!type?.$isSingleNested) {
      if (child == null) scope.$__setValue(relative, {});
      continue;
    }

    if (child == null) {
      // A projection can omit an entire single nested subdocument. Cast only
      // the projected binding subtree, with this document as its real parent.
      const storedSubdocument = readGroupSyncPath(snapshot, ancestor);
      scope.$__setValue(relative, type.cast(storedSubdocument, scope, true, undefined, { path: relative }));
      return;
    }
    scope = child as OrgDocument;
    relativeStart = ancestor.length + 1;
  }
  const relative = path.slice(relativeStart);
  const type = scope.schema.path(relative);
  scope.$__setValue(relative, value === null ? null : type.cast(value, scope, true, undefined, { path: relative }));
}

export function registerKeycloakGroupSyncSaveHooks(schema: Schema, config: KeycloakGroupSyncConfig): void {
  const { paths, roleSource, realm } = config;
  const idPaths = [paths.providerId, paths.roleGroupIds];
  const identityPaths = ['_id', paths.name];
  const defaultPaths = new Set([...identityPaths, ...idPaths].flatMap((path) => [path, ...ancestorPaths(path)]));
  const reconciliationPaths = [paths.name, ...idPaths];
  if (paths.description !== undefined) reconciliationPaths.push(paths.description);
  if (typeof roleSource === 'string') reconciliationPaths.push(roleSource);

  const reconciliationProjection = projectionFor(reconciliationPaths);
  const embeddedIdPaths = idPaths
    .flatMap(ancestorPaths)
    .filter((ancestor) => (schema.path(ancestor) as SingleNestedType | undefined)?.$isSingleNested)
    .map((ancestor) => `${ancestor}._id`)
    .filter((path) => !idPaths.some((binding) => overlaps(path, binding)));
  const bindingsProjection = projectionFor([...idPaths, ...embeddedIdPaths]);
  const checkedSaves = new WeakSet<SaveOptions>();

  schema.pre('save', async function keycloakGroupSyncPreSave(this: OrgDocument) {
    const options = this.$__.saveOptions;
    if (!this.$__.saving || !options) return;

    const base = this.constructor.db.base as OrgModel['db']['base'] & {
      transactionAsyncLocalStorage?: { getStore(): { session?: ClientSession } | undefined };
    };
    if (options.session || this.$session() || base.transactionAsyncLocalStorage?.getStore()?.session) {
      throw new Error('keycloakGroupSyncPlugin does not support sessions or transactions on document saves');
    }

    if (this.$isNew) {
      validateGroupSyncOrgName(config, this.get(paths.name, undefined, rawGet));
      const providerId: unknown = this.get(paths.providerId, undefined, rawGet);
      const roleGroupIds: unknown = this.get(paths.roleGroupIds, undefined, rawGet);
      if (providerId != null || (roleGroupIds != null && (!(roleGroupIds instanceof Map) || roleGroupIds.size > 0))) {
        throw new Error('keycloakGroupSyncPlugin group IDs are server-controlled; omit them on new documents');
      }
    } else {
      const changedPaths = this.directModifiedPaths();
      const changedBinding = idPaths.find((path) => changedPaths.some((changed) => overlaps(changed, path)));
      if (changedBinding !== undefined) {
        throw new Error(`keycloakGroupSyncPlugin cannot change server-controlled group IDs at "${changedBinding}"`);
      }
      const changedIdentity = identityPaths.find((path) => changedPaths.some((changed) => overlaps(changed, path)));
      if (changedIdentity !== undefined) {
        throw new Error(`keycloakGroupSyncPlugin cannot change stable organization identity at "${changedIdentity}"`);
      }
      // Mongoose may save defaults for absent fields even if they were never
      // modified. A default map or container must not replace concurrent IDs.
      for (const path of defaultPaths) {
        if (this.$isDefault(path)) this.unmarkModified(path);
      }
    }
    checkedSaves.add(options);
  });

  schema.post('save', async function keycloakGroupSyncPostSave(this: OrgDocument) {
    const options = this.$__.saveOptions;
    if (!options || !checkedSaves.delete(options)) return;

    const model = this.constructor;
    const collection = model.collection;
    const selector = { _id: { $eq: this.get('_id', undefined, rawGet) as unknown } };
    const read = (projection: Record<string, 1>) =>
      collection.findOne(selector, { projection, readPreference: 'primary', collation: exactCollation });
    const snapshot = await read(reconciliationProjection);
    if (!snapshot) throw new Error('keycloakGroupSyncPlugin could not read the saved organization');

    const source = model.db.base.mongo.BSON.EJSON.stringify(
      [realm, model.db.name, collection.collectionName, snapshot._id],
      {
        relaxed: false,
      },
    );
    const owner = `v1:${createHash('sha256').update(source).digest('hex')}`;

    const resolved = await reconcileKeycloakGroups(config, snapshot, owner, async (path, id, slug) => {
      const result = await collection.updateOne(
        {
          ...selector,
          $expr: {
            $and: [
              { $eq: [`$${paths.name}`, { $literal: slug }] },
              ...ancestorPaths(path).map((ancestor) => ({
                $in: [{ $type: `$${ancestor}` }, ['object', 'missing', 'null']],
              })),
              { $or: [{ $in: [{ $type: `$${path}` }, ['missing', 'null']] }, { $eq: [`$${path}`, { $literal: id }] }] },
            ],
          },
        },
        // The pipeline creates missing or null containers and updates just this
        // binding within existing objects, even when other saves add entries.
        [{ $set: { [path]: { $literal: id } } }],
        { collation: exactCollation },
      );
      if (result.matchedCount !== 1)
        throw new Error(`keycloakGroupSyncPlugin could not store the group ID at "${path}"; the binding changed`);
    });

    const bindings = await read(bindingsProjection);
    if (!bindings) throw new Error('keycloakGroupSyncPlugin could not read the saved group IDs');
    for (const [path, id] of resolved) {
      if (readGroupSyncPath(bindings, path) !== id) {
        throw new Error(`keycloakGroupSyncPlugin group ID at "${path}" changed during reconciliation`);
      }
    }
    for (const path of idPaths) reflectBinding(this, bindings, path);
  });
}
