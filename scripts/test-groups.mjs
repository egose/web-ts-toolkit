import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

// Each group runs concurrently; groups themselves must run sequentially.
// Keep all packages in the utils build family in separate groups.
export const testGroups = {
  1: ['@web-ts-toolkit/utils', '@web-ts-toolkit/json-frame', '@web-ts-toolkit/express-runtime'],
  2: ['@web-ts-toolkit/http-errors', '@web-ts-toolkit/asset-inliner'],
  3: ['@web-ts-toolkit/express-response-handler', '@web-ts-toolkit/express-request-attestation'],
  4: ['@web-ts-toolkit/express-json-router', '@web-ts-toolkit/mongoose-rxdb'],
  5: ['@web-ts-toolkit/access-router', '@web-ts-toolkit/express-oidc-vault'],
  6: ['@web-ts-toolkit/access-router-deco', '@web-ts-toolkit/express-oidc-vault-memory-store'],
  7: ['@web-ts-toolkit/access-router-client', '@web-ts-toolkit/express-oidc-vault-mongodb-store'],
  8: ['@web-ts-toolkit/access-router-react', '@web-ts-toolkit/express-oidc-vault-redis-store'],
  9: ['@web-ts-toolkit/message-service', '@web-ts-toolkit/oidc-vault-dpop-client'],
  10: ['@web-ts-toolkit/access-router-runtime', '@web-ts-toolkit/pdf-reader'],
  11: ['@web-ts-toolkit/moo', 'oidc-vault-dpop-example'],
  12: ['react-vite', 'create-access-router-mongo-starter'],
};

// Test-only accesses not represented by workspace dependency declarations.
// Review these when test scripts or cross-package fixtures change. Source-only
// imports do not need entries: builds replace dist/, not src/.
export const testAccessOverrides = {
  '@web-ts-toolkit/access-router': {
    // The packed-consumer fixture stages the first available compiled CLI.
    reads: [
      '@web-ts-toolkit/access-router-runtime',
      'create-access-router-mongo-starter',
      '@web-ts-toolkit/express-runtime',
    ],
  },
  '@web-ts-toolkit/express-oidc-vault': {
    // Its packed-consumer test builds all documentation wiring dependencies.
    writes: [
      '@web-ts-toolkit/express-oidc-vault-memory-store',
      '@web-ts-toolkit/express-oidc-vault-mongodb-store',
      '@web-ts-toolkit/express-oidc-vault-redis-store',
      '@web-ts-toolkit/oidc-vault-dpop-client',
    ],
  },
  'create-access-router-mongo-starter': {
    // The generated-tooling watch smoke loads the workspace runtime CLI.
    reads: ['@web-ts-toolkit/access-router-runtime'],
  },
  'react-vite': {
    // This consumer only reads shared builds. Fail validation if that changes.
    readOnlyTest: 'vitest run',
  },
};

function dependencyClosure(name, workspaces, visited = new Set()) {
  if (visited.has(name)) return visited;
  const manifest = workspaces.get(name);
  if (!manifest) throw new Error(`Unknown workspace: ${name}`);
  visited.add(name);
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [dependency, version] of Object.entries(manifest[field] ?? {})) {
      if (workspaces.has(dependency)) {
        dependencyClosure(dependency, workspaces, visited);
      } else if (version.startsWith('workspace:')) {
        throw new Error(`Unknown workspace dependency ${dependency} in ${name}`);
      }
    }
  }
  return visited;
}

