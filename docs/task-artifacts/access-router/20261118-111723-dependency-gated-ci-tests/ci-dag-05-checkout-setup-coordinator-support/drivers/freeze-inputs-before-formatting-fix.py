"""Document-only readiness and exclusive review snapshot after all implementers idle."""
import datetime
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.parse

assert sys.argv[1:] == ['--freeze-idle-review-ready']
ROOT = pathlib.Path.cwd().resolve(strict=True)
OWNER = ROOT / '_tmp-c5f-ovtrnV'
RUN = pathlib.Path(tempfile.mkdtemp(prefix='setup-readiness-', dir=OWNER))
os.environ['TMPDIR'] = str(RUN)
os.environ['NODE_COMPILE_CACHE'] = str(RUN / 'node-compile-cache')
BUNDLE = 'docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/'
SUPPORT = BUNDLE + 'ci-dag-05-checkout-setup-coordinator-support/'
TASK = 'docs/tasks/20261118-111723-dependency-gated-ci-tests.md'
BASELINE = '_tmp-c5f-ovtrnV/setup-stage2-oLp7U1/baseline.json'
BYTE_CHECK = BUNDLE + 'ci-dag-05-checkout-setup-stage2-coordinator-reconciliation.json'
EVIDENCE_CHECK = BUNDLE + 'ci-dag-05-checkout-setup-stage2-coordinator-evidence.json'
AMENDMENT = BUNDLE + 'ci-dag-05-checkout-setup-contract-amendment.json'
FAILURE_MANIFEST = SUPPORT + 'readiness-failure-manifest.json'
READINESS = SUPPORT + 'handoff-readiness.json'
ARCHIVE_DRIVER = SUPPORT + 'drivers/freeze-corrective-review-inputs.py'
INPUTS = BUNDLE + 'ci-dag-05-corrective-review-inputs.json'
ASSIGNMENT = BUNDLE + 'ci-dag-05-corrective-review-assignment.json'
REVIEW = BUNDLE + 'ci-dag-05-corrective-review.md'
REVIEW_SUPPORT = BUNDLE + 'ci-dag-05-corrective-review-support/'
COORDINATOR_DOCUMENTS = [TASK, *(BUNDLE + name for name in [
    'README.md', 'ci-dag-05-remediation-coordination.md',
    'ci-dag-05-checkout-setup-handoff.md', 'ci-dag-05-corrective-review-handoff.md',
    'ci-dag-05-local-evidence.md', 'ci-dag-05-handoff.md',
])]
DOCUMENTS = [*COORDINATOR_DOCUMENTS, SUPPORT + 'README.md']
COMMANDS = []
STARTED_AT = datetime.datetime.now(datetime.timezone.utc).isoformat()


def rel(path):
    return path.relative_to(ROOT).as_posix()


def repo_path(name):
    value = pathlib.PurePosixPath(name)
    assert not value.is_absolute() and '..' not in value.parts and value.as_posix() == name
    return ROOT / name


def sha(value):
    return hashlib.sha256(value).hexdigest()


def fingerprint(name):
    path = repo_path(name)
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode), 'Expected regular file: ' + name
    value = path.read_bytes()
    return {'mode': format(stat.S_IMODE(info.st_mode), '04o'),
            'bytes': len(value), 'sha256': sha(value)}


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, 'Duplicate JSON key: ' + key
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError('Nonfinite JSON value: ' + value)


def load(name):
    return json.loads(repo_path(name).read_bytes(), object_pairs_hook=unique_keys,
                      parse_constant=reject_constant)


def scrub(text):
    text = text.replace(str(ROOT), '<repo-root>').replace(str(pathlib.Path.home()), '<user-home>')
    return re.sub(r'\bses_[A-Za-z0-9_-]+', '<private-session-id>', text)


def privacy(text, name):
    assert '\0' not in text and scrub(text) == text, 'Private local content: ' + name
    # Match absolute path tokens, not a tmp/ segment inside a sanitized local path.
    for pattern in [r'(?<![\w./<>-])/(?:home|Users)/[A-Za-z0-9._-]+(?:/|\b)',
                    r'(?<![\w./<>-])/(?:tmp|private/tmp)/(?:opencode|[A-Za-z0-9._-]+)(?:/|\b)',
                    r'\bses_[A-Za-z0-9_-]{8,}\b', r'\bgh[pousr]_[A-Za-z0-9]{20,}\b',
                    r'\bgithub_pat_[A-Za-z0-9_]{20,}\b',
                    r'-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----',
                    r'https?://[^\s/]+:[^\s/]+@']:
        assert not re.search(pattern, text), 'Privacy pattern: ' + name


