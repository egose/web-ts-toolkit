import hashlib
import json
import os
import pathlib
import subprocess
import sys
import time
from datetime import datetime, timezone

ROOT = pathlib.Path.cwd()
SCRATCH = ROOT / "_tmp-ci-dag-05-r2-J2LqEF"
label, *args = sys.argv[1:]
if not label or "/" in label or not args:
    raise SystemExit("Expected a label and command")
log = SCRATCH / f"{label}.log"
record = SCRATCH / f"{label}.json"
if log.exists() or record.exists():
    raise SystemExit("Refusing to overwrite run evidence")
env = {**os.environ, "TMPDIR": str(SCRATCH), "FORCE_COLOR": "0", "NO_COLOR": "1"}
started = datetime.now(timezone.utc).isoformat()
before = time.monotonic()
with log.open("wb") as output:
    process = subprocess.run(args, cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT)
elapsed = time.monotonic() - before
data = {
    "label": label,
    "command": args,
    "cwd": ".",
    "tmpdir": SCRATCH.relative_to(ROOT).as_posix(),
    "startedAt": started,
    "durationSeconds": round(elapsed, 3),
    "exitCode": process.returncode,
    "log": log.relative_to(ROOT).as_posix(),
    "logSha256": hashlib.sha256(log.read_bytes()).hexdigest(),
}
record.write_text(json.dumps(data, indent=2) + "\n")
print(log.read_text(errors="replace"))
print(json.dumps(data, indent=2))
raise SystemExit(process.returncode)
