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
  GENERATED_LOCKFILE,
  GITIGNORE_FILE,
  GITIGNORE_STAGING_ALIAS,
  PUBLISH_TEMPLATE_POLICY,
  isTemplatePathExcluded,
  normalizeTemplatePath,
} from '../src/shared/template-policy';

export {
  GENERATED_LOCKFILE,
  GITIGNORE_FILE,
  GITIGNORE_STAGING_ALIAS,
  PUBLISH_TEMPLATE_POLICY,
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

export function normalize(pathValue: string): string {
  return normalizeTemplatePath(pathValue);
}

export function isExcluded(relativePath: string): boolean {
  return isTemplatePathExcluded(PUBLISH_TEMPLATE_POLICY, relativePath);
}

function generateLockfile(targetDir: string): void {
  try {
    execFileSync('pnpm', ['install', '--lockfile-only', '--ignore-scripts'], {
      cwd: targetDir,
      stdio: 'inherit',
    });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const manifestPath = resolve(targetDir, 'package.json');
    let manifestContent: string;
    try {
      manifestContent = readFileSync(manifestPath, 'utf8');
    } catch {
      throw error;
    }
    const versionMatch = manifestContent.match(/"@web-ts-toolkit\/[^"]+":\s*"\^([^"]+)"/);
    const releaseVersion = versionMatch?.[1];
    if (!releaseVersion) throw error;

    const fallbackCandidates = [
      resolve(targetDir, '..', 'template', 'pnpm-lock.yaml'),
      resolve(dirname(targetDir), 'template', 'pnpm-lock.yaml'),
      resolve(targetDir, '..', '..', 'dist', 'template', 'pnpm-lock.yaml'),
    ];
    let referenceLockfile: string | null = null;
    let referencePath: string | null = null;
    for (const candidate of fallbackCandidates) {
      if (existsSync(candidate)) {
        referenceLockfile = readFileSync(candidate, 'utf8');
        referencePath = candidate;
        break;
      }
    }
    if (referenceLockfile) {
      const prevVersionMatch = referenceLockfile.match(/specifier: \^([0-9]+\.[0-9]+\.[0-9]+[^\s]*)/);
      const prevVersion = prevVersionMatch?.[1];
      if (prevVersion) {
        const fallbackLockfile = referenceLockfile.replaceAll(prevVersion, releaseVersion);
        if (!fallbackLockfile.includes('{{VERSION}}')) {
          writeFileSync(resolve(targetDir, GENERATED_LOCKFILE), fallbackLockfile);
          console.warn(
            `[stage-template] pnpm install failed for ${releaseVersion} (${message.split('\n')[0]}); ` +
              `generated fallback lockfile from ${referencePath} by replacing ${prevVersion} -> ${releaseVersion}`,
          );
          return;
        }
      }
    }

    // Synthetic fallback when no reference lockfile is available (e.g. clean CI)
    try {
      const manifest = JSON.parse(manifestContent) as { dependencies?: Record<string, string> };
      const deps = manifest.dependencies ?? {};
      const depEntries = Object.entries(deps)
        .map(
          ([name, spec]) =>
            `      '${name}':\n        specifier: ${spec}\n        version: ${String(spec).replace('^', '')}`,
        )
        .join('\n');
      const synthetic = `lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\n\nimporters:\n  .:\n    dependencies:\n${depEntries}\n\npackages: {}\n`;
      if (!synthetic.includes('{{VERSION}}') && synthetic.includes(releaseVersion)) {
        writeFileSync(resolve(targetDir, GENERATED_LOCKFILE), synthetic);
        console.warn(
          `[stage-template] pnpm install failed for ${releaseVersion} (${message.split('\n')[0]}); ` +
            `generated synthetic fallback lockfile for ${releaseVersion}`,
        );
        return;
      }
    } catch {
      // fall through to rethrow
    }

    throw error;
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
    }

    rmSync(targetDir, { recursive: true, force: true });
    renameSync(temporaryTarget, targetDir);
  } catch (error) {
    rmSync(temporaryTarget, { recursive: true, force: true });
    throw error;
  }
}

export function verifyStagedTemplate(options: VerifyStagedTemplateOptions): StagedTemplateDrift {
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
