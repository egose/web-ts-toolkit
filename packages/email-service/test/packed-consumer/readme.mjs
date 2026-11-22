import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

// Paste documented follow-on examples into separate modules with their stated
// prior setup. The fenced source comes from the installed tarball, never a copy
// maintained next to this test; the glue only supplies context/exports for calls.
const snippets = {
  quickstart: {}, // No surrounding code: paste and run this module on its own.
  errors: { exports: 'configureSendGrid, hasEmailCode' },
  local: { exports: 'registry, welcomeCommand, prepared' },
  'sendgrid-template': { exports: 'reminder, stagedReminder' },
  admission: {
    imports: "import { registry, welcomeCommand } from './readme-local.mjs';",
    exports: 'store, service, first, again',
  },
  'scheduled-reminder': {
    imports: "import { reminder } from './readme-sendgrid-template.mjs';",
    exports: 'enqueueSevenDayReminder',
  },
  outbox: { exports: 'writeReminder, makeReminderRelay' },
  'smtp-profile': { needsBoth: true, exports: 'smtp' },
  'sendgrid-profile': { exports: 'validationProfile' },
  memory: { exports: 'memoryStore' },
  worker: { exports: 'makeWorker, runDue' },
  'custom-provider': { exports: 'syntheticSmtp' },
  'batch-admission': {
    imports: [
      "import { welcomeCommand } from './readme-local.mjs';",
      "import { service } from './readme-admission.mjs';",
    ].join('\n'),
    exports: 'admission, resumed',
  },
  batch: {
    needsBoth: true,
    imports: [
      "import { registry, welcomeCommand } from './readme-local.mjs';",
      "import { smtp } from './readme-smtp-profile.mjs';",
    ].join('\n'),
    exports: 'admission, resumed, batch, worker',
  },
  results: { exports: 'inspectResults' },
  mongoose: { needsBoth: true, exports: 'openStore' },
  'smtp-capacity': { needsBoth: true, exports: 'configureCapacityLane' },
  'managed-producer': { exports: 'stageInvoice' },
  'managed-worker': { exports: 'makeInvoiceWorker' },
  'managed-mongoose': { peer: 'mongoose', exports: 'mongoAttachmentBinding, bindMongoAttachments' },
  'managed-aws': { peer: '@aws-sdk/client-s3', exports: 'bindAwsAttachments' },
  'managed-seaweedfs': { peer: '@aws-sdk/client-s3', exports: 'bindSeaweedAttachments' },
  'managed-azure': { peer: '@azure/storage-blob', exports: 'bindAzureAttachments' },
  'entry-types': { needsBoth: true },
};

function withRequireImports(source) {
  // Keep the fenced recipe's body intact. Adapt only its named imports to
  // native TS CommonJS syntax so verbatimModuleSyntax checks the require declarations.
  const file = ts.createSourceFile('readme.mts', source, ts.ScriptTarget.Latest, true);
  let index = 0;
  let end = 0;
  let body = '';
  for (const statement of file.statements.filter(ts.isImportDeclaration)) {
    const clause = statement.importClause;
    assert(clause?.namedBindings && ts.isNamedImports(clause.namedBindings) && !clause.name);
    const entry = `readmeEntry${index++}`;
    body += source.slice(end, statement.getStart(file));
    body += `import${clause.isTypeOnly ? ' type' : ''} ${entry} = require(${statement.moduleSpecifier.getText(file)});\n`;
    for (const { isTypeOnly, name, propertyName } of clause.namedBindings.elements) {
      const kind = clause.isTypeOnly || isTypeOnly ? 'type' : 'import';
      body += `${kind} ${name.text} = ${entry}.${(propertyName ?? name).text};\n`;
    }
    end = statement.end;
  }
  return body + source.slice(end);
}

export function writeReadmeExamples(readme, consumer, { peers, legacy }) {
  const blocks = [
    ...readme.matchAll(/^<!-- example: ([a-z-]+) -->\r?\n\r?\n```typescript\r?\n([\s\S]*?)^```[ \t]*$/gm),
  ];
  assert.equal(blocks[0]?.[1], 'quickstart', 'the standalone walkthrough should be the first README example');
  assert.equal(
    blocks.length,
    [...readme.matchAll(/^```(?:ts|typescript)[ \t]*\r?$/gm)].length,
    'unlabelled README TS fence',
  );
  assert.deepEqual(
    blocks.map(([, name]) => name).sort(),
    Object.keys(snippets).sort(),
    'every advertised README example needs installed coverage',
  );
  const files = { esm: [], cjs: [] };
  for (const [, name, source] of blocks) {
    const wiring = snippets[name];
    const managed = name.startsWith('managed-');
    if (!legacy && !managed) continue;
    if (wiring.peer && !peers[wiring.peer]) continue;
    if (wiring.needsBoth && !(peers.mongoose && peers.nodemailer)) continue;
    const stem = `readme-${name}`;
    const pieces = [wiring.imports, source, wiring.exports && `export { ${wiring.exports} };`];
    writeFileSync(join(consumer, `${stem}.mts`), `${pieces.filter(Boolean).join('\n')}\n`);
    files.esm.push(`${stem}.mts`);
    if (managed) {
      assert.equal(wiring.imports, undefined, 'wire up additional CommonJS context if a recipe needs it');
      writeFileSync(join(consumer, `${stem}.cts`), `${withRequireImports(source)}\nexport = { ${wiring.exports} };\n`);
      files.cjs.push(`${stem}.cts`);
    }
  }
  return files;
}
