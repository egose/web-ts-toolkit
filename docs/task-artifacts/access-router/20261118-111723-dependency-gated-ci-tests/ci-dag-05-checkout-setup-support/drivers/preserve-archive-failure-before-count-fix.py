"""Seal our partial archive and failed curation driver without altering either."""
import hashlib
import json
import os
import pathlib
import stat

root = pathlib.Path.cwd()
scratch = pathlib.Path(__file__).parent
support = root / 'docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/ci-dag-05-checkout-setup-support'
destination = pathlib.Path(os.environ['TMPDIR']).parent
preflight = json.loads((scratch / 'preflight.json').read_text())
final = json.loads((scratch / 'ci-check-final-aKP5nR/result.json').read_text())

def fingerprint(path):
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode)
    data = path.read_bytes()
    return {'mode': format(stat.S_IMODE(info.st_mode), '04o'), 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest()}

files = {}
for path in sorted(support.rglob('*')):
    assert not path.is_symlink()
    if path.is_dir():
        continue
    name = str(path.relative_to(support))
    if name.startswith('sources/after/'):
        expected = final['inputsAfter'][name.removeprefix('sources/after/')]
    elif name.startswith('sources/before/'):
        expected = preflight['files'][name.removeprefix('sources/before/')]
    else:
        raise RuntimeError('Unexpected partial evidence path: ' + name)
    fp = fingerprint(path)
    assert fp == expected
    files[str(path.relative_to(root))] = fp
assert len(files) == 22
driver = scratch / 'archive.py'
snapshot = scratch / 'archive-initial-before-fix.py'
data = driver.read_bytes()
with snapshot.open('xb') as handle:
    handle.write(data)
snapshot.chmod(0o644)
record = {
    'scope': 'Owned curation failure only: preserve original failed driver and verify 22 partial source copies; no maintained edit, product/package/source/hosted execution',
    'failedRun': str((scratch / 'archive-initial-sOFopf/result.json').relative_to(root)),
    'failedDriver': {'historicalPath': str(driver.relative_to(root)), **fingerprint(driver)},
    'preservedDriver': {'path': str(snapshot.relative_to(root)), **fingerprint(snapshot)},
    'partialArchiveFiles': files,
    'allPartialCopiesExactlyMatchRecordedSources': True,
    'noExistingEvidenceOverwritten': True,
}
target = destination / 'validation.json'
with target.open('x') as handle:
    handle.write(json.dumps(record, indent=2) + '\n')
print(json.dumps({'validationRecord': str(target.relative_to(root)), 'partialArchiveFiles': len(files),
                  'originalDriverSha256': record['failedDriver']['sha256'],
                  'preservedDriverSha256': record['preservedDriver']['sha256'],
                  'noExistingEvidenceOverwritten': True}, indent=2))
