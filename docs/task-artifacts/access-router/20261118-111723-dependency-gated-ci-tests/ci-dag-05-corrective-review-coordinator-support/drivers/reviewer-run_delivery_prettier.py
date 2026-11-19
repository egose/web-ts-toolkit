"""One installed CLI check of seven reviewer-owned Markdown/JSON files only."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time

S = Path('_tmp-c5cr-5m91q69w')
B = Path('docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests')
D = B / 'ci-dag-05-corrective-review-support'
destination = S / 'deliverable-prettier.result.json'
if destination.exists():
    raise SystemExit('One-shot deliverable formatter result already exists')
paths = [B / 'ci-dag-05-corrective-review.md', D / 'README.md', *(D / name for name in ('inputs.json', 'checks.json', 'evidence-reconciliation.json', 'closing-integrity.json', 'delivery-check.json'))]
assert Path(os.environ['TMPDIR']).resolve() == Path.cwd() / S
def fp(path):
    raw = path.read_bytes()
    return {'path': str(path), 'mode': format(stat.S_IMODE(path.lstat().st_mode), '04o'), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
before = [fp(p) for p in paths]
command = ['pnpm', 'exec', 'prettier', '--check', '--config-path', '.prettierrc', *(str(p) for p in paths)]
started = datetime.now(timezone.utc).isoformat()
clock = time.monotonic()
result = subprocess.run(command, capture_output=True)
duration = time.monotonic() - clock
finished = datetime.now(timezone.utc).isoformat()
after = [fp(p) for p in paths]
streams = {}
for name, raw in (('stdout', result.stdout), ('stderr', result.stderr)):
    text = raw.decode('utf-8').replace(str(Path.cwd()), '<repo-root>').replace(str(Path.home()), '<user-home>')
    text = re.sub(r'\bses_[A-Za-z0-9_-]+', '<private-session-id>', text)
    retained = text.encode('utf-8')
    path = S / ('deliverable-prettier.' + name + '.log')
    if path.exists():
        raise SystemExit('One-shot deliverable formatter stream already exists')
    path.write_bytes(retained)
    streams[name] = {'path': str(path), 'rawBytes': len(raw), 'rawSha256': hashlib.sha256(raw).hexdigest(), 'retainedBytes': len(retained), 'retainedSha256': hashlib.sha256(retained).hexdigest(), 'transformation': 'UTF-8 decode; replace checkout/home absolute paths and private session IDs with placeholders; raw originals not persisted'}
record = {'reviewAlias': 'CI-DAG-05 fresh corrective-review session', 'command': command, 'recorderCommand': ['python3', str(S / 'run_delivery_prettier.py')], 'cwd': '.', 'runtimeTmpdir': "'<repo-root>/" + str(S) + "'", 'startedAt': started, 'finishedAt': finished, 'durationSeconds': duration, 'exitCode': result.returncode, 'result': 'PASS' if result.returncode == 0 and before == after else 'DELIVERABLE FORMAT FAILURE', 'selectedFiles': 7, 'markdownFiles': 2, 'jsonFiles': 5, 'excludedCompleteFailureStreams': 2, 'configInput': fp(Path('.prettierrc')), 'inputsBefore': before, 'inputsAfter': after, 'inputsUnchangedDuringRun': before == after, 'streams': streams, 'limits': 'Reviewer deliverables only; no maintained formatting rerun, tests, product imports, source/native/runner probes, installation or network. New summary metadata may be curated after this capture; own post-capture summary hash is not a self-seal.'}
destination.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({k: record[k] for k in ('result', 'exitCode', 'selectedFiles', 'inputsUnchangedDuringRun')}, indent=2))
raise SystemExit(0 if record['result'] == 'PASS' else 1)
