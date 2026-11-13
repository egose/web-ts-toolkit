/** Diagnostic-only real-worker instrumentation. Never imported by a timing worker or production entry. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { createRequire, isBuiltin } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, sha } from './access-router-crud.mjs';
import { selectPanels } from './access-router-crud-v2.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = 'packages/access-router/test/access-router-crud-fixture.ts';
const prefix = "import { count as __cwoCount, classify as __cwoClassify } from 'cwo-input-probe';\n";

// Exact, finite source anchors fail closed on drift. No file under src/ is edited.
// Counters sit at the actual construction/visit/conversion sites, not inferred from
// helper names or result graph sizes. They do not measure bytes, CPU or latency.
// Keep each exact before/after anchor adjacent for review.
// prettier-ignore
const edits = {
  'acl/model-input-admission.ts': [
    ['if (isMongooseDocument(value)) return value.toObject({ virtuals: false, flattenMaps: true });',
      "if (isMongooseDocument(value)) { __cwoClassify('input.documentConversion'); return value.toObject({ virtuals: false, flattenMaps: true }); }"],
    ['return Object.fromEntries(Object.entries(value));',
      "return (__cwoClassify('input.classNormalization'), Object.fromEntries(Object.entries(value)));"],
    ['const active = new WeakSet<object>();',
      "const __cwoPhase = __cwoClassify('input.normalize.passes');\n  const active = new WeakSet<object>();"],
    ['if (++nodes > maxNodes)', "__cwoCount(`input.normalize.${__cwoPhase}.nodes`);\n    if (++nodes > maxNodes)"],
    ['const output = new Array(value.length);',
      "__cwoCount(`input.normalize.${__cwoPhase}.arrays`);\n        const output = new Array(value.length);"],
    ['value = Object.fromEntries(value);\n      }',
      "__cwoCount(`input.normalize.${__cwoPhase}.mapShells`);\n        value = Object.fromEntries(value);\n      }"],
    ['const output: Record<string, unknown> = {};\n      for (const [key, entry] of entries)',
      "__cwoCount(`input.normalize.${__cwoPhase}.records`);\n      const output: Record<string, unknown> = {};\n      for (const [key, entry] of entries)"],
    ['const bounded = boundedInputValue(input, resolveRequestComplexity(options));',
      "__cwoCount('input.preflight.calls');\n  const bounded = boundedInputValue(input, resolveRequestComplexity(options));"],
    ['for (const field of fields) visit(set({}, field, true));',
      "for (const field of fields) { __cwoCount('path.requestBoundary.fields'); visit(set({}, field, true)); }"],
    ['value = inputValue(value);\n  if (Array.isArray(value)) {',
      "__cwoCount('input.selected.nodes');\n  value = inputValue(value);\n  if (Array.isArray(value)) {\n    __cwoCount('input.selected.arrays');"],
    ['const output: Record<string, unknown> = {};\n  for (const [key, entry] of Object.entries(value))',
      "__cwoCount('input.selected.records');\n  const output: Record<string, unknown> = {};\n  for (const [key, entry] of Object.entries(value))"],
    ["const scrub = (input: unknown, path: string): unknown => {",
      "__cwoCount('input.scrub.passes');\n  const scrub = (input: unknown, path: string): unknown => {\n    __cwoCount('input.scrub.nodes');"],
    ['if (Array.isArray(input)) return input.map((entry) => scrub(entry, path));',
      "if (Array.isArray(input)) { __cwoCount('input.scrub.arrays'); return input.map((entry) => scrub(entry, path)); }"],
    ['const result: Record<string, unknown> = {};\n    for (const [key, entry] of Object.entries(input))',
      "__cwoCount('input.scrub.records');\n    const result: Record<string, unknown> = {};\n    for (const [key, entry] of Object.entries(input))"],
    ["visit(doc.toObject({ virtuals: false, flattenMaps: true }), '', '');",
      "__cwoCount('lifecycle.virtualCleanup.convert');\n  visit(doc.toObject({ virtuals: false, flattenMaps: true }), '', '');"],
    ['const { existing, inputFields, catalog } = args;',
      "__cwoCount('input.admission.calls');\n  const { existing, inputFields, catalog } = args;"],
    ['const { configuration } = readServiceAuthorization(args.authorization, args.binding);\n  const permissions',
      "__cwoCount('input.requestRules.calls');\n  const { configuration } = readServiceAuthorization(args.authorization, args.binding);\n  const permissions"],
  ],
  'acl/document-stage.ts': [
    ['copyDocumentView(record.source!)', "(__cwoClassify('stage.disposableView'), copyDocumentView(record.source!))"],
    ['if (existing) return existing.prepared;',
      "if (existing) { __cwoClassify('stage.sourceReuse'); return existing.prepared; }"],
    ['raw = outsideOutputWorkLedger(() => input.toObject({ virtuals: false, flattenMaps: true }));',
      "__cwoClassify('stage.documentConversion');\n      raw = outsideOutputWorkLedger(() => input.toObject({ virtuals: false, flattenMaps: true }));"],
    ['(copyDocumentView(raw, createPublicationRowBudget(publication)) as Record<string, unknown>)',
      "(__cwoClassify('stage.sourceMaterialization'), copyDocumentView(raw, createPublicationRowBudget(publication)) as Record<string, unknown>)"],
  ],
  'helpers/document.ts': [
    ['if (value instanceof Date) return new Date(value.getTime());',
      "if (value instanceof Date) return (__cwoClassify('native.dateClone'), new Date(value.getTime()));"],
    ['return Buffer.from(value as Buffer);', "return (__cwoClassify('native.bufferClone'), Buffer.from(value as Buffer));"],
    ['return mongo.BSON.deserialize(mongo.BSON.serialize({ value }), { promoteValues: false, bsonRegExp: true }).value;',
      "__cwoClassify('native.bsonRoundtrip');\n    return mongo.BSON.deserialize(mongo.BSON.serialize({ value }), { promoteValues: false, bsonRegExp: true }).value;"],
  ],
  'acl/trusted-output-materialization.ts': [
    ['const result = outsideOutputWorkLedger(\n    () => mongo.BSON.deserialize',
      "__cwoClassify('native.outputBsonRoundtrip');\n  const result = outsideOutputWorkLedger(\n    () => mongo.BSON.deserialize"],
    ['return new Date(time);', "return (__cwoClassify('native.outputDateClone'), new Date(time));"],
  ],
  'helpers/index.ts': [
    ['if (!isPlainObject(query)) return query;', "__cwoCount('parser.calls');\n  if (!isPlainObject(query)) return query;"],
    ['const mapEntry = async ([key, val]: [string, unknown]) => {',
      "const mapEntry = async ([key, val]: [string, unknown]) => {\n    __cwoCount('parser.entries');"],
    ['if (plainValue.$$sq) {', "if (plainValue.$$sq) {\n        __cwoCount('parser.subqueryMarkers');"],
    ['} else if (plainValue.$$date) {', "} else if (plainValue.$$date) {\n        __cwoCount('parser.dateMarkers');"],
    ['const items = val as unknown[];', "__cwoCount('parser.arrays');\n      const items = val as unknown[];"],
  ],
  'helpers/concurrency.ts': [
    ['const results: TOutput[] = new Array(items.length);',
      "__cwoClassify('orchestration.maps'); __cwoCount('orchestration.items', items.length);\n  const results: TOutput[] = new Array(items.length);"],
  ],
  'core-shared.ts': [
    ['const keys = Object.keys(permissionSchema);',
      "const keys = Object.keys(permissionSchema);\n  __cwoCount(`rules.${access}.enumerations`); __cwoCount(`rules.${access}.keys`, keys.length);"],
    ['if (await value.call(req, functionArgs[0], functionArgs[1] ?? EMPTY_DOCUMENT_GRANTS)) fields.push(key);',
      "__cwoCount(`rules.${access}.functions`);\n      if (await value.call(req, functionArgs[0], functionArgs[1] ?? EMPTY_DOCUMENT_GRANTS)) fields.push(key);"],
  ],
  'acl/field-catalog.ts': [
    ["export function isSafeInputPath(path: string, requestIdentity = false): boolean {",
      "export function isSafeInputPath(path: string, requestIdentity = false): boolean {\n  __cwoClassify('path.safeInputChecks');"],
    ['export function isInputVirtualPath(catalog: AuthorizationFieldCatalog, path: string): boolean {',
      "export function isInputVirtualPath(catalog: AuthorizationFieldCatalog, path: string): boolean {\n  __cwoClassify('path.virtualChecks');"],
    ['export function matchesCatalogPattern(pattern: string, path: string, descendants = false): boolean {',
      "export function matchesCatalogPattern(pattern: string, path: string, descendants = false): boolean {\n  __cwoClassify('path.patternMatches');"],
  ],
  'helpers/apply-update.ts': [
    ['for (const field of allowedFields) {', "for (const field of allowedFields) {\n    __cwoCount('path.updateBoundary.fields');"],
    ['target.set(path, value);', "__cwoCount('update.setters');\n      target.set(path, value);"],
  ],
  'services/base.ts': [
    ["assertPublicAdmission(filter, 'data');", "__cwoCount('parser.serviceCalls');\n    assertPublicAdmission(filter, 'data');"],
  ],
  'services/service.ts': [
    ['context.originalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;',
      "__cwoCount('lifecycle.originalSnapshot.convert');\n    context.originalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;"],
    ['contexts[index].finalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;',
      "__cwoCount('lifecycle.finalSnapshot.convert');\n      contexts[index].finalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;"],
    ['context.finalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;',
      "__cwoCount('lifecycle.finalSnapshot.convert');\n    context.finalDocumentSnapshot = doc.toObject({ virtuals: false }) as Record<string, unknown>;"],
    ['omit(d.toObject({ virtuals: false }), diffExcludeFields)',
      "omit((__cwoCount('lifecycle.diff.convert'), d.toObject({ virtuals: false })), diffExcludeFields)"],
    ['await this.changes(doc.toObject({ virtuals: false }) as Record<string, unknown>, context);',
      "__cwoCount('lifecycle.changeInput.convert');\n    await this.changes(doc.toObject({ virtuals: false }) as Record<string, unknown>, context);"],
  ],
};

const probeSource = `
import { createHook } from 'node:async_hooks';
let current;
export function count(key, n = 1) {
  if (!current) return;
  current.counts[key] = (current.counts[key] ?? 0) + n;
  if (/passes|serviceCalls|Snapshot|convert|stage\\./.test(key)) current.trace.push(key);
}
export function classify(key) {
  const stack = new Error().stack;
  const owner = /assertModelInputComplexity/.test(stack) ? 'preflight'
    : /admitModelInput/.test(stack) ? 'admission'
    : /sanitizePreparedInput/.test(stack) ? 'prepared'
    : /resolveInputDocumentGrants/.test(stack) ? 'prewrite'
    : /iterateQuery|mapEntry|parseClientData/.test(stack) ? 'parser'
    : 'other';
  count(key + '.' + owner);
  return owner;
}
const promises = createHook({ init(_id, type) {
  if (!current || type !== 'PROMISE') return;
  count('promise.resources');
  const owner = new Error().stack.split('\\n').find(line =>
    /at (?:async )?(?:iterateQuery|mapEntry|RequestConcurrencyScheduler\\.(?:map|run)|mapWithConcurrencyLimit|worker|BaseService\\.parseClientData|resolveDocumentStage|invokeDocumentPermissions|SharedHookGate\\.(?:run|invoke))\\b/.test(line));
  const name = owner?.match(/at (?:async )?([^ (]+)/)?.[1] ?? 'unassigned';
  count('promise.owner.' + name);
}});
export function startWork() { current = { counts: {}, trace: [] }; promises.enable(); }
export function finishWork() { promises.disable(); const result = current; current = undefined; return result; }
`;

async function sourceFiles(root) {
  const result = [];
  async function visit(dir) {
    for (const e of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    )) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await visit(p);
      else if (e.isFile()) result.push([path.relative(root, p).split(path.sep).join('/'), sha(await fs.readFile(p))]);
    }
  }
  await visit(root);
  return result;
}

export async function buildInputProbe(root, destination) {
  root = path.resolve(root);
  assert.ok(process.env.TMPDIR && path.isAbsolute(process.env.TMPDIR), 'absolute TMPDIR required');
  execFileSync('git', ['check-ignore', process.env.TMPDIR], { cwd: repo });
  const relative = path.relative(process.env.TMPDIR, destination);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'probe must be inside TMPDIR');
  await fs.mkdir(destination);
  const src = path.join(root, 'packages/access-router/src');
  const original = await sourceFiles(src);
  const instrumented = [];
  const require = createRequire(path.join(root, 'packages/access-router/package.json'));
  const esbuild = require('esbuild');
  const result = await esbuild.build({
    absWorkingDir: root,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    write: false,
    stdin: {
      contents: `export * from './${fixture}'; export { startWork, finishWork } from 'cwo-input-probe';`,
      resolveDir: root,
      sourcefile: 'cwo-input-work-entry.ts',
    },
    plugins: [
      {
        name: 'diagnostic-input-sites',
        setup(build) {
          build.onResolve({ filter: /^cwo-input-probe$/ }, () => ({ path: 'probe', namespace: 'cwo' }));
          build.onLoad({ filter: /.*/, namespace: 'cwo' }, () => ({ contents: probeSource, loader: 'js' }));
          build.onResolve({ filter: /^[^./]/ }, (args) => {
            if (args.path === 'cwo-input-probe') return;
            return {
              path: isBuiltin(args.path)
                ? args.path
                : createRequire(path.join(args.resolveDir, 'package.json')).resolve(args.path),
              external: true,
            };
          });
          build.onLoad({ filter: /\.ts$/ }, async (args) => {
            const name = path.relative(src, args.path).split(path.sep).join('/');
            if (!edits[name]) return;
            const original = await fs.readFile(args.path, 'utf8');
            let contents = original;
            for (const [before, after] of edits[name]) {
              assert.equal(contents.split(before).length - 1, 1, `diagnostic source anchor drift: ${name}: ${before}`);
              // A replacement string would interpret $$ in parser markers as one $.
              contents = contents.replace(before, () => after);
            }
            contents = prefix + contents;
            instrumented.push({
              path: `packages/access-router/src/${name}`,
              originalHash: sha(original),
              diagnosticHash: sha(contents),
              anchors: edits[name].length,
            });
            return { contents, loader: 'ts' };
          });
        },
      },
    ],
  });
  assert.equal(instrumented.length, Object.keys(edits).length, 'missing diagnostic module');
  assert.deepEqual(await sourceFiles(src), original, 'production source changed while building probe');
  const bundle = path.join(destination, 'probe.cjs');
  await fs.writeFile(bundle, result.outputFiles[0].contents, { flag: 'wx' });
  const manifest = {
    kind: 'diagnostic-only-not-timing',
    sourceHash: digest(original),
    fixtureHash: sha(await fs.readFile(path.join(root, fixture))),
    toolHash: sha(await fs.readFile(fileURLToPath(import.meta.url))),
    bundleHash: sha(result.outputFiles[0].contents),
    esbuild: esbuild.version,
    instrumented: instrumented.sort((a, b) => a.path.localeCompare(b.path, 'en')),
    metric:
      'Actual executed visits/constructions/conversion sites and PROMISE async resources. Not allocated bytes, retained heap, CPU shares or a speedup.',
  };
  await fs.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(manifest), { flag: 'wx' });
  return { api: require(bundle), manifest };
}

