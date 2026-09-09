import mongoose from 'mongoose';

type RuntimeModel = mongoose.Model<unknown>;

export interface AccessRouterRuntimeDatabaseConfig {
  url?: string;
  options?: mongoose.ConnectOptions;
  disconnectOnShutdown?: boolean;
  connection?: mongoose.Connection;
}

export interface AccessRouterRuntimeDatabaseModelDefinition {
  name?: string;
  model?: mongoose.Model<unknown>;
  schema?: mongoose.Schema<unknown>;
  collection?: string;
}

export interface AccessRouterRuntimeDatabaseAdapter {
  createConnection: () => mongoose.Connection;
}

export interface AccessRouterRuntimeDatabase {
  connection?: mongoose.Connection;
  ownsConnection: boolean;
  resolveModel: (definition: AccessRouterRuntimeDatabaseModelDefinition) => RuntimeModel;
  /**
   * Synchronous pre-mutation check for predictable model conflicts.
   *
   * Replicates `resolveModel` validation (name/schema/connection presence and
   * compatibility with existing registrations) without creating models, so a
   * throwing factory can fail before mutating caller-owned registries.
   */
  prevalidateModels: () => void;
  /**
   * Synchronous construction-time cleanup for a throwing factory.
   *
   * Deletes only models registered by this construction attempt (identity-safe:
   * only when `connection.models[name]` still holds the exact constructor this
   * attempt created) and releases a never-opened owned connection registration
   * from `mongoose.connections`. Never closes/destroys asynchronously, so the
   * synchronous factory never fire-and-forgets a rejected disposal promise.
   * External connections, pre-existing models, and externally replaced
   * registrations are preserved. Throws a single error or an `AggregateError`
   * when cleanup itself fails; the caller preserves the original construction
   * error as primary.
   */
  rollbackConstruction: () => void;
  connect: () => Promise<void>;
  /**
   * Retryable rollback for a failed `init()` attempt.
   *
   * Closes a partially opened owned connection but keeps generated model
   * registrations so a later `init()` retry sees consistent
   * `connection.model(name)` / `runtime.models[name]` handles. Never removes
   * the owned connection from `mongoose.connections`. This is not a shutdown,
   * so it closes an opened connection even when `disconnectOnShutdown: false`.
   */
  rollback: () => Promise<void>;
  /**
   * Terminal disposal for `shutdown()`.
   *
   * Closes the owned connection (unless retained), removes generated model
   * registrations only when the registry still holds the exact constructor
   * created by this runtime, and releases the owned connection registration
   * from `mongoose.connections` (unless external/retained). Reused (borrowed)
   * registrations are never deleted; only the creating runtime deletes.
   * Independent steps are attempted even when an earlier step fails; only
   * successfully cleaned resources are marked disposed so a failed shutdown
   * may retry.
   */
  disconnect: () => Promise<void>;
}

const defaultDatabaseAdapter: AccessRouterRuntimeDatabaseAdapter = {
  createConnection: () => mongoose.createConnection(),
};

function getModelConnection(model: mongoose.Model<unknown>): mongoose.Connection | undefined {
  return (model as mongoose.Model<unknown> & { db?: mongoose.Connection }).db;
}

function getConnectionModel(connection: mongoose.Connection, modelName: string): RuntimeModel | undefined {
  return connection.models[modelName] as RuntimeModel | undefined;
}

function deleteConnectionModel(connection: mongoose.Connection, modelName: string): void {
  if (typeof connection.deleteModel === 'function') {
    connection.deleteModel(modelName);
    return;
  }

  delete connection.models[modelName];
}

function assertExistingModelsMatchSuppliedConnection(
  definitions: ReadonlyArray<AccessRouterRuntimeDatabaseModelDefinition>,
  connection: mongoose.Connection,
): void {
  for (const definition of definitions) {
    if (!definition.model) continue;

    const modelConnection = getModelConnection(definition.model);
    if (modelConnection && modelConnection !== connection) {
      throw new Error(
        `Model definition "${definition.model.modelName}" uses an existing model from a different Mongoose connection than db.connection. Use models from the supplied connection or remove db.connection.`,
      );
    }
  }
}

function assertNoExistingModelsWithRuntimeUrl(
  definitions: ReadonlyArray<AccessRouterRuntimeDatabaseModelDefinition>,
): void {
  for (const definition of definitions) {
    if (definition.model) {
      throw new Error(
        `Model definition "${definition.model.modelName}" uses an existing model while db.url is configured. Use a schema-backed definition so the runtime can register it on its owned connection, or provide an explicit db.connection that owns the model.`,
      );
    }
  }
}

function assertCompatibleExistingConnectionModel(
  existing: RuntimeModel,
  definition: AccessRouterRuntimeDatabaseModelDefinition,
  modelName: string,
): void {
  if (existing.schema !== definition.schema) {
    throw new Error(
      `Model definition "${modelName}" conflicts with an existing model on the selected Mongoose connection. Use a unique model name or reuse the same schema instance.`,
    );
  }

  if (definition.collection && existing.collection?.name && existing.collection.name !== definition.collection) {
    throw new Error(
      `Model definition "${modelName}" collection "${definition.collection}" conflicts with existing collection "${existing.collection.name}" on the selected Mongoose connection.`,
    );
  }
}

