"""Curate this setup's evidence only; do not run product, package or source probes."""
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

root = pathlib.Path.cwd()
scratch = pathlib.Path(__file__).parent
bundle = root / 'docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests'
support = bundle / 'ci-dag-05-checkout-setup-support'
entries = []

def relative(path):
    return str(path.relative_to(root))

def fingerprint(data, mode='0644'):
    return {'mode': mode, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def source_bytes(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise RuntimeError('Nonregular archive source: ' + relative(path))
    data = path.read_bytes()
    return data, fingerprint(data, format(stat.S_IMODE(info.st_mode), '04o'))

def sanitize(data):
    text = data.decode('utf-8')
    text = text.replace(str(root), '<repo-root>').replace(str(pathlib.Path.home()), '<user-home>')
    text = re.sub(r'\bses_[A-Za-z0-9_-]+', '<private-session-id>', text)
    return text.encode('utf-8')

def privacy(data):
    text = data.decode('utf-8')
    patterns = [
        r'/(?:home|Users)/[A-Za-z0-9._-]+(?:/|\b)',
        r'/(?:tmp|private/tmp)/(?:opencode|[A-Za-z0-9._-]+)(?:/|\b)',
        r'\bses_[A-Za-z0-9_-]{8,}\b',
        r'\bgh[pousr]_[A-Za-z0-9]{20,}\b',
        r'\bgithub_pat_[A-Za-z0-9_]{20,}\b',
        r'-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----',
        r'https?://[^\s/]+:[^\s/]+@',
    ]
    if any(re.search(pattern, text) for pattern in patterns):
        raise RuntimeError('Sensitive path/identifier/credential-shaped archive content')
    if '\0' in text:
        raise RuntimeError('NUL in text archive content')

def git(*args):
    return subprocess.run(['git', '--no-optional-locks', *args], cwd=root,
                          env=os.environ, capture_output=True, text=True)

def save(name, data, source=None, transformation='Generated local archival metadata; no execution recertification'):
    path = support / name
    if not path.is_relative_to(support) or '..' in pathlib.Path(name).parts:
        raise RuntimeError('Unbounded archive destination')
    privacy(data)
    if path.suffix == '.json':
        json.loads(data)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() or path.is_symlink():
        raise RuntimeError('Refusing to overwrite existing evidence: ' + relative(path))
    with path.open('xb') as handle:
        handle.write(data)
    path.chmod(0o644)
    ignored = git('check-ignore', relative(path))
    if ignored.returncode != 1:
        raise RuntimeError('Archive destination must not be ignored: ' + relative(path))
    entry = {'archive': {'path': relative(path), **fingerprint(data)}, 'transformation': transformation}
    if source:
        original, fp = source_bytes(source)
        entry['source'] = {'path': relative(source), **fp}
    entries.append(entry)
    return entry['archive']

def copy(source, name, exact=False):
    data, fp = source_bytes(source)
    archived = sanitize(data)
    if exact and archived != data:
        raise RuntimeError('Exact source snapshot would require redaction: ' + relative(source))
    return save(name, archived, source,
                'Byte-exact copy; originals retained unchanged' if archived == data else
                'Replace absolute repository root with <repo-root>, user home with <user-home>, and full private session identifiers with <private-session-id>; originals retained unchanged')

def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode('utf-8')

def archive_run(directory, prefix):
    record_path = directory / 'result.json'
    record = json.loads(source_bytes(record_path)[0])
    archived_result = copy(record_path, prefix + '/result.json')
    streams = {}
    counts = {}
    for stream in ['stdout', 'stderr']:
        source = directory / (stream + '.log')
        data, fp = source_bytes(source)
        archived = copy(source, prefix + '/' + stream + '.log')
        provenance = record.get('outputProvenance', {}).get(stream)
        raw = directory / (stream + '.raw.log')
        raw_record = None
        if provenance:
            assert fp['bytes'] == provenance['archivedBytes'] and fp['sha256'] == provenance['archivedSha256']
            raw_record = {'bytes': provenance['originalBytes'], 'sha256': provenance['originalSha256'],
                          'status': 'Recorded at execution; raw bytes not duplicated in durable payload'}
        if raw.exists():
            raw_data, raw_fp = source_bytes(raw)
            if provenance:
                assert raw_fp['bytes'] == provenance['originalBytes'] and raw_fp['sha256'] == provenance['originalSha256']
            raw_record = {'path': relative(raw), **raw_fp, 'status': 'Verified in ignored scratch at curation; raw bytes omitted'}
        streams[stream] = {'retainedObservation': {'path': relative(source), **fp},
                           'rawAtExecution': raw_record, 'archive': archived}
        if stream == 'stdout':
            for key, value in re.findall(r'^ℹ (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)\s*$',
                                         data.decode('utf-8'), re.M):
                counts[key] = int(value)
    return {'label': record['label'], 'historicalDirectory': relative(directory),
            'command': record['command'], 'cwd': record['cwd'], 'tmpdir': record['tmpdir'],
            'startedAt': record['startedAt'], 'finishedAt': record['finishedAt'],
            'durationMs': record['durationMs'], 'status': record['status'], 'signal': record['signal'],
            'error': record['error'], 'runtime': record.get('runtime'),
            'inputFingerprintCount': len(record.get('inputsBefore', {})),
            'inputsUnchangedDuringRun': (record['inputsBefore'] == record['inputsAfter']) if 'inputsBefore' in record else None,
            'counts': counts or None, 'result': archived_result, 'streams': streams,
            'earlyRecordLimit': None if record.get('outputProvenance') else
                'Early recorder did not retain raw-output provenance or full maintained before/after fingerprints; do not infer missing runtime/input certification from later runs'}

observations = {
    'red-wiring-YkGW6y': 'Behavioral red: original pin lookup/cwd and missing top-level source/main/post binding; 0 passed / 5 failed. The exact five-test input is preserved.',
    'selected-only-fixture-KeBfeD': 'Early selected-only real-fixture observation: 1 passed. Historical intermediate input only, not final-byte or native-selector certification.',
    'boundary-red-c3Z9qz': 'Expanded red: 177 passed / 6 failed. Empty tree record, committed-ignore diagnostic mismatch, high-bit batch header, duplicate shallow boundary, changed pnpm-child mode and unsafe partial-allocation cleanup; preserve all six failures without treating the diagnostic mismatch as a bypass.',
    'checkout-green-XYwIiX': 'Despite its label, FAILED: 204 passed / 1 failed. update-index invoked the public synthetic filter and created an extra source sentinel before the expected hidden-index-flags failure.',
    'checkout-green-isolated-xwggL6': 'Intermediate standalone green: 205 passed / 0 failed / 0 skipped after isolating the index-flags mutation with empty filter.fixture.clean/smudge settings; the Hidden assume-unchanged assertion remains unchanged.',
    'helper-contracts-HZOAkG': 'FAILED: 405 passed / 1 failed. The protected R1-test action-source list omitted the new ciActions.source metadata. Coordinator approval was obtained before the sole line amendment.',
    'lint-final-rqDvx4': 'FAILED: two preserve-caught-error violations for missing AggregateError causes; no warnings.',
    'format-check-before-qUPMpb': 'FAILED invocation: installed Prettier requires --config-path rather than --config; no file formatting result.',
    'format-check-correct-cli-J8kXdv': 'FAILED: four owned JavaScript files needed formatting.',
    'format-owned-files-O1OcqU': 'Authorized formatter edit: only bootstrap, checkout test, plan and plan test were written. This is an edit record, not a test pass.',
    'lint-green-0s2SlG': 'Despite its label, FAILED: two preserve-caught-error violations for incorrect AggregateError causes; no warnings.',
    'lint-after-cause-correction-Bp4l4b': 'Targeted ESLint passed after preserving cleanup as the AggregateError cause.',
    'format-check-final-mrtDQy': 'FAILED: bootstrap alone needed wrapping after the cause correction.',
    'format-check-after-cause-wrap-oXXOQK': 'Final targeted Prettier passed on eight eligible JavaScript/manifest/README paths. YAML follows repository YAML conventions and is checked separately.',
    'ci-check-final-aKP5nR': 'Final mandatory integration verification passed: 611 / 0 / 0, then both strict model and active-workflow/four-action checks; all thirteen maintained fingerprints unchanged.',
    'groups-check-final-NDLH3V': 'Final group validation passed: 18 / 0 / 0; 12 groups covering 25 workspaces. No workspace suite executed.',
    'lint-final-fingerprint-9b6FjG': 'Final targeted ESLint passed on six JavaScript paths with final thirteen-path fingerprints unchanged.',
    'yaml-check-final-FrFAKP': 'Existing checksum/source-verified cached check-yaml passed on five affected YAML paths; no pre-commit environment installation.',
    'actionlint-final-HbTCqp': 'Checksum-verified existing actionlint 1.7.7 passed on the workflow with -shellcheck= -pyflakes=; no installation or hosted action execution.',
    'tool-inventory-eQJCPT': 'Read-only existing-tool/version discovery; not a product/package/runner result.',
    'tool-prerequisites-final-amBAtc': 'Read-only inspected Node candidates, cached YAML source/runtime and actionlint archive/binary provenance. No Node 20 found in inspected candidates; nothing installed.',
    'scope-before-archive-ucoe20': 'Same-implementation-session scope reconciliation passed before archive creation: 10 existing maintained changes, 3 new maintained files, 4 exact coordinator-only document deltas and 1 exact coordinator-only JSON addition; no unexpected path.'
}

mode = sys.argv[1] if len(sys.argv) > 1 else ''
if mode == 'initial':
    if support.exists() or support.is_symlink():
        raise RuntimeError('Initial support destination already exists')
    preflight = json.loads(source_bytes(scratch / 'preflight.json')[0])
    final = json.loads(source_bytes(scratch / 'ci-check-final-aKP5nR/result.json')[0])
    assert final['status'] == 0 and final['inputsBefore'] == final['inputsAfter']
    maintained = sorted(final['inputsAfter'])
    assert len(maintained) == 13
    fingerprints = {'capturedFrom': relative(support / 'observations/ci-check-final-aKP5nR/result.json'),
                    'preflight': relative(support / 'scope/stage2-preflight.json'),
                    'historicalInputs': {'capturedFrom': relative(scratch / 'ci-check-final-aKP5nR/result.json'),
                                         'preflight': relative(scratch / 'preflight.json')},
                    'before': {path: preflight['files'].get(path) for path in maintained},
                    'after': final['inputsAfter'],
                    'limit': 'Exact inherited preflight and final local check inputs; no project revision/hosted/native-short-root/Node-20 certification'}
    source_index = {'before': {}, 'after': {}, 'historicalIntermediate': {}}
    combined_diff = ''
    for path in maintained:
        current = root / path
        after_data, after_fp = source_bytes(current)
        assert after_fp == final['inputsAfter'][path]
        source_index['after'][path] = copy(current, 'sources/after/' + path, exact=True)
        before_data = b''
        if path in preflight['files']:
            before = (root / '_tmp-c5f-ovtrnV/setup-scope-amendment-M5CVmx/workspace-test-before.mjs') if path == 'scripts/ci-test-workspace.test.mjs' else scratch / 'before' / path
            before_data, before_fp = source_bytes(before)
            assert before_fp == preflight['files'][path]
            source_index['before'][path] = copy(before, 'sources/before/' + path, exact=True)
        delta = ''.join(difflib.unified_diff(before_data.decode().splitlines(True), after_data.decode().splitlines(True),
                                           fromfile='stage2-preflight/' + path if before_data else '/dev/null',
                                           tofile='selected-final/' + path))
        combined_diff += delta
        if path == 'scripts/ci-test-workspace.test.mjs':
            amendment = json.loads(source_bytes(bundle / 'ci-dag-05-checkout-setup-contract-amendment.json')[0])
            old = amendment['allowedChange']['previousLine'].encode()
            new = amendment['allowedChange']['replacementLine'].encode()
            assert before_data.count(old) == 1 and after_data == before_data.replace(old, new)
            save('sources/r1-one-line.diff', delta.encode(), transformation='Generated exact isolated sole-line diff from protected preimage to approved full-file postimage; no other byte or mode change')
    save('sources/maintained.diff', combined_diff.encode(), transformation='Generated exact unified diff for thirteen maintained paths against inherited stage-2 preflight, not against HEAD; new files use /dev/null')
    for directory_name in ['boundary-red-c3Z9qz', 'checkout-green-XYwIiX']:
        snapshot_manifest = json.loads(source_bytes(scratch / directory_name / 'input-snapshots.json')[0])
        copy(scratch / directory_name / 'input-snapshots.json', 'observations/' + directory_name + '/input-snapshots.json', exact=True)
        source_index['historicalIntermediate'][directory_name] = {}
        for path, recorded in snapshot_manifest.items():
            source = root / recorded['snapshot']
            data, fp = source_bytes(source)
            assert fp['bytes'] == recorded['bytes'] and fp['sha256'] == recorded['sha256'] == recorded['snapshotSha256']
            source_index['historicalIntermediate'][directory_name][path] = copy(source, 'sources/intermediate/' + directory_name + '/' + path, exact=True)
    source_index['historicalIntermediate']['red-wiring-YkGW6y'] = {
        'scripts/ci-test-checkout.test.mjs': copy(scratch / 'red-wiring-YkGW6y/test-input.mjs', 'sources/red-wiring.test-input.mjs', exact=True)}
    save('sources/manifest.json', json_bytes(source_index))
    save('fingerprints.json', json_bytes(fingerprints))
    for filename in ['stage-1-proposal.md', 'preflight.json', 'stage-1-fingerprints.json']:
        copy(root / '_tmp-c5-setup-ozh7l6on' / filename, 'design/' + filename, exact=True)
    copy(scratch / 'preflight.json', 'scope/stage2-preflight.json', exact=True)
    copy(root / '_tmp-c5f-ovtrnV/setup-scope-check-vLNj13/coordinator-deltas.json', 'scope/coordinator-deltas.json', exact=True)
    copy(scratch / 'scope-before-archive-ucoe20/scope.json', 'scope/scope-before-archive.json', exact=True)
    for filename in ['run.mjs', 'run-final.mjs', 'reconcile-final.py', 'tools.py', 'tools-final.py', 'archive.py']:
        copy(scratch / filename, 'drivers/' + filename, exact=True)
    results = []
    for name, note in observations.items():
        observation = archive_run(scratch / name, 'observations/' + name)
        observation['interpretation'] = note
        results.append(observation)
    results.sort(key=lambda item: item['startedAt'])
    save('observations.json', json_bytes({'scope': 'Retained local setup observations, including every failed/red and later green result; labels are not verdicts',
                                       'observations': results}))
    payload_entries = list(entries)
    manifest = {'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'ownerAlias': 'CI-DAG-05 setup implementation session',
                'status': 'Curated local implementation evidence; coordinator reconciliation and fresh independent review pending; CI-DAG-05 remains blocked',
                'scope': 'Thirteen maintained paths plus only the new setup report/support; coordinator-only deltas recorded separately',
                'sourceArchiveProvenance': payload_entries,
                'omitted': ['Raw unsanitized logs (fingerprints retained where originally recorded)',
                            'Synthetic fixture directories, objects and fixture refs; no production source materialization was performed',
                            'Dependency trees, caches, databases, browser/tool binaries, tarballs and build outputs',
                            'Full coordinator baseline/driver scratch (verified fingerprint and exact delta record retained)',
                            'Unretained intermediate source bytes: earlier result fingerprints are not replaced by final source snapshots',
                            'Hosted execution, actual action runtime/post/cancellation/scheduler/artifact-service evidence and package verification'],
                'reproductionLimit': 'Evidence review and exact diff/source/input fingerprint recalculation are possible from preserved inputs. Executed historical commands requiring omitted tooling/dependencies/fixtures are not runnable from this archive alone. Archiving did not rerun or recertify any historical result.',
                'selfReferenceLimit': 'This manifest does not hash itself. The report, README and later delivery-check records have separate recorded fingerprints/provenance; no record claims to hash its own final bytes.'}
    save('manifest.json', json_bytes(manifest))
    print(json.dumps({'support': relative(support), 'initialPayloadFiles': len(payload_entries),
                      'observations': len(results), 'maintainedPaths': len(maintained),
                      'failedObservations': sum(item['status'] != 0 for item in results)}, indent=2))
elif mode == 'append':
    label = sys.argv[2]
    if not re.fullmatch(r'[a-z0-9-]+', label):
        raise RuntimeError('Invalid append label')
    results = []
    for name in sys.argv[3:]:
        directory = scratch / name
        if not directory.is_relative_to(scratch) or '/' in name:
            raise RuntimeError('Unbounded append source')
        results.append(archive_run(directory, 'delivery/' + name))
        for extra in ['scope.json', 'validation.json']:
            if (directory / extra).exists():
                copy(directory / extra, 'delivery/' + name + '/' + extra, exact=True)
    save('delivery/provenance-' + label + '.json', json_bytes({
        'curatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'scope': 'Later local delivery/document/scope checks; no package/resource/source/hosted execution',
        'observations': results, 'sourceArchiveProvenance': list(entries),
        'selfReferenceLimit': 'This provenance record is generated after copying its inputs and does not hash itself; copying validates UTF-8/privacy/JSON/destination ignore status without recertifying execution'}))
    print(json.dumps({'append': label, 'observations': len(results), 'copiedFiles': len(entries) - 1}, indent=2))
else:
    raise RuntimeError('Use initial or append <fresh-label> <owned-run-directory>...')
