import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { digest, verifySeal } from './access-router-crud.mjs';

const [directory, json] = process.argv.slice(2);
const settings = JSON.parse(json);
// Parent verifies external dependency bytes before/after; workers verify their own immutable source/bundle.
const seal = await verifySeal(directory, undefined, false);
const api = createRequire(import.meta.url)(path.resolve(directory, 'worker.cjs'));
assert.equal(api.fixtureId, seal.fixtureId, 'wrong fixture loaded');
assert.equal(api.sourceHash, seal.sourceHash, 'wrong production source loaded');
const cases = api.crudCatalog();
assert.ok(cases.length > 0);
const ids = cases.map((c) => c.id);
assert.equal(new Set(ids).size, ids.length, 'duplicate fixture identities');
const output = { sourceHash: api.sourceHash, bundleHash: seal.bundleHash, ids, hashes: [], values: [], work: [] };
const order = settings.reverse ? [...cases.keys()].reverse() : [...cases.keys()];
for (const index of order) {
  const c = cases[index];
  api.validateCase(c);
  const diagnostic = settings.kind === 'diagnostic';
  const f = api.createCrudFixture(c, diagnostic);
  try {
    let expected;
    const total = diagnostic ? 1 : settings.warmups + settings.samples;
    let wall = 0, cpu = 0;
    for (let n = 0; n < total; n++) {
      f.reset(); // Equivalent state and inputs outside timing, including write resets.
      let result;
      if (diagnostic || n < settings.warmups) result = await f.invoke();
      else {
        const startCpu = process.cpuUsage(), start = performance.now();
        result = await f.invoke(); // The actual write, lifecycle, authorization and finalization are INSIDE timing.
        wall += performance.now() - start;
        const used = process.cpuUsage(startCpu);
        cpu += (used.user + used.system) / 1000;
      }
      const hash = digest(f.check(result)); // All assertions and fingerprinting OUTSIDE timing.
      if (expected) assert.equal(hash, expected, 'unstable result or write state');
      expected = hash;
    }
    output.hashes[index] = expected;
    if (diagnostic) output.work[index] = { configuredModes: c.modes, resolvedModes: f.resolvedModes(), counts: f.counts, trace: f.trace };
    else output.values[index] = [wall / settings.samples, cpu / settings.samples];
  } finally { f.dispose(); }
}
if (settings.kind === 'diagnostic') delete output.values;
else delete output.work;
console.log(JSON.stringify(output));
