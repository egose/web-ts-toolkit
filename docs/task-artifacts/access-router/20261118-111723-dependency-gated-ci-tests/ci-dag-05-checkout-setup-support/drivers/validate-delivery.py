"""Check this delivery's evidence and references, never execute archived tests.

Run from the repository root with a freshly owned, ignored checkout-local run
directory and its real tmp child as TMPDIR. Writes only run-dir/validation.json.
--verify-local-sources additionally checks original, locally retained inputs.
"""
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
import urllib.parse


ROOT = pathlib.Path.cwd()
BUNDLE = ROOT / 'docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests'
SUPPORT = BUNDLE / 'ci-dag-05-checkout-setup-support'
REPORT = BUNDLE / 'ci-dag-05-checkout-setup.md'
R1_TEST = 'scripts/ci-test-workspace.test.mjs'
RAW_FIXTURE = 'https://' + 'user:secret' + '@example.org/'
REDACTED_FIXTURE = 'https://example.org/<redacted-synthetic-auth>/'
VERIFY_LOCAL = sys.argv[1:] == ['--verify-local-sources']
assert sys.argv[1:] in [[], ['--verify-local-sources']], 'Unsupported verification arguments'


def relative(path):
    return path.relative_to(ROOT).as_posix()


def regular_bytes(path):
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode), 'Nonregular input: ' + relative(path)
    return path.read_bytes(), format(stat.S_IMODE(info.st_mode), '04o')


