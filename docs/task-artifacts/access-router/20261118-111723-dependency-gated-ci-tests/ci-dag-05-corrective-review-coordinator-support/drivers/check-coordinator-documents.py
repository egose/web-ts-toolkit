"""New coordinator-document closure only; no historical/project driver execution."""

from datetime import datetime, timezone
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path.cwd().resolve()
WORK = Path("_tmp-c5cr-coord-3ovrro4e")
BUNDLE = Path("docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests")
SUPPORT = BUNDLE / "ci-dag-05-corrective-review-coordinator-support"
SNAPSHOT = BUNDLE / "ci-dag-05-corrective-review-inputs.json"
DOCUMENTS = [
    Path("docs/tasks/20261118-111723-dependency-gated-ci-tests.md"),
    *[BUNDLE / name for name in (
        "ci-dag-05-remediation-coordination.md", "ci-dag-05-corrective-review-handoff.md",
        "ci-dag-05-checkout-setup-handoff.md", "ci-dag-05-handoff.md",
        "ci-dag-05-local-evidence.md", "README.md",
    )],
]
FORMAT_FILES = [*DOCUMENTS, SUPPORT / "README.md", SUPPORT / "manifest.json"]
CHECKS = 0
GIT_COMMANDS = []
FACTS = {}


def need(condition, label):
    global CHECKS
    CHECKS += 1
    if not condition:
        raise AssertionError(label)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def fp(path):
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode), "Regular metadata/document: " + str(path))
    data = path.read_bytes()
    return {"mode": format(stat.S_IMODE(info.st_mode), "04o"), "bytes": len(data), "sha256": sha(data)}


def match(path, expected):
    need(fp(path) == {k: expected[k] for k in ("mode", "bytes", "sha256")}, "Unchanged expected bytes/mode: " + str(path))


def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError("Duplicate JSON key: " + key)
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError("Nonfinite JSON number: " + value)


def load(path):
    return json.loads(path.read_bytes(), object_pairs_hook=pairs, parse_constant=reject_constant)


def git(*args):
    need(args[0] in {"status", "rev-parse", "for-each-ref", "ls-files", "check-ignore", "diff"}, "Read-only Git allowlist")
    need(args[0] != "diff" or args[1:] == ("--check",), "Only Git whitespace diff check")
    result = subprocess.run(["git", *args], capture_output=True, env=dict(os.environ, GIT_OPTIONAL_LOCKS="0"))
    GIT_COMMANDS.append({"command": ["git", *args], "exitCode": result.returncode, "stdoutBytes": len(result.stdout), "stdoutSha256": sha(result.stdout)})
    need(result.returncode in ((0, 1) if args[0] == "check-ignore" else (0,)), "Read-only Git command succeeded")
    return result


def current_scope(snapshot):
    changed = {}
    allowed = {str(path) for path in DOCUMENTS}
    for path, expected in snapshot["files"].items():
        actual = fp(Path(path))
        if path in allowed:
            preimage = WORK / "pre-update" / path
            match(preimage, expected)
            need(actual != expected, "Actual coordinator update: " + path)
            changed[path] = {"before": expected, "after": actual, "retainedPreimage": str(preimage)}
        else:
            need(actual == expected, "Protected original remains byte/mode exact: " + path)
    need(set(changed) == allowed, "Only seven coordinator documents differ from reviewed originals")
    for name in ("historicalProtectedInputs", "reviewedMaintainedFingerprints"):
        for path, expected in snapshot[name].items():
            match(Path(path), expected)
    byte_scope = load(SUPPORT / "coordinator-byte-scope.json")
    for path, expected in byte_scope["reviewerFiles"].items():
        match(Path(path), expected)
    need(len(byte_scope["reviewerFiles"]) == 9, "All nine delivered reviewer files unchanged")
    match(SNAPSHOT, {"mode": "0644", "bytes": 610017, "sha256": "ad378fec69c87bb1b750c9f1bb3b47b23861ebf4f1d40a3aabb9ebe4678ef696"})
    match(BUNDLE / "ci-dag-05-corrective-review-assignment.json", byte_scope["assignment"])
    need(git("rev-parse", "HEAD").stdout.decode().strip() == snapshot["head"], "HEAD unchanged")
    need(sha(git("for-each-ref", "--format=%(objectname) %(refname)").stdout) == snapshot["projectRefsSha256"], "Refs unchanged")
    need(git("status", "--short").stdout.decode().splitlines() == snapshot["gitStatus"], "Inherited Git status unchanged")
    names = set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").stdout.decode().split("\0")) - {""}
    old_allowed = {str(SNAPSHOT), snapshot["allowedCoordinatorNewAssignmentRecord"]} | set(byte_scope["reviewerFiles"])
    additions = names - set(snapshot["files"])
    need(not any(path not in old_allowed and not path.startswith(str(SUPPORT) + "/") for path in additions), "No additions outside new coordinator support and prior allowed files")
    need(git("check-ignore", "--", str(WORK)).returncode == 0 and Path(os.environ["TMPDIR"]).resolve() == ROOT / WORK, "Ignored repository-local coordinator scratch/TMPDIR")
    need(git("check-ignore", "--", *[str(path) for path in FORMAT_FILES]).returncode == 1, "Updated documents/new index/manifest unignored")
    diff = git("diff", "--check")
    need(not diff.stdout and not diff.stderr, "Git diff --check passed; new files separately scanned")
    return changed, {path: fp(Path(path)) for path in sorted(names)}


