/**
 * Scaffold a new access-router + MongoDB CRUD app from the starter template.
 *
 * Usage:
 *   npx create-access-router-mongo-starter <target-dir> [options]
 *   pnpm create-access-router-mongo-starter <target-dir> [options]
 *
 * Copies the template from the sibling `access-router-mongo-starter` package,
 * rewrites `{{APP_NAME}}`, `{{APP_TITLE}}`, and `{{DB_NAME}}` placeholders, and
 * prints next steps.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cancel, intro, isCancel, outro, text } from '@clack/prompts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Works in both ESM (import.meta.url) and CJS (__dirname after tsup build).
const SCRIPT_DIR = typeof __dirname !== 'undefined' ? __dirname : fileURLToPath(new URL('.', import.meta.url));
const TEMPLATE_DIR = resolve(SCRIPT_DIR, '..', 'template');

const EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  'api/functions',
  'netlify',
  '.netlify',
  '.tmp',
  '.env',
  'pnpm-lock.yaml',
];

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
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('-')) throw new Error(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case '--name':
        o.name = next();
        break;
      case '--title':
        o.title = next();
        break;
      case '--db-name':
        o.dbName = next();
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
        process.stdout.write(HELP);
        process.exit(0);
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

function bail(msg: string): never {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

function isExcluded(relPath: string): boolean {
  return EXCLUDE_PATTERNS.some((p) => relPath === p || relPath.startsWith(p + '/') || relPath.startsWith(p + '\\'));
}

function copyTemplate(src: string, dest: string, dry: boolean): void {
  if (!existsSync(src)) return;

  const entries = readdirSync(src);
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const rel = relative(TEMPLATE_DIR, srcPath);

    if (isExcluded(rel)) continue;

    const stat = statSync(srcPath);
    if (stat.isDirectory()) {
      if (!dry) mkdirSync(destPath, { recursive: true });
      copyTemplate(srcPath, destPath, dry);
    } else {
      if (!dry) {
        mkdirSync(dest, { recursive: true });
        cpSync(srcPath, destPath);
      }
      console.log(`  ${dry ? '[dry-run] ' : ''}copy ${relative(TEMPLATE_DIR, srcPath)}`);
    }
  }
}

function rewritePlaceholders(dir: string, replacements: Record<string, string>): void {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      rewritePlaceholders(fullPath, replacements);
    } else {
      let content = readFileSync(fullPath, 'utf8');
      let changed = false;
      for (const [token, value] of Object.entries(replacements)) {
        if (content.includes(token)) {
          content = content.split(token).join(value);
          changed = true;
        }
      }
      if (changed) writeFileSync(fullPath, content);
    }
  }
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

async function main() {
  let options = parseArgs(process.argv.slice(2));

  if (options.interactive) {
    options = await promptMissing(options);
  }

  if (!options.targetDir)
    bail('Target directory is required. Pass it as the first argument or use -i for interactive prompts.');

  const name = options.name || options.targetDir.split(/[/\\]/).pop() || '';
  if (!name) bail('Could not derive a package name. Pass --name explicitly.');

  const title = options.title || toTitleCase(name);
  const dbName = options.dbName || name;
  const targetDir = resolve(options.targetDir);

  console.log('\n─ Scaffold summary ─');
  console.log(`  Target:   ${targetDir}`);
  console.log(`  Name:     ${name}`);
  console.log(`  Title:    ${title}`);
  console.log(`  DB name:  ${dbName}`);
  if (options.dryRun) console.log('  (dry-run — no files will be written)');

  if (!existsSync(TEMPLATE_DIR)) {
    bail(
      `Template source not found at ${TEMPLATE_DIR}. Make sure the access-router-mongo-starter package exists in the same monorepo.`,
    );
  }

  if (existsSync(targetDir)) {
    if (!options.force) {
      bail(`Target directory already exists: ${targetDir}\n  Use --force to overwrite.`);
    }
    console.log(`\n• Removing existing directory: ${targetDir}`);
    if (!options.dryRun) rmSync(targetDir, { recursive: true, force: true });
  }

  console.log('\n─ Copying template ─');
  if (!options.dryRun) mkdirSync(targetDir, { recursive: true });
  copyTemplate(TEMPLATE_DIR, targetDir, options.dryRun);

  console.log('\n─ Rewriting placeholders ─');
  const replacements: Record<string, string> = {
    '{{APP_NAME}}': name,
    '{{APP_TITLE}}': title,
    '{{DB_NAME}}': dbName,
  };
  if (!options.dryRun) rewritePlaceholders(targetDir, replacements);
  for (const [token, value] of Object.entries(replacements)) {
    console.log(`  ${token} → ${value}`);
  }

  console.log('\n✓ Scaffold complete.');
  console.log('\nNext steps:');
  console.log(`  cd ${relative(process.cwd(), targetDir) || '.'}`);
  console.log('  cp .env.example .env  # then edit MONGODB_URI');
  console.log('  pnpm install');
  console.log('  pnpm server           # backend on :8000');
  console.log('  pnpm dev              # frontend on :3000');
  console.log('  pnpm deploy:netlify -- --help  # deploy to Netlify');
}

main();
