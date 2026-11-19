import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tarfile

root = pathlib.Path.cwd()
home = pathlib.Path.home()
def sanitize(value):
    return str(value).replace(str(root), '<repo-root>').replace(str(home), '<user-home>')

versions = {}
for command in [['node', '--version'], ['pnpm', '--version'], ['git', '--version'],
                ['pre-commit', '--version'], ['pnpm', 'exec', 'eslint', '--version'],
                ['pnpm', 'exec', 'prettier', '--version']]:
    result = subprocess.run(command, cwd=root, env=os.environ, capture_output=True, text=True)
    versions[' '.join(command)] = {'status': result.returncode,
        'stdout': sanitize(result.stdout), 'stderr': sanitize(result.stderr)}

matches = sorted(p for p in root.glob('_tmp*/**/*actionlint*') if p.is_file())
direct = shutil.which('actionlint')
if direct:
    matches.append(pathlib.Path(direct))
files = []
for path in matches:
    data = path.read_bytes()
    item = {'path': sanitize(path), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    if tarfile.is_tarfile(path):
        with tarfile.open(path) as archive:
            binary = next((m for m in archive.getmembers() if m.name == 'actionlint' and m.isfile()), None)
            if binary:
                payload = archive.extractfile(binary).read()
                item['archivedBinary'] = {'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
    files.append(item)

node_installs = home / '.asdf/installs/nodejs'
pre_commit = home / '.cache/pre-commit'
print(json.dumps({'versions': versions, 'actionlintFiles': files,
    'existingAsdfNodeInstalls': sorted(p.name for p in node_installs.iterdir()) if node_installs.exists() else [],
    'preCommitCache': [{'directory': sanitize(p), 'pyEnvironments': [sanitize(q) for q in p.glob('py_env-*')]} for p in pre_commit.glob('repo*') if (p / '.pre-commit-hooks.yaml').exists()]}, indent=2))
