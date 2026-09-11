import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import {
  ALLOWED_DOTENV_EXAMPLE_BASENAME,
  GENERATED_LOCKFILE,
  GITIGNORE_FILE,
  GITIGNORE_STAGING_ALIAS,
  PUBLISH_TEMPLATE_POLICY,
  isPrivateDotenvPath,
  isTemplatePathExcluded,
  normalizeTemplatePath,
} from '../src/shared/template-policy';

export {
  ALLOWED_DOTENV_EXAMPLE_BASENAME,
  GENERATED_LOCKFILE,
  GITIGNORE_FILE,
  GITIGNORE_STAGING_ALIAS,
  PUBLISH_TEMPLATE_POLICY,
  isPrivateDotenvPath,
  isTemplatePathExcluded,
  normalizeTemplatePath,
};

export const EXCLUDED_PATHS = PUBLISH_TEMPLATE_POLICY.excludedPaths;

export interface StageTemplateOptions {
  sourceDir: string;
  targetDir: string;
  releaseVersion?: string;
  generateLockfile?: (targetDir: string) => void;
}

export interface StagedTemplateDrift {
  missing: string[];
  unexpected: string[];
  changed: string[];
}

export interface VerifyStagedTemplateOptions {
  sourceDir: string;
  targetDir: string;
  releaseVersion: string;
}

export type ReleasePublishState = 'published' | 'unpublished' | 'unknown';

export type RegistryVersionsRunner = (command: string, args: string[]) => string;

/**
 * Workspace package used to probe the registry for a release version. All
 * `@web-ts-toolkit/*` template dependencies are versioned in lockstep, so one
 * probe covers the release line.
 */
export const RELEASE_PROBE_PACKAGE = '@web-ts-toolkit/access-router-runtime';

const DEFAULT_REGISTRY_RUNNER: RegistryVersionsRunner = (command, args) =>
  execFileSync(command, args, { encoding: 'utf8', stdio: 'pipe' }) as string;

/**
 * Reports whether `releaseVersion` is already published to the npm registry.
 * Returns `'unknown'` when the registry cannot be reached or its response is
 * unreadable, so callers can fail closed instead of guessing.
 */
export function getReleasePublishState(
  releaseVersion: string,
  run: RegistryVersionsRunner = DEFAULT_REGISTRY_RUNNER,
): ReleasePublishState {
  try {
    const parsed = JSON.parse(run('pnpm', ['view', RELEASE_PROBE_PACKAGE, 'versions', '--json'])) as unknown;
    if (!Array.isArray(parsed)) return 'unknown';
    return parsed.includes(releaseVersion) ? 'published' : 'unpublished';
  } catch {
    return 'unknown';
  }
}

/**
 * Detects a `pnpm install --lockfile-only` resolution failure raised by the
 * default lockfile generator (Node reports it as
 * `Command failed: pnpm install ...`). Other staging errors (missing
 * gitignore, symlinks, placeholder or lockfile validation) never match, so
 * they always fail the build even for unpublished releases.
 */
export function isLockfileInstallFailure(message: string): boolean {
  return message.includes('Command failed: pnpm install');
}

export function normalize(pathValue: string): string {
  return normalizeTemplatePath(pathValue);
}

export function isExcluded(relativePath: string): boolean {
  return isTemplatePathExcluded(PUBLISH_TEMPLATE_POLICY, relativePath);
}

function generateLockfile(targetDir: string): void {
  // Fail closed: any resolution failure propagates to stageTemplate, which
  // discards the temporary stage and preserves the previously valid output.
  // Never fabricate resolution metadata (version substitution or synthetic
  // lockfiles); a publishable stage requires a real pnpm resolution.
  execFileSync('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], {
    cwd: targetDir,
    stdio: 'inherit',
  });
}

interface ParsedImporterSpecifiers {
  dependencies: Map<string, string>;
  devDependencies: Map<string, string>;
  versions: Map<string, string>;
}

function unquoteLockfileKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseImporterSpecifiers(lockfileContent: string): ParsedImporterSpecifiers {
  const lines = lockfileContent.split('\n');
  const importersIndex = lines.findIndex((line) => /^importers:\s*$/.test(line));
  if (importersIndex === -1) {
    throw new Error('Staged lockfile is malformed: missing top-level `importers:` section.');
  }
  const rootImporterIndex = lines.findIndex((line, index) => index > importersIndex && /^ {2}\.:\s*$/.test(line));
  if (rootImporterIndex === -1) {
    throw new Error('Staged lockfile is malformed: missing root `.` importer.');
  }
  const dependencies = new Map<string, string>();
  const devDependencies = new Map<string, string>();
  const versions = new Map<string, string>();
  let section: 'dependencies' | 'devDependencies' | null = null;
  let currentPackage: string | null = null;
  for (let index = rootImporterIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line) || /^ {2}\S/.test(line)) break;
    const sectionMatch = line.match(/^ {4}(\S+):\s*$/);
    if (sectionMatch) {
      section =
        sectionMatch[1] === 'dependencies'
          ? 'dependencies'
          : sectionMatch[1] === 'devDependencies'
            ? 'devDependencies'
            : null;
      currentPackage = null;
      continue;
    }
    const entryMatch = line.match(/^ {6}(\S.*):\s*$/);
    if (entryMatch && section) {
      currentPackage = unquoteLockfileKey(entryMatch[1]);
      continue;
    }
    if (section && currentPackage) {
      const specifierMatch = line.match(/^ {8}specifier:\s*(.+?)\s*$/);
      if (specifierMatch) {
        (section === 'dependencies' ? dependencies : devDependencies).set(currentPackage, specifierMatch[1]);
        continue;
      }
      const versionMatch = line.match(/^ {8}version:\s*(.+?)\s*$/);
      if (versionMatch) {
        versions.set(`${section}:${currentPackage}`, versionMatch[1]);
      }
    }
  }
  return { dependencies, devDependencies, versions };
}

function describeSpecifierMismatch(kind: string, details: string): Error {
  return new Error(
    `Staged lockfile importer ${kind} does not match the staged manifest (${details}). ` +
      'Regenerate the stage with a successful pnpm resolution instead of reusing a stale lockfile.',
  );
}

/**
 * Fail-closed validation for a staged `pnpm-lock.yaml`: requires a real pnpm
 * resolution whose root importer specifiers agree exactly with the staged
 * manifest and whose `packages:`/`snapshots:` sections carry integrity
 * metadata. Synthetic or version-substituted lockfiles are rejected.
 */