def preserved_copies():
    manifest = load(SUPPORT / "manifest.json")
    need(manifest["entryCount"] == len(manifest["entries"]) == 21, "Twenty-one initial immutable payloads")
    total = 0
    for entry in manifest["entries"]:
        source, archive = (Path(entry[k]["path"]) for k in ("source", "archive"))
        match(source, entry["source"])
        match(archive, entry["archive"])
        need(source.read_bytes() == archive.read_bytes(), "Byte-exact archival copy")
        total += archive.stat().st_size
    need(total == manifest["payloadBytes"] == 383653, "Initial payload byte total")
    for entry in manifest["coordinatorDocumentPreimages"]:
        path = Path(entry["archive"]["path"])
        match(path, entry["archive"])
    match(Path(manifest["subsequentDocumentationScope"]["additionalPreimage"]["path"]), manifest["subsequentDocumentationScope"]["additionalPreimage"])
    need(manifest["subsequentDocumentationScope"]["changedCoordinatorDocuments"] == 7, "Seventh handoff preimage separately accounted")
    return manifest


def headings(path):
    seen = {}
    result = set()
    for heading in re.findall(r"^#{1,6}\s+(.+)$", path.read_text(), re.M):
        base = re.sub(r"[^\w -]", "", heading.lower()).strip().replace(" ", "-")
        occurrence = seen.get(base, 0)
        result.add(base if occurrence == 0 else base + "-" + str(occurrence))
        seen[base] = occurrence + 1
    return result


