/**
 * VIRT-00 baseline characterization (no behavior change).
 *
 * Pins the current populate-vs-include trimming asymmetry plus
 * projection-identity basics before the virtuals feature lands:
 *
 * - `include` targets trim via target `Service.find`/`findOne`
 *   (`src/services/base.ts`), while `populate` targets only get
 *   query-level `select`/`match` (`src/core.ts:219-283`) with no
 *   target-model post-fetch trim.
 * - There is no package `virtuals` option yet.
 *
 * Fixture design (distinguishes query projection from trimming): the
 * target model keeps an internal field (`internalNote`) OUTSIDE its
 * `permissionSchema` but forces it into the query via
 * `alwaysSelectFields.read` / `.list`. A second denied field
 * (`secret`) is left unforced as a control for ordinary
 * query-restriction.
 *
 * HISTORICAL EVIDENCE: the populate-leakage assertions below describe
 * today's behavior. VIRT-05 closes the asymmetry (target-model
 * finalization for populate targets) and must update those live
 * assertions to the intended symmetric contract; do not retain a test
 * requiring the old leakage after integration.
 */
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createAccessRuntime, defaultRuntime, setGlobalOptions } from '../dist/index.mjs';
import { useMongoTestDatabase } from './setup';

useMongoTestDatabase();

let modelCounter = 0;
const activeRuntimes: Array<{ runtime: { clearOpenApiRoutes(): void } }> = [];

const resetGlobalOptions = () => {
  setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });
};

afterEach(() => {
  for (const entry of activeRuntimes.splice(0)) {
    entry.runtime.clearOpenApiRoutes();
  }
  defaultRuntime.clearOpenApiRoutes();
  resetGlobalOptions();
  mongoose.deleteModel(/Virt00.*/);
});

const createAsymmetryApp = async () => {
  const runtime = createAccessRuntime();
  activeRuntimes.push({ runtime: runtime.runtime });
  const tag = ++modelCounter;
  const targetModelName = `Virt00Target${tag}`;
  const parentModelName = `Virt00Parent${tag}`;

  const Target = mongoose.model(
    targetModelName,
    new mongoose.Schema({
      name: String,
      internalNote: String,
      secret: String, // pragma: allowlist secret
    }),
  );
  const Parent = mongoose.model(
    parentModelName,
    new mongoose.Schema({
      name: String,
      targetRef: { type: mongoose.Schema.Types.ObjectId, ref: targetModelName },
    }),
  );

  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });

  // `internalNote` is deliberately outside `permissionSchema` but forced
  // into the query via `alwaysSelectFields`; `secret` stays fully denied
  // (control for ordinary query-restriction).
  runtime.createRouter(Target, {
    basePath: `/virt00-targets-${tag}`,
    operationAccess: { list: true, read: true },
    permissionSchema: {
      name: { list: true, read: true },
    },
    alwaysSelectFields: { read: ['internalNote'], list: ['internalNote'] },
  });

  const parentRouter = runtime.createRouter(Parent, {
    basePath: `/virt00-parents-${tag}`,
    operationAccess: { list: true, read: true },
    permissionSchema: {
      name: { list: true, read: true },
      targetRef: { list: true, read: true },
    },
  });

  const target = await Target.create({
    name: 'virt00-target',
    internalNote: 'forced-internal',
    secret: 'denied-secret', // pragma: allowlist secret
  });
  const parent = await Parent.create({ name: 'virt00-parent', targetRef: target._id });

  const app = express();
  app.use(express.json());
  app.use(parentRouter.routes);

  return {
    app,
    targetModelName,
    parentBase: `/virt00-parents-${tag}`,
    parentId: String(parent._id),
  };
};

const createProjectionApp = async () => {
  const runtime = createAccessRuntime();
  activeRuntimes.push({ runtime: runtime.runtime });
  const tag = ++modelCounter;
  const modelName = `Virt00Proj${tag}`;

  const Doc = mongoose.model(
    modelName,
    new mongoose.Schema({
      name: String,
      role: String,
    }),
  );

  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions: () => [],
  });

  const router = runtime.createRouter(Doc, {
    basePath: `/virt00-proj-${tag}`,
    operationAccess: { list: true, read: true },
    permissionSchema: {
      name: { list: true, read: true },
      role: { list: true, read: true },
    },
  });

  await Doc.create([{ name: 'virt00-seed', role: 'admin' }]);

  const app = express();
  app.use(express.json());
  app.use(router.routes);

  return { app, base: `/virt00-proj-${tag}` };
};

