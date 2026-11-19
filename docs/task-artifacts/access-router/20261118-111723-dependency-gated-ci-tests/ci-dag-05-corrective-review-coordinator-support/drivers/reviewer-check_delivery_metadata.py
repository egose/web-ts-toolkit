"""Final read-only reviewer-summary/protected-scope check; no product/helper execution."""

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from urllib.parse import unquote

ROOT = Path.cwd()
S = Path('_tmp-c5cr-5m91q69w')
B = Path('docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests')
D = B / 'ci-dag-05-corrective-review-support'
REPORT = B / 'ci-dag-05-corrective-review.md'
OWN = D / 'delivery-check.json'
checks = 0
problems = []
references = 0


def require(value, label):
    global checks
    checks += 1
    if not value:
        problems.append(label)


def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError('Duplicate JSON key: ' + key)
        result[key] = value
    return result


def load(path):
    return json.loads(Path(path).read_text(), object_pairs_hook=pairs)


def fp(path):
    p = Path(path)
    info = p.lstat()
    require(stat.S_ISREG(info.st_mode), 'Regular file: ' + str(p))
    raw = p.read_bytes()
    return {'path': str(p), 'mode': format(stat.S_IMODE(info.st_mode), '04o'), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}


def verify_fingerprints(value):
    global references
    if isinstance(value, dict):
        if {'path', 'bytes', 'sha256'}.issubset(value):
            observed = fp(value['path'])
            require(all(value[key] == observed[key] for key in ('mode', 'bytes', 'sha256') if key in value), 'Exact recorded fingerprint: ' + value['path'])
            references += 1
        for nested in value.values():
            verify_fingerprints(nested)
    elif isinstance(value, list):
        for nested in value:
            verify_fingerprints(nested)


def common(summary, source, label, skip=()):
    for key in (summary.keys() & source.keys()) - set(skip):
        require(summary[key] == source[key], label + ': ' + key)


def git(*args):
    return subprocess.run(['git', *args], capture_output=True, env=dict(os.environ, GIT_OPTIONAL_LOCKS='0'))


def protected_scope():
    snapshot_path = B / 'ci-dag-05-corrective-review-inputs.json'
    snapshot_fp = fp(snapshot_path)
    require(snapshot_fp['bytes'] == 610017 and snapshot_fp['mode'] == '0644' and snapshot_fp['sha256'] == 'ad378fec69c87bb1b750c9f1bb3b47b23861ebf4f1d40a3aabb9ebe4678ef696', 'Exact immutable snapshot')
    if problems:
        raise RuntimeError('STOP: immutable snapshot drift')
    snapshot = load(snapshot_path)
    canonical = lambda value: json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    require(len(snapshot['files']) == snapshot['protectedRegularFiles'] == 2771, 'Protected table size')
    require(hashlib.sha256(canonical(snapshot['files'])).hexdigest() == snapshot['filesTableSha256'], 'Protected table canonical hash')
    for name in ('files', 'historicalProtectedInputs', 'reviewedMaintainedFingerprints'):
        for path, expected in snapshot[name].items():
            observed = fp(path)
            require(expected == {key: observed[key] for key in expected}, 'Protected bytes/mode: ' + path)
    for label in ('readinessCheck', 'coordinatorReadinessDriver'):
        for side in ('source', 'archive'):
            expected = snapshot[label][side]
            require(fp(expected['path']) == expected, 'Readiness pair: ' + label + '.' + side)
    head = git('rev-parse', 'HEAD')
    refs = git('for-each-ref', '--format=%(objectname) %(refname)')
    status = git('status', '--short')
    require(head.returncode == refs.returncode == status.returncode == 0, 'Read-only Git identity commands')
    require(head.stdout.decode().strip() == snapshot['head'], 'HEAD unchanged')
    require(hashlib.sha256(refs.stdout).hexdigest() == snapshot['projectRefsSha256'], 'Refs unchanged')
    require(status.stdout.decode().splitlines() == snapshot['gitStatus'], 'Git status unchanged')
    names = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
    require(names.returncode == 0, 'Read-only visible inventory command')
    names = sorted(set(names.stdout.decode().split('\0')) - {''})
    nonregular = {p: {'mode': format(stat.S_IMODE(Path(p).lstat().st_mode), '04o')} for p in names if not stat.S_ISREG(Path(p).lstat().st_mode)}
    require(nonregular == snapshot['nonRegularGitVisiblePaths'], 'Nonregular inventory unchanged')
    additions = sorted(set(names) - set(snapshot['files']))
    allowed = {str(snapshot_path), snapshot['allowedCoordinatorNewAssignmentRecord'], snapshot['allowedReviewerNewFile']}
    require(not [p for p in additions if p not in allowed and not p.startswith(snapshot['allowedReviewerNewEvidencePrefix'])], 'Only authorized visible additions')
    require(git('check-ignore', '--', str(S)).returncode == 0 and Path(os.environ['TMPDIR']).resolve() == ROOT / S, 'Ignored reviewer scratch and absolute runtime TMPDIR')
    if problems:
        raise RuntimeError('STOP: protected-input or checkout-scope drift')
    return snapshot, additions