function testAccess(name, workspaces, overrides) {
  const override = overrides[name] ?? {};
  if (override.readOnlyTest && workspaces.get(name).scripts.test !== override.readOnlyTest) {
    throw new Error(`Review the read-only test override for ${name}: its test script changed`);
  }
  // Conservatively assume each normal test rebuilds its entire dependency
  // closure, including dev/peer dependencies selected by pnpm's name... filter.
  const dependencies = dependencyClosure(name, workspaces);
  const reads = new Set(dependencies);
  const writes = override.readOnlyTest ? new Set() : new Set(dependencies);
  for (const dependency of override.reads ?? []) dependencyClosure(dependency, workspaces, reads);
  for (const dependency of override.writes ?? []) {
    dependencyClosure(dependency, workspaces, reads);
    dependencyClosure(dependency, workspaces, writes);
  }
  return { reads, writes };
}

export function validateTestGroups(workspaces, groups, overrides = {}) {
  const seen = new Set();
  for (const [group, names] of Object.entries(groups)) {
    if (!names.length) throw new Error(`Test group ${group} is empty`);
    for (const name of names) {
      if (!workspaces.get(name)?.scripts?.test) throw new Error(`No workspace test script for ${name}`);
      if (seen.has(name)) throw new Error(`Workspace appears in multiple test groups: ${name}`);
      seen.add(name);
    }
  }
  const missing = [...workspaces].filter(([name, manifest]) => manifest.scripts?.test && !seen.has(name));
  if (missing.length) {
    throw new Error(`Workspaces missing from test groups: ${missing.map(([name]) => name).join(', ')}`);
  }
  for (const name of Object.keys(overrides)) {
    if (!seen.has(name)) throw new Error(`Unused test access override: ${name}`);
  }

  const accesses = new Map([...seen].map((name) => [name, testAccess(name, workspaces, overrides)]));
  for (const [group, names] of Object.entries(groups)) {
    for (let left = 0; left < names.length; left += 1) {
      for (let right = left + 1; right < names.length; right += 1) {
        const a = accesses.get(names[left]);
        const b = accesses.get(names[right]);
        const conflicts = new Set([
          ...[...a.writes].filter((name) => b.reads.has(name)),
          ...[...b.writes].filter((name) => a.reads.has(name)),
        ]);
        if (conflicts.size) {
          throw new Error(
            `Test group ${group}: ${names[left]} and ${names[right]} have build/read conflicts: ${[...conflicts].sort().join(', ')}`,
          );
        }
      }
    }
  }
}

function loadWorkspaces() {
  // Ask pnpm rather than duplicating pnpm-workspace.yaml's discovery rules.
  const result = spawnSync('pnpm', ['-r', 'list', '--depth', '-1', '--json'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Unable to list pnpm workspaces: ${result.stderr}`);
  return new Map(
    JSON.parse(result.stdout)
      .filter((workspace) => resolve(workspace.path) !== resolve(repositoryRoot))
      .map((workspace) => [workspace.name, JSON.parse(readFileSync(resolve(workspace.path, 'package.json'), 'utf8'))]),
  );
}

export function runTestGroups(groups, run = spawnSync, log = console.log) {
  for (const [group, names] of Object.entries(groups)) {
    log(`Test group ${group}: ${names.join(', ')}`);
    const result = run(
      'pnpm',
      // --parallel bypasses pnpm's topological scheduling within a safe group.
      // --no-bail waits for all members to finish, but still fails the group.
      ['-r', '--parallel', '--no-bail', ...names.flatMap((name) => ['--filter', name]), 'run', 'test'],
      { cwd: repositoryRoot, stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [group, ...rest] = process.argv.slice(2);
    if (rest.length || (group !== undefined && group !== '--check' && !Object.hasOwn(testGroups, group))) {
      throw new Error(`Usage: node scripts/test-groups.mjs [${Object.keys(testGroups).join('|')}|--check]`);
    }
    const workspaces = loadWorkspaces();
    validateTestGroups(workspaces, testGroups, testAccessOverrides);
    if (group === '--check') {
      console.log(
        `Validated ${Object.keys(testGroups).length} test groups covering ${Object.values(testGroups).flat().length} workspaces.`,
      );
    } else {
      process.exitCode = runTestGroups(group ? { [group]: testGroups[group] } : testGroups);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
