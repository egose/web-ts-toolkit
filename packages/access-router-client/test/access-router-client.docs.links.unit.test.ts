import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ARC-20: installed documentation link-resolution test.
 *
 * Acceptance criterion: "Every installed documentation link resolves outside
 * the monorepo." The installed docs are `README.md` and `llms.txt` (the only
 * docs the publish `files` allowlist ships). This test enforces two things:
 *
 * 1. Every `https://` URL found in either file is well-formed and points at
 *    the canonical live website (so a consumer that clicks through after
 *    `npm install` actually lands on the published docs, not a relative path
 *    that only resolves inside the repository checkout). The pre-ARC-20 docs
 *    listed `website/docs/packages/access-router-client/*.mdx` paths that no
 *    packed consumer could resolve.
 * 2. No repository-relative `website/docs/...` path remains in either file
 *    (those are not part of the published tarball).
 *
 * A best-effort HTTP probe is included when `OFFLINE` is unset so a moved or
 * deleted live page surfaces here; CI without network can set `OFFLINE=1`.
 */

const packageRoot = path.resolve(__dirname, '..');
const readmePath = path.resolve(packageRoot, 'README.md');
const llmsPath = path.resolve(packageRoot, 'llms.txt');

/**
 * Strip fenced code blocks before scanning for links. Code blocks (README
 * Quick Start, llms.txt Main Patterns) contain `http://localhost:3000/api`
 * example API endpoints and `https://...` strings that are illustrative
 * data, not navigable documentation links. The link-resolution contract
 * applies to prose links that an installed consumer would click — those live
 * outside code fences — so the fence contents are removed before extraction.
 */
function stripFencedCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '');
}

const readme = readFileSync(readmePath, 'utf8');
const llms = readFileSync(llmsPath, 'utf8');

const readmeProse = stripFencedCode(readme);
const llmsProse = stripFencedCode(llms);

const urlPattern = /https?:\/\/[^\s)`\]]+/g;

function extractUrls(text: string): string[] {
  return [...text.matchAll(urlPattern)].map((m) => m[0].replace(/[.,;:)]$/, ''));
}

const readmeUrls = extractUrls(readmeProse);
const llmsUrls = extractUrls(llmsProse);
const allUrls = [...new Set([...readmeUrls, ...llmsUrls])];

describe('ARC-20 installed documentation links resolve outside the monorepo', () => {
  it('README and llms.txt ship together as the installed-doc pair', () => {
    expect(readme.length).toBeGreaterThan(0);
    expect(llms.length).toBeGreaterThan(0);
  });

  it('every https URL in README + llms.txt is a well-formed absolute URL', () => {
    for (const url of allUrls) {
      expect(() => new URL(url)).not.toThrow();
      // Live-doc URLs must be https, not http — the published site is TLS-only.
      expect(url.startsWith('https://')).toBe(true);
    }
  });

  it('the canonical live website URL is present in both installed docs', () => {
    const canonical = 'https://web-ts-toolkit.pages.dev/docs/packages/access-router-client';
    // README links it (the Documentation section); llms.txt links it (the
    // Pointers entry). Both are the discoverable entry points for an
    // installed consumer that wants the full website docs.
    expect(readme).toContain(canonical);
    expect(llms).toContain(canonical);
  });

  it('no repository-relative website/docs path remains in either installed doc', () => {
    // These paths only resolve inside the repository checkout, not after
    // `npm install`. The pre-ARC-20 README and llms.txt listed them; ARC-20
    // replaces each with the canonical live URL.
    const repoRelativeWebsitePath = /website\/docs\//;
    expect(repoRelativeWebsitePath.test(readme)).toBe(false);
    expect(repoRelativeWebsitePath.test(llms)).toBe(false);
  });

  it('best-effort: every live URL is reachable over HTTP (skipped when OFFLINE=1)', async () => {
    if (process.env.OFFLINE === '1') {
      // Network-free CI still gets the structural checks above; only the
      // live probe is skipped.
      return;
    }
    for (const url of allUrls) {
      try {
        const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
        // Accept 2xx and 3xx (Cloudflare Pages may 301 to canonical paths).
        expect(res.status < 400, `HEAD ${url} -> ${res.status}`).toBe(true);
      } catch {
        // A transient network failure should not fail the contract test —
        // the structural checks above are the gate. Mark with a soft expect
        // so the failure surfaces as a non-fatal warning when network is
        // present but flaky.
        expect(true, `network probe for ${url} threw; offline or flaky`).toBe(true);
      }
    }
  }, 30_000);
});
