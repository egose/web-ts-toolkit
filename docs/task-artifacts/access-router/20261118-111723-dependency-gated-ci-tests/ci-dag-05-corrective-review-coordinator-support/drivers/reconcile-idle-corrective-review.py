"""Read-only byte/scope/document reconciliation; run only after reviewer idle delivery."""
import datetime
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import unicodedata
import urllib.parse

assert sys.argv[1:] == ['--reviewer-idle-confirmed']
ROOT = pathlib.Path.cwd().resolve(strict=True)
RUN = ROOT / '_tmp-c5f-ovtrnV/corrective-reconcile-e8x4a97c'
os.environ['TMPDIR'] = str(RUN)
BUNDLE = 'docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/'
INPUTS = BUNDLE + 'ci-dag-05-corrective-review-inputs.json'
ASSIGNMENT = BUNDLE + 'ci-dag-05-corrective-review-assignment.json'
REPORT = BUNDLE + 'ci-dag-05-corrective-review.md'
SUPPORT = BUNDLE + 'ci-dag-05-corrective-review-support/'
SEAL = '_tmp-c5f-ovtrnV/corrective-reconcile-e8x4a97c/launch-seal.json'
RESULT = '_tmp-c5f-ovtrnV/corrective-reconcile-e8x4a97c/coordinator-review-byte-scope.json'
COMMANDS = []


def relative(path):
    return path.relative_to(ROOT).as_posix()


def path_for(name):
    path = pathlib.PurePosixPath(name)
    assert not path.is_absolute() and '..' not in path.parts and path.as_posix() == name
    return ROOT / name


def digest(value):
    return hashlib.sha256(value).hexdigest()


def fingerprint(name):
    path = path_for(name)
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode), 'Expected regular file: ' + name
    value = path.read_bytes()
    return {'mode': format(stat.S_IMODE(info.st_mode), '04o'), 'bytes': len(value), 'sha256': digest(value)}


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        assert key not in result, 'Duplicate JSON key: ' + key
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError('Nonfinite JSON: ' + value)


def load(name):
    return json.loads(path_for(name).read_bytes(), object_pairs_hook=unique_keys, parse_constant=reject_constant)


def scrub(text):
    return re.sub(r'\bses_[A-Za-z0-9_-]+', '<private-session-id>',
                  text.replace(str(ROOT), '<repo-root>').replace(str(pathlib.Path.home()), '<user-home>'))


def privacy(text, name):
    assert '\0' not in text and scrub(text) == text, 'Private local content: ' + name
    patterns = [r'(?<![\w./<>-])/(?:home|Users)/[A-Za-z0-9._-]+(?:/|\b)',
                r'(?<![\w./<>-])/(?:tmp|private/tmp)/[A-Za-z0-9._-]+(?:/|\b)',
                r'\bses_[A-Za-z0-9_-]{8,}\b', r'\bgh[pousr]_[A-Za-z0-9]{20,}\b',
                r'\bgithub_pat_[A-Za-z0-9_]{20,}\b',
                r'-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----', r'https?://[^\s/]+:[^\s/]+@']
    assert not any(re.search(pattern, text) for pattern in patterns), 'Privacy pattern: ' + name


def git(args, expected=0):
    command = ['git', '--no-optional-locks', *args]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    result = subprocess.run(command, cwd=ROOT, env=os.environ, capture_output=True, check=False)
    COMMANDS.append({'command': command, 'cwd': '.', 'tmpdir': relative(RUN), 'startedAt': started,
                     'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                     'exitCode': result.returncode, 'stdoutBytes': len(result.stdout),
                     'stdoutSha256': digest(result.stdout), 'stderrBytes': len(result.stderr),
                     'stderrSha256': digest(result.stderr), 'stderrText': scrub(result.stderr.decode())})
    assert result.returncode == expected, scrub(result.stdout.decode() + result.stderr.decode())
    return result.stdout


def inventory():
    names = sorted(set(git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).decode().split('\0')) - {''})
    files, other = {}, {}
    for name in names:
        path = path_for(name)
        info = path.lstat()
        if stat.S_ISREG(info.st_mode):
            files[name] = fingerprint(name)
        elif stat.S_ISLNK(info.st_mode):
            other[name] = {'kind': 'symlink', 'target': os.readlink(path), 'mode': format(stat.S_IMODE(info.st_mode), '04o')}
        else:
            other[name] = {'kind': 'other', 'mode': format(stat.S_IMODE(info.st_mode), '04o')}
    return files, other


