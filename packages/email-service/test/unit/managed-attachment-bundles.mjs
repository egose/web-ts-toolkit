import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'tsup';
import { acquireTestScratch, packageRoot } from '../scratch.mjs';

const scratch = acquireTestScratch();
let outDir;
try {
  process.env.TMPDIR = scratch.directory;
  outDir = await mkdtemp(join(scratch.directory, 'managed-attachment-bundles-'));
  // Keep the root's ordinary external dependency external, as in the shipping build.
  await symlink(join(packageRoot, 'node_modules'), join(outDir, 'node_modules'), 'dir');
  await build({
    config: false,
    tsconfig: join(packageRoot, 'tsconfig.json'),
    entry: {
      attachments: join(packageRoot, 'src/attachments.ts'),
      adapter: join(import.meta.dirname, 'managed-attachment-bundle-fixture.ts'),
      index: join(packageRoot, 'src/index.ts'),
    },
    outDir,
    bundle: true,
    splitting: false,
    dts: false,
    format: ['esm', 'cjs'],
    platform: 'node',
    target: 'node24',
    external: ['handlebars'],
    // Use an explicit CJS extension because the repo's scratch lives outside the package.
    outExtension: ({ format }) => ({ js: format === 'esm' ? '.mjs' : '.cjs' }),
    silent: true,
  });

  const require = createRequire(import.meta.url);
  const files = (name) =>
    Promise.all([import(pathToFileURL(join(outDir, `${name}.mjs`)).href), require(join(outDir, `${name}.cjs`))]);
  const [checkers, adapters, roots] = await Promise.all([files('attachments'), files('adapter'), files('index')]);
  for (const [i, common] of checkers.entries()) {
    assert.deepEqual(Object.keys(common), ['checkManagedAttachmentRetention']);
    const root = roots[i];
    assert.equal(root.checkManagedAttachmentRetention, undefined);
    for (const adapter of adapters) {
      assert.notEqual(adapter.EmailError, root.EmailError);
      const writer = adapter.createFixtureWriter();
      const scope = 'fixture-tenant';
      const deliverBy = Date.now() + 60_000;
      const receipt = await writer.put({
        scope,
        deliverBy,
        bytes: Uint8Array.of(0, 255),
        id: 'synthetic',
        revision: 'r1',
        filename: 'synthetic.bin',
        contentType: 'application/octet-stream',
      });
      const registry = root.createEmailTemplateRegistry({
        example: root.defineSendGridTemplate({
          kind: 'sendgrid',
          templateId: `d-${'0'.repeat(32)}`,
          revision: 'r1',
          defaults: { from: { address: 'sender@example.invalid' } },
          parseInput: () => null,
          parseData: (data) => data,
          prepare: () => ({
            to: [{ address: 'recipient@example.invalid' }],
            values: {},
            expiresAt: deliverBy,
            attachments: [receipt.ref],
          }),
        }),
      });
      const prepared = await registry.prepare(scope, {
        key: { kind: 'single', idempotencyKey: 'test' },
        intent: null,
        templateKey: 'example',
        provider: { kind: 'sendgrid', key: 'synthetic', mode: 'sandbox' },
        input: null,
      });
      const options = { scope, stores: [writer], receipts: [receipt] };
      const checked = common.checkManagedAttachmentRetention(prepared, options);
      assert.deepEqual(checked, prepared);
      assert(Object.isFrozen(checked));
      assert.throws(
        () => common.checkManagedAttachmentRetention(prepared, { ...options, receipts: [structuredClone(receipt)] }),
        { code: 'attachment_retention' },
      );
    }
  }
  console.log('4 independent ESM/CJS common-checker and writer combinations verified');
} finally {
  if (outDir) await rm(outDir, { recursive: true, force: true });
  scratch.cleanup();
}
