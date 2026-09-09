import mongoose from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccessRouterRuntime, createAccessRouterRuntimeApp } from '../src/index';

let modelCounter = 0;
function uniqueModelName(prefix: string): string {
  modelCounter += 1;
  return `${prefix}${modelCounter}_${Date.now().toString(36)}`;
}

describe('ARRT-B03 database disposal', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('keeps external generated models registered across a failed init retry', async () => {
    const externalConnection = mongoose.createConnection();
    const owned: mongoose.Connection[] = [externalConnection];
    try {
      const modelName = uniqueModelName('ArrtB03ExternalRetry');
      const schema = new mongoose.Schema({ title: String });
      const init = vi.fn().mockRejectedValueOnce(new Error('first init failed')).mockResolvedValueOnce(undefined);
      const runtime = createAccessRouterRuntime({
        db: { connection: externalConnection },
        models: [{ name: modelName, schema, router: { operationAccess: false } }],
        init,
      });

      await expect(runtime.init()).rejects.toThrow('first init failed');
      // Retryable rollback must not delete the generated registration.
      expect(externalConnection.models[modelName]).toBeDefined();

      await runtime.init();
      expect(externalConnection.models[modelName]).toBeDefined();
      expect(runtime.models[modelName]).toBe(externalConnection.models[modelName]);
      expect(externalConnection.model(modelName)).toBe(runtime.models[modelName]);

      await runtime.shutdown();
      expect(externalConnection.models[modelName]).toBeUndefined();
      expect(mongoose.connections).toContain(externalConnection);
    } finally {
      for (const connection of owned) {
        try {
          await connection.destroy();
        } catch {
          // ignore teardown errors; test assertions already ran
        }
      }
    }
  });

  it('keeps owned schema-only generated models registered across a failed init retry', async () => {
    const baseline = mongoose.connections.length;
    const modelName = uniqueModelName('ArrtB03OwnedRetry');
    const schema = new mongoose.Schema({ title: String });
    const init = vi.fn().mockRejectedValueOnce(new Error('first init failed')).mockResolvedValueOnce(undefined);
    const runtime = createAccessRouterRuntime({
      models: [{ name: modelName, schema, router: { operationAccess: false } }],
      init,
    });
    const connection = (runtime as unknown as { models: Record<string, mongoose.Model<unknown>> }).models[modelName]
      .db as mongoose.Connection;
    expect(connection).toBeDefined();

    try {
      await expect(runtime.init()).rejects.toThrow('first init failed');
      expect(connection.models[modelName]).toBeDefined();

      await runtime.init();
      expect(connection.models[modelName]).toBeDefined();
      expect(runtime.models[modelName]).toBe(connection.models[modelName]);
      expect(connection.model(modelName)).toBe(runtime.models[modelName]);

      await runtime.shutdown();
      expect(connection.models[modelName]).toBeUndefined();
      expect(mongoose.connections).not.toContain(connection);
      expect(mongoose.connections.length).toBe(baseline);
    } finally {
      if (mongoose.connections.includes(connection)) {
        await connection.destroy();
      }
    }
  });

  it('releases never-opened owned connections on terminal shutdown', async () => {
    const baseline = mongoose.connections.length;
    const runtimes = [0, 1, 2].map((index) =>
      createAccessRouterRuntime({
        models: [
          {
            name: uniqueModelName(`ArrtB03SchemaOnly${index}`),
            schema: new mongoose.Schema({ title: String }),
            router: { operationAccess: false },
          },
        ],
      }),
    );
    const owned = runtimes.map(
      (runtime) =>
        (runtime as unknown as { models: Record<string, mongoose.Model<unknown>> }).models[
          Object.keys(runtime.models)[0] as string
        ].db as mongoose.Connection,
    );

    try {
      expect(mongoose.connections.length).toBe(baseline + 3);
      for (const runtime of runtimes) {
        await runtime.shutdown();
      }
      expect(mongoose.connections.length).toBe(baseline);
      for (const connection of owned) {
        expect(mongoose.connections).not.toContain(connection);
      }
      // Repeated terminal shutdown is idempotent.
      for (const runtime of runtimes) {
        await runtime.shutdown();
      }
      expect(mongoose.connections.length).toBe(baseline);
    } finally {
      for (const connection of owned) {
        if (mongoose.connections.includes(connection)) {
          await connection.destroy();
        }
      }
    }
  });

  it('keeps retained and external connections operational on terminal shutdown', async () => {
    const baseline = mongoose.connections.length;
    const externalConnection = mongoose.createConnection();
    const externalModelName = uniqueModelName('ArrtB03RetainedExternal');
    const externalRuntime = createAccessRouterRuntime({
      db: { connection: externalConnection },
      models: [
        { name: externalModelName, schema: new mongoose.Schema({ title: String }), router: { operationAccess: false } },
      ],
    });

    const retainedModelName = uniqueModelName('ArrtB03RetainedOwned');
    const retainedRuntime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/arrt-b03-retained', disconnectOnShutdown: false },
      models: [
        { name: retainedModelName, schema: new mongoose.Schema({ title: String }), router: { operationAccess: false } },
      ],
    });
    const retainedConnection = (retainedRuntime as unknown as { models: Record<string, mongoose.Model<unknown>> })
      .models[retainedModelName].db as mongoose.Connection;
    vi.spyOn(retainedConnection, 'openUri').mockImplementation(async () => {
      (retainedConnection as unknown as { readyState: number }).readyState = 1;
      return retainedConnection;
    });
    vi.spyOn(retainedConnection, 'close').mockImplementation(async () => {
      (retainedConnection as unknown as { readyState: number }).readyState = 0;
      return retainedConnection;
    });

    try {
      await externalRuntime.init();
      await retainedRuntime.init();

      await externalRuntime.shutdown();
      expect(mongoose.connections).toContain(externalConnection);
      expect(externalConnection.models[externalModelName]).toBeUndefined();

      await retainedRuntime.shutdown();
      expect(mongoose.connections).toContain(retainedConnection);
      expect(retainedConnection.models[retainedModelName]).toBeUndefined();
      expect(mongoose.connections.length).toBe(baseline + 2);
    } finally {
      if (mongoose.connections.includes(externalConnection)) {
        await externalConnection.destroy();
      }
      if (mongoose.connections.includes(retainedConnection)) {
        await retainedConnection.destroy();
      }
      expect(mongoose.connections.length).toBe(baseline);
    }
  });

  it('attempts model cleanup and release even when close rejects', async () => {
    const baseline = mongoose.connections.length;
    const modelA = uniqueModelName('ArrtB03CloseFailA');
    const modelB = uniqueModelName('ArrtB03CloseFailB');
    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/arrt-b03-close-fail' },
      models: [
        { name: modelA, schema: new mongoose.Schema({ title: String }), router: { operationAccess: false } },
        { name: modelB, schema: new mongoose.Schema({ label: String }), router: { operationAccess: false } },
      ],
    });
    const connection = (runtime as unknown as { models: Record<string, mongoose.Model<unknown>> }).models[modelA]
      .db as mongoose.Connection;
    const closeFailure = new Error('close failed');

    // Simulate an opened owned connection without needing a server.
    vi.spyOn(connection, 'openUri').mockImplementation(async () => {
      (connection as unknown as { readyState: number }).readyState = 1;
      return connection;
    });
    const closeSpy = vi.spyOn(connection, 'close').mockRejectedValueOnce(closeFailure);

    try {
      await runtime.init();
      expect(connection.readyState).toBe(1);

      await expect(runtime.shutdown()).rejects.toBe(closeFailure);
      expect(closeSpy).toHaveBeenCalledTimes(1);
      // Independent model cleanup still ran despite the close failure.
      expect(connection.models[modelA]).toBeUndefined();
      expect(connection.models[modelB]).toBeUndefined();
      // Release was still attempted.
      expect(mongoose.connections).not.toContain(connection);

      // Failed shutdown allows a retry, which now succeeds as a no-op.
      await runtime.shutdown();
      expect(mongoose.connections.length).toBe(baseline);
    } finally {
      if (mongoose.connections.includes(connection)) {
        await connection.destroy();
      }
    }
  });

  it('attempts every model deletion when the first deletion rejects and retains the failed name', async () => {
    const baseline = mongoose.connections.length;
    const modelA = uniqueModelName('ArrtB03DeleteFailA');
    const modelB = uniqueModelName('ArrtB03DeleteFailB');
    const runtime = createAccessRouterRuntime({
      db: { url: 'mongodb://127.0.0.1:27017/arrt-b03-delete-fail' },
      models: [
        { name: modelA, schema: new mongoose.Schema({ title: String }), router: { operationAccess: false } },
        { name: modelB, schema: new mongoose.Schema({ label: String }), router: { operationAccess: false } },
      ],
    });
    const connection = (runtime as unknown as { models: Record<string, mongoose.Model<unknown>> }).models[modelA]
      .db as mongoose.Connection;
    const deleteFailure = new Error('delete A failed');
    vi.spyOn(connection, 'openUri').mockImplementation(async () => {
      (connection as unknown as { readyState: number }).readyState = 1;
      return connection;
    });
    vi.spyOn(connection, 'close').mockImplementation(async () => {
      (connection as unknown as { readyState: number }).readyState = 0;
      return connection;
    });
    const originalDeleteModel = connection.deleteModel.bind(connection);
    const deleteSpy = vi.spyOn(connection, 'deleteModel').mockImplementationOnce(() => {
      throw deleteFailure;
    });

    try {
      await runtime.init();
      await expect(runtime.shutdown()).rejects.toBe(deleteFailure);
      expect(deleteSpy).toHaveBeenCalledTimes(2);
      // First model retained for retry; second model still cleaned.
      expect(connection.models[modelA]).toBeDefined();
      expect(connection.models[modelB]).toBeUndefined();

      // Restore real deletion and retry the failed shutdown.
      deleteSpy.mockImplementation((name: string) => originalDeleteModel(name));
      await runtime.shutdown();
      expect(connection.models[modelA]).toBeUndefined();
      expect(mongoose.connections).not.toContain(connection);
      expect(mongoose.connections.length).toBe(baseline);
    } finally {
      if (mongoose.connections.includes(connection)) {
        await connection.destroy();
      }
    }
  });

  it('leaves an externally replaced model intact on shutdown (identity-safe cleanup)', async () => {
    const externalConnection = mongoose.createConnection();
    try {
      const modelName = uniqueModelName('ArrtB05Replaced');
      const schema = new mongoose.Schema({ title: String });
      const runtime = createAccessRouterRuntime({
        db: { connection: externalConnection },
        models: [{ name: modelName, schema, router: { operationAccess: false } }],
      });
      const original = externalConnection.models[modelName];
      expect(original).toBeDefined();
      expect(runtime.models[modelName]).toBe(original);

      externalConnection.deleteModel(modelName);
      const replacement = externalConnection.model(modelName, new mongoose.Schema({ other: String }));
      expect(replacement).not.toBe(original);

      await runtime.shutdown();
      expect(externalConnection.models[modelName]).toBe(replacement);
      expect(mongoose.connections).toContain(externalConnection);
    } finally {
      await externalConnection.destroy().catch(() => {});
    }
  });

  it('keeps a shared external registration until the creating owner exits (borrower never deletes)', async () => {
    const externalConnection = mongoose.createConnection();
    try {
      const modelName = uniqueModelName('ArrtB05Shared');
      const schema = new mongoose.Schema({ title: String });
      const creator = createAccessRouterRuntime({
        db: { connection: externalConnection },
        models: [{ name: modelName, schema, router: { operationAccess: false } }],
      });
      const borrower = createAccessRouterRuntime({
        db: { connection: externalConnection },
        models: [{ name: modelName, schema, router: { operationAccess: false } }],
      });
      expect(borrower.models[modelName]).toBe(creator.models[modelName]);
      expect(externalConnection.models[modelName]).toBe(creator.models[modelName]);

      await borrower.shutdown();
      expect(externalConnection.models[modelName]).toBe(creator.models[modelName]);

      await creator.shutdown();
      expect(externalConnection.models[modelName]).toBeUndefined();
      expect(mongoose.connections).toContain(externalConnection);

      const next = createAccessRouterRuntime({
        db: { connection: externalConnection },
        models: [{ name: modelName, schema, router: { operationAccess: false } }],
      });
      expect(externalConnection.models[modelName]).toBeDefined();
      await next.shutdown();
      expect(externalConnection.models[modelName]).toBeUndefined();
    } finally {
      await externalConnection.destroy().catch(() => {});
    }
  });

  it('rejects schema-backed app-only configs before allocating a connection', () => {
    const baseline = mongoose.connections.length;
    const createConnectionSpy = vi.spyOn(mongoose, 'createConnection');

    expect(() =>
      createAccessRouterRuntimeApp({
        models: [
          {
            name: uniqueModelName('ArrtB03AppOnly'),
            schema: new mongoose.Schema({ title: String }),
            router: { operationAccess: false },
          },
        ],
      }),
    ).toThrow(/schema-backed models.*no disposal handle/);
    expect(createConnectionSpy).not.toHaveBeenCalled();
    expect(mongoose.connections.length).toBe(baseline);

    // Genuinely lifecycle-free configs (data-only) still work.
    const app = createAccessRouterRuntimeApp({
      data: [{ name: 'status', router: { data: [{ id: 'ok' }], idField: 'id' } }],
    });
    expect(app).toBeDefined();
    expect(mongoose.connections.length).toBe(baseline);
  });
});
