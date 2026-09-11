import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertStagedTemplateReady } from './stage-template';

const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version?: string };

if (!manifest.version || manifest.version.includes('PLACEHOLDER')) {
  throw new Error(
    'Refusing to pack the source package with placeholder metadata. Use `pnpm publish-packages -- --version <version> --filter create-access-router-mongo-starter --dry-run` so the repository publication transformation is applied.',
  );
}

const sourceDir = resolve('template');
const targetDir = resolve('dist', 'template');
if (existsSync(sourceDir)) {
  assertStagedTemplateReady({ sourceDir, targetDir, releaseVersion: manifest.version });
}
