import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);

const documents = [
  {
    path: 'apps/oidc-vault-dpop-example/README.md',
    heading: '## Use the published browser client',
    file: 'app.ts',
    basePath: '/auth/oidc/body',
    replayNamespace: 'oidc-vault-dpop-example-api',
  },
  {
    path: 'packages/express-oidc-vault/README.md',
    heading: '### Browser DPoP client',
    file: 'core.ts',
    basePath: '/auth/oidc',
    replayNamespace: 'app-api-v1',
  },
  {
    path: 'website/docs/packages/express-oidc-vault.md',
    heading: '### Persistent-key DPoP SPA example',
    file: 'website.ts',
    basePath: '/auth/oidc/body',
    replayNamespace: 'oidc-vault-dpop-example-api',
  },
];

function snippet(readme: string, { path, heading }: { path: string; heading: string }): string {
  const lines = readme.replace(/\r\n/g, '\n').split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) {
    throw new Error(`${path}: missing Markdown heading "${heading}". Update the guide and consumer heading together.`);
  }

  // Each guide puts its snippet directly under this heading. A removed block
  // must not borrow code from a later section, including a nested heading.
  const following = lines.slice(start + 1);
  const end = following.findIndex((line) => /^ {0,3}#{1,6}(?:[ \t]|$)/.test(line));
  const section = (end < 0 ? following : following.slice(0, end)).join('\n');
  const code = section.match(/^```ts[ \t]*\n([\s\S]*?)^```[ \t]*$/m)?.[1];
  if (!code?.trim()) {
    throw new Error(
      `${path}: missing TypeScript snippet under "${heading}". Expected a non-empty, closed \`\`\`ts block before the next heading.`,
    );
  }
  return code.trimEnd();
}

describe('DPH-11 documentation snippet diagnostics', () => {
  const source = documents[1];

  it('reports the document and exact missing heading instead of matching prose or a heading prefix', () => {
    const readme = `See ${source.heading}\n${source.heading} details\n\n\`\`\`ts\nexport {};\n\`\`\``;
    expect(() => snippet(readme, source)).toThrow(`${source.path}: missing Markdown heading "${source.heading}"`);
  });

  it.each(['## Later section', '### Later section', '#### Nested section'])(
    'reports missing code rather than borrowing a block after %s',
    (nextHeading) => {
      const readme = `${source.heading}\n\n\`\`\`sh\npnpm add example\n\`\`\`\n\n${nextHeading}\n\n\`\`\`ts\nexport {};\n\`\`\``;
      expect(() => snippet(readme, source)).toThrow(
        `${source.path}: missing TypeScript snippet under "${source.heading}"`,
      );
    },
  );

  it.each([
    ['empty', '```ts\n\n```'],
    ['unclosed', '```ts\nexport {};'],
  ])('reports an %s code block instead of falling through to the next section', (_name, block) => {
    const readme = `${source.heading}\n\n${block}\n\n### Later section\n\n\`\`\`ts\nexport {};\n\`\`\``;
    expect(() => snippet(readme, source)).toThrow(
      `${source.path}: missing TypeScript snippet under "${source.heading}"`,
    );
  });

  it('selects only the current section TypeScript after installation instructions with CRLF line endings', () => {
    const code = "import { fetchWithDpop } from '@web-ts-toolkit/oidc-vault-dpop-client';";
    const readme = [
      source.heading,
      '',
      '```sh',
      'pnpm add example',
      '```',
      '',
      '```ts',
      code,
      '```',
      '',
      '### Later section',
      '```ts',
      'export {};',
      '```',
    ].join('\r\n');
    expect(snippet(readme, source)).toBe(code);
  });
});

describe('CLIENT-08 published package README copy/paste consumers', () => {
  it('extracts app/core/website bound frontend snippets and strictly typechecks them against the published client', async () => {
    const output = await mkdtemp(join(tmpdir(), 'client-08-docs-'));
    try {
      for (const source of documents) {
        const readme = await readFile(new URL(`../../../${source.path}`, import.meta.url), 'utf8');
        const code = snippet(readme, source);
        expect(code, source.path).toContain(`basePath: '${source.basePath}'`);
        expect(code, source.path).toContain(`replayNamespace: '${source.replayNamespace}'`);
        expect(code, source.path).toMatch(
          /\bimport\s*\{[^}]+\}\s*from\s+['"]@web-ts-toolkit\/oidc-vault-dpop-client['"]/,
        );
        expect(code, source.path).not.toContain('@web-ts-toolkit/express');
        expect(code, source.path).not.toContain('@web-ts-toolkit/oidc-vault-dpop-client/');
        expect(code, source.path).not.toMatch(/\bfrom\s+['"]\./);
        expect(code, source.path).toMatch(
          /url\.searchParams\.delete\('code'\);\s*history\.replaceState\(null, '', url\.href\);\s*await session\.exchange\(code\);/,
        );
        expect(code, source.path).toMatch(
          /if \(error instanceof OidcVaultDpopClientError && error\.requiresLogin\) return 'sign-in';\s*throw error;/,
        );
        await writeFile(join(output, source.file), code);
      }
      // Snippets import the published client root, resolved through this app's
      // node_modules workspace link (no src/auth copy remains to symlink).
      await symlink(new URL('../node_modules', import.meta.url).pathname, join(output, 'node_modules'), 'dir');
      await writeFile(
        join(output, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            lib: ['ES2022', 'DOM', 'DOM.Iterable'],
            strict: true,
            skipLibCheck: false,
            noEmit: true,
            types: [],
          },
          files: documents.map((source) => source.file),
        }),
      );
      const tsc = new URL('../node_modules/typescript/bin/tsc', import.meta.url).pathname;
      const { stdout } = await execute(process.execPath, [tsc, '-p', join(output, 'tsconfig.json'), '--listFiles']);
      expect(stdout).toMatch(/[/\\]oidc-vault-dpop-client[/\\]dist[/\\]index\.d\.mts/);
      expect(stdout).not.toMatch(/[/\\]@types[/\\]|express-serve-static-core|express-oidc-vault/);
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
});
