import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { getReleasePublishState, isLockfileInstallFailure, stageTemplate } from './stage-template';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryVersion = readFileSync(resolve(rootDir, '..', '..', 'VERSION'), 'utf8').trim();
const releaseVersion = process.env.WTT_RELEASE_VERSION ?? repositoryVersion;

if (process.env.WTT_RELEASE_VERSION && process.env.WTT_RELEASE_VERSION !== repositoryVersion) {
  throw new Error(
    `WTT_RELEASE_VERSION (${process.env.WTT_RELEASE_VERSION}) does not match VERSION (${repositoryVersion}); refusing to stage mismatched release dependencies.`,
  );
}

const stagedTemplateDir = resolve(rootDir, 'dist', 'template');
try {
  stageTemplate({
    sourceDir: resolve(rootDir, 'template'),
    targetDir: stagedTemplateDir,
    releaseVersion,
  });
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  // A real lockfile needs the release tarballs on the registry, so staging a
  // not-yet-published release cannot resolve and must not fail `pnpm build`
  // (release/tag builds run before `publish-packages` releases the new
  // dependency set). Tolerate only that case: the failure must come from the
  // registry resolution itself and the registry must positively report the
  // release as unpublished. Every other failure — and any failure for a
  // published release — still fails the build, and publication stays
  // fail-closed via the prepack verification.
  if (isLockfileInstallFailure(reason) && getReleasePublishState(releaseVersion) === 'unpublished') {
    console.warn(
      `[stage-template] release ${releaseVersion} is not published yet; skipping template staging ` +
        `so the build stays green pre-publish (resolution failure: ${reason.split('\n')[0]}).`,
    );
    if (existsSync(stagedTemplateDir)) {
      console.warn('[stage-template] preserving the previously staged dist/template.');
    } else {
      console.warn('[stage-template] no staged dist/template is present.');
    }
    console.warn(
      '[stage-template] publish-packages rebuilds each package after its dependencies are published, ' +
        'so the published template still carries a real lockfile; prepack refuses to pack a missing or stale stage.',
    );
  } else {
    throw error;
  }
}
console.log(`staged template -> ${stagedTemplateDir}`);
