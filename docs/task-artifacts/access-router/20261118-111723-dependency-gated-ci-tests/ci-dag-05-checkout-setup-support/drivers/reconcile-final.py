import datetime
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess

root = pathlib.Path.cwd()
scratch = pathlib.Path(__file__).parent
destination = pathlib.Path(os.environ['TMPDIR']).parent
added_test = 'scripts/ci-test-workspace.test.mjs'
coordinator_delta_path = '_tmp-c5f-ovtrnV/setup-scope-check-vLNj13/coordinator-deltas.json'
preimage_path = '_tmp-c5f-ovtrnV/setup-scope-amendment-M5CVmx/workspace-test-before.mjs'

def git(*args):
    return subprocess.check_output(['git', '--no-optional-locks', *args], cwd=root)

def fingerprint(path):
    target = root / path
    info = target.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise RuntimeError('Nonregular scope input: ' + path)
    data = target.read_bytes()
    return {'mode': format(stat.S_IMODE(info.st_mode), '04o'), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest()}

def verified_json(path, size, digest):
    fp = fingerprint(path)
    assert fp['bytes'] == size and fp['sha256'] == digest, path
    return json.loads((root / path).read_text()), {'path': path, **fp}

initial, preflight_fp = verified_json(
    str((scratch / 'preflight.json').relative_to(root)), 547222,
    '72b2bcd351628378cfd9f6ad7ccf1e01f7a154e543343b0ff559e1d982cdb4ff')
coordinator, coordinator_fp = verified_json(
    initial['coordinatorBaseline']['path'], 547981,
    'ed5906c0c6c97b52055bcb9edae0c93120bd379446b7a33b8e2b5ff8fd164c45')
delta, delta_fp = verified_json(
    coordinator_delta_path, 2598,
    '4c24f3a6fc7a32b88ff405f8096b4ca9b0ed680c3f0a09aaeb6a03b88f5357e1')
amendment_path = delta['coordinatorAddedAmendment']['path']
amendment, amendment_fp = verified_json(
    amendment_path, 3315,
    '899234ecfcead72ac7cf4cfa6b32fdc77f90348afbf7dbfce30ef9b56111ea07')
original_owned = set(initial['allowedMaintainedPaths'])
assert len(original_owned) == 12 and original_owned == set(coordinator['allowedMaintainedPaths'])
owned = original_owned | {added_test}
coordinator_documents = delta['coordinatorChangedDocuments']
assert len(coordinator_documents) == 4 and not (owned & set(coordinator_documents))

paths = sorted(set(os.fsdecode(p) for p in git('ls-files', '-z', '--cached', '--others',
                                            '--exclude-standard', '--deduplicate').split(b'\0') if p))
current = {path: fingerprint(path) for path in paths}
changed = {p: {'before': old, 'after': current.get(p)} for p, old in initial['files'].items()
           if old != current.get(p)}
added = {p: fp for p, fp in current.items() if p not in initial['files']}
unexpected = [p for p in changed if p not in owned and p not in coordinator_documents]
unexpected += [p for p in added if p not in owned and p != amendment_path
               and p != initial['allowedNewEvidenceFile']
               and not p.startswith(initial['allowedNewEvidencePrefix'])]
historical = {path: fingerprint(path) for path in initial['historicalInputsAndSeals']}

