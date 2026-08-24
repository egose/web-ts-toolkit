/**
 * Scaffold a new access-router + MongoDB CRUD app from the starter template.
 *
 * Usage:
 *   npx create-access-router-mongo-starter <target-dir> [options]
 *   pnpm create-access-router-mongo-starter <target-dir> [options]
 *
 * Copies the bundled starter template,
 * rewrites the operational app placeholders according to their output syntax
 * (the release version is normally stamped before publication),
 * and prints next steps.
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { cancel, intro, isCancel, outro, text } from '@clack/prompts';
import { resolveCliScriptPath } from './runtime-paths';
import { readRequiredOptionValue } from './shared/arg-parser';
import { bail } from './shared/bail';
import {
  GITIGNORE_FILE,
  GITIGNORE_STAGING_ALIAS,
  SCAFFOLD_TEMPLATE_POLICY,
  isTemplatePathExcluded,
} from './shared/template-policy';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Prefer the template relative to the built CLI (`dist/bin` -> `dist/template`)
// and fall back to the source template for local `tsx src/cli.ts` execution.
// Installed package bins are commonly symlinked, so resolve the actual CLI file
// instead of relying on the raw argv entrypoint path.
const SCRIPT_DIR = dirname(
  resolveCliScriptPath(typeof __filename === 'string' ? __filename : undefined, process.argv[1]),
);
const BUNDLED_TEMPLATE_DIR = resolve(SCRIPT_DIR, '..', 'template');
const SOURCE_TEMPLATE_DIR = resolve(SCRIPT_DIR, '..', '..', 'template');
const TEMPLATE_DIR = existsSync(BUNDLED_TEMPLATE_DIR) ? BUNDLED_TEMPLATE_DIR : SOURCE_TEMPLATE_DIR;

const PKG_JSON_PATH = resolve(SCRIPT_DIR, '..', 'package.json');

const SCAFFOLDER_VERSION = (() => {
  try {
    return (JSON.parse(readFileSync(PKG_JSON_PATH, 'utf8')) as { version?: unknown }).version;
  } catch {
    return undefined;
  }
})();

const OPERATIONAL_PLACEHOLDERS = ['{{APP_NAME}}', '{{APP_TITLE}}', '{{DB_NAME}}', '{{VERSION}}'] as const;

const TEXT_PLACEHOLDER_MANIFEST = [
  { path: 'README.md', token: '# {{APP_TITLE}}', value: 'markdownTitle' },
  { path: 'README.md', token: '{{VERSION}}', value: 'version', optional: true },
  { path: 'api/access-router.config.ts', token: "'{{APP_NAME}}'", value: 'typescriptName' },
  { path: 'api/src/config.ts', token: "'{{DB_NAME}}'", value: 'typescriptDbName' },
  { path: 'src/pages/home-page.tsx', token: "{'{{APP_TITLE}}'}", value: 'jsxTitle' },
  { path: 'index.html', token: '{{APP_TITLE}}', value: 'htmlTitle' },
  { path: '.env.example', token: '{{DB_NAME}}', value: 'uriDbName' },
] as const;

const HELP = `create-access-router-mongo-starter

Scaffold a new access-router + MongoDB CRUD app from the starter template.

Usage:
  create-access-router-mongo-starter <target-dir> [options]

Options:
  --name <name>       Package/app name (default: derived from <target-dir>)
  --title <title>     Display title for the app (default: Title Case of <name>)
  --db-name <name>    MongoDB database name (default: same as <name>)
  --force             Overwrite the target directory if it already exists
  --dry-run           Print actions without writing files
  -i, --interactive   Prompt for any missing option
  -h, --help          Show this help

Examples:
  create-access-router-mongo-starter ./apps/my-app --name my-app
  create-access-router-mongo-starter ./packages/billing --name billing --title "Billing App"
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Options {
  targetDir: string | undefined;
  name: string | undefined;
  title: string | undefined;
  dbName: string | undefined;
  force: boolean;
  dryRun: boolean;
  interactive: boolean;
  help: boolean;
}

export interface ScaffoldServices {
  templateDir: string;
  scaffolderVersion: unknown;
  cwd: string;
  exists(path: string): boolean;
  validatePaths(templateDir: string, targetDir: string, cwd: string): void;
  createTemporaryTarget(targetDir: string): string;
  move(source: string, target: string): void;
  removeTarget(path: string): void;
  createTarget(path: string): void;
  copyTemplate(source: string, target: string, dryRun: boolean): void;
  rewritePlaceholders(path: string, values: ScaffoldValues): void;
  validateTarget(path: string): void;
  promptMissing(options: Options): Promise<Options>;
  log(message?: string): void;
  writeStdout(message: string): void;
}

export interface ScaffoldValues {
  name: string;
  title: string;
  dbName: string;
  version: string;
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Options {
  const o: Options = {
    targetDir: undefined,
    name: undefined,
    title: undefined,
    dbName: undefined,
    force: false,
    dryRun: false,
    interactive: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--name':
        o.name = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--title':
        o.title = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--db-name':
        o.dbName = readRequiredOptionValue(argv, i, a);
        i += 1;
        break;
      case '--force':
        o.force = true;
        break;
      case '--dry-run':
        o.dryRun = true;
        break;
      case '-i':
      case '--interactive':
        o.interactive = true;
        break;
      case '-h':
      case '--help':
        o.help = true;
        break;
      default:
        if (a.startsWith('-')) throw new Error(`Unknown option: ${a}\n\n${HELP}`);
        if (!o.targetDir) o.targetDir = a;
        else throw new Error(`Unexpected positional argument: ${a}\n\n${HELP}`);
    }
  }
  return o;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toTitleCase(name: string): string {
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function defaultDatabaseName(packageName: string): string {
  return packageName.slice(packageName.lastIndexOf('/') + 1).replaceAll('.', '-');
}

function validatePackageName(name: string): void {
  if (
    name.length > 214 ||
    name === 'node_modules' ||
    name === 'favicon.ico' ||
    !/^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/.test(name)
  ) {
    throw new Error(
      'Invalid package name. Use a lowercase npm name such as "my-app" or "@scope/my-app" (maximum 214 characters).',
    );
  }
}

function validateDatabaseName(name: string): void {
  const byteLength = Buffer.byteLength(name, 'utf8');
  const containsControlCharacter = [...name].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (!name || byteLength > 63 || containsControlCharacter || /[/\\. "$*<>:|?]/.test(name)) {
    throw new Error(
      'Invalid MongoDB database name. Use 1-63 UTF-8 bytes without control characters, spaces, /, \\, ., ", $, *, <, >, :, |, or ?.',
    );
  }
}

function validateTitle(title: string): void {
  if (!title.trim()) throw new Error('Display title must not be empty or whitespace-only.');
  if (title.includes('\0')) throw new Error('Display title must not contain a null character.');
}

function validateVersion(version: unknown): asserts version is string {
  if (
    typeof version !== 'string' ||
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      version,
    ) ||
    /PLACEHOLDER|not_found|\{\{|workspace:/i.test(version)
  ) {
    throw new Error(
      'Could not resolve a concrete scaffolder package version; refusing to generate dependency metadata.',
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeMarkdownTitle(value: string): string {
  return escapeHtml(value.replace(/\r\n?|\n/g, ' ')).replace(/[\\`*_[\]{}()#+.!|-]/g, '\\$&');
}

function isExcluded(relPath: string): boolean {
  return isTemplatePathExcluded(SCAFFOLD_TEMPLATE_POLICY, relPath);
}

function canonicalizePath(path: string): string {
  let existing = resolve(path);
  const missing: string[] = [];

  while (true) {
    if (existsSync(existing)) {
      return resolve(realpathSync.native(existing), ...missing);
    }

    const parent = dirname(existing);
    if (parent === existing) throw new Error(`Cannot resolve an existing ancestor for ${path}`);
    missing.unshift(basename(existing));
    existing = parent;
  }
}

function containsPath(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function validateScaffoldPaths(templateDir: string, targetDir: string, cwd: string): void {
  const sourceStat = lstatSync(templateDir);
  if (sourceStat.isSymbolicLink() || !sourceStat.isDirectory()) {
    throw new Error(`Template source must be a real directory, not a symlink: ${templateDir}`);
  }
  const targetStat = lstatSync(targetDir, { throwIfNoEntry: false });
  if (targetStat?.isSymbolicLink()) {
    throw new Error(`Target directory must not be a symlink: ${targetDir}`);
  }

  const source = canonicalizePath(templateDir);
  const target = canonicalizePath(targetDir);
  const current = canonicalizePath(cwd);
  const home = canonicalizePath(homedir());

  if (target === parse(target).root) throw new Error(`Refusing to replace a filesystem root: ${targetDir}`);
  if (containsPath(target, current)) {
    throw new Error(`Refusing to replace the current working directory or one of its ancestors: ${targetDir}`);
  }
  if (containsPath(target, home)) {
    throw new Error(`Refusing to replace the user's home directory or one of its ancestors: ${targetDir}`);
  }
  if (containsPath(source, target) || containsPath(target, source)) {
    throw new Error(`Target and template directories must not contain one another: ${targetDir}`);
  }

  validateTemplateTree(templateDir, templateDir);
}

function validateTemplateTree(dir: string, templateDir: string): void {
  if (dir === templateDir) {
    const entries = new Set(readdirSync(dir));
    if (entries.has(GITIGNORE_FILE) && entries.has(GITIGNORE_STAGING_ALIAS)) {
      throw new Error(
        `Template must not contain both ${GITIGNORE_FILE} and reserved staging alias ${GITIGNORE_STAGING_ALIAS}`,
      );
    }
  }

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const rel = relative(templateDir, fullPath);
    if (isExcluded(rel)) continue;

    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) throw new Error(`Template symlinks are not supported: ${rel}`);
    if (stat.isDirectory()) validateTemplateTree(fullPath, templateDir);
    else if (!stat.isFile()) throw new Error(`Unsupported template entry: ${rel}`);
  }
}

function copyTemplate(src: string, dest: string, dry: boolean, templateDir = TEMPLATE_DIR): void {
  if (!existsSync(src)) return;

  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const rel = relative(templateDir, srcPath);
    const outputEntry = rel === GITIGNORE_STAGING_ALIAS ? GITIGNORE_FILE : entry;
    const destPath = join(dest, outputEntry);

    if (isExcluded(rel)) continue;

    const stat = lstatSync(srcPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Template symlinks are not supported: ${relative(templateDir, srcPath)}`);
    }
    if (stat.isDirectory()) {
      if (!dry) mkdirSync(destPath, { recursive: true });
      copyTemplate(srcPath, destPath, dry, templateDir);
    } else if (stat.isFile()) {
      if (!dry) {
        mkdirSync(dest, { recursive: true });
        cpSync(srcPath, destPath);
      }
      console.log(`  ${dry ? '[dry-run] ' : ''}copy ${relative(templateDir, srcPath)}`);
    } else {
      throw new Error(`Unsupported template entry: ${relative(templateDir, srcPath)}`);
    }
  }
}

function replaceManifestToken(path: string, token: string, value: string, optional = false): void {
  const content = readFileSync(path, 'utf8');
  const occurrences = content.split(token).length - 1;
  if (optional && occurrences === 0) return;
  if (occurrences !== 1) {
    throw new Error(`Expected exactly one operational placeholder ${token} in ${path}; found ${occurrences}`);
  }
  writeFileSync(path, content.replace(token, value));
}

function rewritePlaceholders(dir: string, values: ScaffoldValues): void {
  const packageJson = join(dir, 'package.json');
  const manifest = JSON.parse(readFileSync(packageJson, 'utf8')) as { name?: unknown };
  if (manifest.name !== '{{APP_NAME}}') {
    throw new Error('Template package.json must contain {{APP_NAME}} as its name.');
  }
  manifest.name = values.name;
  let manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  if (manifestText.includes('{{VERSION}}')) {
    manifestText = manifestText.replaceAll('{{VERSION}}', values.version);
  }
  writeFileSync(packageJson, manifestText);

  const serialized = {
    markdownTitle: escapeMarkdownTitle(values.title),
    typescriptName: JSON.stringify(values.name),
    typescriptDbName: JSON.stringify(values.dbName),
    jsxTitle: `{${JSON.stringify(values.title)}}`,
    htmlTitle: escapeHtml(values.title),
    uriDbName: encodeURIComponent(values.dbName),
    version: values.version,
  };
  for (const entry of TEXT_PLACEHOLDER_MANIFEST) {
    replaceManifestToken(
      join(dir, entry.path),
      entry.token,
      serialized[entry.value],
      'optional' in entry && entry.optional,
    );
  }
}

function validateTarget(dir: string): void {
  validateGeneratedTree(dir);
  const packageJson = join(dir, 'package.json');
  if (!existsSync(packageJson) || !lstatSync(packageJson).isFile()) {
    throw new Error('Generated scaffold is missing package.json');
  }
  try {
    JSON.parse(readFileSync(packageJson, 'utf8'));
  } catch {
    throw new Error('Generated scaffold contains an invalid package.json');
  }
  const gitignore = join(dir, GITIGNORE_FILE);
  if (!existsSync(gitignore) || !lstatSync(gitignore).isFile()) {
    throw new Error(`Generated scaffold is missing ${GITIGNORE_FILE}`);
  }
  if (existsSync(join(dir, GITIGNORE_STAGING_ALIAS))) {
    throw new Error(`Generated scaffold still contains staging alias ${GITIGNORE_STAGING_ALIAS}`);
  }

  for (const entry of TEXT_PLACEHOLDER_MANIFEST) {
    const path = join(dir, entry.path);
    const content = readFileSync(path, 'utf8');
    if (content.includes(entry.token)) {
      throw new Error(`Generated scaffold still contains ${entry.token}: ${path}`);
    }
    if (entry.path !== 'README.md') validateOperationalFile(path);
  }
  validateOperationalFile(packageJson);
}

function validateGeneratedTree(dir: string): void {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) throw new Error(`Generated scaffold contains an unsupported symlink: ${fullPath}`);
    if (stat.isDirectory()) validateGeneratedTree(fullPath);
    else if (!stat.isFile()) throw new Error(`Generated scaffold contains an unsupported entry: ${fullPath}`);
  }
}

function validateOperationalFile(path: string): void {
  const content = readFileSync(path, 'utf8');
  const unresolved = OPERATIONAL_PLACEHOLDERS.find((placeholder) => content.includes(placeholder));
  if (unresolved) throw new Error(`Generated scaffold still contains ${unresolved}: ${path}`);
}

function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

// ---------------------------------------------------------------------------
// Interactive prompts
// ---------------------------------------------------------------------------

async function promptMissing(o: Options): Promise<Options> {
  intro('create-access-router-mongo-starter');

  if (!o.targetDir) {
    const v = await text({
      message: 'Target directory',
      placeholder: './apps/my-app',
      validate: (s) => (s && s.trim() ? undefined : 'Required'),
    });
    if (isCancel(v)) {
      cancel('Cancelled');
      process.exit(0);
    }
    o.targetDir = (v as string).trim();
  }

  if (!o.name) {
    const derived = o.targetDir ? (o.targetDir.split(/[/\\]/).pop() ?? '') : '';
    const v = await text({
      message: 'Package/app name',
      placeholder: derived || 'my-app',
      defaultValue: derived,
      validate: (s) => (s && s.trim() ? undefined : 'Required'),
    });
    if (isCancel(v)) {
      cancel('Cancelled');
      process.exit(0);
    }
    o.name = (v as string).trim() || derived;
  }

  if (!o.title) {
    const derived = toTitleCase(o.name!);
    const v = await text({
      message: 'Display title',
      placeholder: derived,
      defaultValue: derived,
      validate: (s) => (s && s.trim() ? undefined : 'Required'),
    });
    if (isCancel(v)) {
      cancel('Cancelled');
      process.exit(0);
    }
    o.title = (v as string).trim() || derived;
  }

  if (!o.dbName) {
    const v = await text({
      message: 'MongoDB database name',
      placeholder: o.name!,
      defaultValue: o.name!,
      validate: (s) => (s && s.trim() ? undefined : 'Required'),
    });
    if (isCancel(v)) {
      cancel('Cancelled');
      process.exit(0);
    }
    o.dbName = (v as string).trim() || o.name!;
  }

  outro('Scaffolding…');
  return o;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const DEFAULT_SERVICES: ScaffoldServices = {
  templateDir: TEMPLATE_DIR,
  scaffolderVersion: SCAFFOLDER_VERSION,
  cwd: process.cwd(),
  exists: existsSync,
  validatePaths: validateScaffoldPaths,
  createTemporaryTarget: (target) => {
    mkdirSync(dirname(target), { recursive: true });
    return mkdtempSync(join(dirname(target), `.${basename(target)}.tmp-`));
  },
  move: renameSync,
  removeTarget: (path) => rmSync(path, { recursive: true, force: true }),
  createTarget: (path) => mkdirSync(path, { recursive: true }),
  copyTemplate: (source, target, dryRun) => copyTemplate(source, target, dryRun, source),
  rewritePlaceholders,
  validateTarget,
  promptMissing,
  log: (message = '') => console.log(message),
  writeStdout: (message) => process.stdout.write(message),
};

export async function runCli(argv: string[], overrides: Partial<ScaffoldServices> = {}): Promise<number> {
  const services = { ...DEFAULT_SERVICES, ...overrides };
  let options = parseArgs(argv);

  if (options.help) {
    services.writeStdout(HELP);
    return 0;
  }

  if (options.interactive) {
    options = await services.promptMissing(options);
  }

  if (!options.targetDir)
    bail('Target directory is required. Pass it as the first argument or use -i for interactive prompts.');

  const name = options.name || options.targetDir.split(/[/\\]/).pop() || '';
  if (!name) bail('Could not derive a package name. Pass --name explicitly.');

  const title = options.title || toTitleCase(name);
  const dbName = options.dbName || defaultDatabaseName(name);
  const targetDir = resolve(services.cwd, options.targetDir);

  validatePackageName(name);
  validateTitle(title);
  validateDatabaseName(dbName);
  validateVersion(services.scaffolderVersion);

  services.log('\n─ Scaffold summary ─');
  services.log(`  Target:   ${targetDir}`);
  services.log(`  Name:     ${name}`);
  services.log(`  Title:    ${JSON.stringify(title)}`);
  services.log(`  DB name:  ${dbName}`);
  if (options.dryRun) services.log('  (dry-run — no files will be written)');

  if (!services.exists(services.templateDir)) {
    bail(
      `Template source not found at ${services.templateDir}. Make sure the access-router-mongo-starter package exists in the same monorepo.`,
    );
  }

  services.validatePaths(services.templateDir, targetDir, services.cwd);

  const targetExists = services.exists(targetDir);
  if (targetExists) {
    if (!options.force) {
      bail(`Target directory already exists: ${targetDir}\n  Use --force to overwrite.`);
    }
    services.log(`\n• Replacing existing directory: ${targetDir}`);
  }

  services.log('\n─ Copying template ─');
  const values: ScaffoldValues = { name, title, dbName, version: services.scaffolderVersion };
  let temporaryTarget: string | undefined;
  let backupTarget: string | undefined;
  try {
    if (options.dryRun) {
      services.copyTemplate(services.templateDir, targetDir, true);
    } else {
      temporaryTarget = services.createTemporaryTarget(targetDir);
      services.createTarget(temporaryTarget);
      services.copyTemplate(services.templateDir, temporaryTarget, false);
    }

    services.log('\n─ Rewriting placeholders ─');
    if (temporaryTarget) {
      services.rewritePlaceholders(temporaryTarget, values);
      services.validateTarget(temporaryTarget);

      if (targetExists) {
        backupTarget = join(dirname(targetDir), `.${basename(targetDir)}.backup-${randomUUID()}`);
        services.move(targetDir, backupTarget);
      }

      try {
        services.move(temporaryTarget, targetDir);
        temporaryTarget = undefined;
      } catch (error) {
        if (backupTarget) {
          services.move(backupTarget, targetDir);
          backupTarget = undefined;
        }
        throw error;
      }

      if (backupTarget) {
        const completedBackup = backupTarget;
        try {
          services.removeTarget(completedBackup);
          backupTarget = undefined;
        } catch (error) {
          services.removeTarget(targetDir);
          services.move(completedBackup, targetDir);
          backupTarget = undefined;
          throw error;
        }
      }
    }
  } finally {
    if (temporaryTarget) services.removeTarget(temporaryTarget);
    if (backupTarget && !services.exists(targetDir)) services.move(backupTarget, targetDir);
  }
  for (const [token, value] of Object.entries({
    '{{APP_NAME}}': name,
    '{{APP_TITLE}}': JSON.stringify(title),
    '{{DB_NAME}}': dbName,
    '{{VERSION}}': services.scaffolderVersion,
  })) {
    services.log(`  ${token} → ${value}`);
  }

  services.log('\n✓ Scaffold complete.');
  services.log('\nNext steps:');
  services.log(`  cd ${quoteShellArgument(relative(services.cwd, targetDir) || '.')}`);
  services.log('  cp .env.example .env  # then edit MONGODB_URI');
  services.log('  pnpm install --frozen-lockfile');
  services.log('  pnpm server                                   # backend on :8000');
  services.log('  pnpm dev                                      # frontend on :3000');
  services.log(
    `  pnpm add -D create-access-router-mongo-starter@${services.scaffolderVersion} netlify-cli  # enable deploy bin`,
  );
  services.log('  pnpm exec create-access-router-mongo-starter-deploy-netlify -- --help');
  return 0;
}

if (typeof require !== 'undefined' && require.main === module) {
  runCli(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? `\n✖ ${error.message}` : error);
    process.exitCode = 1;
  });
}