export async function collectInputWork(api, cases) {
  const records = [];
  for (const c of cases) {
    const f = api.createCrudFixture(c, true);
    try {
      f.reset();
      api.startWork();
      let result, work;
      try {
        result = await f.invoke();
      } finally {
        work = api.finishWork();
      }
      const adapterCounts = { ...f.counts },
        callbackTrace = [...f.trace];
      const fingerprint = digest(f.check(result));
      records.push({
        id: c.id,
        configuredModes: c.modes,
        resolvedModes: f.resolvedModes(),
        ...work,
        adapterCounts,
        callbackTrace,
        fingerprint,
      });
    } finally {
      f.dispose();
    }
  }
  return records;
}

/** Curate only CPU samples overlapping actual invocation windows, with reviewable
 * stacks. Sampling estimates are not exclusive CPU clocks or allocation bytes. */
export function summarizeInputProfile(profile, worker, root = repo) {
  assert.equal(profile.samples.length, profile.timeDeltas.length, 'profile sample mismatch');
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parents = new Map(profile.nodes.flatMap((n) => (n.children ?? []).map((id) => [id, n.id])));
  const windows = worker.profiles.flatMap((p, index) => p.intervals.map(([start, end]) => ({ start, end, index })));
  windows.sort((a, b) => a.start - b.start);
  assert.ok(
    windows.length && windows.every((w) => w.start >= profile.startTime && w.end <= profile.endTime && w.end > w.start),
    'profile/window clock mismatch',
  );
  const stack = (id) => {
    const result = [];
    while (nodes.has(id)) {
      const frame = nodes.get(id).callFrame;
      let file = frame.url ?? '';
      if (file.startsWith('file://')) file = fileURLToPath(file);
      if (file.includes('/_tmp') && file.endsWith('/worker.cjs')) file = '<sealed-source-bundle>';
      else if (file.startsWith(`${root}/`)) file = path.relative(root, file);
      else if (path.isAbsolute(file)) file = '<runtime-or-external>';
      result.push({ function: frame.functionName, file, line: frame.lineNumber });
      id = parents.get(id);
    }
    return result;
  };
  const category = (frames) => {
    const names = frames.map((f) => f.function).join('|');
    if (/\(idle\)/.test(names)) return 'idle';
    if (/\(garbage collector\)/.test(names)) return 'gc';
    if (/cloneIsolatedLeaf|copyTrustedBsonValue|prepareWire|selectedBsonBytes/.test(names)) return 'native-clone-wire';
    if (/\$toObject/.test(names)) return 'mongoose-toObject';
    if (/boundedInputValue/.test(names)) return 'input-normalize';
    if (/copyInputValue/.test(names)) return 'input-selected-copy';
    if (/sanitizePreparedInput|scrub/.test(names)) return 'input-scrub';
    if (/stripDocumentInputVirtuals/.test(names)) return 'update-virtual-cleanup';
    if (/collectSchemaFields|requestInputFields/.test(names)) return 'request-field-rules';
    if (/matchesCatalogPattern|isSafeInputPath|isInputVirtualPath|requestBoundaries|inputFetchPaths/.test(names))
      return 'catalog-path-shared';
    if (/iterateQuery|mapEntry|parseClientData/.test(names)) return 'parser';
    if (/prepareQueryOutputSource/.test(names)) return 'stage-source-materialization';
    if (/resolveDocumentStage|copyDocumentView/.test(names)) return 'stage-view-resolution';
    if (/copyOutputValue|materializeTrustedOutputValue/.test(names)) return 'output-selected-materialization';
    if (/mapWithConcurrencyLimit|RequestConcurrencyScheduler|SharedHookGate/.test(names)) return 'orchestration';
    if (/\bdiff\b/.test(names)) return 'lifecycle-diff';
    return 'other-unattributed';
  };
  const rows = new Map();
  let cursor = profile.startTime,
    nextWindow = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const end = cursor + profile.timeDeltas[i];
    while (nextWindow < windows.length && windows[nextWindow].end <= cursor) nextWindow++;
    for (let j = nextWindow; j < windows.length && windows[j].start < end; j++) {
      const w = windows[j],
        micros = Math.min(end, w.end) - Math.max(cursor, w.start);
      if (micros <= 0) continue;
      const frames = stack(profile.samples[i]);
      const key = `${w.index}/${profile.samples[i]}`;
      const row = rows.get(key) ?? {
        id: worker.ids[w.index],
        category: category(frames),
        stack: frames,
        samples: 0,
        sampledMicros: 0,
      };
      row.samples++;
      row.sampledMicros += micros;
      rows.set(key, row);
    }
    cursor = end;
  }
  return {
    kind: 'separate-baseline-cpu-sampling-not-timing-acceptance',
    sourceHash: worker.sourceHash,
    bundleHash: worker.bundleHash,
    rawProfileHash: digest(profile),
    workerRecordHash: digest(worker),
    cells: worker.ids.map((id, i) => ({
      id,
      operations: worker.profiles[i].operations,
      fingerprint: worker.hashes[i],
      invocationMicros: worker.profiles[i].intervals.reduce((sum, [a, b]) => sum + b - a, 0),
    })),
    rows: [...rows.values()],
    limitations:
      'Overlap-clipped sampling intervals include timer bookkeeping, but exclude reset/request construction/assertions and profile warmup. Inclusive synchronous stacks categorize samples; async continuation/engine work can be unattributed. Idle and GC are separate, not exclusive CPU shares. Stack source locations are bundled, not source-mapped. No candidate or allocation benefit.',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, 'Usage: access-router-input-work.mjs NEW_SCRATCH_OUTPUT');
  const destination = path.resolve(process.argv[2]);
  const { api, manifest } = await buildInputProbe(repo, destination);
  const cases = [...api.inputCatalog(), ...selectPanels(['core']).flatMap((p) => p.cases)];
  const records = await collectInputWork(api, cases);
  await fs.writeFile(path.join(destination, 'work.json'), JSON.stringify({ manifest, records }), { flag: 'wx' });
  console.log(
    JSON.stringify({
      kind: manifest.kind,
      records: records.length,
      sourceHash: manifest.sourceHash,
      fixtureHash: manifest.fixtureHash,
    }),
  );
}
