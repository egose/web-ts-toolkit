import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const action = (name) => parseDocument(readFileSync(resolve(repositoryRoot, `.github/actions/${name}/action.yml`), 'utf8')).toJS();
const workflow = () => parseDocument(readFileSync(resolve(repositoryRoot, '.github/workflows/test.yml'), 'utf8')).toJS();
const mainJobs = () => Object.entries(workflow().jobs).filter(([id]) => !['lint', 'access-router-minimum-node-smoke', 'access-router-react-minimum-node'].includes(id));

function scratch(t) {
  const root = mkdtempSync(resolve(repositoryRoot, '_tmp-ci-checkout-'));
  assert.equal(spawnSync('git', ['check-ignore', relative(repositoryRoot, root)], { cwd: repositoryRoot }).status, 0);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, path, bytes) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}

function bindingFixture(t) {
  const parent = scratch(t);
  const original = join(parent, 'original');
  const selected = join(parent, 'c');
  for (const [root, marker] of [[original, 'original'], [selected, 'selected']]) {
    write(root, '.tool-versions', marker);
    write(root, 'package.json', JSON.stringify({ packageManager: marker }));
    write(root, 'scripts/sentinel.mjs', `console.log(JSON.stringify({ origin: '${marker}', cwd: process.cwd(), tmpdir: process.env.TMPDIR }));`);
  }
  const tmpdir = join(selected, '_tmpABC123');
  const dest = join(selected, '_tmp-pnpm-ABC123');
  mkdirSync(tmpdir);
  mkdirSync(dest);
  return { original, selected, tmpdir, dest, relative: '../c' };
}

function evaluate(value, fixture) {
  if (typeof value !== 'string') return value;
  const bindings = {
    'inputs.checkout-root': fixture.selected,
    'inputs.checkout-relative': fixture.relative,
    'inputs.pnpm-dest': fixture.dest,
    'steps.source.outputs.root': fixture.selected,
    'steps.source.outputs.relative-root': fixture.relative,
    'steps.source.outputs.tmpdir': fixture.tmpdir,
    'steps.source.outputs.pnpm-dest': fixture.dest,
  };
  return value.replace(/\$\{\{ ([^}]+) \}\}/g, (_match, key) => {
    assert.ok(Object.hasOwn(bindings, key), `Unknown sentinel binding: ${key}`);
    return bindings[key];
  });
}

test('wiring: setup-node effectively reads the selected version pin, not the original workspace', (t) => {
  const fixture = bindingFixture(t);
  const node = action('ci-setup').runs.steps.find((step) => step.uses?.startsWith('actions/setup-node@'));
  // Model the inspected action's path.join(GITHUB_WORKSPACE, file input), not shell cwd.
  const path = join(fixture.original, evaluate(node.with['node-version-file'], fixture));
  assert.equal(readFileSync(path, 'utf8'), 'selected');
  assert.equal(node.with['package-manager-cache'], false);
  assert.equal(node.with.cache, undefined);
});

test('wiring: pnpm effectively reads the selected manifest and receives only the fresh owned destination', (t) => {
  const fixture = bindingFixture(t);
  const pnpm = action('ci-setup').runs.steps.find((step) => step.uses?.startsWith('pnpm/action-setup@'));
  const path = join(fixture.original, evaluate(pnpm.with.package_json_file, fixture));
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).packageManager, 'selected');
  assert.equal(evaluate(pnpm.with.dest, fixture), fixture.dest);
  assert.equal(pnpm.with.run_install, false);
  assert.equal(pnpm.with.cache, false);
});

test('wiring: every main project shell resolves the selected module, cwd and TMPDIR', (t) => {
  const fixture = bindingFixture(t);
  const steps = mainJobs().flatMap(([, job]) => job.steps.filter((step) => step.run));
  steps.push(...['ci-setup', 'ci-prepare', 'ci-test'].flatMap((name) => action(name).runs.steps.filter((step) => step.run)));
  for (const step of steps) {
    const cwd = evaluate(step['working-directory'], fixture) ?? fixture.original;
    const tmpdir = evaluate(step.env?.TMPDIR, fixture) ?? fixture.tmpdir; // Composite steps inherit the explicit call environment.
    const result = spawnSync(process.execPath, ['scripts/sentinel.mjs'], { cwd, env: { ...process.env, TMPDIR: tmpdir }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { origin: 'selected', cwd: fixture.selected, tmpdir: fixture.tmpdir }, step.run);
  }
});

test('wiring: all 28 main jobs retain the original SHA checkout then register a top-level source action', () => {
  const jobs = mainJobs();
  assert.equal(jobs.length, 28);
  for (const [id, job] of jobs) {
    assert.deepEqual(job.steps[0], { uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1', with: { ref: '${{ github.sha }}' } }, id);
    assert.deepEqual(job.steps[1], { id: 'source', uses: './.github/actions/ci-checkout' }, id);
  }
});

test('wiring: source metadata declares dependency-free node20 main/post and always cleanup, not a composite deletion', () => {
  const path = resolve(repositoryRoot, '.github/actions/ci-checkout/action.yml');
  const metadata = existsSync(path) ? action('ci-checkout') : {};
  assert.deepEqual(metadata.runs, { using: 'node20', main: 'index.mjs', post: 'index.mjs', 'post-if': 'always()' });
  assert.deepEqual(Object.keys(metadata.outputs).sort(), ['pnpm-dest', 'relative-root', 'root', 'tmpdir']);
  assert.equal(metadata.inputs, undefined);
});