def hygiene():
    files = [*DOCUMENTS, *sorted(path for path in SUPPORT.rglob("*") if path.is_file())]
    links = anchors = external_links = json_files = 0
    # Match actual absolute-path tokens, not sanitized repo-local /tmp/ subpaths.
    private = re.compile(r"(?<![A-Za-z0-9_<>./-])/(?:home|Users|tmp|var/tmp|root)/|\bses_[A-Za-z0-9_-]+|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bBearer\s+[A-Za-z0-9._-]{20,}")
    for path in files:
        fp(path)
        data = path.read_bytes()
        text = data.decode("utf-8")
        need(data.endswith(b"\n") and b"\r" not in data and b"\x00" not in data, "UTF-8/LF/newline/NUL: " + str(path))
        need(not any(line.rstrip(" \t") != line for line in text.splitlines()), "Trailing whitespace: " + str(path))
        need(not private.search(text), "Privacy-pattern scan: " + str(path))
        if path.suffix == ".json":
            load(path)
            json_files += 1
        if path.suffix == ".md":
            for target in re.findall(r"\[[^\]]*\]\(([^\s)]+)\)", text):
                target = unquote(target)
                if re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", target):
                    parsed = urlsplit(target)
                    need(parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password, "Existing HTTPS reference, not fetched")
                    external_links += 1
                    continue
                part, _, anchor = target.partition("#")
                destination = (path.parent / part).resolve() if part else path.resolve()
                need(destination.is_file() and destination.is_relative_to(ROOT), "Local Markdown link resolves: " + target)
                links += 1
                if anchor:
                    need(anchor in headings(destination), "Local GitHub-style anchor resolves: " + target)
                    anchors += 1
    task, old_task = DOCUMENTS[0].read_text(), (WORK / "pre-update" / DOCUMENTS[0]).read_text()
    boundary = "### Task CI-DAG-05:"
    need(task.split(boundary)[0] == old_task.split(boundary)[0], "CI-DAG-01–04 historical acceptance/requirements unchanged")
    need(task.split("## Shared verification and working rules")[1] == old_task.split("## Shared verification and working rules")[1], "Shared requirements/definition of done unchanged")
    need("Status: in_progress" in task.split(boundary)[1], "CI-DAG-05 remains in_progress")
    need("Current authorization is **saved-evidence reconciliation and coordinator documentation only**" in task, "Execution scope remains closed")
    ledger = BUNDLE / "ci-dag-05-local-evidence.md"
    old_ledger = WORK / "pre-update" / ledger
    start, end = "## Sequential attempts", "## Fresh finishing-review addendum"
    need(ledger.read_text().split(start)[1].split(end)[0] == old_ledger.read_text().split(start)[1].split(end)[0], "V5 rows/log hashes and saved execution evidence unchanged")
    return {"scannedFiles": len(files), "markdownFiles": sum(path.suffix == ".md" for path in files), "strictJsonFiles": json_files, "localLinks": links, "anchors": anchors, "existingExternalHttpsReferencesNotFetched": external_links}


def format_documents(snapshot):
    preview = load(WORK / "coordinator-document-format-preview.json")
    for row in preview["records"]:
        if not row["unchanged"]:
            need(Path(row["path"]).read_bytes() == Path(row["proposal"]).read_bytes(), "Exact inspected formatter proposal applied")
    command = ["pnpm", "exec", "prettier", "--check", "--config-path", ".prettierrc", *[str(path) for path in FORMAT_FILES]]
    before = {str(path): fp(path) for path in FORMAT_FILES}
    started = datetime.now(timezone.utc).isoformat()
    completed = subprocess.run(command, capture_output=True, env=dict(os.environ, TMPDIR=str(ROOT / WORK), COREPACK_ENABLE_NETWORK="0"))
    finished = datetime.now(timezone.utc).isoformat()
    after = {str(path): fp(path) for path in FORMAT_FILES}
    streams = {}
    for name, data in (("stdout", completed.stdout), ("stderr", completed.stderr)):
        text = data.decode().replace(str(ROOT), "<repo-root>").replace(str(Path.home()), "<user-home>")
        text = re.sub(r"\bses_[A-Za-z0-9_-]+", "<private-session-id>", text)
        path = WORK / ("coordinator-document-prettier." + name + ".log")
        with path.open("xb") as stream:
            stream.write(text.encode())
        streams[name] = {
            "path": str(path), **fp(path), "rawAtExecutionBytesReported": len(data),
            "rawAtExecutionSha256Reported": sha(data),
            "limit": "Raw bytes not separately persisted; retained text is independently readable. Only coordinator documents/new index/manifest selected.",
        }
    FACTS["documentationFormatter"] = {
        "command": command, "startedAt": started, "finishedAt": finished,
        "exitCode": completed.returncode, "inputsBefore": before, "inputsAfter": after,
        "inputsUnchangedDuringRun": before == after, "streams": streams,
        "selectedMarkdownFiles": 8, "selectedJsonFiles": 1,
        "excluded": "All maintained code/workflow files, unchanged reviewer deliverables and 21 immutable raw receipt/driver copies; their exclusion is not a Prettier pass",
        "configInput": {"path": ".prettierrc", **fp(Path(".prettierrc"))},
    }
    need(completed.returncode == 0 and before == after, "New coordinator documentation Prettier passed without mutation")
    need(fp(Path(".prettierrc")) == snapshot["files"][".prettierrc"], "Formatter config unchanged")


