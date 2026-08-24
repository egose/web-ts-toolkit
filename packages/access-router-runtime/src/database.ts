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
  connect: () => Promise<void>;
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
  const generatedModelNames = new Set<string>();
  let openedOwnedConnection = false;

  if (db?.connection) {
    assertExistingModelsMatchSuppliedConnection(definitions, db.connection);
  }

  return {
    connection,
    ownsConnection,
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
      generatedModelNames.add(modelName);
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
    async disconnect() {
      const shouldCloseOwnedConnection =
        ownsConnection && openedOwnedConnection && (db?.disconnectOnShutdown ?? true) && connection.readyState !== 0;

      if (shouldCloseOwnedConnection) {
        await connection.close();
      }

      for (const modelName of generatedModelNames) {
        if (getConnectionModel(connection, modelName)) {
          deleteConnectionModel(connection, modelName);
        }
      }
      generatedModelNames.clear();
      openedOwnedConnection = false;
    },
  };
}
