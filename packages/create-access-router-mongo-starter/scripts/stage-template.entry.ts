import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { stageTemplate } from './stage-template';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryVersion = readFileSync(resolve(rootDir, '..', '..', 'VERSION'), 'utf8').trim();
const releaseVersion = process.env.WTT_RELEASE_VERSION ?? repositoryVersion;

if (process.env.WTT_RELEASE_VERSION && process.env.WTT_RELEASE_VERSION !== repositoryVersion) {
  throw new Error(
    `WTT_RELEASE_VERSION (${process.env.WTT_RELEASE_VERSION}) does not match VERSION (${repositoryVersion}); refusing to stage mismatched release dependencies.`,
  );
}

const stagedTemplateDir = resolve(rootDir, 'dist', 'template');
stageTemplate({
  sourceDir: resolve(rootDir, 'template'),
  targetDir: stagedTemplateDir,
  releaseVersion,
});
console.log(`staged template -> ${stagedTemplateDir}`);