def run(command, expected=0, stdin=None, retain_text=False):
    # Only read-only Git metadata and installed Prettier --check are allowed.
    assert command[0] == 'git' or command[:6] == ['pnpm', 'exec', 'prettier', '--check', '--config-path', '.prettierrc']
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    clock = time.monotonic_ns()
    result = subprocess.run(command, cwd=ROOT, env=os.environ, input=stdin, capture_output=True, check=False)
    entry = {'command': command, 'cwd': '.', 'tmpdir': rel(RUN), 'startedAt': started,
             'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
             'durationMs': (time.monotonic_ns() - clock) // 1_000_000,
             'exitCode': result.returncode, 'signal': -result.returncode if result.returncode < 0 else None,
             'stdoutBytes': len(result.stdout), 'stdoutSha256': sha(result.stdout),
             'stderrBytes': len(result.stderr), 'stderrSha256': sha(result.stderr),
             'stderrText': scrub(result.stderr.decode('utf-8'))}
    if retain_text:
        entry['stdoutText'] = scrub(result.stdout.decode('utf-8'))
    COMMANDS.append(entry)
    prefix = RUN / ('command-%03d' % len(COMMANDS))
    for stream in ['stdout', 'stderr']:
        with pathlib.Path(str(prefix) + '.' + stream + '.log').open('x') as handle:
            handle.write(scrub(getattr(result, stream).decode('utf-8')))
    assert result.returncode == expected, scrub(result.stdout.decode() + result.stderr.decode())
    return result.stdout


def git(args, expected=0, stdin=None, retain_text=False):
    return run(['git', '--no-optional-locks', *args], expected, stdin, retain_text)


def inventory():
    names = sorted(set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).decode().split('\0')) - {''})
    files, other = {}, {}
    for name in names:
        path = repo_path(name)
        info = path.lstat()
        if stat.S_ISREG(info.st_mode):
            files[name] = fingerprint(name)
        elif stat.S_ISLNK(info.st_mode):
            other[name] = {'kind': 'symlink', 'target': os.readlink(path), 'mode': format(stat.S_IMODE(info.st_mode), '04o')}
        else:
            other[name] = {'kind': 'other', 'mode': format(stat.S_IMODE(info.st_mode), '04o')}
    return files, other


