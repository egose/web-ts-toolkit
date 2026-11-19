"""Final newly preserved coordinator metadata only; never execute archived drivers."""

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

ROOT = Path.cwd().resolve()
WORK = Path("_tmp-c5cr-coord-3ovrro4e")
BUNDLE = Path("docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests")
SUPPORT = BUNDLE / "ci-dag-05-corrective-review-coordinator-support"
SELF = WORK / "verify-final-coordinator-metadata.py"
CHECKS = 0


def need(condition, label):
    global CHECKS
    CHECKS += 1
    if not condition:
        raise AssertionError(label)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fp(path):
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode), "Regular final metadata: " + str(path))
    raw = path.read_bytes()
    return {"mode": format(stat.S_IMODE(info.st_mode), "04o"), "bytes": len(raw), "sha256": sha(raw)}


def match(path, expected):
    need(fp(path) == {k: expected[k] for k in ("mode", "bytes", "sha256")}, "Final recorded fingerprint: " + str(path))


def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError("Duplicate JSON key: " + key)
        result[key] = value
    return result


def reject(value):
    raise ValueError("Nonfinite JSON number: " + value)


def load(path):
    return json.loads(path.read_bytes(), object_pairs_hook=pairs, parse_constant=reject)


def git(*args):
    need(args[0] in {"rev-parse", "for-each-ref", "status", "ls-files", "check-ignore", "diff"}, "Final read-only Git allowlist")
    need(args[0] != "diff" or args[1:] == ("--check",), "Only Git whitespace diff check")
    completed = subprocess.run(["git", *args], capture_output=True, env=dict(os.environ, GIT_OPTIONAL_LOCKS="0"))
    need(completed.returncode in ((0, 1) if args[0] == "check-ignore" else (0,)), "Final read-only Git command succeeded")
    return completed


def inverse_document_diff(patch, documents):
    lines = patch.splitlines(True)
    result = {}
    index = 0
    while index < len(lines):
        need(lines[index].startswith("--- review-input/"), "Exact document delta old header")
        old_name = lines[index][len("--- review-input/"):].strip()
        new_name = lines[index + 1][len("+++ coordinator-closeout/"):].strip()
        need(lines[index + 1].startswith("+++ coordinator-closeout/") and old_name == new_name and old_name in documents, "Exact document delta target")
        current = Path(old_name).read_text().splitlines(True)
        index += 2
        hunks = []
        while index < len(lines) and not lines[index].startswith("--- review-input/"):
            header = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", lines[index])
            need(header is not None, "Exact document delta hunk header")
            old_count, new_count = int(header[2] or 1), int(header[4] or 1)
            start = int(header[3]) - bool(new_count)
            old, new = [], []
            index += 1
            while index < len(lines) and not lines[index].startswith(("@@ ", "--- review-input/")):
                line = lines[index]
                need(line.startswith((" ", "+", "-")), "Document delta text marker")
                if line.startswith((" ", "-")):
                    old.append(line[1:])
                if line.startswith((" ", "+")):
                    new.append(line[1:])
                index += 1
            need(len(old) == old_count and len(new) == new_count, "Document delta exact hunk counts")
            hunks.append((start, old, new))
        for start, old, new in reversed(hunks):
            need(current[start:start + len(new)] == new, "Document delta delivered-side exact context")
            current[start:start + len(new)] = old
        data = "".join(current).encode()
        need(data == Path(documents[old_name]["retainedPreimage"]).read_bytes(), "Document delta independently reconstructs full preimage")
        need(sha(data) == documents[old_name]["before"]["sha256"], "Document delta original fingerprint")
        result[old_name] = sha(data)
    need(set(result) == set(documents) and len(result) == 7, "All seven preimages reconstructed")
    return result