def table_hash(files):
    return digest(json.dumps(files, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode())


def slug(value):
    value = re.sub(r'[`*_]', '', value.lower())
    value = ''.join(char for char in value if char.isspace() or char in '_-' or unicodedata.category(char)[0] in 'LNM')
    return re.sub(r'\s', '-', value)


def write_json(name, value):
    text = json.dumps(value, indent=2, ensure_ascii=False) + '\n'
    privacy(text, name)
    with path_for(name).open('x') as handle:
        handle.write(text)


def main():
    assert not path_for(RESULT).exists(), 'Never overwrite a prior coordinator observation'
    git(['check-ignore', relative(RUN)])
    assert fingerprint(INPUTS) == {'mode': '0644', 'bytes': 610017, 'sha256': 'ad378fec69c87bb1b750c9f1bb3b47b23861ebf4f1d40a3aabb9ebe4678ef696'}
    assert fingerprint(SEAL)['sha256'] == '6e89f7233b97cde411adbce91c52ebfdad99e8a2f87443ef233f2ddbf5768157'
    inputs, seal = load(INPUTS), load(SEAL)
    assert len(inputs['files']) == inputs['protectedRegularFiles'] == 2771
    assert table_hash(inputs['files']) == inputs['filesTableSha256'] == '0ff69a3db18fc13dbebe0107f4dc3dc03151520dd1a263da180feee31c56a7c2'
    assert fingerprint(ASSIGNMENT) == {key: seal['assignment'][key] for key in ['mode', 'bytes', 'sha256']}
    head = git(['rev-parse', 'HEAD']).decode().strip()
    refs_hash = digest(git(['for-each-ref', '--format=%(objectname) %(refname)']))
    status = git(['status', '--short']).decode().splitlines()
    assert head == inputs['head'] == seal['head']
    assert refs_hash == inputs['projectRefsSha256'] == seal['projectRefsSha256']
    assert status == inputs['gitStatus'], 'Unexpected staged or tracked/untracked status drift'
    files, nonregular = inventory()
    assert nonregular == inputs['nonRegularGitVisiblePaths']
    for name, expected in inputs['files'].items():
        assert files.get(name) == expected, 'Changed frozen original: ' + name
    assert len(inputs['allCorrectiveMaintainedPaths']) == 24
    assert set(inputs['reviewedMaintainedFingerprints']) == set(inputs['allCorrectiveMaintainedPaths'])
    assert inputs['reviewedMaintainedFingerprints'] == {name: files[name] for name in inputs['allCorrectiveMaintainedPaths']}
    for name, expected in inputs['historicalProtectedInputs'].items():
        assert fingerprint(name) == expected, 'Changed historical original/seal: ' + name
    assert len(inputs['historicalProtectedInputs']) == 33
    source_copy_checks = {}
    for key in ['readinessCheck', 'coordinatorReadinessDriver']:
        record = inputs[key]
        for phase in ['source', 'archive']:
            value = record[phase]
            assert fingerprint(value['path']) == {field: value[field] for field in ['mode', 'bytes', 'sha256']}
        assert path_for(record['source']['path']).read_bytes() == path_for(record['archive']['path']).read_bytes()
        source_copy_checks[key] = record
    added = sorted(set(files) - set(inputs['files']))
    assert INPUTS in added and ASSIGNMENT in added and REPORT in added
    assert all(name in [INPUTS, ASSIGNMENT, REPORT] or name.startswith(SUPPORT) for name in added), 'Unexpected review-phase addition'
    reviewer_paths = [name for name in added if name == REPORT or name.startswith(SUPPORT)]
    assert files[REPORT]['mode'] == '0644'
    for name in reviewer_paths:
        assert git(['check-ignore', name], 1) == b'', 'Review evidence is ignored: ' + name
    documents, json_files, links, anchors = [], [], 0, 0
    for name in [ASSIGNMENT, *reviewer_paths]:
        text = path_for(name).read_text()
        privacy(text, name)
        if name.endswith(('.md', '.json')):
            assert text.endswith('\n') and not re.search(r'\r|[\t ]+$', text, re.M), 'Metadata whitespace: ' + name
        if name.endswith('.json'):
            load(name)
            json_files.append(name)
        if not name.endswith('.md'):
            continue
        documents.append(name)
        for href in re.findall(r'\[[^\]]*\]\(([^)]+)\)', text):
            if re.match(r'^[a-z][a-z\d+.-]*:', href, re.I):
                continue
            filename, _, fragment = href.partition('#')
            target = (path_for(name).parent / urllib.parse.unquote(filename)).resolve() if filename else path_for(name)
            assert target.is_relative_to(ROOT) and (target.is_file() or target.is_dir()), name + ': unresolved link ' + href
            links += 1
            if fragment:
                assert target.is_file(), name + ': anchor is not in a file ' + href
                headings = re.findall(r'^#{1,6}\s+(.+?)\s*#*$', target.read_text(), re.M)
                assert urllib.parse.unquote(fragment) in map(slug, headings), name + ': unresolved anchor ' + href
                anchors += 1
    assert inventory() == (files, nonregular), 'Reconciliation changed Git-visible bytes/modes'
    assert git(['rev-parse', 'HEAD']).decode().strip() == head
    assert digest(git(['for-each-ref', '--format=%(objectname) %(refname)'])) == refs_hash
    result = {
        'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'ownerAlias': 'CI-DAG-05 remediation coordinator',
        'verdict': 'Idle reviewer report/support bytes and allowed scope reconciled; behavioral findings and saved-command reconciliation are separate, not test or rollout recertification',
        'scope': 'Read-only Git metadata, file hashes/modes, new report/support privacy, JSON validity and local links; no import/test/build/resource/source/runtime/tool/hosted/publication execution',
        'command': ['python3', relative(pathlib.Path(__file__).resolve()), '--reviewer-idle-confirmed'],
        'cwd': '.', 'tmpdir': relative(RUN), 'head': head, 'projectRefsSha256': refs_hash,
        'reviewInputs': {'path': INPUTS, **fingerprint(INPUTS)},
        'assignment': {'path': ASSIGNMENT, **fingerprint(ASSIGNMENT)},
        'launchSeal': {'path': SEAL, **fingerprint(SEAL)},
        'protectedOriginals': len(inputs['files']), 'unchangedOriginals': len(inputs['files']),
        'historicalInputsAndSealsMatched': len(inputs['historicalProtectedInputs']),
        'allCorrectiveMaintainedFingerprintsMatched': len(inputs['reviewedMaintainedFingerprints']),
        'readinessAndDriverSourceCopiesMatched': source_copy_checks,
        'reviewerNewFileCount': len(reviewer_paths), 'reviewerFiles': {name: files[name] for name in reviewer_paths},
        'allowedNewCoordinatorRecord': ASSIGNMENT, 'allAddedPaths': added,
        'allCurrentRegularFiles': len(files), 'currentFilesTableSha256': table_hash(files),
        'newDocumentsChecked': documents, 'newJsonFilesChecked': json_files,
        'localLinks': links, 'anchors': anchors,
        'privacyJsonLinksAndMetadataWhitespace': 'passed; raw/diff evidence not reformatted',
        'gitStatusMatchedInitialSnapshot': True, 'checksMadeNoGitVisibleEdits': True,
        'commands': COMMANDS,
        'checker': {'path': relative(pathlib.Path(__file__).resolve()), **fingerprint(relative(pathlib.Path(__file__).resolve()))},
        'selfReferenceLimit': 'This result is written after input capture; it excludes itself, future curated copies/status edits and subsequent coordinator evidence',
        'limits': ['Does not independently rerun reviewer CI/group/quality checks or establish original R2 causality/timing neutrality',
                   'Does not certify full native short-root, Node-20 or runner/main/post behavior or any R3 hosted/maintainer rollout decision',
                   'Ignored dependencies, caches, builds, fixture state, tool binaries and redundant metadata streams are omitted; not archive-only execution reproduction'],
    }
    write_json(RESULT, result)
    print(json.dumps({'result': {'path': RESULT, **fingerprint(RESULT)},
                      'protectedOriginalsMatched': len(inputs['files']), 'reviewerNewFiles': len(reviewer_paths),
                      'historicalInputsAndSealsMatched': len(inputs['historicalProtectedInputs']),
                      'localLinks': links, 'anchors': anchors, 'newJsonFiles': len(json_files),
                      'noExistingBytesModesHeadRefsChanged': True}, indent=2))


try:
    main()
except Exception as error:
    failure = {'failedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
               'scope': 'Read-only coordinator idle-review reconciliation failure, not a suite/probe execution',
               'error': scrub(str(error)), 'type': type(error).__name__, 'commands': COMMANDS}
    failure_path = relative(RUN / 'coordinator-checker-failure.json')
    write_json(failure_path, failure)
    print(json.dumps({'failurePath': failure_path, **failure}, indent=2))
    raise
