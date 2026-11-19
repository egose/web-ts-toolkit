"""Serial reviewer check recorder. One invocation per label; no retry or installation."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time

ROOT = Path.cwd()
SCRATCH = Path('_tmp-c5cr-5m91q69w')
BUNDLE = Path('docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests')
SNAPSHOT = BUNDLE / 'ci-dag-05-corrective-review-inputs.json'
SNAPSHOT_SHA = 'ad378fec69c87bb1b750c9f1bb3b47b23861ebf4f1d40a3aabb9ebe4678ef696'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()


def scrub(text):
    text = text.replace(str(ROOT), '<repo-root>').replace(str(Path.home()), '<user-home>')
    return re.sub(r'\bses_[A-Za-z0-9_-]+', '<private-session-id>', text)


def fingerprint(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise RuntimeError('Not a regular input: ' + scrub(str(path)))
    data = path.read_bytes()
    return {'mode': f'{stat.S_IMODE(info.st_mode):04o}', 'bytes': len(data), 'sha256': sha(data)}


def match_snapshot():
    actual_snapshot = fingerprint(SNAPSHOT)
    if actual_snapshot != {'mode': '0644', 'bytes': 610017, 'sha256': SNAPSHOT_SHA}:
        raise RuntimeError('STOP: immutable snapshot drift')
    data = json.loads(SNAPSHOT.read_text())
    actual = {path: fingerprint(Path(path)) for path in data['files']}
    drift = [path for path, value in actual.items() if value != data['files'][path]]
    if drift:
        raise RuntimeError('STOP: protected-input drift: ' + ', '.join(drift))
    return data, {'immutableSnapshot': {'path': str(SNAPSHOT), **actual_snapshot},
                  'protectedRegularFiles': len(actual), 'filesTableSha256': sha(canonical(actual)),
                  'maintainedInputs': {path: actual[path] for path in data['reviewedMaintainedFingerprints']},
                  'groupValidationInputs': {path: actual[path] for path in ('scripts/test-groups.mjs', 'scripts/test-groups.test.mjs')},
                  'validationAndQualityConfigInputs': {path: actual[path] for path in ('package.json', 'pnpm-lock.yaml', '.tool-versions', '.prettierrc', 'eslint.config.mjs')},
                  'head': data['head'], 'projectRefsSha256': data['projectRefsSha256']}


def main():
    label = sys.argv[1]
    data, inputs_before = match_snapshot()
    maintained = sorted(data['reviewedMaintainedFingerprints'])
    code = [path for path in maintained if path.endswith(('.mjs', '.ts', '.mts', '.cts', '.js'))]
    commands = {
        'static-review': ['node', str(SCRATCH / 'static-review.mjs'), str(SCRATCH / 'static-review.json')],
        'ci-contract-check': ['pnpm', 'test:ci:check'],
        'group-validation-check': ['pnpm', 'test:groups:check'],
        'targeted-eslint': ['pnpm', 'exec', 'eslint', *code],
        'maintained-prettier': ['pnpm', 'exec', 'prettier', '--check', '--config-path', '.prettierrc', *maintained],
        'verified-actionlint': ['_tmp-ci-dag-04-accept-HHjMox/actionlint/actionlint', '-shellcheck=', '-pyflakes=', '.github/workflows/test.yml'],
    }
    if label not in commands:
        raise RuntimeError('Not an authorized recorder label')
    if label == 'group-validation-check' and not (SCRATCH / 'ci-contract-check.result.json').exists():
        raise RuntimeError('CI validation must finish before group validation')
    command = commands[label]
    reservation = SCRATCH / f'{label}.started.json'
    started = datetime.now(timezone.utc).isoformat()
    with reservation.open('x') as stream:
        json.dump({'label': label, 'startedAt': started, 'command': command,
                   'inputsBefore': inputs_before}, stream, indent=2)
        stream.write('\n')
    provenance = None
    if label == 'verified-actionlint':
        import tarfile
        archive = Path('_tmp-ci-dag-04-accept-HHjMox/actionlint/actionlint.tar.gz')
        binary = Path(command[0])
        archive_fp, binary_fp = fingerprint(archive), fingerprint(binary)
        with tarfile.open(archive, 'r:gz') as tar:
            member = tar.getmember('actionlint')
            member_bytes = tar.extractfile(member).read() if member.isfile() else b''
        if (archive_fp['sha256'] != '023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757'
                or binary_fp['sha256'] != '9f7dedb4e23f89f2922073d1a6720405b7b520d4f5832ebb96f0d55a2958886c'
                or binary_fp['mode'] != '0755' or member.mode != 0o755 or member_bytes != binary.read_bytes()):
            raise RuntimeError('STOP: installed actionlint provenance mismatch before execution')
        provenance = {'archive': {'path': str(archive), **archive_fp}, 'binary': {'path': str(binary), **binary_fp},
                      'archiveMember': {'name': member.name, 'mode': f'{member.mode:04o}', 'bytes': len(member_bytes), 'sha256': sha(member_bytes)},
                      'limits': 'Local equality to historical checksum pin, not new network/signature verification. Optional shellcheck/pyflakes are explicitly disabled.'}
    env = dict(os.environ, TMPDIR=str(ROOT / SCRATCH), GIT_OPTIONAL_LOCKS='0', COREPACK_ENABLE_NETWORK='0')
    if subprocess.run(['git', 'check-ignore', '--', str(SCRATCH)], capture_output=True).returncode:
        raise RuntimeError('Review scratch is not ignored')
    clock = time.monotonic()
    completed = subprocess.run(command, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    elapsed = time.monotonic() - clock
    streams = {}
    for name, raw in (('stdout', completed.stdout), ('stderr', completed.stderr)):
        path = SCRATCH / f'{label}.{name}.log'
        text = scrub(raw.decode('utf8', errors='replace'))
        path.write_text(text)
        streams[name] = {'path': str(path), 'rawBytes': len(raw), 'rawSha256': sha(raw),
                         'retainedBytes': len(text.encode()), 'retainedSha256': sha(text.encode()),
                         'transformation': 'UTF-8 text; replace checkout/home absolute paths and private session IDs with placeholders; originals not persisted'}
    _, inputs_after = match_snapshot()
    output = (SCRATCH / f'{label}.stdout.log').read_text()
    counts = {}
    for key, number in re.findall(r'^(?:# |ℹ )(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+([\d.]+)', output, re.M):
        counts[key] = float(number) if '.' in number else int(number)
    result = {'reviewAlias': 'CI-DAG-05 fresh corrective-review session', 'label': label, 'command': command,
              'recorderCommand': ['python3', str(SCRATCH / 'run_review_check.py'), label],
              'cwd': '.', 'tmpdir': f"'<repo-root>/{SCRATCH}'", 'startedAt': started,
              'finishedAt': datetime.now(timezone.utc).isoformat(), 'durationSeconds': round(elapsed, 6),
              'exitCode': completed.returncode if completed.returncode >= 0 else None,
              'signalNumber': -completed.returncode if completed.returncode < 0 else None,
              'counts': counts or None, 'inputsBefore': inputs_before, 'inputsAfter': inputs_after,
              'inputsUnchangedDuringRun': inputs_before == inputs_after, 'streams': streams,
              'actionlintProvenance': provenance,
              'scope': {'selected': code if label == 'targeted-eslint' else maintained if label == 'maintained-prettier'
                        else ['scripts/ci-test-plan.test.mjs', 'scripts/ci-test-artifacts.test.mjs',
                              'scripts/ci-test-workspace.test.mjs', 'scripts/ci-test-results.test.mjs',
                              'scripts/ci-test-checkout.test.mjs', 'scripts/ci-test-plan.mjs --check',
                              'scripts/ci-test-plan.mjs --check-workflow .github/workflows/test.yml'] if label == 'ci-contract-check'
                        else ['scripts/test-groups.test.mjs', 'scripts/test-groups.mjs --check'] if label == 'group-validation-check'
                        else ['.github/workflows/test.yml'] if label == 'verified-actionlint'
                        else ['all eight R2 maintained files and five saved preimages; graph/evaluator/workflow/package metadata static comparison'],
                        'skipped': ['all package/focused/pack/consumer lanes', 'all workspace builds/full suites/resources',
                                    'standalone source/native-short-root/Node-20/runner/hosted probes',
                                    'installations/fetches/history/config/ref changes'],
                        'limits': 'One recorded command, no retry. CI validation alone may execute maintained synthetic checkout fixtures; no package lanes, builds, resources, native/runner probes or network/install commands.'}}
    destination = SCRATCH / f'{label}.result.json'
    with destination.open('x') as stream:
        json.dump(result, stream, indent=2, ensure_ascii=False)
        stream.write('\n')
    print(json.dumps({'label': label, 'exitCode': result['exitCode'], 'signalNumber': result['signalNumber'],
                      'durationSeconds': result['durationSeconds'], 'counts': result['counts'],
                      'inputsUnchangedDuringRun': result['inputsUnchangedDuringRun'], 'result': str(destination)}, indent=2))
    if completed.returncode or inputs_before != inputs_after:
        print(output[-6000:])
        print((SCRATCH / f'{label}.stderr.log').read_text()[-3000:])
    return 0 if completed.returncode == 0 and inputs_before == inputs_after else 1


if __name__ == '__main__':
    raise SystemExit(main())
