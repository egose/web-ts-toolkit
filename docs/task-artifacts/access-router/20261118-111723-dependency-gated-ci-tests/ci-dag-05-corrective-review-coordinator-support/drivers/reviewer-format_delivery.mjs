// Installed-formatter preview/verification of reviewer-owned deliverables only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as prettier from 'prettier';

const scratch = '_tmp-c5cr-5m91q69w';
const base = 'docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests';
const support = `${base}/ci-dag-05-corrective-review-support`;
const files = [
  `${base}/ci-dag-05-corrective-review.md`,
  `${support}/README.md`,
  ...['inputs.json', 'checks.json', 'evidence-reconciliation.json', 'closing-integrity.json', 'delivery-check.json'].map(
    (name) => `${support}/${name}`,
  ),
];
const [phase, destination] = process.argv.slice(2);
if (!['preview', 'verify'].includes(phase) || !destination.startsWith(`${scratch}/`) || fs.existsSync(destination)) {
  throw new Error('Invalid phase or non-fresh reviewer-scratch destination');
}
if (path.resolve(process.env.TMPDIR) !== path.resolve(scratch)) throw new Error('Invalid reviewer TMPDIR');
const startedAt = new Date().toISOString();
const config = JSON.parse(fs.readFileSync('.prettierrc', 'utf8'));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const records = [];
for (const file of files) {
  const before = fs.readFileSync(file);
  const formatted = Buffer.from(await prettier.format(before.toString('utf8'), { ...config, filepath: file }));
  const unchanged = before.equals(formatted);
  const record = {
    path: file,
    unchanged,
    inputBytes: before.length,
    inputSha256: sha256(before),
    formattedBytes: formatted.length,
    formattedSha256: sha256(formatted),
  };
  if (phase === 'preview' && !unchanged) {
    const proposal = `${scratch}/format-proposals/${file}`;
    if (fs.existsSync(proposal)) throw new Error('Formatter proposal already exists');
    fs.mkdirSync(path.dirname(proposal), { recursive: true });
    fs.writeFileSync(proposal, formatted);
    record.proposal = proposal;
  }
  records.push(record);
}
const result = {
  reviewAlias: 'CI-DAG-05 fresh corrective-review session',
  phase,
  startedAt,
  finishedAt: new Date().toISOString(),
  command: ['node', `${scratch}/format_delivery.mjs`, phase, destination],
  cwd: '.',
  runtimeTmpdir: `'<repo-root>/${scratch}'`,
  formatterVersion: prettier.version,
  selectedFiles: files.length,
  markdownFiles: 2,
  jsonFiles: 5,
  excludedCompleteFailureStreams: 2,
  result: phase === 'preview' ? 'PREVIEW ONLY' : records.every((record) => record.unchanged) ? 'PASS' : 'DELIVERABLE FORMAT DISCREPANCIES',
  records,
  limits: 'Installed formatter API; proposals written only to new reviewer scratch. No durable write, maintained formatting retry, tests, product imports, source/native/runner probes, installation or network. Failure logs are deliberately not formatter inputs.',
};
fs.writeFileSync(destination, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ phase, result: result.result, selectedFiles: files.length, changedPaths: records.filter((x) => !x.unchanged).map((x) => x.path) }, null, 2));
if (phase === 'verify' && result.result !== 'PASS') process.exitCode = 1;