export function createAccessRouterRuntimeDatabase(
  db: AccessRouterRuntimeDatabaseConfig | undefined,
  definitions: ReadonlyArray<AccessRouterRuntimeDatabaseModelDefinition>,
  adapter: AccessRouterRuntimeDatabaseAdapter = defaultDatabaseAdapter,
): AccessRouterRuntimeDatabase {
  if (db?.url && db.connection) {
    throw new Error('Runtime db config cannot define both "url" and "connection".');
  }

  if (db?.url) {
    assertNoExistingModelsWithRuntimeUrl(definitions);
  }

  const hasGeneratedModels = definitions.some((definition) => definition.schema);
  const connection = db?.connection ?? (db?.url || hasGeneratedModels ? adapter.createConnection() : undefined);
  const ownsConnection = connection !== undefined && connection !== db?.connection;
  const generatedModels = new Map<string, RuntimeModel>();
  let openedOwnedConnection = false;

  if (db?.connection) {
    assertExistingModelsMatchSuppliedConnection(definitions, db.connection);
  }

  function prevalidateDefinition(definition: AccessRouterRuntimeDatabaseModelDefinition): void {
    if (definition.model) {
      return;
    }

    const modelName = definition.name ?? '';
    if (!modelName) {
      throw new Error('Model definitions require `name` when `model` is not provided.');
    }
    if (!definition.schema) {
      throw new Error(`Model definition "${modelName}" requires either \`model\` or \`schema\`.`);
    }
    if (!connection) {
      throw new Error(`Model definition "${modelName}" requires a selected Mongoose connection.`);
    }

    const existing = getConnectionModel(connection, modelName);
    if (existing) {
      assertCompatibleExistingConnectionModel(existing, definition, modelName);
    }
  }

  return {
    connection,
    ownsConnection,
    prevalidateModels() {
      for (const definition of definitions) {
        prevalidateDefinition(definition);
      }
    },
    rollbackConstruction() {
      const errors: unknown[] = [];

      if (connection) {
        for (const [modelName, trackedModel] of [...generatedModels]) {
          try {
            if (getConnectionModel(connection, modelName) === trackedModel) {
              deleteConnectionModel(connection, modelName);
            }
            generatedModels.delete(modelName);
          } catch (error) {
            errors.push(error);
          }
        }
      }

      if (ownsConnection && connection) {
        try {
          const index = mongoose.connections.indexOf(connection);
          if (index !== -1) {
            mongoose.connections.splice(index, 1);
          }
        } catch (error) {
          errors.push(error);
        }
      }

      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, 'Runtime construction cleanup failed');
      }
    },
    resolveModel(definition) {
      if (definition.model) {
        return definition.model as RuntimeModel;
      }

      const modelName = definition.name ?? '';
      if (!modelName) {
        throw new Error('Model definitions require `name` when `model` is not provided.');
      }
      if (!definition.schema) {
        throw new Error(`Model definition "${modelName}" requires either \`model\` or \`schema\`.`);
      }
      if (!connection) {
        throw new Error(`Model definition "${modelName}" requires a selected Mongoose connection.`);
      }

      const existing = getConnectionModel(connection, modelName);
      if (existing) {
        assertCompatibleExistingConnectionModel(existing, definition, modelName);
        return existing;
      }

      const model = connection.model(modelName, definition.schema, definition.collection) as RuntimeModel;
      generatedModels.set(modelName, model);
      return model;
    },
    async connect() {
      if (!db?.url || !connection || connection.readyState === 1) {
        return;
      }

      try {
        await connection.openUri(db.url, db.options);
      } finally {
        openedOwnedConnection = ownsConnection && connection.readyState !== 0;
      }
    },
    async rollback() {
      if (!connection || !ownsConnection || !openedOwnedConnection || connection.readyState === 0) {
        return;
      }

      await connection.close();
      openedOwnedConnection = false;
    },
    async disconnect() {
      const errors: unknown[] = [];
      const shouldClose =
        ownsConnection &&
        openedOwnedConnection &&
        (db?.disconnectOnShutdown ?? true) &&
        !!connection &&
        connection.readyState !== 0;
      const shouldRelease = ownsConnection && (db?.disconnectOnShutdown ?? true) && !!connection;

      if (shouldClose && connection) {
        try {
          await connection.close();
          openedOwnedConnection = false;
        } catch (error) {
          errors.push(error);
        }
      }

      if (connection) {
        for (const [modelName, trackedModel] of [...generatedModels]) {
          try {
            if (getConnectionModel(connection, modelName) === trackedModel) {
              deleteConnectionModel(connection, modelName);
            }
            generatedModels.delete(modelName);
          } catch (error) {
            errors.push(error);
          }
        }
      }

      if (shouldRelease && connection) {
        try {
          if (typeof connection.destroy === 'function') {
            await connection.destroy();
          } else if (mongoose.connections.includes(connection)) {
            mongoose.connections.splice(mongoose.connections.indexOf(connection), 1);
          }
          if (connection.readyState === 0) {
            openedOwnedConnection = false;
          }
        } catch (error) {
          errors.push(error);
        }
      }

      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, 'Runtime database disposal failed');
      }
    },
  };
}
