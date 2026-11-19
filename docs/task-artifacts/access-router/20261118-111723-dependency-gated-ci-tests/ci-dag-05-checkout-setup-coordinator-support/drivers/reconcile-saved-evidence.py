"""Coordinator saved-evidence checks only; never import or execute project code."""
import datetime
import difflib
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import tempfile

assert sys.argv[1:] == ['--setup-idle-evidence']
ROOT = pathlib.Path.cwd().resolve(strict=True)
OWNER = ROOT / '_tmp-c5f-ovtrnV'
SCRATCH = pathlib.Path(tempfile.mkdtemp(prefix='setup-evidence-', dir=OWNER))
os.environ['TMPDIR'] = str(SCRATCH)
BUNDLE = ROOT / 'docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests'
SUPPORT = BUNDLE / 'ci-dag-05-checkout-setup-support'
REPORT = BUNDLE / 'ci-dag-05-checkout-setup.md'
R1_TEST = 'scripts/ci-test-workspace.test.mjs'
RAW_FIXTURE = 'https://' + 'user:secret' + '@example.org/'
REDACTED_FIXTURE = 'https://example.org/<redacted-synthetic-auth>/'
STARTED_AT = datetime.datetime.now(datetime.timezone.utc).isoformat()
GIT_COMMANDS = []


def rel(path):
    return path.relative_to(ROOT).as_posix()


def data(path):
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode), 'Not a regular file: ' + rel(path)
    return path.read_bytes()


def fp(path):
    value = data(path)
    return {'mode': format(stat.S_IMODE(path.lstat().st_mode), '04o'),
            'bytes': len(value), 'sha256': hashlib.sha256(value).hexdigest()}


def repo_path(name):
    path = pathlib.PurePosixPath(name)
    assert not path.is_absolute() and '..' not in path.parts and path.as_posix() == name
    assert not any(char in name for char in ['\0', '\n', '\r'])
    return ROOT / name


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, 'Duplicate JSON key: ' + key
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError('Nonfinite JSON value: ' + value)


def load(path):
    return json.loads(data(path), object_pairs_hook=unique_keys, parse_constant=reject_constant)


def verified(record):
    path = repo_path(record['path'])
    assert fp(path) == {key: record[key] for key in ['mode', 'bytes', 'sha256']}, record['path']
    return path


def scrub(text):
    text = text.replace(str(ROOT), '<repo-root>').replace(str(pathlib.Path.home()), '<user-home>')
    text = re.sub(r'\bses_[A-Za-z0-9_-]+', '<private-session-id>', text)
    return text.replace(RAW_FIXTURE, REDACTED_FIXTURE)


def git(args, expected=0, stdin=None):
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = subprocess.run(['git', '--no-optional-locks', *args], cwd=ROOT,
                            input=stdin, capture_output=True, check=False)
    GIT_COMMANDS.append({'command': ['git', '--no-optional-locks', *args],
                         'startedAt': started, 'exitCode': result.returncode,
                         'stdoutSha256': hashlib.sha256(result.stdout).hexdigest(),
                         'stderr': scrub(result.stderr.decode())})
    assert result.returncode == expected, scrub(result.stdout.decode() + result.stderr.decode())
    return result.stdout


