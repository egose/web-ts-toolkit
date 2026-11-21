import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

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
  'entry-types': { needsBoth: true },
};

export function writeReadmeExamples(readme, consumer, both) {
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
  const files = [];
  for (const [, name, source] of blocks) {
    const wiring = snippets[name];
    if (wiring.needsBoth && !both) continue;
    const filename = `readme-${name}.mts`;
    const pieces = [wiring.imports, source, wiring.exports && `export { ${wiring.exports} };`];
    writeFileSync(join(consumer, filename), `${pieces.filter(Boolean).join('\n')}\n`);
    files.push(filename);
  }
  return files;
}