def metadata(snapshot, additions):
    summary = load(OWN)
    closing = load(D / 'closing-integrity.json')
    verify_fingerprints(summary)
    verify_fingerprints(closing)
    original_closing = load(closing['originalRecord']['path'])
    common(closing, original_closing, 'Closing inventory projection')
    common(closing['supportFinalizationResume'], load(closing['supportFinalizationResume']['originalRecord']['path']), 'Resume inventory projection')
    receipts = {}
    for name in ('recordsAudit', 'formatPreview', 'deliverablePrettier', 'contentClosure', 'deliveryProtectedScope'):
        record = summary[name]
        original = load(record['originalRecord']['path'])
        receipts[name] = original
        skip = ('streams',) if name == 'deliverablePrettier' else ('selection',) if name == 'contentClosure' else ()
        common(record, original, name, skip)
        require(record['invocationCount'] == 1, name + ': single recorded phase invocation')
        if 'exitCode' in record:
            require(record['exitCode'] == 0 and original['result'] == 'PASS', name + ': actual successful receipt')
    manifest = summary['recordedFingerprintManifest']
    content = receipts['contentClosure']
    require(manifest == content['selection']['fingerprintsExcludingOwnSummary'], 'Exact eight-file final manifest from content receipt')
    require(summary['contentClosure']['selection'] == {key: value for key, value in content['selection'].items() if key != 'fingerprintsExcludingOwnSummary'}, 'Content selection and counts')
    require(summary['recordsAudit']['selection'] == receipts['recordsAudit']['selection'], 'Initial 449-check selection')
    cli = receipts['deliverablePrettier']
    require(cli['inputsBefore'] == cli['inputsAfter'] and cli['inputsUnchangedDuringRun'], 'Formatter did not mutate inputs')
    require([entry['path'] for entry in cli['inputsBefore']] == cli['command'][6:], 'Exact seven CLI formatter paths')
    own_old = summary['deliverablePrettier']['ownSummaryAtCliCapture']
    require({key: own_old[key] for key in ('mode', 'bytes', 'sha256')} == {key: cli['inputsBefore'][-1][key] for key in ('mode', 'bytes', 'sha256')} and own_old['historicalPath'] == str(OWN), 'Historical own-summary hash is labeled, not treated as current')
    require(cli['inputsBefore'][:-1] == [entry for entry in manifest if not entry['path'].endswith('.log')], 'Six other formatter inputs are final manifest inputs')
    for name, stream in summary['deliverablePrettier']['streams'].items():
        original = cli['streams'][name]
        require(stream['path'] == original['path'] and stream['bytes'] == original['rawBytes'] == original['retainedBytes'] and stream['sha256'] == original['rawSha256'] == original['retainedSha256'], 'Exact CLI original/retained stream: ' + name)
        if 'excerptLines' in stream:
            require(stream['excerptLines'] == Path(stream['path']).read_text().splitlines(), 'Labeled complete CLI stdout lines')
    preview = receipts['formatPreview']
    changed = [Path(entry['path']).name for entry in preview['records'] if not entry['unchanged']]
    require(changed == summary['formatPreview']['changedOwnedSelections'] == ['inputs.json', 'checks.json'], 'Exactly two reviewer-owned formatting changes')
    for entry in preview['records']:
        if not entry['unchanged']:
            require(fp(entry['path'])['sha256'] == entry['formattedSha256'] and Path(entry['path']).read_bytes() == Path(entry['proposal']).read_bytes(), 'Exact formatter proposal applied: ' + entry['path'])
    seals = [load(p) for p in S.glob('*seal.json')]
    closing_count = closing['inventoryRecordCountAtCapture']
    require(sum(item['finishedAt'] <= original_closing['finishedAt'] for item in seals) == closing_count['total'] == 55, '55 inventory receipts at closing capture')
    scope = receipts['deliveryProtectedScope']
    scope_count = summary['deliveryProtectedScope']['inventoryRecordsAtCapture']
    require(sum(item['finishedAt'] <= scope['finishedAt'] for item in seals) == scope_count['total'] == 56 and scope_count['throughClosingInventory'] == 55 and scope_count['laterDeliveryScope'] == 1, '56 inventory receipts at later scope capture')
    created = re.search(r'Created: \*\*([^*]+)\*\*', REPORT.read_text()).group(1)
    require(sum(item['finishedAt'] < created for item in seals) == closing_count['beforeReportCreation'] == scope_count['beforeReportCreation'] == 52, '52 receipts before report creation')
    require(all(item['result'] == 'PASS' and not item['problems'] for item in seals), 'All retained standalone inventory receipts passed')
    require(scope['allowedGitVisibleAdditions'] == additions == original_closing['allowedGitVisibleAdditions'], 'Captured and current authorized addition names identical')
    require(len(additions) == 11 and summary['deliveryProtectedScope']['reviewerOwnedAdditionCount'] == closing['reviewerOwnedAdditionCount'] == 9 and summary['deliveryProtectedScope']['otherPermittedAdditionCount'] == 2, 'Nine reviewer plus two separate permitted additions')
    final_format = load(S / 'delivery-final-format.json')
    require(final_format['command'] == summary['postCaptureChecks']['formatCommand'] and final_format['result'] == 'PASS' and final_format['selectedFiles'] == 7, 'Actual successful post-curation formatter receipt')
    require(final_format['formatterVersion'] == preview['formatterVersion'], 'Same installed formatter version')
    for entry in final_format['records']:
        current = fp(entry['path'])
        require(entry['unchanged'] and current['bytes'] == entry['inputBytes'] == entry['formattedBytes'] and current['sha256'] == entry['inputSha256'] == entry['formattedSha256'], 'Final formatter receipt matches current file: ' + entry['path'])
    require(summary['postCaptureChecks']['metadataCommand'] == ['python3', str(S / 'check_delivery_metadata.py'), sys.argv[1]], 'Actual metadata command matches declared post-capture command')
    require(summary['capturedResult'].startswith('PASS for the checks below only;') and 'CHANGES REQUIRED / BLOCKED' in summary['capturedResult'], 'Captured passes do not override review verdict')
    require(summary['contentRecorder']['sha256'] == '77d14340857673bd7ee687c3922481a848b7af9593d4cc117ce526539e162caa', 'Original 449/591-check driver unchanged')
    files = [Path(item['path']) for item in manifest] + [OWN]
    visible = git('ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', str(REPORT), str(D))
    require(visible.returncode == 0 and sorted(set(visible.stdout.decode().split('\0')) - {''}) == sorted(str(p) for p in files), 'Exactly nine final reviewer-owned files')
    require(git('check-ignore', '--', *(str(p) for p in files)).returncode == 1, 'All nine final destinations unignored')
    links = 0
    anchors = 0
    for p in files:
        raw = p.read_bytes()
        text = raw.decode('utf-8')
        require(raw.endswith(b'\n') and b'\r' not in raw and b'\x00' not in raw, 'UTF-8/LF/newline/NUL: ' + str(p))
        require(not any(line.rstrip(' \t') != line for line in text.splitlines()), 'Whitespace: ' + str(p))
        require(not re.search(r'/(?:home|Users|tmp|var/tmp|root)/|\bses_[A-Za-z0-9_-]+|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bBearer\s+[A-Za-z0-9._-]{20,}', text), 'Privacy patterns: ' + str(p))
        if p.suffix == '.json':
            load(p)
            require(True, 'Strict duplicate-key-free JSON: ' + str(p))
        if p.suffix == '.md':
            for target in re.findall(r'\[[^\]]*\]\(([^\s)]+)\)', text):
                parts = unquote(target).split('#', 1)
                destination = (p.parent / parts[0]).resolve() if parts[0] else p.resolve()
                require(not re.match(r'^[a-zA-Z]+:', parts[0]) and destination.is_file() and destination.is_relative_to(ROOT), 'Local link resolves: ' + target)
                links += 1
                if len(parts) == 2:
                    headings = [re.sub(r'[^\w -]', '', heading.lower()).strip().replace(' ', '-') for heading in re.findall(r'^#{1,6}\s+(.+)$', destination.read_text(), re.M)]
                    require(parts[1] in headings, 'Local anchor resolves: ' + target)
                    anchors += 1
    require(links == 31 and anchors == 1, 'Final link/anchor counts unchanged')
    diff = git('diff', '--check', '--', str(REPORT), str(D))
    require(diff.returncode == 0 and not diff.stdout and not diff.stderr, 'Scoped git diff --check plus explicit new-file whitespace scan')
    require(summary['deliveryProtectedScope']['observedProtectedFilesTableSha256'] == snapshot['filesTableSha256'], 'Final scope table identity')
    return {'files': 9, 'markdownFiles': 2, 'jsonFiles': 5, 'failureStreams': 2, 'localLinks': links, 'anchors': anchors, 'reviewedReceiptReferences': references, 'standaloneInventoryReceipts': len(seals), 'protectedRegularFiles': 2771, 'maintainedFingerprints': 24, 'historicalSeals': 33, 'formatterInputs': 7, 'finalSummaryFingerprint': fp(OWN), 'reportFingerprint': fp(REPORT)}


