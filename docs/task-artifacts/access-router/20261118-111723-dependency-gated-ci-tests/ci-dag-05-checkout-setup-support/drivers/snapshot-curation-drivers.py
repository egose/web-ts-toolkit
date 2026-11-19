"""Retain exact curation-driver preimages before correcting our archival checks."""
import hashlib
import json
import os
import pathlib
import stat

root = pathlib.Path.cwd()
scratch = pathlib.Path(__file__).parent
destination = pathlib.Path(os.environ['TMPDIR']).parent
records = []
for source_name, snapshot_name in [
    ('archive.py', 'archive-initial-before-fix.py'),
    ('preserve-archive-failure.py', 'preserve-archive-failure-before-count-fix.py'),
]:
    source = scratch / source_name
    snapshot = scratch / snapshot_name
    info = source.lstat()
    assert stat.S_ISREG(info.st_mode)
    data = source.read_bytes()
    with snapshot.open('xb') as handle:
        handle.write(data)
    snapshot.chmod(0o644)
    assert snapshot.read_bytes() == data
    records.append({'source': str(source.relative_to(root)), 'snapshot': str(snapshot.relative_to(root)),
                    'mode': format(stat.S_IMODE(info.st_mode), '04o'), 'bytes': len(data),
                    'sha256': hashlib.sha256(data).hexdigest()})
result = {'scope': 'Byte-exact copies of our two failed curation-driver inputs only; no original overwrite or execution recertification',
          'drivers': records}
with (destination / 'validation.json').open('x') as handle:
    handle.write(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