workflow = (root / '.github/workflows/test.yml').read_text()
independent = {}
for name in initial['independentJobBlocks']:
    match = re.search(r'^  ' + re.escape(name) + r':\n.*?(?=^  [a-zA-Z0-9_-]+:\n|\Z)',
                      workflow, re.M | re.S)
    if not match:
        raise RuntimeError('Missing independent job block: ' + name)
    source = match.group().rstrip('\n') + '\n'
    data = source.encode()
    independent[name] = {'source': source, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

preimage = (root / preimage_path).read_bytes()
old_line = amendment['allowedChange']['previousLine'].encode()
new_line = amendment['allowedChange']['replacementLine'].encode()
postimage = (root / added_test).read_bytes()
before_package = (scratch / 'before/package.json').read_bytes()
package_anchor = b'scripts/ci-test-results.test.mjs && node scripts/ci-test-plan.mjs --check'
package_replacement = b'scripts/ci-test-results.test.mjs scripts/ci-test-checkout.test.mjs && node scripts/ci-test-plan.mjs --check'
before_results = (scratch / 'before/scripts/ci-test-results.test.mjs').read_bytes()
result_changes = [
    (b'    assert.equal(job.steps[1].with.workspace, node.workspace);',
     b"    assert.deepEqual(job.steps[1], { id: 'source', uses: './.github/actions/ci-checkout' });\n    assert.equal(job.steps[2].with.workspace, node.workspace);"),
    (b"    env: { CI_TEST_NEEDS: '${{ toJSON(needs) }}' },",
     b"    'working-directory': '${{ steps.source.outputs.root }}',\n    env: { TMPDIR: '${{ steps.source.outputs.tmpdir }}', CI_TEST_NEEDS: '${{ toJSON(needs) }}' },"),
]
expected_results = before_results
for old, new in result_changes:
    assert expected_results.count(old) == 1
    expected_results = expected_results.replace(old, new)
before_plan = (scratch / 'before/scripts/ci-test-plan.mjs').read_bytes()
plan = (root / 'scripts/ci-test-plan.mjs').read_bytes()
graph_boundary = b'export const ciActions = {'
assert before_plan.count(graph_boundary) == plan.count(graph_boundary) == 1

final_ci_path = str((scratch / 'ci-check-final-aKP5nR/result.json').relative_to(root))
final_ci = json.loads((root / final_ci_path).read_text())
final_inputs = {path: current[path] for path in sorted(owned)}
head = git('rev-parse', 'HEAD').decode().strip()
refs_hash = hashlib.sha256(git('for-each-ref', '--format=%(objectname) %(refname)')).hexdigest()
status = git('status', '--short').decode().splitlines()
missing_status = sorted(set(initial['inheritedStatus']) - set(status))
assertions = {
    'original2582FileCoordinatorBaselineMatchesPreflight': initial['files'] == coordinator['files'] and len(initial['files']) == 2582,
    'coordinatorBaselineBytesAndModeUnchanged': coordinator_fp == initial['coordinatorBaseline'],
    'stage2PreflightFingerprintMatched': True,
    'thirteenMaintainedPathsOnly': len(owned) == 13 and not unexpected,
    'fourCoordinatorDocumentDeltasExactlyMatched': all(current.get(p) == fp for p, fp in coordinator_documents.items()),
    'coordinatorAddedArtifactExactlyMatched': current.get(amendment_path) == {k: v for k, v in delta['coordinatorAddedAmendment'].items() if k != 'path'},
    'originalHistorical13InputAndSealFingerprintsUnchanged': historical == initial['historicalInputsAndSeals'],
    'threeIndependentJobBlocksUnchanged': independent == initial['independentJobBlocks'],
    'headUnchanged': head == initial['head'],
    'projectRefsUnchanged': refs_hash == initial['projectRefsSha256'],
    'allExistingFileModesUnchanged': all(current.get(p) and current[p]['mode'] == fp['mode'] for p, fp in initial['files'].items()),
    'allInheritedStatusEntriesRetained': not missing_status,
    'oneLineR1MetadataAmendmentOnly': preimage.count(old_line) == 1 and postimage == preimage.replace(old_line, new_line)
        and current[added_test] == delta['exactExpectedPostAmendmentFingerprint']
        and initial['files'][added_test] == {k: v for k, v in delta['protectedPreAmendmentTest'].items() if k != 'path'},
    'rootManifestOnlyApprovedValidationFilenameAddition': before_package.count(package_anchor) == 1
        and (root / 'package.json').read_bytes() == before_package.replace(package_anchor, package_replacement),
    'resultTestOnlyApprovedWiringAmendment': (root / 'scripts/ci-test-results.test.mjs').read_bytes() == expected_results,
    'dependencyModelGraphPrefixBytesUnchanged': before_plan.split(graph_boundary)[0] == plan.split(graph_boundary)[0],
    'mandatoryCiCheckSucceededOnAllFinalMaintainedFingerprints': final_ci['status'] == 0 and final_ci['signal'] is None
        and final_ci['inputsBefore'] == final_ci['inputsAfter'] == final_inputs,
}
result = {
    'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Same setup implementation session, local read-only final scope reconciliation; not coordinator reconciliation, independent acceptance, hosted/runtime/cancellation certification or package execution',
    'preflight': preflight_fp, 'coordinatorBaseline': coordinator_fp,
    'coordinatorDeltaRecord': delta_fp, 'coordinatorAmendmentArtifact': amendment_fp,
    'maintainedPathCount': len(owned), 'maintainedFinalFingerprints': final_inputs,
    'maintainedExistingChanges': {p: value for p, value in changed.items() if p in owned},
    'maintainedNewFiles': {p: value for p, value in added.items() if p in owned},
    'coordinatorOnlyDocumentChanges': {p: value for p, value in changed.items() if p in coordinator_documents},
    'coordinatorOnlyNewArtifact': {amendment_path: added.get(amendment_path)},
    'newSetupEvidenceObservedAtCapture': {p: value for p, value in added.items() if p not in owned and p != amendment_path},
    'originalRegularFileCount': len(initial['files']), 'originalModeCounts': initial['modeCounts'],
    'unchangedOriginalFilesOutsideMaintainedAndCoordinatorDeltas': len(initial['files']) - len(changed),
    'historicalInputsAndSeals': historical, 'independentJobBlocks': independent,
    'head': head, 'projectRefsSha256': refs_hash, 'initialStatus': initial['inheritedStatus'], 'finalStatus': status,
    'missingInheritedStatusEntries': missing_status, 'unexpectedPaths': unexpected, 'assertions': assertions,
    'mandatoryCiCheckRecord': {'path': final_ci_path, **fingerprint(final_ci_path)},
    'driver': {'path': str(pathlib.Path(__file__).relative_to(root)), **fingerprint(str(pathlib.Path(__file__).relative_to(root)))},
    'selfReferenceLimit': 'The generated scope record is written after observation; its later curated copy is allowed setup evidence, not a baseline/protected-file delta. No record claims to hash itself.',
}
(destination / 'scope.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'scopeRecord': str((destination / 'scope.json').relative_to(root)),
                  'maintainedExistingChanges': len(result['maintainedExistingChanges']),
                  'maintainedNewFiles': len(result['maintainedNewFiles']),
                  'coordinatorDocumentChanges': len(result['coordinatorOnlyDocumentChanges']),
                  'coordinatorAddedArtifact': 1,
                  'unchangedOriginalFiles': result['unchangedOriginalFilesOutsideMaintainedAndCoordinatorDeltas'],
                  'unexpectedPaths': unexpected, 'assertions': assertions}, indent=2))
assert not unexpected and all(assertions.values())