def main():
    git(['check-ignore', rel(SCRATCH)])
    byte_record = OWNER / 'setup-stage2-reconcile-wC6ozM/coordinator-reconciliation.json'
    assert fp(byte_record)['sha256'] == '30941803b7f15af7cc44be9f742be0c95a0a2148bf65675c8f5b562927101253'
    byte_scope = load(byte_record)
    baseline_path = OWNER / 'setup-stage2-oLp7U1/baseline.json'
    baseline = load(baseline_path)
    assert fp(baseline_path)['sha256'] == 'ed5906c0c6c97b52055bcb9edae0c93120bd379446b7a33b8e2b5ff8fd164c45'
    assert git(['rev-parse', 'HEAD']).decode().strip() == baseline['head']
    assert hashlib.sha256(git(['for-each-ref', '--format=%(objectname) %(refname)'])).hexdigest() == baseline['projectRefsSha256']
    status = git(['status', '--short']).decode().splitlines()
    assert set(baseline['inheritedStatus']).issubset(status), 'Inherited status was not retained'
    for name, expected in baseline['historicalInputsAndSeals'].items():
        assert fp(repo_path(name)) == expected, 'Historical seal: ' + name

    paths = [REPORT]
    for directory, dirs, files in os.walk(SUPPORT, followlinks=False):
        base = pathlib.Path(directory)
        assert stat.S_ISDIR(base.lstat().st_mode)
        for name in dirs:
            assert stat.S_ISDIR((base / name).lstat().st_mode)
        paths.extend(base / name for name in files)
    paths.sort()
    captured = {rel(path): fp(path) for path in paths}
    assert len(captured) == len(paths)
    assert captured == {name: expected for name, expected in byte_scope['deliveryFingerprints'].items()
                        if name == rel(REPORT) or name.startswith(rel(SUPPORT) + '/')}
    privacy = [r'/(?:home|Users)/[A-Za-z0-9._-]+(?:/|\b)',
               r'/(?:tmp|private/tmp)/(?:opencode|[A-Za-z0-9._-]+)(?:/|\b)',
               r'\bses_[A-Za-z0-9_-]{8,}\b', r'\bgh[pousr]_[A-Za-z0-9]{20,}\b',
               r'\bgithub_pat_[A-Za-z0-9_]{20,}\b', r'-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----',
               r'https?://[^\s/]+:[^\s/]+@']
    json_count = 0
    for path in paths:
        text = data(path).decode('utf-8')
        assert '\0' not in text
        assert not any(re.search(pattern, text) for pattern in privacy), 'Privacy pattern: ' + rel(path)
        if path.suffix == '.json':
            load(path)
            json_count += 1
    assert git(['check-ignore', '-z', '--stdin'], 1,
               b''.join(name.encode() + b'\0' for name in captured)) == b''

    provenance_paths = [SUPPORT / 'manifest.json', *sorted((SUPPORT / 'delivery').glob('provenance-*.json'))]
    provenances = [load(path) for path in provenance_paths]
    assert len(provenances[0]['sourceArchiveProvenance']) == 132
    archives = set()
    sources = set()
    differences = []
    for provenance in provenances:
        assert provenance['selfReferenceLimit']
        for entry in provenance['sourceArchiveProvenance']:
            archive = verified(entry['archive'])
            assert archive.is_relative_to(SUPPORT) and rel(archive) not in archives
            archives.add(rel(archive))
            assert entry['transformation']
            if 'source' not in entry:
                continue
            source = verified(entry['source'])
            sources.add(rel(source))
            assert data(archive) == scrub(data(source).decode('utf-8')).encode('utf-8'), 'Transformation: ' + rel(archive)
            if entry['transformation'].startswith('Byte-exact copy;'):
                assert data(archive) == data(source)
            if entry['source']['sha256'] != entry['archive']['sha256']:
                differences.append({'source': entry['source'], 'archive': entry['archive'],
                                    'transformation': entry['transformation']})
    authored = {rel(REPORT), rel(SUPPORT / 'README.md'), rel(SUPPORT / 'drivers/validate-delivery.py')}
    metadata = set(map(rel, provenance_paths))
    assert set(captured) - archives == authored | metadata

    fingerprints = load(SUPPORT / 'fingerprints.json')
    source_index = load(SUPPORT / 'sources/manifest.json')
    final_ci = load(repo_path(fingerprints['capturedFrom']))
    preflight = load(repo_path(fingerprints['preflight']))
    assert preflight['files'] == baseline['files']
    assert final_ci['status'] == 0 and final_ci['signal'] is None
    assert final_ci['inputsBefore'] == final_ci['inputsAfter'] == fingerprints['after']
    assert len(fingerprints['after']) == len(fingerprints['before']) == 13
    assert fingerprints['before'] == {name: baseline['files'].get(name) for name in fingerprints['after']}
    assert sum(value is None for value in fingerprints['before'].values()) == 3
    amendment = load(BUNDLE / 'ci-dag-05-checkout-setup-contract-amendment.json')
    reconstructed = {'before': {}, 'after': {}}
    combined_diff = ''
    for name in sorted(fingerprints['after']):
        assert fp(repo_path(name)) == fingerprints['after'][name] == byte_scope['deliveryFingerprints'][name]
        for phase in ['before', 'after']:
            expected = fingerprints[phase][name]
            if expected is None:
                assert name not in source_index[phase]
                reconstructed[phase][name] = b''
                continue
            snapshot = verified(source_index[phase][name])
            value = data(snapshot)
            if name == R1_TEST:
                assert value.count(REDACTED_FIXTURE.encode()) == 1
                value = value.replace(REDACTED_FIXTURE.encode(), RAW_FIXTURE.encode())
            assert {**fp(snapshot), 'bytes': len(value), 'sha256': hashlib.sha256(value).hexdigest()} == expected
            reconstructed[phase][name] = value
        before, after = reconstructed['before'][name], reconstructed['after'][name]
        delta = ''.join(difflib.unified_diff(before.decode().splitlines(True), after.decode().splitlines(True),
                                           fromfile='stage2-preflight/' + name if before else '/dev/null',
                                           tofile='selected-final/' + name))
        combined_diff += delta
        if name == R1_TEST:
            old, new = (amendment['allowedChange'][key].encode() for key in ['previousLine', 'replacementLine'])
            assert before.count(old) == 1 and after == before.replace(old, new)
            assert data(SUPPORT / 'sources/r1-one-line.diff') == delta.encode()
    assert data(SUPPORT / 'sources/maintained.diff') == combined_diff.encode()
    results_changes = [
        ("    assert.equal(job.steps[1].with.workspace, node.workspace);",
         "    assert.deepEqual(job.steps[1], { id: 'source', uses: './.github/actions/ci-checkout' });\n    assert.equal(job.steps[2].with.workspace, node.workspace);"),
        ("    env: { CI_TEST_NEEDS: '${{ toJSON(needs) }}' },",
         "    'working-directory': '${{ steps.source.outputs.root }}',\n    env: { TMPDIR: '${{ steps.source.outputs.tmpdir }}', CI_TEST_NEEDS: '${{ toJSON(needs) }}' },"),
    ]
    expected_results = reconstructed['before']['scripts/ci-test-results.test.mjs'].decode()
    for old, new in results_changes:
        assert expected_results.count(old) == 1
        expected_results = expected_results.replace(old, new)
    assert expected_results.encode() == data(ROOT / 'scripts/ci-test-results.test.mjs')
    rows = {name: {'mode': '0644', 'bytes': int(size.replace(',', '')), 'sha256': digest}
            for name, size, digest in re.findall(r'^\|\s+`([^`]+)`\s+\|\s+([\d,]+)\s+\|\s+`([0-9a-f]{64})`\s+\|\s*$', data(REPORT).decode(), re.M)}
    assert rows == fingerprints['after']
    for directory, snapshots in source_index['historicalIntermediate'].items():
        record = load(SUPPORT / 'observations' / directory / 'result.json')
        for name, snapshot in snapshots.items():
            archived = verified(snapshot)
            if 'inputsBefore' in record:
                assert fp(archived) == record['inputsBefore'][name]

    initial = load(SUPPORT / 'observations.json')['observations']
    assert len(initial) == 26 and sum(item['status'] != 0 for item in initial) == 11
    observations = [*initial, *(item for p in provenances[1:] for item in p['observations'])]
    observations.sort(key=lambda item: item['startedAt'])
    summaries = []
    raw_sources = set()
    previous_finish = None
    for item in observations:
        record = load(verified(item['result']))
        for key in ['label', 'command', 'cwd', 'tmpdir', 'startedAt', 'finishedAt', 'durationMs', 'status', 'signal', 'error']:
            assert item[key] == record[key], item['label'] + ': ' + key
        assert item['inputFingerprintCount'] == len(record.get('inputsBefore', {}))
        if 'inputsBefore' in record:
            assert item['inputsUnchangedDuringRun'] == (record['inputsBefore'] == record['inputsAfter'])
        counts = {}
        for stream, stream_record in item['streams'].items():
            archived = verified(stream_record['archive'])
            if stream_record.get('retainedObservation'):
                retained = verified(stream_record['retainedObservation'])
                assert data(archived) == scrub(data(retained).decode()).encode()
            provenance = record.get('outputProvenance', {}).get(stream)
            if provenance:
                assert fp(archived)['bytes'] == provenance['archivedBytes']
                assert fp(archived)['sha256'] == provenance['archivedSha256']
                raw = stream_record['rawAtExecution']
                assert raw['bytes'] == provenance['originalBytes'] and raw['sha256'] == provenance['originalSha256']
            if stream_record['rawAtExecution'] and 'path' in stream_record['rawAtExecution']:
                raw = verified(stream_record['rawAtExecution'])
                raw_sources.add(rel(raw))
                assert data(archived) == scrub(data(raw).decode()).encode()
            if stream == 'stdout':
                counts = {key: int(value) for key, value in re.findall(r'^ℹ (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)\s*$', data(archived).decode(), re.M)}
        assert item['counts'] == (counts or None)
        start = datetime.datetime.fromisoformat(item['startedAt'])
        finish = datetime.datetime.fromisoformat(item['finishedAt'])
        assert finish >= start and (previous_finish is None or start >= previous_finish)
        previous_finish = finish
        summaries.append({key: item[key] for key in ['label', 'historicalDirectory', 'command', 'startedAt', 'finishedAt', 'status', 'signal', 'counts', 'inputFingerprintCount', 'inputsUnchangedDuringRun', 'result']})
        summaries[-1]['matchesAllFinalMaintainedInputs'] = record.get('inputsBefore') == record.get('inputsAfter') == fingerprints['after']
    by_label = {item['label']: item for item in summaries}
    expected_counts = {'red-wiring': (0, 5, 1), 'selected-only-fixture': (1, 0, 0),
                       'boundary-red': (177, 6, 1), 'checkout-green': (204, 1, 1),
                       'checkout-green-isolated': (205, 0, 0), 'helper-contracts': (405, 1, 1),
                       'ci-check-final': (611, 0, 0), 'groups-check-final': (18, 0, 0)}
    for label, (passed, failed, status_code) in expected_counts.items():
        item = by_label[label]
        assert item['status'] == status_code
        assert [item['counts'][key] for key in ['pass', 'fail', 'skipped', 'cancelled', 'todo']] == [passed, failed, 0, 0, 0]
    for label in ['ci-check-final', 'groups-check-final', 'lint-final-fingerprint',
                  'format-check-after-cause-wrap', 'yaml-check-final', 'actionlint-final']:
        assert by_label[label]['status'] == 0 and by_label[label]['matchesAllFinalMaintainedInputs']

    historical_captures = []
    for path in sorted((SUPPORT / 'delivery').glob('*/validation.json')):
        record = load(path)
        assert all(record['assertions'].values())
        changed_since = {name: {'atCapture': expected, 'now': fp(repo_path(name))}
                         for name, expected in record['capturedFiles'].items() if fp(repo_path(name)) != expected}
        assert set(changed_since).issubset(authored), 'Unexpected historical-capture drift'
        historical_captures.append({'record': {'path': rel(path), **fp(path)},
                                    'capturedFileCount': record['capturedFileCount'],
                                    'laterAuthoredChangesNotRecertified': changed_since,
                                    'laterUncapturedFileCount': len(set(captured) - set(record['capturedFiles']))})
    assert {name: fp(repo_path(name)) for name in captured} == captured
    for name, expected in byte_scope['deliveryFingerprints'].items():
        assert fp(repo_path(name)) == expected
    result = {
        'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'startedAt': STARTED_AT, 'ownerAlias': 'CI-DAG-05 remediation coordinator',
        'verdict': 'Setup saved commands/counts, exact maintained diffs, local originals and archive provenance reconciled; no independent behavior acceptance or execution recertification',
        'scope': 'Read-only files/JSON/logs/diffs and Git metadata; no product/archived-driver import or execution, source operation, test, build, resource, package, runtime install, hosted run or repository publication',
        'byteReconciliationInput': {'path': rel(byte_record), **fp(byte_record)},
        'capturedSetupFiles': captured, 'capturedSetupFileCount': len(captured),
        'jsonFilesParsedWithoutDuplicateOrNonfiniteValues': json_count,
        'provenanceInputs': [{'path': rel(path), **fp(path), 'entries': len(p['sourceArchiveProvenance'])}
                             for path, p in zip(provenance_paths, provenances)],
        'archiveEntriesVerified': len(archives), 'originalSourceFilesVerified': len(sources),
        'rawOutputFilesVerified': len(raw_sources), 'sourceArchiveHashDifferences': differences,
        'allThirteenActualMaintainedFingerprints': fingerprints['after'],
        'exactCombinedDiffRecalculated': True, 'onlyApprovedR1TestLineAndTwoResultTestChanges': True,
        'initialObservationCount': len(initial), 'initialNonzeroObservationCount': 11,
        'totalObservationCount': len(summaries), 'allRecordedIntervalsSerial': True,
        'observationSummaries': summaries, 'historicalDeliveryCaptures': historical_captures,
        'headAndRefsUnchanged': True, 'inheritedStatusRetained': True,
        'historicalInputAndSealCount': len(baseline['historicalInputsAndSeals']),
        'allDeliveryInputsUnchangedDuringReconciliation': True,
        'scratch': rel(SCRATCH), 'command': ['python3', rel(pathlib.Path(__file__).resolve()), '--setup-idle-evidence'],
        'cwd': '.', 'tmpdir': rel(SCRATCH), 'runtime': {'python': sys.version.split()[0], 'platform': sys.platform},
        'gitCommands': GIT_COMMANDS,
        'coordinatorDriver': {'historicalPath': rel(pathlib.Path(__file__).resolve()), **fp(pathlib.Path(__file__).resolve())},
        'limitations': [
            'This recalculates saved observations, not source/bootstrap behavior. No package/resource/helper suite or source-materialization probe was run.',
            'Early records lack later runtime/input/raw-output coverage; intermediate green results do not certify final bytes.',
            'Positive full native short-root execution, Node-20 compatibility and real runner main/post behavior remain unverified.',
            'R1 independent acceptance, original R2 cause/abort/timing-neutrality/incomplete package disposition and all R3 rollout evidence remain pending.',
            'Original raw logs, fixture Git objects, dependencies/tool binaries and scratch drivers are locally retained but omitted; historical test execution is not reproducible from the archive alone.',
            'This result is written after its input capture; it does not hash itself or future coordinator copies/status edits/review files.',
        ],
    }
    value = json.dumps(result, indent=2, ensure_ascii=False) + '\n'
    assert scrub(value) == value
    output = SCRATCH / 'coordinator-evidence.json'
    with output.open('x') as handle:
        handle.write(value)
    print(json.dumps({'resultPath': rel(output), **fp(output), 'checkedAt': result['checkedAt'],
                      'capturedSetupFiles': len(captured), 'parsedJsonFiles': json_count,
                      'archiveEntriesVerified': len(archives), 'originalSourceFilesVerified': len(sources),
                      'rawOutputFilesVerified': len(raw_sources), 'observations': len(summaries),
                      'initialNonzeroObservations': 11, 'verdict': result['verdict']}, indent=2))


try:
    main()
except Exception as error:
    failure = {'failedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'scope': 'Coordinator saved-evidence checker failure, not product/test execution',
               'error': scrub(str(error)), 'type': type(error).__name__, 'gitCommands': GIT_COMMANDS}
    with (SCRATCH / 'checker-failure.json').open('x') as handle:
        json.dump(failure, handle, indent=2)
        handle.write('\n')
    print(json.dumps({'failurePath': rel(SCRATCH / 'checker-failure.json'), **failure}, indent=2))
    raise
