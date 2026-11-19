"""Independent read-only corrective-review inventory check; no historical driver execution."""

import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path.cwd()
BUNDLE = "docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/"
SNAPSHOT = BUNDLE + "ci-dag-05-corrective-review-inputs.json"
EXPECTED_SNAPSHOT = {
    "mode": "0644",
    "bytes": 610017,
    "sha256": "ad378fec69c87bb1b750c9f1bb3b47b23861ebf4f1d40a3aabb9ebe4678ef696",
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def git(*args):
    env = dict(os.environ, GIT_OPTIONAL_LOCKS="0")
    result = subprocess.run(["git", *args], cwd=ROOT, env=env, capture_output=True)
    if result.returncode:
        raise RuntimeError("Read-only git command failed: " + " ".join(args))
    return result.stdout


def fingerprint(path):
    value = ROOT / path
    info = value.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise RuntimeError("Not a regular file: " + path)
    data = value.read_bytes()
    return {"mode": f"{stat.S_IMODE(info.st_mode):04o}", "bytes": len(data), "sha256": sha(data)}


def main():
    phase, destination = sys.argv[1:]
    started = datetime.now(timezone.utc).isoformat()
    problems = []
    snapshot_record = fingerprint(SNAPSHOT)
    if snapshot_record != EXPECTED_SNAPSHOT:
        problems.append("Immutable snapshot bytes/mode changed")
    data = json.loads((ROOT / SNAPSHOT).read_text())
    files = data["files"]
    expected_table_hash = sha(canonical(files))
    if expected_table_hash != data["filesTableSha256"] or len(files) != data["protectedRegularFiles"]:
        problems.append("Immutable snapshot table/count is internally inconsistent")

    def match_table(table):
        matched = {}
        drift = []
        for path, expected in table.items():
            try:
                actual = fingerprint(path)
                matched[path] = actual
                if actual != expected:
                    drift.append({"path": path, "expected": expected, "actual": actual})
            except (OSError, RuntimeError) as error:
                drift.append({"path": path, "error": str(error).replace(str(ROOT), "<repo-root>")})
        return matched, drift

    actual_files, file_drift = match_table(files)
    _, historical_drift = match_table(data["historicalProtectedInputs"])
    _, maintained_drift = match_table(data["reviewedMaintainedFingerprints"])
    pair_records = {}
    for label in ("readinessCheck", "coordinatorReadinessDriver"):
        pair = data[label]
        for side in ("source", "archive"):
            expected = pair[side]
            actual = fingerprint(expected["path"])
            pair_records[f"{label}.{side}"] = actual
            if actual != {key: expected[key] for key in ("mode", "bytes", "sha256")}:
                problems.append(f"{label}.{side} drift")

    names = sorted(set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").decode().split("\0")) - {""})
    nonregular = {}
    for path in names:
        try:
            info = (ROOT / path).lstat()
            if not stat.S_ISREG(info.st_mode):
                nonregular[path] = {"mode": f"{stat.S_IMODE(info.st_mode):04o}"}
        except FileNotFoundError:
            nonregular[path] = {"missing": True}
    if nonregular != data["nonRegularGitVisiblePaths"]:
        problems.append("Nonregular Git-visible inventory changed")
    additions = sorted(set(names) - set(files))
    allowed = {
        SNAPSHOT,
        data["allowedCoordinatorNewAssignmentRecord"],
        data["allowedReviewerNewFile"],
    }
    unexpected = [path for path in additions if path not in allowed and not path.startswith(data["allowedReviewerNewEvidencePrefix"])]
    if unexpected:
        problems.append("Unexpected Git-visible additions")
    head = git("rev-parse", "HEAD").decode().strip()
    refs_hash = sha(git("for-each-ref", "--format=%(objectname) %(refname)"))
    status = git("status", "--short").decode().splitlines()
    if head != data["head"] or refs_hash != data["projectRefsSha256"]:
        problems.append("HEAD/refs changed")
    if status != data["gitStatus"]:
        problems.append("Git status changed")
    if file_drift or historical_drift or maintained_drift:
        problems.append("Protected file bytes/modes changed")

    scratch = "_tmp-c5cr-5m91q69w"
    ignored = subprocess.run(["git", "check-ignore", "--", scratch], cwd=ROOT, capture_output=True).returncode == 0
    if not ignored or Path(os.environ.get("TMPDIR", "")).resolve() != ROOT / scratch:
        problems.append("Review scratch/TMPDIR is not the verified ignored checkout-local directory")
    result = {
        "reviewAlias": "CI-DAG-05 fresh corrective-review session",
        "phase": phase,
        "startedAt": started,
        "finishedAt": datetime.now(timezone.utc).isoformat(),
        "result": "PASS" if not problems else "STOP: PROTECTED-INPUT DRIFT",
        "immutableSnapshot": {"path": SNAPSHOT, **snapshot_record},
        "protectedRegularFiles": len(files),
        "observedProtectedFilesTableSha256": sha(canonical(actual_files)),
        "expectedProtectedFilesTableSha256": expected_table_hash,
        "maintainedFingerprintsMatched": len(data["reviewedMaintainedFingerprints"]) - len(maintained_drift),
        "historicalSealsMatched": len(data["historicalProtectedInputs"]) - len(historical_drift),
        "readinessPairs": pair_records,
        "head": head,
        "projectRefsSha256": refs_hash,
        "gitStatusMatchesSnapshot": status == data["gitStatus"],
        "nonRegularGitVisiblePaths": nonregular,
        "allowedGitVisibleAdditions": additions,
        "unexpectedGitVisibleAdditions": unexpected,
        "scratch": scratch,
        "scratchIgnored": ignored,
        "runtimeTmpdir": "'<repo-root>/" + scratch + "'",
        "drift": {"files": file_drift, "historical": historical_drift, "maintained": maintained_drift},
        "problems": problems,
        "command": ["python3", scratch + "/verify_seal.py", phase, destination],
        "cwd": ".",
        "limits": "Git-visible regular files plus expressly sealed ignored originals; ignored dependencies/build/cache state is not inventoried. The snapshot is checked separately because it excludes itself. No source/runtime/hosted probe or historical driver was executed.",
    }
    (ROOT / destination).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({key: result[key] for key in ("phase", "result", "protectedRegularFiles", "maintainedFingerprintsMatched", "historicalSealsMatched", "gitStatusMatchesSnapshot", "problems")}, indent=2))
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
