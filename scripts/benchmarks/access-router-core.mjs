import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { finished } from 'node:stream/promises';

export const SCENARIOS = Object.freeze([
  { id: 'plain-narrow', label: 'Plain list / narrow selection / lean', fields: 'narrow' },
  { id: 'plain-wide', label: 'Plain list / all fields / lean' },
  { id: 'hydrated', label: 'Plain list / all fields / hydrated', hydrated: true },
  { id: 'global-rules', label: 'Global string permission rules / lean', globalRules: true },
  { id: 'document-rules', label: 'Per-document grants and field callbacks / lean', documentRules: true },
  { id: 'large-config', label: 'Plain list / large unused read-policy configuration', largeConfig: true },
  { id: 'embedded', label: 'Embedded arrays (four children per row)', embedded: true },
  { id: 'populate', label: 'Public populate (eight shared targets)', populate: true },
  { id: 'virtuals', label: 'Two synchronous virtual getters / lean', virtuals: true },
]);

/** Keep this list independent of the candidate: historical builds have their own sources. */
export const UNSAFE_SNAPSHOT_FLAGS = Object.freeze([
  'unsafeSkipListDocumentSnapshotChecks',
  'unsafeSkipReadDocumentSnapshotChecks',
  'unsafeSkipListOutputSnapshotChecks',
  'unsafeSkipReadOutputSnapshotChecks',
  'unsafeSkipListNestedDocumentSnapshotChecks',
  'unsafeSkipReadNestedDocumentSnapshotChecks',
]);

/** Separate opt-in group: do not expand the historical six-flag ON meaning. */
export const UNSAFE_INITIAL_OUTPUT_COPY_FLAGS = Object.freeze([
  'unsafeSkipListInitialOutputSnapshotCopy',
  'unsafeSkipReadInitialOutputSnapshotCopy',
]);

/** Inspect actual model-option declarations, not comments or similarly named internal fields. */
async function supportedOptionFlags(declarations, flagNames) {
  // Only preparation parses types. Benchmark workers must not load the compiler
  // into the measured process and alter its heap/GC behavior.
  const { default: ts } = await import('typescript');
  const found = new Set();
  const hasBoolean = (type) =>
    type && (type.kind === ts.SyntaxKind.BooleanKeyword || (ts.isUnionTypeNode(type) && type.types.some(hasBoolean)));
  for (const [fileName, text] of declarations) {
    const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node) => {
      if (
        ts.isInterfaceDeclaration(node) &&
        ['DefaultModelRouterOptions', 'ModelRouterOptions'].includes(node.name.text)
      ) {
        for (const member of node.members) {
          if (
            ts.isPropertySignature(member) &&
            member.name &&
            (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) &&
            flagNames.includes(member.name.text) &&
            hasBoolean(member.type)
          )
            found.add(member.name.text);
        }
      } else if (ts.isSourceFile(node) || ts.isModuleDeclaration(node) || ts.isModuleBlock(node)) {
        ts.forEachChild(node, visit);
      }
    };
    visit(source);
  }
  return flagNames.filter((flag) => found.has(flag));
}

export const supportedSnapshotFlags = (declarations) => supportedOptionFlags(declarations, UNSAFE_SNAPSHOT_FLAGS);
export const supportedInitialOutputCopyFlags = (declarations) =>
  supportedOptionFlags(declarations, UNSAFE_INITIAL_OUTPUT_COPY_FLAGS);

/** tsup may put the actual options in a shared declaration chunk instead of index.d.ts. */
async function readSnapshotDeclarations(root) {
  const directory = resolve(root, 'packages/access-router/dist');
  const files = (await readdir(directory)).filter((name) => name.endsWith('.d.ts')).sort();
  if (!files.includes('index.d.ts')) throw new Error(`Build did not produce ${resolve(directory, 'index.d.ts')}`);
  return Promise.all(files.map(async (file) => [file, await readFile(resolve(directory, file), 'utf8')]));
}

