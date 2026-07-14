import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceTemplateDir = resolve(rootDir, 'template');
const stagedTemplateDir = resolve(rootDir, 'dist', 'template');

const EXCLUDED_PATHS = ['node_modules', 'dist', '.tmp', '.netlify', 'netlify', 'netlify.toml', 'api/functions'];

function normalize(pathValue: string): string {
  return pathValue.replace(/\\/g, '/');
}

function isExcluded(relativePath: string): boolean {
  return EXCLUDED_PATHS.some((excluded) => relativePath === excluded || relativePath.startsWith(`${excluded}/`));
}

if (!existsSync(sourceTemplateDir)) {
  throw new Error(`Template source directory not found: ${sourceTemplateDir}`);
}

rmSync(stagedTemplateDir, { recursive: true, force: true });
mkdirSync(resolve(rootDir, 'dist'), { recursive: true });

cpSync(sourceTemplateDir, stagedTemplateDir, {
  recursive: true,
  filter(sourcePath: string): boolean {
    const relativePath = normalize(relative(sourceTemplateDir, sourcePath));
    if (!relativePath) return true;
    return !isExcluded(relativePath);
  },
});

console.log(`staged template → ${stagedTemplateDir}`);