def fingerprint(path):
    data, mode = regular_bytes(path)
    return {'mode': mode, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def repo_path(name):
    path = pathlib.PurePosixPath(name)
    assert not path.is_absolute() and '..' not in path.parts and path.as_posix() == name
    assert '\0' not in name and '\n' not in name and '\r' not in name
    return ROOT / name


def no_duplicates(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, 'Duplicate JSON key: ' + key
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError('Nonfinite JSON value: ' + value)


def load(path):
    return json.loads(regular_bytes(path)[0], object_pairs_hook=no_duplicates,
                      parse_constant=reject_constant)


def verify_fp(record):
    path = repo_path(record['path'])
    assert fingerprint(path) == {key: record[key] for key in ['mode', 'bytes', 'sha256']}, record['path']
    return path


def git(*args, data=None):
    return subprocess.run(['git', '--no-optional-locks', *args], cwd=ROOT,
                          input=data, capture_output=True, check=False)


tmp = pathlib.Path(os.environ['TMPDIR'])
assert tmp.is_absolute() and tmp.name == 'tmp' and tmp.resolve(strict=True) == tmp
assert tmp.is_relative_to(ROOT) and tmp.relative_to(ROOT).parts[0].startswith('_tmp')
assert tmp.stat().st_uid == os.getuid() and stat.S_ISDIR(tmp.lstat().st_mode)
assert git('check-ignore', relative(tmp.parent)).returncode == 0, 'Run directory must be ignored'
destination = tmp.parent / 'validation.json'
assert not destination.exists() and not destination.is_symlink(), 'Refusing to overwrite a record'
assert pathlib.Path(__file__) == SUPPORT / 'drivers/validate-delivery.py'

# Capture every curated text file before writing any record or later archive copy.
paths = [REPORT]
for directory, dirs, files in os.walk(SUPPORT, followlinks=False):
    base = pathlib.Path(directory)
    assert not base.is_symlink()
    for name in dirs:
        assert stat.S_ISDIR((base / name).lstat().st_mode), 'Unsupported archive directory'
    paths.extend(base / name for name in files)
paths = sorted(paths)
assert len(paths) == len(set(paths))
files_before = {relative(path): fingerprint(path) for path in paths}
privacy_patterns = [
    r'/(?:home|Users)/[A-Za-z0-9._-]+(?:/|\b)',
    r'/(?:tmp|private/tmp)/(?:opencode|[A-Za-z0-9._-]+)(?:/|\b)',
    r'\bses_[A-Za-z0-9_-]{8,}\b',
    r'\bgh[pousr]_[A-Za-z0-9]{20,}\b',
    r'\bgithub_pat_[A-Za-z0-9_]{20,}\b',
    r'-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----',
    r'https?://[^\s/]+:[^\s/]+@',
]
json_count = 0
for path in paths:
    text = regular_bytes(path)[0].decode('utf-8')
    assert '\0' not in text, 'NUL text: ' + relative(path)
    for pattern in privacy_patterns:
        assert not re.search(pattern, text), 'Privacy-pattern match: ' + relative(path)
    if path.suffix == '.json':
        load(path)
        json_count += 1
ignored = git('check-ignore', '-z', '--stdin', data=b''.join(
    relative(path).encode() + b'\0' for path in paths))
assert ignored.returncode == 1 and ignored.stdout == b'', 'Delivery file ignored or ignore check failed'

core = load(SUPPORT / 'manifest.json')
core_entries = core['sourceArchiveProvenance']
assert len(core_entries) == 132
provenances = [core] + [load(path) for path in sorted((SUPPORT / 'delivery').glob('provenance-*.json'))]
covered = set()
local_sources = set()
redacted_copies = []
for provenance in provenances:
    assert provenance['selfReferenceLimit']
    for entry in provenance['sourceArchiveProvenance']:
        archive = verify_fp(entry['archive'])
        assert archive.is_relative_to(SUPPORT) and relative(archive) not in covered
        covered.add(relative(archive))
        assert entry['transformation']
        if 'source' not in entry:
            continue
        source_record = entry['source']
        if source_record['sha256'] != entry['archive']['sha256']:
            redacted_copies.append({'source': source_record, 'archive': entry['archive']})
        if VERIFY_LOCAL:
            source = verify_fp(source_record)
            local_sources.add(relative(source))
            data = regular_bytes(source)[0].decode('utf-8')
            transformed = data.replace(str(ROOT), '<repo-root>').replace(str(pathlib.Path.home()), '<user-home>')
            transformed = re.sub(r'\bses_[A-Za-z0-9_-]+', '<private-session-id>', transformed)
            transformed = transformed.replace(RAW_FIXTURE, REDACTED_FIXTURE).encode()
            assert regular_bytes(archive)[0] == transformed, 'Unexpected source/archive transformation'
            if entry['transformation'].startswith('Byte-exact copy;'):
                assert regular_bytes(source)[0] == regular_bytes(archive)[0]

authored = {relative(REPORT), relative(SUPPORT / 'README.md'),
            relative(SUPPORT / 'drivers/validate-delivery.py')}
metadata = {relative(SUPPORT / 'manifest.json')} | {
    relative(path) for path in (SUPPORT / 'delivery').glob('provenance-*.json')}
uncovered = set(files_before) - covered
assert uncovered == authored | metadata, 'Unindexed delivery content: ' + str(sorted(uncovered - authored - metadata))

fingerprints = load(SUPPORT / 'fingerprints.json')
source_index = load(SUPPORT / 'sources/manifest.json')
final_ci = load(repo_path(fingerprints['capturedFrom']))
preflight = load(repo_path(fingerprints['preflight']))
assert final_ci['status'] == 0 and final_ci['signal'] is None
assert final_ci['inputsBefore'] == final_ci['inputsAfter'] == fingerprints['after']
assert len(fingerprints['after']) == len(fingerprints['before']) == 13
assert fingerprints['before'] == {path: preflight['files'].get(path) for path in fingerprints['after']}
assert sum(value is None for value in fingerprints['before'].values()) == 3
assert len(source_index['before']) == 10 and len(source_index['after']) == 13
amendment = load(BUNDLE / 'ci-dag-05-checkout-setup-contract-amendment.json')
old = amendment['allowedChange']['previousLine'].encode()
new = amendment['allowedChange']['replacementLine'].encode()
combined_diff = ''
reconstructed = {'before': {}, 'after': {}}
for path in sorted(fingerprints['after']):
    for phase in ['before', 'after']:
        expected = fingerprints[phase][path]
        if expected is None:
            assert path not in source_index[phase]
            reconstructed[phase][path] = b''
            continue
        snapshot = verify_fp(source_index[phase][path])
        data, mode = regular_bytes(snapshot)
        if path == R1_TEST:
            assert data.count(REDACTED_FIXTURE.encode()) == 1
            data = data.replace(REDACTED_FIXTURE.encode(), RAW_FIXTURE.encode())
        assert {'mode': mode, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} == expected
        reconstructed[phase][path] = data
    before, after = reconstructed['before'][path], reconstructed['after'][path]
    delta = ''.join(difflib.unified_diff(before.decode().splitlines(True), after.decode().splitlines(True),
                                       fromfile='stage2-preflight/' + path if before else '/dev/null',
                                       tofile='selected-final/' + path))
    combined_diff += delta
    if path == R1_TEST:
        assert before.count(old) == 1 and after == before.replace(old, new)
        assert regular_bytes(SUPPORT / 'sources/r1-one-line.diff')[0] == delta.encode()
assert regular_bytes(SUPPORT / 'sources/maintained.diff')[0] == combined_diff.encode()
for name, snapshots in source_index['historicalIntermediate'].items():
    record = load(SUPPORT / 'observations' / name / 'result.json')
    for path, snapshot_record in snapshots.items():
        snapshot = verify_fp(snapshot_record)
        if 'inputsBefore' in record:
            assert fingerprint(snapshot) == record['inputsBefore'][path]

report_text = regular_bytes(REPORT)[0].decode()
table = {path: {'mode': '0644', 'bytes': int(size.replace(',', '')), 'sha256': digest}
         for path, size, digest in re.findall(
             r'^\|\s+`([^`]+)`\s+\|\s+([\d,]+)\s+\|\s+`([0-9a-f]{64})`\s+\|\s*$', report_text, re.M)}
assert table == fingerprints['after'], 'Report fingerprint table differs from actual final inputs'

observation_groups = [load(SUPPORT / 'observations.json')['observations']] + [
    provenance['observations'] for provenance in provenances[1:]]
assert len(observation_groups[0]) == 26
assert sum(item['status'] != 0 for item in observation_groups[0]) == 11
observations = []
for group in observation_groups:
    for item in group:
        record = load(verify_fp(item['result']))
        for key in ['label', 'command', 'cwd', 'tmpdir', 'startedAt', 'finishedAt',
                    'durationMs', 'status', 'signal', 'error']:
            assert item[key] == record[key], 'Observation metadata differs: ' + key
        assert item['inputFingerprintCount'] == len(record.get('inputsBefore', {}))
        if 'inputsBefore' in record:
            assert item['inputsUnchangedDuringRun'] == (record['inputsBefore'] == record['inputsAfter'])
        counts = {}
        for stream, stream_record in item['streams'].items():
            archived = verify_fp(stream_record['archive'])
            data = regular_bytes(archived)[0]
            provenance = record.get('outputProvenance', {}).get(stream)
            if provenance:
                assert hashlib.sha256(data).hexdigest() == provenance['archivedSha256']
                assert len(data) == provenance['archivedBytes']
                raw = stream_record['rawAtExecution']
                assert raw['sha256'] == provenance['originalSha256'] and raw['bytes'] == provenance['originalBytes']
            if VERIFY_LOCAL and stream_record['rawAtExecution'] and 'path' in stream_record['rawAtExecution']:
                verify_fp(stream_record['rawAtExecution'])
            if stream == 'stdout':
                counts = {key: int(value) for key, value in re.findall(
                    r'^ℹ (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)\s*$', data.decode(), re.M)}
        assert item['counts'] == (counts or None)
        observations.append(item)
observations.sort(key=lambda item: item['startedAt'])
for index, item in enumerate(observations):
    start = datetime.datetime.fromisoformat(item['startedAt'])
    finish = datetime.datetime.fromisoformat(item['finishedAt'])
    assert finish >= start
    if index:
        assert start >= datetime.datetime.fromisoformat(observations[index - 1]['finishedAt']), 'Overlapping recorded runs'
by_directory = {pathlib.PurePosixPath(item['historicalDirectory']).name: item for item in observations}
expected_counts = {
    'red-wiring-YkGW6y': (0, 5, 0, 1),
    'selected-only-fixture-KeBfeD': (1, 0, 0, 0),
    'boundary-red-c3Z9qz': (177, 6, 0, 1),
    'checkout-green-XYwIiX': (204, 1, 0, 1),
    'checkout-green-isolated-xwggL6': (205, 0, 0, 0),
    'helper-contracts-HZOAkG': (405, 1, 0, 1),
    'ci-check-final-aKP5nR': (611, 0, 0, 0),
    'groups-check-final-NDLH3V': (18, 0, 0, 0),
}
for name, (passed, failed, skipped, status) in expected_counts.items():
    item = by_directory[name]
    assert [item['counts'][key] for key in ['pass', 'fail', 'skipped']] == [passed, failed, skipped]
    assert item['status'] == status

# Only maintained/authored documentation is a relocated link contract. Copied
# historical README/design/source/log evidence keeps its original context.
def without_fences(text):
    return re.sub(r'(?ms)^```[^\n]*\n.*?^```\s*$', '', text)


def anchors(path):
    text = without_fences(regular_bytes(path)[0].decode())
    result = set(re.findall(r'(?:id|name)=["\']([^"\']+)["\']', text))
    duplicates = {}
    for heading in re.findall(r'^#{1,6}\s+(.+?)\s*$', text, re.M):
        heading = re.sub(r'\s+#+$', '', heading)
        heading = re.sub(r'<[^>]*>', '', heading)
        heading = re.sub(r'\[([^]]+)\]\([^)]+\)', r'\1', heading)
        slug = re.sub(r'[^\w -]', '', heading.lower()).replace(' ', '-')
        occurrence = duplicates.get(slug, 0)
        duplicates[slug] = occurrence + 1
        result.add(slug + ('-' + str(occurrence) if occurrence else ''))
    return result


documents = [ROOT / 'README.md', REPORT, SUPPORT / 'README.md']
links = []
external_links = []
anchor_count = 0
for document in documents:
    text = without_fences(regular_bytes(document)[0].decode())
    for reference in re.findall(r'!?\[[^]\n]*\]\(([^\s)]+)(?:\s+"[^"\n]*")?\)', text):
        parsed = urllib.parse.urlsplit(reference)
        if parsed.scheme or parsed.netloc:
            external_links.append({'document': relative(document), 'reference': reference})
            continue
        assert not parsed.query, 'Unsupported local query link'
        target = pathlib.Path(os.path.normpath(document.parent / urllib.parse.unquote(parsed.path)))
        if not parsed.path:
            target = document
        assert target.is_relative_to(ROOT) and target.exists(), 'Unresolved local link: ' + reference
        assert not target.is_symlink(), 'Symlink link target'
        if parsed.fragment:
            assert target.suffix == '.md' and urllib.parse.unquote(parsed.fragment) in anchors(target), reference
            anchor_count += 1
        links.append({'document': relative(document), 'reference': reference, 'target': relative(target)})

for name in authored | {relative(ROOT / 'README.md')}:
    text = regular_bytes(repo_path(name))[0].decode()
    assert text.endswith('\n') and not text.endswith('\n\n'), 'Authored final newline: ' + name
    assert all(line == line.rstrip(' \t') for line in text.splitlines()), 'Authored trailing whitespace: ' + name
files_after = {relative(path): fingerprint(path) for path in paths}
assert files_after == files_before, 'Delivery input changed during verification'
result = {
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Same setup implementation session, read-only delivery integrity/reference/privacy/JSON/ignore checks only; not independent acceptance, source/package/runtime/hosted execution or historical test recertification',
    'runtime': {'python': sys.version.split()[0], 'platform': sys.platform},
    'driver': {'path': relative(pathlib.Path(__file__)), **fingerprint(pathlib.Path(__file__))},
    'tmpdir': relative(tmp), 'scratchIgnored': True, 'verifyOriginalLocalSources': VERIFY_LOCAL,
    'capturedFiles': files_before, 'capturedFileCount': len(files_before),
    'jsonFilesParsed': json_count, 'corePayloadEntriesVerified': len(core_entries),
    'totalPayloadEntriesVerified': len(covered), 'localSourceFilesVerified': len(local_sources),
    'sourceArchiveHashDifferences': redacted_copies,
    'selfExcludedOrSeparatelyAuthoredMetadataAtCapture': sorted(uncovered),
    'observationsVerified': len(observations), 'initialObservationCount': 26, 'initialNonzeroObservationCount': 11,
    'knownTestCounts': {name: by_directory[name]['counts'] for name in expected_counts},
    'documentCoverage': [{'path': relative(path), **fingerprint(path)} for path in documents],
    'localLinks': links, 'localLinkCount': len(links), 'localAnchorCount': anchor_count,
    'externalLinksNotFetched': external_links,
    'privacyCoverage': 'UTF-8/NUL and seven recorded path/private-ID/credential-shape patterns over every captured curated file; manual review remains necessary; no secret scanner or external endpoint was run',
    'assertions': {
        'allCapturedTextPrivacyPatternsPassed': True, 'allJsonParsedWithoutDuplicateOrNonfiniteValues': True,
        'allDeliveryPathsNotIgnored': True, 'allDeclaredArchiveFingerprintsAndTransformationsMatched': True,
        'allThirteenFinalFingerprintsAndReportRowsMatched': True, 'allExactDiffsRecalculated': True,
        'onlyApprovedR1LineReplacement': True, 'allObservationCountsMetadataAndAvailableOutputHashesMatched': True,
        'allRecordedRunsSerial': True, 'authoredAndRootReadmeLinksAndAnchorsResolve': True,
        'authoredWhitespaceClean': True, 'allCapturedInputsUnchangedDuringCheck': True,
    },
    'selfReferenceLimit': 'This validation record is written after capture. It does not hash itself, its future result/logs/curated copies or later additions. Each later provenance writer separately checks copied bytes/privacy/JSON/ignore status; no future file-set coverage is inferred.',
}
with destination.open('x') as handle:
    handle.write(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
print(json.dumps({'validationRecord': relative(destination), 'capturedFiles': len(files_before),
                  'jsonFilesParsed': json_count, 'payloadEntriesVerified': len(covered),
                  'localSourceFilesVerified': len(local_sources), 'observationsVerified': len(observations),
                  'localLinks': len(links), 'localAnchors': anchor_count, 'assertions': result['assertions']}, indent=2))