function hashSnapshotDeclarations(declarations) {
  const hash = createHash('sha256');
  for (const [name, text] of declarations) {
    hash
      .update(`${Buffer.byteLength(name)}:`)
      .update(name)
      .update(`${Buffer.byteLength(text)}:`)
      .update(text);
  }
  return hash.digest('hex');
}

export async function inspectSnapshotDeclarations(root) {
  const declarations = await readSnapshotDeclarations(root);
  return {
    supportedSnapshotFlags: await supportedSnapshotFlags(declarations),
    supportedInitialOutputCopyFlags: await supportedInitialOutputCopyFlags(declarations),
    snapshotDeclarationsSha256: hashSnapshotDeclarations(declarations),
  };
}

/** Workers recheck the preparation manifest without importing/parsing TypeScript. */
export async function snapshotDeclarationHash(root) {
  return hashSnapshotDeclarations(await readSnapshotDeclarations(root));
}

function normalizeSupportedSnapshotFlags(flags) {
  if (
    !Array.isArray(flags) ||
    new Set(flags).size !== flags.length ||
    flags.some((flag) => !UNSAFE_SNAPSHOT_FLAGS.includes(flag))
  )
    throw new Error('Invalid supported unsafe snapshot flags.');
  return UNSAFE_SNAPSHOT_FLAGS.filter((flag) => flags.includes(flag));
}

/** Set only declared flags, and never pretend a partial/old build enabled all six. */
export function snapshotFlagOptions(mode, supported) {
  if (mode !== 'on' && mode !== 'off') throw new Error(`Invalid unsafe snapshot mode: ${String(mode)}`);
  const flags = normalizeSupportedSnapshotFlags(supported);
  if (mode === 'on' && flags.length !== UNSAFE_SNAPSHOT_FLAGS.length) {
    const missing = UNSAFE_SNAPSHOT_FLAGS.filter((flag) => !flags.includes(flag));
    throw new Error(`Cannot enable all unsafe snapshot flags; this build does not declare: ${missing.join(', ')}`);
  }
  return Object.fromEntries(flags.map((flag) => [flag, mode === 'on']));
}

export function snapshotModeLabel(target) {
  if (!target?.snapshotSkips) return '-';
  const count = target.supportedSnapshotFlags.length;
  if (count === 0) return 'N/A (0/6 supported)';
  const mode = target.snapshotSkips.toUpperCase();
  return count === UNSAFE_SNAPSHOT_FLAGS.length ? mode : `${mode} (${count}/6 supported)`;
}

/** A prepared build can be measured twice, with distinct candidate and baseline identities. */
export function snapshotCandidates(target, setting) {
  const flags = normalizeSupportedSnapshotFlags(target.supportedSnapshotFlags);
  if (!['off', 'on', 'both'].includes(setting)) throw new Error(`Invalid candidate setting: ${String(setting)}`);
  const modes = setting === 'both' ? ['off', 'on'] : [setting];
  return modes.map((mode) => {
    snapshotFlagOptions(mode, flags);
    const candidate = {
      ...target,
      id: `${target.id}-snapshot-${mode}`,
      buildId: target.id,
      buildLabel: target.label,
      snapshotSkips: mode,
      supportedSnapshotFlags: flags,
    };
    candidate.label = `${target.label} · snapshot skips ${snapshotModeLabel(candidate)}`;
    return candidate;
  });
}

export function initialOutputCopyFlagOptions(mode, supported) {
  if (mode !== 'on' && mode !== 'off') throw new Error(`Invalid unsafe initial output copy mode: ${String(mode)}`);
  if (
    !Array.isArray(supported) ||
    new Set(supported).size !== supported.length ||
    supported.some((flag) => !UNSAFE_INITIAL_OUTPUT_COPY_FLAGS.includes(flag))
  )
    throw new Error('Invalid supported unsafe initial output copy flags.');
  if (mode === 'on' && supported.length !== UNSAFE_INITIAL_OUTPUT_COPY_FLAGS.length)
    throw new Error('Cannot enable initial output copy skips; this build does not declare both options.');
  return Object.fromEntries(
    UNSAFE_INITIAL_OUTPUT_COPY_FLAGS.filter((flag) => supported.includes(flag)).map((flag) => [flag, mode === 'on']),
  );
}