def main():
    destination = Path(sys.argv[1])
    need(destination.parent == WORK and not destination.exists(), "Fresh scratch documentation receipt")
    started = datetime.now(timezone.utc).isoformat()
    problems = []
    try:
        snapshot = load(SNAPSHOT)
        changed, before = current_scope(snapshot)
        manifest = preserved_copies()
        FACTS["hygiene"] = hygiene()
        format_documents(snapshot)
        after_changed, after = current_scope(snapshot)
        need(changed == after_changed and before == after, "Documentation checks made no Git-visible edits")
        patch = ""
        for path in DOCUMENTS:
            old = (WORK / "pre-update" / path).read_text()
            patch += "".join(difflib.unified_diff(old.splitlines(True), path.read_text().splitlines(True), fromfile="review-input/" + str(path), tofile="coordinator-closeout/" + str(path)))
        diff_path = WORK / "coordinator-document-update.diff"
        with diff_path.open("x") as stream:
            stream.write(patch)
        FACTS["documentationDelta"] = {
            "changedDocuments": changed,
            "diff": {"path": str(diff_path), **fp(diff_path)},
            "method": "Exact seven-path unified diff against preserved review-input preimages, not HEAD. Preimage fingerprints equal immutable snapshot; all other originals remain byte/mode exact.",
        }
        FACTS["protectedScope"] = {
            "reviewedOriginals": 2771, "authorizedCoordinatorDocumentChanges": 7,
            "unchangedProtectedOriginals": 2764, "unchangedMaintainedFingerprints": 24,
            "unchangedHistoricalSeals": 33, "unchangedReviewerDeliverables": 9,
            "unchangedSnapshotAndAssignment": True, "head": snapshot["head"],
            "projectRefsSha256": snapshot["projectRefsSha256"],
            "capturedCurrentRegularFiles": len(after), "capturedCurrentFilesTableSha256": sha(canonical(after)),
            "initialImmutableCopyEntries": 21, "initialImmutableCopyBytes": manifest["payloadBytes"],
            "onlyAdditionalPrefix": str(SUPPORT) + "/", "checksMadeNoGitVisibleEdits": True,
        }
    except (AssertionError, ValueError, OSError, KeyError) as error:
        problems.append(str(error).replace(str(ROOT), "<repo-root>").replace(str(Path.home()), "<user-home>"))
    result = {
        "ownerAlias": "CI-DAG-05 remediation coordinator",
        "startedAt": started, "finishedAt": datetime.now(timezone.utc).isoformat(),
        "verdict": "PASS: coordinator documentation/hygiene/scope only; CHANGES REQUIRED / BLOCKED remains" if not problems else "STOP: COORDINATOR DOCUMENT DISCREPANCY",
        "command": ["python3", str(WORK / "check-coordinator-documents.py"), str(destination)],
        "cwd": ".", "runtimeTmpdir": "'<repo-root>/" + str(WORK) + "'",
        "documentationAssertions": CHECKS, "problems": problems, **FACTS,
        "gitCommands": GIT_COMMANDS,
        "coordinatorDriver": {"path": str(WORK / "check-coordinator-documents.py"), **fp(WORK / "check-coordinator-documents.py")},
        "captureBoundary": "Updated documents/index/manifest and the 21 immutable evidence payloads at this capture. The later diff/receipt/driver/preservation metadata copies are separate additions; this receipt excludes its own digest and those later copies. No historical check is rerun or acceptance granted.",
        "limits": "Only this new stdlib document reader, allowlisted read-only Git metadata and one nine-file coordinator-document Prettier check executed. No historical/project/reviewer driver, maintained validator/package/quality selection, source/native/runner probe, installation, resource, network, hosted/publication/settings operation. Existing HTTPS links were checked syntactically, not fetched. Privacy patterns/manual review are bounded, not a claim of exhaustive secret detection.",
    }
    with destination.open("x") as stream:
        json.dump(result, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
    print(json.dumps({k: result[k] for k in ("verdict", "documentationAssertions", "problems")}, indent=2))
    if "hygiene" in result:
        print(json.dumps(result["hygiene"], indent=2))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