def main():
    destination = Path(sys.argv[1])
    need(destination.parent == WORK and not destination.exists(), "Fresh final scratch receipt")
    started = datetime.now(timezone.utc).isoformat()
    problems, facts = [], {}
    try:
        first = load(SUPPORT / "manifest.json")
        later = load(SUPPORT / "documentation-support-manifest.json")
        original_later = load(WORK / "documentation-support-manifest.json")
        need(later == original_later, "Later manifest curation preserves all parsed JSON values")
        entries = first["entries"] + later["entries"]
        need(len(first["entries"]) == 21 and len(later["entries"]) == 8, "Separate 21-entry and eight-entry capture sets")
        for entry in entries:
            source, archive = Path(entry["source"]["path"]), Path(entry["archive"]["path"])
            match(source, entry["source"])
            match(archive, entry["archive"])
            expected = source.read_bytes()
            if entry.get("crlfCountBefore") is not None:
                need(expected.count(b"\r\n") == entry["crlfCountBefore"] == 1, "New document-success stdout sole CRLF")
                expected = expected.replace(b"\r\n", b"\n")
            need(expected == archive.read_bytes(), "All preserved copy transformations")
        receipt = load(SUPPORT / "coordinator-document-check.json")
        need(receipt["verdict"].startswith("PASS: coordinator documentation/hygiene/scope only;") and not receipt["problems"], "Actual passing document receipt")
        for path, expected in receipt["documentationFormatter"]["inputsAfter"].items():
            match(Path(path), expected)
        documents = receipt["documentationDelta"]["changedDocuments"]
        reconstructed = inverse_document_diff((SUPPORT / "coordinator-document-update.diff").read_text(), documents)
        snapshot_path = BUNDLE / "ci-dag-05-corrective-review-inputs.json"
        snapshot = load(snapshot_path)
        match(snapshot_path, {"mode": "0644", "bytes": 610017, "sha256": "ad378fec69c87bb1b750c9f1bb3b47b23861ebf4f1d40a3aabb9ebe4678ef696"})
        for path, expected in snapshot["files"].items():
            match(Path(path), documents[path]["after"] if path in documents else expected)
        for name in ("historicalProtectedInputs", "reviewedMaintainedFingerprints"):
            for path, expected in snapshot[name].items():
                match(Path(path), expected)
        byte_scope = load(SUPPORT / "coordinator-byte-scope.json")
        for path, expected in byte_scope["reviewerFiles"].items():
            match(Path(path), expected)
        match(BUNDLE / "ci-dag-05-corrective-review-assignment.json", byte_scope["assignment"])
        match(SUPPORT / "drivers/verify-final-coordinator-metadata.py", fp(SELF))
        need(git("rev-parse", "HEAD").stdout.decode().strip() == snapshot["head"], "Final HEAD unchanged")
        need(sha(git("for-each-ref", "--format=%(objectname) %(refname)").stdout) == snapshot["projectRefsSha256"], "Final refs unchanged")
        need(git("status", "--short").stdout.decode().splitlines() == snapshot["gitStatus"], "Final inherited status unchanged")
        names = set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").stdout.decode().split("\0")) - {""}
        additions = names - set(snapshot["files"])
        existing_allowed = set(byte_scope["reviewerFiles"]) | {str(snapshot_path), snapshot["allowedCoordinatorNewAssignmentRecord"]}
        need(not any(path not in existing_allowed and not path.startswith(str(SUPPORT) + "/") for path in additions), "Final additions restricted to coordinator support")
        need(git("check-ignore", "--", str(WORK)).returncode == 0, "Final scratch ignored")
        support_files = sorted(path for path in SUPPORT.rglob("*") if path.is_file())
        need(git("check-ignore", "--", *[str(path) for path in support_files]).returncode == 1, "Final preservation files all unignored")
        private = re.compile(r"(?<![A-Za-z0-9_<>./-])/(?:home|Users|tmp|var/tmp|root)/|\bses_[A-Za-z0-9_-]+|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bBearer\s+[A-Za-z0-9._-]{20,}")
        json_count = 0
        for path in support_files:
            data = path.read_bytes()
            text = data.decode()
            need(data.endswith(b"\n") and b"\r" not in data and b"\x00" not in data, "Final preservation encoding/newline")
            need(not private.search(text), "Final bounded privacy-pattern scan")
            checked_lines = [line[1:] if path.suffix == ".diff" and line.startswith((" ", "+", "-")) else line for line in text.splitlines()]
            need(not any(line.rstrip(" \t") != line for line in checked_lines), "Final whitespace scan; diff syntax prefix is not source whitespace")
            if path.suffix == ".json":
                load(path)
                json_count += 1
        need(json_count == 13, "Thirteen final preserved JSON files before this external receipt")
        for name in ("coordinator-document-check.json", "coordinator-document-update.diff", "documentation-support-manifest.json"):
            need((SUPPORT / name).is_file(), "Final index's closure reference resolves: " + name)
        diff = git("diff", "--check")
        need(not diff.stdout and not diff.stderr, "Final git diff --check plus explicit untracked-file scan")
        script = """import fs from 'node:fs'; import * as prettier from 'prettier';
const filepath='docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests/ci-dag-05-corrective-review-coordinator-support/documentation-support-manifest.json';
const text=fs.readFileSync(filepath,'utf8'); const config=JSON.parse(fs.readFileSync('.prettierrc','utf8'));
const formatted=await prettier.format(text,{...config,filepath});
console.log(JSON.stringify({unchanged:text===formatted,formatterVersion:prettier.version}));
if(text!==formatted)process.exitCode=1;"""
        completed = subprocess.run(["node", "--input-type=module", "-e", script], capture_output=True, env=dict(os.environ, TMPDIR=str(ROOT / WORK), COREPACK_ENABLE_NETWORK="0"))
        format_result = json.loads(completed.stdout)
        need(completed.returncode == 0 and format_result["unchanged"], "Final newly authored manifest formatter API pass")
        need(not completed.stderr, "Final manifest formatter stderr empty")
        facts = {
            "initialPayloads": 21, "initialPayloadBytes": 383653,
            "laterPayloads": 8, "laterPayloadBytes": 144389,
            "coordinatorSupportFilesAtCapture": len(support_files),
            "strictJsonFilesAtCapture": json_count,
            "changedCoordinatorDocuments": 7, "unchangedProtectedOriginals": 2764,
            "unchangedMaintainedFingerprints": 24, "unchangedHistoricalSeals": 33,
            "unchangedReviewerFiles": 9, "head": snapshot["head"],
            "projectRefsSha256": snapshot["projectRefsSha256"],
            "independentlyReconstructedSevenPreimageHashes": reconstructed,
            "eightDocumentLinkAnchorCheck": receipt["hygiene"],
            "nineFileDocumentCliFormatterExit": receipt["documentationFormatter"]["exitCode"],
            "laterManifestApiFormatter": format_result,
            "laterManifestCuration": "Parsed JSON equal to original scratch source; installed formatter applied only to this new metadata, not immutable receipts or maintained workflow",
            "laterManifest": {"path": str(SUPPORT / "documentation-support-manifest.json"), **fp(SUPPORT / "documentation-support-manifest.json")},
            "documentReceipt": {"path": str(SUPPORT / "coordinator-document-check.json"), **fp(SUPPORT / "coordinator-document-check.json")},
            "helperSourceArchivePair": {"source": {"path": str(SELF), **fp(SELF)}, "archive": {"path": str(SUPPORT / "drivers/verify-final-coordinator-metadata.py"), **fp(SUPPORT / "drivers/verify-final-coordinator-metadata.py")}},
            "formatterApiScriptBytes": len(script.encode()), "formatterApiScriptSha256": sha(script.encode()),
        }
    except (AssertionError, ValueError, OSError, KeyError) as error:
        problems.append(str(error).replace(str(ROOT), "<repo-root>").replace(str(Path.home()), "<user-home>"))
    result = {
        "ownerAlias": "CI-DAG-05 remediation coordinator",
        "startedAt": started, "finishedAt": datetime.now(timezone.utc).isoformat(),
        "verdict": "PASS: final coordinator metadata/diff/privacy/scope only; CHANGES REQUIRED / BLOCKED remains" if not problems else "STOP: FINAL COORDINATOR METADATA DISCREPANCY",
        "command": ["python3", str(SELF), str(destination)], "cwd": ".",
        "runtimeTmpdir": "'<repo-root>/" + str(WORK) + "'",
        "metadataAssertions": CHECKS, "problems": problems, **facts,
        "captureBoundary": "Final preserved support and seven updated coordinator documents before this external receipt's later byte-exact copy. Own digest and later copy are excluded. The 21 initial and eight later manifest entries remain separate; the final metadata driver/source pair is separately fingerprinted here.",
        "limits": "Only this new stdlib metadata reader, read-only Git metadata and an installed formatter API on the single newly authored documentation manifest ran. No archived/reviewer/project driver, validator/package/maintained-formatting rerun, source/native/Node-20/runner probe, installation/resource/network/hosted/publication/settings work. Historical four-entry formatting exception remains not a pass; maintained workflow Q1 remains unresolved. Scope reconciliation does not grant acceptance.",
    }
    with destination.open("x") as stream:
        json.dump(result, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
    print(json.dumps({k: result[k] for k in ("verdict", "metadataAssertions", "problems")}, indent=2))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