export function effectiveInitialOutputCopySkips(snapshotFlags, copyFlags) {
  // Existing workloads initiate LIST. READ settings are verified but not timed.
  return snapshotFlags.unsafeSkipListOutputSnapshotChecks === true &&
    copyFlags.unsafeSkipListInitialOutputSnapshotCopy === true
    ? 'on'
    : 'off';
}

export function initialOutputCopyModeLabel(target) {
  if (!target?.initialOutputCopySkips) return '-';
  const count = target.supportedInitialOutputCopyFlags.length;
  if (count === 0) return 'N/A (0/2 supported)';
  const mode = target.initialOutputCopySkips.toUpperCase();
  if (count !== UNSAFE_INITIAL_OUTPUT_COPY_FLAGS.length) return `${mode} (${count}/2 supported)`;
  const effective = effectiveInitialOutputCopySkips(
    snapshotFlagOptions(target.snapshotSkips, target.supportedSnapshotFlags),
    initialOutputCopyFlagOptions(target.initialOutputCopySkips, target.supportedInitialOutputCopyFlags),
  );
  return mode === 'ON' && effective === 'off' ? 'ON (dormant; effective OFF)' : mode;
}

/** Cross product with already-selected comparison candidates, including dormant ON. */
export function initialOutputCopyCandidates(target, setting) {
  if (!['off', 'on', 'both'].includes(setting))
    throw new Error(`Invalid initial output copy candidate setting: ${String(setting)}`);
  return (setting === 'both' ? ['off', 'on'] : [setting]).map((mode) => {
    const supported = target.supportedInitialOutputCopyFlags ?? [];
    initialOutputCopyFlagOptions(mode, supported);
    const candidate = {
      ...target,
      id: `${target.id}-initial-copy-${mode}`,
      initialOutputCopySkips: mode,
      supportedInitialOutputCopyFlags: supported,
    };
    candidate.label = `${target.label} · initial output copy skips ${initialOutputCopyModeLabel(candidate)}`;
    return candidate;
  });
}