def main():
    destination = Path(sys.argv[1])
    if not destination.is_relative_to(S) or destination.exists():
        raise SystemExit('Fresh reviewer-scratch destination required')
    started = datetime.now(timezone.utc).isoformat()
    selection = {}
    try:
        snapshot, additions = protected_scope()
        selection = metadata(snapshot, additions)
    except (OSError, ValueError, RuntimeError, KeyError) as error:
        problems.append(str(error).replace(str(ROOT), '<repo-root>').replace(str(Path.home()), '<user-home>'))
    result = {'reviewAlias': 'CI-DAG-05 fresh corrective-review session', 'phase': 'post-curation-final-metadata', 'command': ['python3', str(S / 'check_delivery_metadata.py'), str(destination)], 'cwd': '.', 'runtimeTmpdir': "'<repo-root>/" + str(S) + "'", 'startedAt': started, 'finishedAt': datetime.now(timezone.utc).isoformat(), 'result': 'PASS' if not problems else 'STOP: FINAL METADATA OR PROTECTED-SCOPE DISCREPANCY', 'checks': checks, 'problems': problems, 'selection': selection, 'limits': 'Final reviewer-owned deliverables, existing read-only receipts and immutable protected scope only. No product imports, tests, original historical/helper execution, source/native/runner probes, build/resource/install/fetch/hosted/publication/settings operation. This external receipt is after summary curation; no deliverable was written and no self-seal is claimed.'}
    destination.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({key: result[key] for key in ('phase', 'result', 'checks', 'problems', 'selection')}, indent=2))
    return 0 if not problems else 1


if __name__ == '__main__':
    raise SystemExit(main())
