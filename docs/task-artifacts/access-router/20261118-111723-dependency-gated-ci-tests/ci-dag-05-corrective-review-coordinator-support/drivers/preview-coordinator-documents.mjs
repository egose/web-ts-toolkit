// New coordinator-document formatter preview only; no historical driver execution.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as prettier from 'prettier';

const scratch = '_tmp-c5cr-coord-3ovrro4e';
const bundle = 'docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests';
const support = `${bundle}/ci-dag-05-corrective-review-coordinator-support`;
const paths = [
  'docs/tasks/20261118-111723-dependency-gated-ci-tests.md',
  ...['ci-dag-05-remediation-coordination.md', 'ci-dag-05-corrective-review-handoff.md',
    'ci-dag-05-checkout-setup-handoff.md', 'ci-dag-05-handoff.md', 'ci-dag-05-local-evidence.md', 'README.md']
    .map((name) => `${bundle}/${name}`),
  `${support}/README.md`,
  `${support}/manifest.json`,
];
assert.equal(resolve(process.env.TMPDIR), resolve(scratch));
const destination = `${scratch}/coordinator-document-format-preview.json`;
assert.equal(existsSync(destination), false);
const startedAt = new Date().toISOString();
const config = JSON.parse(readFileSync('.prettierrc', 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const records = [];
for (const path of paths) {
  const input = readFileSync(path);
  const formatted = Buffer.from(await prettier.format(input.toString('utf8'), { ...config, filepath: path }));
  const unchanged = input.equals(formatted);
  const record = {
    path, unchanged, inputBytes: input.length, inputSha256: sha256(input),
    formattedBytes: formatted.length, formattedSha256: sha256(formatted),
  };
  if (!unchanged) {
    const proposal = `${scratch}/document-format-proposals/${path}`;
    assert.equal(existsSync(proposal), false);
    mkdirSync(dirname(proposal), { recursive: true });
    writeFileSync(proposal, formatted, { flag: 'wx' });
    record.proposal = proposal;
  }
  records.push(record);
}
const receipt = {
  ownerAlias: 'CI-DAG-05 remediation coordinator', phase: 'coordinator-document-preview',
  startedAt, finishedAt: new Date().toISOString(),
  command: ['node', `${scratch}/preview-coordinator-documents.mjs`],
  cwd: '.', runtimeTmpdir: `'<repo-root>/${scratch}'`, formatterVersion: prettier.version,
  result: 'PREVIEW ONLY', markdownFiles: 8, jsonFiles: 1, records,
  excluded: 'All maintained source/workflow paths, unchanged reviewer deliverables and 21 immutable captured receipt/driver copies',
  limits: 'Installed formatter API on seven authorized coordinator updates plus the new coordinator index/manifest. Proposals are new scratch writes only; no durable mutation, historical/maintained check rerun, tests, source/native/runner probes, installation or network.',
};
writeFileSync(destination, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  result: receipt.result, selectedFiles: paths.length,
  changedPaths: records.filter((record) => !record.unchanged).map((record) => record.path),
}, null, 2));