export function integer(value, min, max) {
  if (!/^\d+$/.test(String(value).trim())) throw new Error(`Enter an integer between ${min} and ${max}.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new Error(`Enter an integer between ${min} and ${max}.`);
  return number;
}

export function integerList(value, min, max) {
  const values = String(value)
    .split(',')
    .map((part) => integer(part.trim(), min, max));
  if (values.length > 8) throw new Error('Use at most eight values.');
  return [...new Set(values)].sort((a, b) => a - b);
}

export function requireSelection(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('Select at least one option.');
  return values;
}

export function canonicalJson(value) {
  return JSON.stringify(value, (_key, entry) => {
    if (entry && Object.getPrototypeOf(entry) === Object.prototype)
      return Object.fromEntries(
        Object.keys(entry)
          .sort()
          .map((key) => [key, entry[key]]),
      );
    return entry;
  });
}

export function fingerprint(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function summarize(samples, elapsedMs, cpuMicroseconds) {
  if (!samples.length || samples.some((value) => !Number.isFinite(value) || value < 0) || elapsedMs <= 0)
    throw new Error('Cannot summarize empty/invalid samples.');
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
  return {
    requests: samples.length,
    meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    medianMs:
      sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    p95Ms: percentile(0.95),
    minMs: sorted[0],
    maxMs: sorted.at(-1),
    elapsedMs,
    requestsPerSecond: (samples.length * 1000) / elapsedMs,
    cpuMsPerRequest: cpuMicroseconds / 1000 / samples.length,
  };
}

export async function mapBounded(count, concurrency, run) {
  let next = 0;
  let failed = false;
  const results = new Array(count);
  // Await all active workers even on failure, so no request leaks into the next phase.
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(count, concurrency) }, async () => {
      for (;;) {
        if (failed) break;
        const index = next++;
        if (index >= count) break;
        try {
          results[index] = await run(index);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  const rejected = settled.find((result) => result.status === 'rejected');
  if (rejected) throw rejected.reason;
  return results;
}

/** All commands use argv, never a shell. Interactive auth stays on the terminal,
 * not in logs; detached builds/workers retain independent cancellation groups.
 */
export async function runLogged(command, args, { cwd, logFile, signal, timeoutMs = 0, env = {}, interactive = false }) {
  signal?.throwIfAborted();
  await mkdir(resolve(logFile, '..'), { recursive: true });
  const output = createWriteStream(logFile, { flags: 'a' });
  output.write(`\n$ ${command} ${args.join(' ')}\n`);
  if (interactive) output.write('[interactive: output and authentication prompts go to the terminal, not this log]\n');
  let timedOut = false;
  let killTimer;
  let timer;
  let failure;
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    detached: !interactive && process.platform !== 'win32',
  });
  const kill = (kind) => {
    if (!child.pid) return;
    try {
      if (interactive || process.platform === 'win32') child.kill(kind);
      else process.kill(-child.pid, kind);
    } catch (error) {
      if (error.code !== 'ESRCH') failure ??= error;
    }
  };
  const stop = () => {
    kill('SIGTERM');
    killTimer ??= setTimeout(() => kill('SIGKILL'), 5000);
  };
  output.on('error', (error) => {
    failure = error;
    stop();
  });
  if (!interactive) {
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(output, { end: false });
  }
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  if (timeoutMs)
    timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
  const result = await new Promise((done) => {
    child.once('error', (error) => {
      failure = error;
    });
    child.once('close', (code, termination) => done({ code, termination }));
  });
  if (signal?.aborted || timedOut || failure) kill('SIGKILL');
  clearTimeout(timer);
  clearTimeout(killTimer);
  signal?.removeEventListener('abort', stop);
  output.write(`[exit: ${result.code ?? result.termination}${timedOut ? ', timed out' : ''}]\n`);
  output.end();
  await finished(output);
  signal?.throwIfAborted();
  if (failure) throw failure;
  if (timedOut || result.code !== 0)
    throw new Error(
      `${timedOut ? 'Timed out' : `Exited ${result.code ?? result.termination}`}: ${command}. See ${logFile}`,
    );
}

export const pnpmEnvironment = Object.freeze({
  COREPACK_ENABLE_PROJECT_SPEC: '0',
  npm_config_manage_package_manager_versions: 'false',
  npm_config_package_manager_strict: 'false',
});

export async function prepareTarget({
  root,
  repository,
  commit,
  archive,
  logFile,
  signal,
  current = false,
  run = runLogged,
}) {
  if (!current) {
    await mkdir(root, { recursive: true });
    await run('git', ['archive', '--format=tar', '--output', archive, commit], { cwd: repository, logFile, signal });
    await run('tar', ['-xf', archive, '-C', root], { cwd: repository, logFile, signal });
    await run(
      'pnpm',
      ['install', '--frozen-lockfile', '--ignore-scripts', '--filter', '@web-ts-toolkit/access-router...'],
      {
        cwd: root,
        logFile,
        signal,
        env: pnpmEnvironment,
      },
    );
  }
  await run('pnpm', ['--filter', '@web-ts-toolkit/access-router...', '--workspace-concurrency=1', 'build'], {
    cwd: root,
    logFile,
    signal,
    env: pnpmEnvironment,
  });
  const entry = resolve(root, 'packages/access-router/dist/index.mjs');
  if (!(await stat(entry)).isFile()) throw new Error(`Build did not produce ${entry}`);
  return {
    root,
    commit,
    version: (await readFile(resolve(root, 'VERSION'), 'utf8')).trim(),
    entry,
    ...(await inspectSnapshotDeclarations(root)),
    distSha256: createHash('sha256')
      .update(await readFile(entry))
      .digest('hex'),
    lockSha256: createHash('sha256')
      .update(await readFile(resolve(root, 'pnpm-lock.yaml')))
      .digest('hex'),
  };
}

function caseKey(row) {
  return `${row.scenario}/${row.rows}/${row.concurrency}`;
}

export function reportRows(report) {
  const baseline = new Map(
    report.results
      .filter((row) => row.targetId === report.baseline && row.status === 'ok')
      .map((row) => [caseKey(row), row]),
  );
  return report.results.map((row) => {
    const reference = baseline.get(caseKey(row));
    const target = report.targets.find((target) => target.id === row.targetId);
    const comparable = row.status === 'ok' && reference && reference.outputFingerprint === row.outputFingerprint;
    const ratio =
      comparable && reference.stats.medianMs > 0 ? row.stats.medianMs / reference.stats.medianMs : undefined;
    return {
      version: target?.buildLabel ?? target?.label ?? row.targetId,
      'snapshot skips': snapshotModeLabel(target),
      ...(report.targets.some((entry) => entry.initialOutputCopySkips !== undefined)
        ? { 'initial output copy skips': initialOutputCopyModeLabel(target) }
        : {}),
      scenario: row.scenario,
      rows: row.rows,
      clients: row.concurrency,
      status: row.status === 'ok' && reference && !comparable ? 'OUTPUT DIFF' : row.status,
      'median ms': row.stats?.medianMs.toFixed(2) ?? '-',
      'p95 ms': row.stats?.p95Ms.toFixed(2) ?? '-',
      'req/s': row.stats?.requestsPerSecond.toFixed(2) ?? '-',
      'CPU ms/req': row.stats?.cpuMsPerRequest.toFixed(2) ?? '-',
      'DB reads/req': row.readsPerRequest?.toFixed(2) ?? '-',
      'vs baseline': ratio === undefined ? '-' : `${ratio.toFixed(2)}x`,
    };
  });
}

export async function saveReport(directory, report) {
  const rows = reportRows(report);
  const headings = rows.length ? Object.keys(rows[0]) : [];
  const escape = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
  const markdown = [
    '# Access-router benchmark',
    '',
    `Started: ${report.startedAt}`,
    `Node: ${report.node}; platform: ${report.platform}`,
    `Baseline: ${report.targets.find((target) => target.id === report.baseline)?.label ?? 'not selected'}`,
    '',
    'Latency ratios are target / baseline; lower is faster. Ratios require identical validated outputs.',
    'Snapshot skips ON is UNSAFE and not security-equivalent to OFF. N/A means the build does not declare these options.',
    'Initial output copy skips are a separate UNSAFE group: ON requires the matching output-comparison skip, otherwise it is dormant. Eligible graphs still retain bounded shape admission and graph identities; other copies remain.',
    'HTTP timing includes loopback transport, response serialization and parsing. Setup, seeding and warmup are excluded.',
    'CPU is the Node worker (HTTP server + client), not the separate MongoDB process. Read counts use Mongoose debug operations.',
    'Each tag uses its own frozen lockfile: dependency-version changes can affect results. Sequential ordering and JIT/OS noise can bias small runs.',
    '',
    ...(rows.length
      ? [
          `| ${headings.join(' | ')} |`,
          `| ${headings.map(() => '---').join(' | ')} |`,
          ...rows.map((row) => `| ${Object.values(row).map(escape).join(' | ')} |`),
        ]
      : ['No measured results yet.']),
    '',
    '## Failures',
    ...(report.error ? [`- Runner: ${escape(report.error)}`] : []),
    ...report.preparationFailures.map((failure) => `- Preparation ${escape(failure.label)}: ${escape(failure.error)}`),
    ...report.results
      .filter((row) => row.status !== 'ok')
      .map((row) => `- ${escape(row.targetId)} / ${escape(caseKey(row))}: ${escape(row.error)}`),
    '',
    'Raw samples, configuration, build hashes, dirty-worktree status and dependency versions are in report.json.',
    '',
  ].join('\n');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(resolve(directory, 'report.md'), markdown);
  return rows;
}