export function validateStagedLockfile(targetDir: string): void {
  const lockfilePath = resolve(targetDir, GENERATED_LOCKFILE);
  if (!existsSync(lockfilePath) || !lstatSync(lockfilePath).isFile()) {
    throw new Error(`Staged lockfile is missing: ${lockfilePath}`);
  }
  const content = readFileSync(lockfilePath, 'utf8');
  if (content.includes('{{VERSION}}')) {
    throw new Error(`Staged lockfile contains an unresolved {{VERSION}} placeholder: ${lockfilePath}`);
  }
  const { dependencies, devDependencies, versions } = parseImporterSpecifiers(content);
  const manifest = JSON.parse(readFileSync(resolve(targetDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const [kind, expected, actual] of [
    ['dependencies', manifest.dependencies ?? {}, dependencies],
    ['devDependencies', manifest.devDependencies ?? {}, devDependencies],
  ] as const) {
    const expectedEntries = Object.entries(expected).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const actualEntries = [...actual.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    if (expectedEntries.length !== actualEntries.length) {
      throw describeSpecifierMismatch(
        kind,
        `expected ${expectedEntries.length} entries, found ${actualEntries.length}`,
      );
    }
    for (let i = 0; i < expectedEntries.length; i += 1) {
      const [expectedName, expectedSpecifier] = expectedEntries[i];
      const [actualName, actualSpecifier] = actualEntries[i];
      if (expectedName !== actualName || expectedSpecifier !== actualSpecifier) {
        throw describeSpecifierMismatch(
          kind,
          `'${actualName}: ${actualSpecifier}' !== '${expectedName}: ${expectedSpecifier}'`,
        );
      }
      if (!versions.get(`${kind}:${actualName}`)) {
        throw new Error(
          `Staged lockfile entry '${actualName}' has no resolved version metadata. ` +
            'Regenerate the stage with a successful pnpm resolution.',
        );
      }
    }
  }
  if (/^\s*packages:\s*\{\}\s*$/m.test(content)) {
    throw new Error('Staged lockfile has an empty `packages:` section and no real resolution metadata.');
  }
  if (!/^packages:\s*$/m.test(content) || !/^snapshots:\s*$/m.test(content)) {
    throw new Error('Staged lockfile is missing real resolution metadata (`packages:`/`snapshots:` sections).');
  }
  if (!/integrity:\s*sha\d+-[A-Za-z0-9+/=]+/.test(content)) {
    throw new Error(
      'Staged lockfile has no package integrity metadata. Regenerate the stage with a successful pnpm resolution.',
    );
  }
}

export function stageTemplate(options: StageTemplateOptions): void {
  const { sourceDir, targetDir } = options;
  if (!existsSync(sourceDir)) {
    throw new Error(`Template source directory not found: ${sourceDir}`);
  }

  const sourceIgnore = resolve(sourceDir, GITIGNORE_FILE);
  const sourceAlias = resolve(sourceDir, GITIGNORE_STAGING_ALIAS);
  if (!existsSync(sourceIgnore) || !lstatSync(sourceIgnore).isFile()) {
    throw new Error(`Template must contain a regular ${GITIGNORE_FILE} file: ${sourceIgnore}`);
  }
  if (existsSync(sourceAlias)) {
    throw new Error(`Template staging alias ${GITIGNORE_STAGING_ALIAS} is reserved and must not exist: ${sourceAlias}`);
  }

  mkdirSync(dirname(targetDir), { recursive: true });
  const temporaryTarget = mkdtempSync(resolve(dirname(targetDir), `.${basename(targetDir)}.stage-`));

  try {
    copyTemplateForPublish(sourceDir, temporaryTarget, sourceDir);
    renameSync(resolve(temporaryTarget, GITIGNORE_FILE), resolve(temporaryTarget, GITIGNORE_STAGING_ALIAS));

    const manifestPath = resolve(temporaryTarget, 'package.json');
    if (existsSync(manifestPath)) {
      if (!options.releaseVersion)
        throw new Error('A release version is required to stage the template manifest and lockfile.');

      const sourceManifest = readFileSync(manifestPath, 'utf8');
      if (!sourceManifest.includes('{{VERSION}}')) {
        throw new Error('Template package.json must contain the {{VERSION}} release placeholder.');
      }
      writeFileSync(manifestPath, sourceManifest.replaceAll('{{VERSION}}', options.releaseVersion));
      rmSync(resolve(temporaryTarget, GENERATED_LOCKFILE), { force: true });
      (options.generateLockfile ?? generateLockfile)(temporaryTarget);

      const lockfilePath = resolve(temporaryTarget, GENERATED_LOCKFILE);
      if (!existsSync(lockfilePath) || !lstatSync(lockfilePath).isFile()) {
        throw new Error(`Lockfile generation did not create ${lockfilePath}`);
      }
      if (readFileSync(lockfilePath, 'utf8').includes('{{VERSION}}')) {
        throw new Error(`Generated lockfile contains an unresolved {{VERSION}} placeholder: ${lockfilePath}`);
      }
      validateStagedLockfile(temporaryTarget);
    }

    rmSync(targetDir, { recursive: true, force: true });
    renameSync(temporaryTarget, targetDir);
  } catch (error) {
    rmSync(temporaryTarget, { recursive: true, force: true });
    throw error;
  }
}

export function verifyStagedTemplate(options: VerifyStagedTemplateOptions): StagedTemplateDrift {
  // Fail closed on fabricated lockfiles even when file-by-file drift is clean:
  // drift comparison intentionally ignores generated lockfile bytes, so importer
  // agreement and resolution metadata are established explicitly here.
  validateStagedLockfile(options.targetDir);
  const expected = collectExpectedPublishedFiles(options.sourceDir, options.releaseVersion);
  const actual = collectActualPublishedFiles(options.targetDir);

  const missing = [...expected.keys()].filter((path) => !actual.has(path)).sort();
  const unexpected = [...actual.keys()].filter((path) => !expected.has(path)).sort();
  const changed = [...expected.keys()]
    .filter((path) => {
      const actualContent = actual.get(path);
      const expectedContent = expected.get(path);
      return actualContent && expectedContent && !actualContent.equals(expectedContent);
    })
    .sort();

  return { missing, unexpected, changed };
}

/**
 * Fail-closed publication gate for `prepack`: the staged template must exist
 * and agree exactly with the source template for `releaseVersion` (including
 * a real resolved lockfile, enforced by `verifyStagedTemplate`). Unlike a
 * drift-only check, a missing stage is rejected so an unpublished-version
 * build that skipped staging can never be packed.
 */
export function assertStagedTemplateReady(options: VerifyStagedTemplateOptions): void {
  if (!existsSync(options.targetDir)) {
    throw new Error(
      `Refusing to pack without a staged template: ${options.targetDir} is missing. ` +
        `Run the package build after release ${options.releaseVersion} dependencies are published.`,
    );
  }
  const drift = verifyStagedTemplate(options);
  if (drift.missing.length || drift.unexpected.length || drift.changed.length) {
    throw new Error(
      `Refusing to pack stale dist/template. Run the package build before packing. Drift: ${JSON.stringify(drift)}`,
    );
  }
}

function copyTemplateForPublish(sourceDir: string, targetDir: string, rootDir: string): void {
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = join(sourceDir, entry);
    const relativePath = normalize(relative(rootDir, sourcePath));
    if (isExcluded(relativePath)) continue;

    const stat = lstatSync(sourcePath);
    if (stat.isSymbolicLink()) throw new Error(`Template symlinks are not supported: ${relativePath}`);
    if (stat.isDirectory()) {
      const targetPath = join(targetDir, entry);
      mkdirSync(targetPath, { recursive: true });
      copyTemplateForPublish(sourcePath, targetPath, rootDir);
    } else if (stat.isFile()) {
      mkdirSync(targetDir, { recursive: true });
      copyFileSync(sourcePath, join(targetDir, entry));
    } else {
      throw new Error(`Unsupported template entry: ${relativePath}`);
    }
  }
}

function collectExpectedPublishedFiles(sourceDir: string, releaseVersion: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  collectSourceFiles(sourceDir, sourceDir, files, releaseVersion);
  return files;
}

function collectSourceFiles(dir: string, rootDir: string, files: Map<string, Buffer>, releaseVersion: string): void {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const relativePath = normalize(relative(rootDir, path));
    if (isExcluded(relativePath)) continue;

    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Template symlinks are not supported: ${relativePath}`);
    if (stat.isDirectory()) {
      collectSourceFiles(path, rootDir, files, releaseVersion);
    } else if (stat.isFile()) {
      const outputPath = relativePath === GITIGNORE_FILE ? GITIGNORE_STAGING_ALIAS : relativePath;
      if (relativePath === GENERATED_LOCKFILE) return;
      let content = readFileSync(path);
      if (relativePath === 'package.json') {
        content = Buffer.from(content.toString('utf8').replaceAll('{{VERSION}}', releaseVersion));
      }
      files.set(outputPath, content);
    } else {
      throw new Error(`Unsupported template entry: ${relativePath}`);
    }
  }
}

function collectActualPublishedFiles(targetDir: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  collectTargetFiles(targetDir, targetDir, files);
  return files;
}

function collectTargetFiles(dir: string, rootDir: string, files: Map<string, Buffer>): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const relativePath = normalize(relative(rootDir, path));
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Staged template symlinks are not supported: ${relativePath}`);
    if (stat.isDirectory()) {
      collectTargetFiles(path, rootDir, files);
    } else if (stat.isFile()) {
      if (relativePath === GENERATED_LOCKFILE) {
        const content = readFileSync(path, 'utf8');
        if (content.includes('{{VERSION}}')) files.set(relativePath, Buffer.from(content));
        continue;
      }
      files.set(relativePath, readFileSync(path));
    } else {
      throw new Error(`Unsupported staged template entry: ${relativePath}`);
    }
  }
}