def table_hash(files):
    return sha(json.dumps(files, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())


def write_json(name, value):
    text = json.dumps(value, indent=2, ensure_ascii=False) + '\n'
    privacy(text, name)
    path = repo_path(name)
    with path.open('x') as handle:
        handle.write(text)
    assert fingerprint(name)['mode'] == '0644'


def heading_slug(value):
    value = re.sub(r'[`*_]', '', value.lower())
    value = ''.join(char for char in value if char.isspace() or char in '_-' or unicodedata.category(char)[0] in 'LNM')
    return re.sub(r'\s', '-', value)


def main():
    git(['check-ignore', rel(RUN)])
    for name in [READINESS, ARCHIVE_DRIVER, INPUTS, ASSIGNMENT, REVIEW, REVIEW_SUPPORT.rstrip('/')]:
        assert not repo_path(name).exists(), 'Never overwrite review/historical work: ' + name
    assert fingerprint(BASELINE)['sha256'] == 'ed5906c0c6c97b52055bcb9edae0c93120bd379446b7a33b8e2b5ff8fd164c45'
    assert fingerprint(BYTE_CHECK)['sha256'] == '30941803b7f15af7cc44be9f742be0c95a0a2148bf65675c8f5b562927101253'
    assert fingerprint(EVIDENCE_CHECK)['sha256'] == '6d624edf0f2f742724e3fa5b5702664fb58d6c8e81b50738fab11cd9b80a1349'
    assert fingerprint(AMENDMENT)['sha256'] == '899234ecfcead72ac7cf4cfa6b32fdc77f90348afbf7dbfce30ef9b56111ea07'
    assert fingerprint(SUPPORT + 'manifest.json')['sha256'] == '1ba9fb6fde027bade004d9246dc00504e4a38ba508f1c12539867efa0c29123d'
    baseline, byte_check, evidence, amendment = map(load, [BASELINE, BYTE_CHECK, EVIDENCE_CHECK, AMENDMENT])
    assert len(baseline['files']) == baseline['protectedRegularFiles'] == 2582
    head = git(['rev-parse', 'HEAD']).decode().strip()
    refs_hash = sha(git(['for-each-ref', '--format=%(objectname) %(refname)']))
    status = git(['status', '--short'], retain_text=True).decode().splitlines()
    assert head == baseline['head'] == '0fda5197c5b950e865af73681225c8bbf5533775'
    assert refs_hash == baseline['projectRefsSha256']
    assert set(baseline['inheritedStatus']).issubset(status)
    captured, nonregular = inventory()
    assert not nonregular, 'Unexpected non-regular Git-visible paths'

    for name, expected in byte_check['deliveryFingerprints'].items():
        assert captured[name] == expected, 'Changed setup delivery: ' + name
    assert evidence['capturedSetupFileCount'] == 169
    assert len(evidence['capturedSetupFiles']) == 169
    assert evidence['capturedSetupFiles'] == {name: captured[name] for name in evidence['capturedSetupFiles']}, 'Changed delivered setup report/support'
    assert evidence['totalObservationCount'] == 35 and evidence['initialNonzeroObservationCount'] == 11
    assert evidence['allThirteenActualMaintainedFingerprints'] == {name: captured[name] for name in evidence['allThirteenActualMaintainedFingerprints']}
    assert captured[amendment['addedMaintainedPath']] == amendment['exactExpectedPostAmendmentFingerprint']
    historical = {**baseline['historicalInputsAndSeals'], BASELINE: fingerprint(BASELINE)}
    for name, expected in historical.items():
        assert fingerprint(name) == expected, 'Changed historical input/seal: ' + name
    for name, source in byte_check['sourceReferences']['originals'].items():
        expected = baseline['files'][name]
        assert fingerprint(source['originalPath']) == expected
        historical[source['originalPath']] = expected
    assert fingerprint(amendment['historicalSnapshot']['path']) == amendment['protectedPreAmendmentFingerprint']
    historical[amendment['historicalSnapshot']['path']] = amendment['protectedPreAmendmentFingerprint']

    manifest_name = SUPPORT + 'manifest.json'
    copy_manifest = load(manifest_name)
    assert len(copy_manifest['entries']) == 4
    for entry in copy_manifest['entries']:
        for phase in ['source', 'archive']:
            record = entry[phase]
            assert fingerprint(record['path']) == {key: record[key] for key in ['mode', 'bytes', 'sha256']}
        assert repo_path(entry['source']['path']).read_bytes() == repo_path(entry['archive']['path']).read_bytes()
        historical[entry['source']['path']] = fingerprint(entry['source']['path'])
    failure_manifest = load(FAILURE_MANIFEST)
    assert len(failure_manifest['entries']) == 2
    for entry in failure_manifest['entries']:
        for phase in ['source', 'archive']:
            record = entry[phase]
            assert fingerprint(record['path']) == {key: record[key] for key in ['mode', 'bytes', 'sha256']}
        assert repo_path(entry['source']['path']).read_bytes() == repo_path(entry['archive']['path']).read_bytes()
        historical[entry['source']['path']] = fingerprint(entry['source']['path'])
    curated = [*(entry['archive']['path'] for entry in copy_manifest['entries']), manifest_name, SUPPORT + 'README.md',
               *(entry['archive']['path'] for entry in failure_manifest['entries']), FAILURE_MANIFEST]
    expected_additions = set(byte_check['protectedScope']['newMaintainedPaths'] + byte_check['protectedScope']['newEvidencePaths'] + [AMENDMENT] + curated)
    assert set(captured) - set(baseline['files']) == expected_additions, 'Unexpected repository addition'
    expected_changed = set(byte_check['protectedScope']['maintainedChangedOriginals']) | set(COORDINATOR_DOCUMENTS)
    changed = []
    for name, expected in baseline['files'].items():
        assert captured[name]['mode'] == expected['mode'], 'Original mode changed: ' + name
        if captured[name] != expected:
            changed.append(name)
    assert set(changed) == expected_changed, 'Unexpected original-file change'
    assert len(changed) == 17
    assert len(expected_additions) == 182 and len(captured) == len(baseline['files']) + len(expected_additions) == 2764
    for name in expected_additions:
        assert captured[name]['mode'] == '0644'

    inspected = sorted(set(DOCUMENTS + curated + [AMENDMENT]))
    assert git(['check-ignore', '-z', '--stdin'], 1, b''.join(name.encode() + b'\0' for name in inspected)) == b''
    links, anchors, json_count = 0, 0, 0
    for name in inspected:
        text = repo_path(name).read_text()
        privacy(text, name)
        assert text.endswith('\n') and not re.search(r'\r|[\t ]+$', text, re.M), 'Whitespace: ' + name
        if name.endswith('.json'):
            load(name)
            json_count += 1
        if name not in DOCUMENTS:
            continue
        for href in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
            if re.match(r'^[a-z][a-z\d+.-]*:', href, re.I):
                continue
            filename, _, fragment = href.partition('#')
            target = (repo_path(name).parent / urllib.parse.unquote(filename)).resolve() if filename else repo_path(name)
            assert target.is_relative_to(ROOT) and target.exists(), name + ': unresolved link ' + href
            links += 1
            if fragment:
                headings = re.findall(r'^#{1,6}\s+(.+?)\s*#*$', target.read_text(), re.M)
                assert urllib.parse.unquote(fragment) in map(heading_slug, headings), name + ': unresolved anchor ' + href
                anchors += 1
    task_text = repo_path(TASK).read_text()
    section = task_text.split('### Task CI-DAG-05:')[1].split('## Shared verification')[0]
    assert '\nStatus: in_progress\n' in section
    assert 'any additional package execution, including focused lanes, requires renewed explicit authorization' in section
    assert '**in_progress and blocked before independent corrective/final rollout acceptance**' in section
    assert fingerprint(BUNDLE + 'ci-dag-05-finishing-review.md')['sha256'] == 'f96fa3f21bd701a1862823eae388c78fb189f296bd6f40c4cfe975767f3ba02b'
    formatter_selection = [*DOCUMENTS, manifest_name, FAILURE_MANIFEST]
    run(['pnpm', 'exec', 'prettier', '--check', '--config-path', '.prettierrc', *formatter_selection], retain_text=True)
    git(['diff', '--check'], retain_text=True)
    assert inventory() == (captured, nonregular), 'Readiness checks changed reviewed bytes/modes'
    assert git(['rev-parse', 'HEAD']).decode().strip() == head
    assert sha(git(['for-each-ref', '--format=%(objectname) %(refname)'])) == refs_hash
    readiness = {
        'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'startedAt': STARTED_AT,
        'ownerAlias': 'CI-DAG-05 remediation coordinator',
        'verdict': 'Coordinator documents, exact preserved reconciliation copies and protected delivery scope match; ready to snapshot and assign fresh independent review, not acceptance',
        'scope': 'Files/JSON/links/privacy/ignored status and installed Prettier --check only; no helper/package suite, build, resource, source operation, runtime/tool installation, hosted or publication execution',
        'command': ['python3', rel(pathlib.Path(__file__).resolve()), '--freeze-idle-review-ready'],
        'cwd': '.', 'tmpdir': rel(RUN), 'runtime': {'python': sys.version.split()[0], 'platform': sys.platform},
        'checks': {'documents': len(DOCUMENTS), 'jsonFiles': json_count, 'inspectedFiles': len(inspected),
                   'localLinks': links, 'anchors': anchors, 'privacyNewlineWhitespaceIgnore': 'passed',
                    'prettierSelection': formatter_selection, 'prettier': 'exit 0', 'gitDiffCheck': 'exit 0'},
        'documentFingerprints': {name: captured[name] for name in DOCUMENTS},
        'preservedCopiesAndMetadata': {name: captured[name] for name in curated},
        'allSetupDeliveryFingerprintsMatched': len(byte_check['deliveryFingerprints']),
        'capturedSetupFilesMatched': 169, 'originalHistoricalInputsMatched': len(historical),
        'originalBaseline': {'path': BASELINE, **fingerprint(BASELINE)},
        'scopeDelta': {'protectedOriginals': 2582, 'unchangedOriginals': 2582 - len(changed),
                       'maintainedChangedOriginals': byte_check['protectedScope']['maintainedChangedOriginals'],
                       'coordinatorChangedOriginals': COORDINATOR_DOCUMENTS,
                       'newMaintainedPaths': byte_check['protectedScope']['newMaintainedPaths'],
                       'newSetupEvidenceFiles': 169, 'newCoordinatorPreservedFiles': len(curated),
                       'amendmentSeparatelyAccounted': True, 'allCurrentRegularFiles': len(captured)},
        'currentFilesTableSha256': table_hash(captured), 'head': head, 'projectRefsSha256': refs_hash,
        'allExistingBytesModesAndRefsUnchangedByChecks': True, 'commands': list(COMMANDS),
        'coordinatorDriver': {'historicalPath': rel(pathlib.Path(__file__).resolve()),
                              'archivePath': ARCHIVE_DRIVER, **fingerprint(rel(pathlib.Path(__file__).resolve()))},
        'archivePath': READINESS,
        'retainedReadinessFailure': {'manifest': {'path': FAILURE_MANIFEST, **captured[FAILURE_MANIFEST]},
                                     'failedAt': failure_manifest['failedAt'],
                                     'disposition': failure_manifest['disposition']},
        'selfReferenceLimit': 'Input capture precedes this result, its driver copy, review inputs, assignment and review evidence; no self/future-file certification',
        'omitted': ['Redundant Git/raw command streams retained only in original scratch; relevant formatter/diff output is included above',
                    'Ignored dependencies, builds, caches, tool binaries, fixture objects and execution state; no archive-only test reproduction'],
        'retainedBlockers': evidence['limitations'][2:4],
    }
    scratch_result = rel(RUN / 'handoff-readiness.json')
    write_json(scratch_result, readiness)
    privacy(pathlib.Path(__file__).read_text(), rel(pathlib.Path(__file__).resolve()))
    with repo_path(READINESS).open('xb') as handle:
        handle.write(repo_path(scratch_result).read_bytes())
    with repo_path(ARCHIVE_DRIVER).open('xb') as handle:
        handle.write(pathlib.Path(__file__).read_bytes())
    assert fingerprint(READINESS) == fingerprint(scratch_result)
    assert fingerprint(ARCHIVE_DRIVER) == fingerprint(rel(pathlib.Path(__file__).resolve()))
    review_files, review_nonregular = inventory()
    assert review_nonregular == nonregular
    assert {name: value for name, value in review_files.items() if name not in [READINESS, ARCHIVE_DRIVER]} == captured
    assert set(review_files) - set(captured) == {READINESS, ARCHIVE_DRIVER}
    r1_paths = ['scripts/ci-test-workspace.mjs', 'scripts/ci-test-workspace.test.mjs',
                'scripts/ci-test-artifacts.mjs', 'scripts/ci-test-artifacts.test.mjs', 'README.md']
    r2_record = load(BUNDLE + 'ci-dag-05-r2-coordinator-reconciliation.json')
    r2_paths = r2_record['protectedScope']['r2CodeEdits'] + r2_record['protectedScope']['r2CodeAdditions']
    assert len(r2_paths) == 8
    setup_paths = list(evidence['allThirteenActualMaintainedFingerprints'])
    maintained = sorted(set(r1_paths + r2_paths + setup_paths))
    assert len(maintained) == 24
    snapshot = {
        'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'ownerAlias': 'CI-DAG-05 remediation coordinator',
        'reviewAlias': 'CI-DAG-05 fresh corrective-review session',
        'assignmentState': 'Prepared after idle R1/R2/setup delivery reconciliation; no reviewer assigned or accepted by this snapshot',
        'scope': 'Immutable exact input snapshot for fresh non-implementer corrective review; all listed original bytes and modes are protected during review',
        'head': head, 'projectRefsSha256': refs_hash, 'gitStatus': status,
        'protectedRegularFiles': len(review_files), 'filesTableSha256': table_hash(review_files),
        'files': review_files, 'nonRegularGitVisiblePaths': review_nonregular,
        'allCorrectiveMaintainedPaths': maintained,
        'reviewedMaintainedFingerprints': {name: review_files[name] for name in maintained},
        'historicalProtectedInputs': historical,
        'readinessCheck': {'source': {'path': scratch_result, **fingerprint(scratch_result)},
                           'archive': {'path': READINESS, **fingerprint(READINESS)},
                           'transformation': 'None; byte-exact copy; source retained unchanged'},
        'coordinatorReadinessDriver': {'source': {'path': rel(pathlib.Path(__file__).resolve()), **fingerprint(rel(pathlib.Path(__file__).resolve()))},
                                      'archive': {'path': ARCHIVE_DRIVER, **fingerprint(ARCHIVE_DRIVER)},
                                      'transformation': 'None; byte-exact historical driver; not runnable from archive alone'},
        'allowedReviewerNewFile': REVIEW, 'allowedReviewerNewEvidencePrefix': REVIEW_SUPPORT,
        'allowedCoordinatorNewAssignmentRecord': ASSIGNMENT,
        'protectedDuringReview': 'No edit, deletion or mode change to existing listed files, delivered/historical evidence, project HEAD/refs, package scripts/assertions or implementation; only fresh ignored scratch and the three enumerated new report/support/assignment destinations may be written',
        'executionBoundary': ['Begin with independent matching of this table, HEAD/refs and original seals; stop on unexpected drift',
                              'At most one fresh pnpm test:ci:check and one pnpm test:groups:check, serially, plus proportionate installed-tool lint/format/YAML/actionlint checks',
                              'Maintained synthetic checkout fixtures are allowed inside CI validation; separate source/native short-root/runner probes are not authorized',
                              'No additional package execution including focused lanes, resources, build/full suites, runtime/tool installation, history/config copying, fetch/retry/weaker fsck, hosted run, commit/push/dispatch/publication/settings or further delegation'],
        'retainedBlockers': ['R1 and setup independent acceptance remain outstanding; positive full native short-root success, Node-20 execution and actual runner main/post behavior are unverified',
                             'Original R2 cause, focused Node abort failure, observer timing neutrality and incomplete packed-consumer disposition remain unresolved; complete-package allowance is spent',
                             'All R3 live healthy/fault/preparation/validation/cancellation/missing/skipped results, scheduling/artifacts/required-check, timing/quota/billing and maintainer rollout decisions remain outstanding'],
        'selfReferenceLimit': 'The exact table excludes this snapshot written after capture and future assignment/review files; the launch prompt supplies this file hash. Historical execution results certify only their recorded inputs, not this later snapshot.',
        'omitted': 'Ignored dependencies/caches/builds/tool binaries/fixture state and redundant original scratch inventories remain local and are not copied; this is a review input seal, not a self-contained test reproduction bundle',
        'command': ['python3', rel(pathlib.Path(__file__).resolve()), '--freeze-idle-review-ready'], 'cwd': '.', 'tmpdir': rel(RUN),
    }
    write_json(INPUTS, snapshot)
    assert load(INPUTS) == snapshot
    final_files, final_nonregular = inventory()
    assert final_nonregular == review_nonregular
    assert {name: value for name, value in final_files.items() if name != INPUTS} == review_files
    assert set(final_files) - set(review_files) == {INPUTS}
    assert git(['check-ignore', '-z', '--stdin'], 1,
               b'\0'.join(name.encode() for name in [READINESS, ARCHIVE_DRIVER, INPUTS]) + b'\0') == b''
    assert git(['rev-parse', 'HEAD']).decode().strip() == head
    assert sha(git(['for-each-ref', '--format=%(objectname) %(refname)'])) == refs_hash
    summary = {'checkedAt': readiness['checkedAt'], 'readiness': {'path': READINESS, **fingerprint(READINESS)},
               'reviewInputs': {'path': INPUTS, **fingerprint(INPUTS)}, 'protectedRegularFiles': len(review_files),
               'allCorrectiveMaintainedPaths': len(maintained), 'historicalProtectedInputs': len(historical),
               'checks': readiness['checks'], 'headAndRefsUnchanged': True,
               'allDeliveredReportsAndEvidenceUnchanged': True, 'snapshotExcludesOnlyItselfAndFutureAllowedAdds': True}
    write_json(rel(RUN / 'snapshot-summary.json'), summary)
    print(json.dumps(summary, indent=2))


try:
    main()
except Exception as error:
    failure = {'failedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'scope': 'Coordinator document/readiness/snapshot check failure, not package/helper/source/hosted execution',
               'error': scrub(str(error)), 'type': type(error).__name__, 'commands': COMMANDS}
    write_json(rel(RUN / 'checker-failure.json'), failure)
    print(json.dumps({'failurePath': rel(RUN / 'checker-failure.json'), **failure}, indent=2))
    raise