describe('VIRT-00 virtuals baseline: populate-vs-include trimming symmetry (VIRT-05 closed)', () => {
  // HISTORICAL NOTE (VIRT-00 evidence retained): before VIRT-05, populate
  // leaked `internalNote` (forced via alwaysSelectFields, no target trim)
  // while includes trimmed it. VIRT-05 closes the asymmetry: populate targets
  // now finalize through the target model (virtuals + trim), even without
  // virtual definitions. Live assertions below assert the symmetric contract.
  it('populate (default read access) trims the forced field via target-model finalization', async () => {
    const { app, parentBase } = await createAsymmetryApp();

    const response = await request(app)
      .post(`${parentBase}/__query`)
      .send({ populate: ['targetRef'] })
      .expect(200)
      .expect('Content-Type', /json/);

    const rows = (response.body.data ?? response.body) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    const populated = rows[0].targetRef as Record<string, unknown>;
    expect(populated).toMatchObject({ name: 'virt00-target' });
    // Forced via alwaysSelectFields.read: fetched internally but trimmed from
    // populated output (symmetric with includes since VIRT-05).
    expect(populated).not.toHaveProperty('internalNote');
    // Control: ordinary unforced denied field stays query-restricted.
    expect(populated).not.toHaveProperty('secret');
  });

  it('populate with explicit list access also trims the forced field (alwaysSelectFields.list)', async () => {
    const { app, parentBase } = await createAsymmetryApp();

    const response = await request(app)
      .post(`${parentBase}/__query`)
      .send({ populate: [{ path: 'targetRef', access: 'list' }] })
      .expect(200)
      .expect('Content-Type', /json/);

    const rows = (response.body.data ?? response.body) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    const populated = rows[0].targetRef as Record<string, unknown>;
    expect(populated).toMatchObject({ name: 'virt00-target' });
    expect(populated).not.toHaveProperty('internalNote');
    expect(populated).not.toHaveProperty('secret');
  });

  it('control: explicitly requested forced/denied fields stay trimmed in populated output', async () => {
    const { app, parentBase, parentId } = await createAsymmetryApp();

    const response = await request(app)
      .post(`${parentBase}/__query/${parentId}`)
      .send({ populate: [{ path: 'targetRef', select: ['name', 'internalNote', 'secret'] }] })
      .expect(200)
      .expect('Content-Type', /json/);

    const populated = (response.body as Record<string, unknown>).targetRef as Record<string, unknown>;
    expect(populated).toMatchObject({ name: 'virt00-target' });
    // `internalNote` (forced, outside permissionSchema) and `secret` (denied,
    // never forced) are both absent after target-model trim, even when
    // explicitly requested.
    expect(populated).not.toHaveProperty('internalNote');
    expect(populated).not.toHaveProperty('secret');
  });

  it('legacy include (op read) passes the target through target-model trim: forced field removed', async () => {
    const { app, parentBase, targetModelName } = await createAsymmetryApp();

    const response = await request(app)
      .post(`${parentBase}/__query`)
      .send({
        include: {
          model: targetModelName,
          op: 'read',
          path: 'targetDoc',
          localField: 'targetRef',
          foreignField: '_id',
        },
      })
      .expect(200)
      .expect('Content-Type', /json/);

    const rows = (response.body.data ?? response.body) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    const included = rows[0].targetDoc as Record<string, unknown>;
    expect(included).toMatchObject({ name: 'virt00-target' });
    // Same fetch as populate (target Service.findOne selects the forced
    // field), but the target trim drops it because it is outside the
    // target permissionSchema.
    expect(included).not.toHaveProperty('internalNote');
    expect(included).not.toHaveProperty('secret');
  });

  it('legacy include (op list) passes the target through target-model trim: forced field removed', async () => {
    const { app, parentBase, targetModelName } = await createAsymmetryApp();

    const response = await request(app)
      .post(`${parentBase}/__query`)
      .send({
        include: {
          model: targetModelName,
          op: 'list',
          path: 'targetDocs',
          localField: 'targetRef',
          foreignField: '_id',
        },
      })
      .expect(200)
      .expect('Content-Type', /json/);

    const rows = (response.body.data ?? response.body) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    const included = rows[0].targetDocs as Array<Record<string, unknown>>;
    expect(Array.isArray(included)).toBe(true);
    expect(included).toHaveLength(1);
    expect(included[0]).toMatchObject({ name: 'virt00-target' });
    expect(included[0]).not.toHaveProperty('internalNote');
    expect(included[0]).not.toHaveProperty('secret');
  });

  it("projection identity: inclusion select ['name'] retains _id on a fresh model", async () => {
    const { app, base } = await createProjectionApp();

    const response = await request(app)
      .post(`${base}/__query`)
      .send({ select: ['name'] })
      .expect(200)
      .expect('Content-Type', /json/);

    const rows = (response.body.data ?? response.body) as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveProperty('_id');
      expect(row).toHaveProperty('name');
      expect(row).not.toHaveProperty('role');
    }
  });

  it("projection identity: explicit ['name', '-_id'] strips _id on a fresh model", async () => {
    const { app, base } = await createProjectionApp();

    const response = await request(app)
      .post(`${base}/__query`)
      .send({ select: ['name', '-_id'] })
      .expect(200)
      .expect('Content-Type', /json/);

    const rows = (response.body.data ?? response.body) as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toHaveProperty('_id');
      expect(row).toHaveProperty('name');
    }
  });
});
