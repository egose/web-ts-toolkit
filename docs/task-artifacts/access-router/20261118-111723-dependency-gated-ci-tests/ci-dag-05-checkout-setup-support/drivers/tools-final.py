import hashlib
import json
import os
import pathlib
import subprocess
import tarfile

root = pathlib.Path.cwd()
home = pathlib.Path.home()

def sanitize(value):
    return str(value).replace(str(root), '<repo-root>').replace(str(home), '<user-home>')

def run(command):
    result = subprocess.run(command, cwd=root, env=os.environ, capture_output=True, text=True)
    return {'command': [sanitize(p) for p in command], 'status': result.returncode,
            'stdout': sanitize(result.stdout), 'stderr': sanitize(result.stderr)}

def fingerprint(path):
    data = path.read_bytes()
    return {'path': sanitize(path), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

versions = [run(command) for command in [
    ['node', '--version'], ['pnpm', '--version'], ['git', '--version'], ['pre-commit', '--version'],
    ['pnpm', 'exec', 'eslint', '--version'], ['pnpm', 'exec', 'prettier', '--version'],
]]
node_paths = {pathlib.Path(p) / 'node' for p in os.environ.get('PATH', '').split(os.pathsep) if p}
asdf_nodes = home / '.asdf/installs/nodejs'
if asdf_nodes.is_dir():
    node_paths.update(p / 'bin/node' for p in asdf_nodes.iterdir() if p.is_dir())
node_versions = [run([str(p), '--version']) for p in sorted(node_paths) if p.is_file() and os.access(p, os.X_OK)]

cache = home / '.cache/pre-commit/repo3aru3ozk'
python = cache / 'py_env-python3.14/bin/python'
check_yaml = cache / 'py_env-python3.14/bin/check-yaml'
cache_head = run(['git', '--no-optional-locks', '-C', str(cache), 'rev-parse', 'HEAD'])
assert cache_head['status'] == 0 and cache_head['stdout'].strip() == '3e8a8703264a2f4a69428a0aa4dcb512790b2c8c'
yaml_runtime = run([str(python), '-c',
    "import importlib.metadata as m,json,sys; print(json.dumps({'python':sys.version,'pre_commit_hooks':m.version('pre-commit-hooks'),'ruamel_yaml':m.version('ruamel.yaml')}))"])
assert yaml_runtime['status'] == 0, yaml_runtime

binary = root / '_tmp-ci-dag-04-accept-HHjMox/actionlint/actionlint'
archive = binary.with_name('actionlint.tar.gz')
binary_fp = fingerprint(binary)
archive_fp = fingerprint(archive)
assert binary_fp['sha256'] == '9f7dedb4e23f89f2922073d1a6720405b7b520d4f5832ebb96f0d55a2958886c'
assert archive_fp['sha256'] == '023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757'
with tarfile.open(archive) as payload:
    archived_binary = payload.extractfile('actionlint').read()
assert hashlib.sha256(archived_binary).hexdigest() == binary_fp['sha256']
actionlint_version = run([str(binary), '--version'])
assert actionlint_version['status'] == 0 and actionlint_version['stdout'].startswith('1.7.7\n')

print(json.dumps({
    'versions': versions,
    'nodeDiscovery': {'scope': 'Existing executable node candidates on PATH and existing asdf nodejs installs only; no installation, external scratch or runner execution',
                      'candidates': node_versions,
                      'node20AvailableInInspectedCandidates': any(v['status'] == 0 and v['stdout'].startswith('v20.') for v in node_versions)},
    'checkYaml': {'sourceHead': cache_head, 'entry': fingerprint(check_yaml), 'runtime': yaml_runtime,
                  'noPreCommitEnvironmentInstallation': True},
    'actionlint': {'archive': archive_fp, 'binary': binary_fp, 'archiveBinaryMatches': True, 'version': actionlint_version},
}, indent=2))
