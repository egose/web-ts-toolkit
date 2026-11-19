"""Coordinator saved-evidence audit only; never import or run historical drivers.

Requires retained local originals. Writes one fresh coordinator-scratch receipt.
No tests, formatter, source materialization, resource, installation or network work.
"""

import ast
from collections import Counter, defaultdict
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
import tarfile

ROOT = Path.cwd().resolve()
WORK = Path("_tmp-c5cr-coord-3ovrro4e")
REVIEW = Path("_tmp-c5cr-5m91q69w")
BUNDLE = Path("docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests")
SUPPORT = BUNDLE / "ci-dag-05-corrective-review-support"
SETUP = BUNDLE / "ci-dag-05-checkout-setup-support"
SNAPSHOT = BUNDLE / "ci-dag-05-corrective-review-inputs.json"
BYTE_RUN = Path("_tmp-c5f-ovtrnV/corrective-reconcile-e8x4a97c")
LABELS = [
    "static-review", "ci-contract-check", "group-validation-check",
    "targeted-eslint", "maintained-prettier", "verified-actionlint",
]
CHECKS = 0
FACTS = {}
READ_FILES = {}
AUDIT_SOURCES = {}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def need(value, label):
    global CHECKS
    CHECKS += 1
    if not value:
        raise AssertionError(label)


def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError("Duplicate JSON key: " + key)
        result[key] = value
    return result


def reject_constant(value):
    raise ValueError("Nonfinite JSON number: " + value)


def raw(path):
    path = Path(path)
    need(not path.is_absolute() and ".." not in path.parts, "Repo-relative evidence path: " + str(path))
    resolved = (ROOT / path).resolve(strict=True)
    need(resolved.is_relative_to(ROOT), "Evidence stays in checkout: " + str(path))
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode), "Regular evidence: " + str(path))
    data = path.read_bytes()
    READ_FILES[str(path)] = {
        "mode": format(stat.S_IMODE(info.st_mode), "04o"),
        "bytes": len(data), "sha256": sha(data),
    }
    return data


def load(path):
    return json.loads(raw(path), object_pairs_hook=pairs, parse_constant=reject_constant)


def fp(path):
    raw(path)
    return READ_FILES[str(path)]


def normalize(expected):
    if isinstance(expected, str):
        return {"sha256": expected}
    value = {key: expected[key] for key in ("mode", "bytes", "sha256") if key in expected}
    if isinstance(value.get("mode"), int):
        value["mode"] = format(value["mode"], "04o")
    return value


def match(path, expected, inventory=False):
    actual = fp(path)
    need(all(actual[key] == value for key, value in normalize(expected).items()), "Exact fingerprint: " + str(path))
    if inventory:
        AUDIT_SOURCES[str(path)] = actual
    return {"path": str(path), **actual}


def source_record(record, inventory=False):
    path = record.get("path", record.get("originalPath"))
    expected = {
        key: record[key] if key in record else record["original" + key.title()]
        for key in ("mode", "bytes", "sha256")
        if key in record or "original" + key.title() in record
    }
    return match(path, expected, inventory)


def common(summary, original, label, skip=()):
    for key in (summary.keys() & original.keys()) - set(skip):
        need(summary[key] == original[key], label + "." + key)


def git(*args):
    allowed = {"rev-parse", "for-each-ref", "status", "ls-files", "check-ignore"}
    need(args[0] in allowed, "Read-only Git allowlist")
    completed = subprocess.run(
        ["git", *args], capture_output=True,
        env=dict(os.environ, GIT_OPTIONAL_LOCKS="0"), check=False,
    )
    need(completed.returncode in ((0, 1) if args[0] == "check-ignore" else (0,)), "Read-only Git command succeeded")
    return completed


def table(path):
    value = load(path)
    return {p: normalize(v) for p, v in value.get("files", value.get("hashes", {})).items()}


def changes(before, after):
    return sorted(path for path, value in before.items() if path not in after or any(after[path].get(k) != v for k, v in value.items()))


def tap(data):
    text = data.decode("utf-8")
    result = {}
    for key, value in re.findall(r"^(?:# |ℹ )(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+([\d.]+)", text, re.M):
        result[key] = float(value) if "." in value else int(value)
    return result


def vitest(data):
    result = []
    for kind, rest in re.findall(r"^\s*(Test Files|Tests)\s+(.+)$", data.decode("utf-8"), re.M):
        value = {"kind": kind}
        value.update({k: int(n.replace(",", "")) for n, k in re.findall(r"([\d,]+) (passed|failed|skipped|todo)", rest)})
        total = re.search(r"\(([\d,]+)\)", rest)
        if total:
            value["total"] = int(total[1].replace(",", ""))
        result.append(value)
    return result


def line_numbers(selection):
    if selection == "":
        return []
    if isinstance(selection, list):
        return selection
    if isinstance(selection, dict):
        return range(selection["first"], selection["last"] + 1)
    result = []
    for part in selection.split(","):
        ends = [int(n) for n in part.split("-")]
        result.extend(range(ends[0], ends[-1] + 1))
    return result


def selected_text(source):
    lines = raw(source["originalPath"]).decode("utf-8").splitlines()
    return "".join(lines[n - 1] + "\n" for n in line_numbers(source["selectedLines"]))


def scrub_setup(data):
    text = data.decode("utf-8").replace(str(ROOT), "<repo-root>").replace(str(Path.home()), "<user-home>")
    text = re.sub(r"\bses_[A-Za-z0-9_-]+", "<private-session-id>", text)
    return text.replace("https://" + "user:secret" + "@example.org/", "https://example.org/<redacted-synthetic-auth>/").encode()


def scrub_r2(text):
    text = text.replace(str(ROOT), "<repo-root>")
    text = re.sub(r"http://127\.0\.0\.1:\d+", "<api-origin>", text)
    return re.sub(r"\(node:\d+\)", "(node:<pid>)", text)


def invert_delta(final_bytes, patch):
    """Validate new-side hunks, then replace them in reverse order entirely in memory."""
    lines = patch.splitlines(keepends=True)
    sections = {}
    index = 0
    while index < len(lines):
        if not lines[index].startswith("--- "):
            index += 1
            continue
        name = lines[index + 1][4:].strip()
        need(name in final_bytes, "Known delta target: " + name)
        index += 2
        hunks = []
        while index < len(lines) and not lines[index].startswith("--- "):
            header = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", lines[index])
            if not header:
                index += 1
                continue
            old_count, new_count = int(header[2] or 1), int(header[4] or 1)
            old_start = int(header[1]) - bool(old_count)
            new_start = int(header[3]) - bool(new_count)
            old, new = [], []
            index += 1
            while index < len(lines) and not lines[index].startswith(("@@ ", "--- ")):
                line = lines[index]
                if line.startswith((" ", "-")):
                    old.append(line[1:])
                if line.startswith((" ", "+")):
                    new.append(line[1:])
                index += 1
            need(len(old) == old_count and len(new) == new_count, "Delta line counts: " + name)
            hunks.append((old_start, new_start, old, new))
        current = final_bytes[name].decode("utf-8").splitlines(keepends=True)
        for _, start, old, new in reversed(hunks):
            need(current[start:start + len(new)] == new, "Exact delivered delta context: " + name)
            current[start:start + len(new)] = old
        for start, _, old, _ in hunks:
            need(current[start:start + len(old)] == old, "Exact reconstructed preimage context: " + name)
        sections[name] = "".join(current).encode()
    return sections


def protected_inputs(snapshot):
    for name in ("files", "historicalProtectedInputs", "reviewedMaintainedFingerprints"):
        for path, expected in snapshot[name].items():
            match(path, expected)
    need(sha(canonical(snapshot["files"])) == snapshot["filesTableSha256"], "Canonical immutable files table")
    need(git("rev-parse", "HEAD").stdout.decode().strip() == snapshot["head"], "HEAD unchanged")
    need(sha(git("for-each-ref", "--format=%(objectname) %(refname)").stdout) == snapshot["projectRefsSha256"], "Refs unchanged")
    need(git("status", "--short").stdout.decode().splitlines() == snapshot["gitStatus"], "Inherited status unchanged")
    names = set(git("ls-files", "--cached", "--others", "--exclude-standard", "-z").stdout.decode().split("\0")) - {""}
    need(all(stat.S_ISREG(Path(p).lstat().st_mode) for p in names), "Git-visible inventory remains regular")
    additions = names - set(snapshot["files"])
    own = {snapshot["allowedReviewerNewFile"]} | {str(p) for p in SUPPORT.iterdir()}
    need(len(own) == 9, "Exactly nine reviewer files")
    need(additions == own | {str(SNAPSHOT), snapshot["allowedCoordinatorNewAssignmentRecord"]}, "Only the separately allowed eleven additions")
    return {p: fp(p) for p in sorted(names)}


def inspect_drivers():
    drivers = {}
    for name in [
        "run_review_check.py", "verify_seal.py", "reconcile_evidence.attempt-1.py",
        "reconcile_evidence.py", "static-review.mjs", "check_delivery.py",
        "format_delivery.mjs", "run_delivery_prettier.py", "check_delivery_metadata.py",
    ]:
        path = REVIEW / name
        drivers[name] = {"path": str(path), **fp(path)}
        if path.suffix == ".py":
            tree = ast.parse(raw(path).decode(), filename=str(path))
            need(not any(isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in {"eval", "exec", "__import__"} for n in ast.walk(tree)), "No dynamic driver execution: " + name)
            imports = {
                alias.name.split(".")[0]
                for n in ast.walk(tree) if isinstance(n, ast.Import) for alias in n.names
            } | {n.module.split(".")[0] for n in ast.walk(tree) if isinstance(n, ast.ImportFrom) and n.module}
            need(imports <= {"ast", "collections", "datetime", "difflib", "hashlib", "json", "os", "pathlib", "re", "stat", "subprocess", "sys", "tarfile", "time", "urllib"}, "Standard-library driver imports: " + name)
            if name.startswith("reconcile_evidence"):
                need("subprocess" not in imports, "Read-only audit has no subprocess import: " + name)
    recorder = raw(REVIEW / "run_review_check.py").decode()
    need("reservation.open('x')" in recorder and "destination.open('x')" in recorder, "Exclusive one-shot reservation and receipt")
    need("originals not persisted" in recorder and "raw.decode('utf8', errors='replace')" in recorder, "Raw execution streams not persisted")
    static = raw(REVIEW / "static-review.mjs").decode()
    capture = static.index("result: problems.length ? 'STATIC DISCREPANCIES' : 'PASS', checks, problems,")
    tail = static[capture:static.index("writeFileSync(process.argv[2]")]
    need(tail.count("fingerprint(") == 6, "Six static fingerprint calls follow captured counter")
    FACTS["inspectedDrivers"] = drivers
    FACTS["executionBoundary"] = {
        "basis": "Saved receipts and direct source/AST inspection; not a comprehensive harness execution transcript",
        "executedHere": "Only this new stdlib evidence reader and allowlisted read-only Git metadata commands",
        "notExecutedHere": ["Historical/reviewer/project drivers", "validators/tests/packages/builds", "formatter/linter/actionlint", "source/native/Node-20/runner probes", "resources/installations/network/hosted/publication/settings work"],
        "rawStreamLimit": "Raw-at-execution bytes were not persisted. Their equality to retained streams is recorder-reported metadata, not an independently readable raw witness.",
    }


def six_checks(snapshot):
    summary = load(SUPPORT / "checks.json")
    source_record(summary["recorder"])
    need([r["label"] for r in summary["records"]] == LABELS, "Exact six summary labels")
    need({p.stem.removesuffix(".started") for p in REVIEW.glob("*.started.json")} == set(LABELS), "Six retained exclusive reservations")
    maintained = sorted(snapshot["reviewedMaintainedFingerprints"])
    code = [p for p in maintained if p.endswith((".mjs", ".ts", ".mts", ".cts", ".js"))]
    commands = {
        "static-review": ["node", str(REVIEW / "static-review.mjs"), str(REVIEW / "static-review.json")],
        "ci-contract-check": ["pnpm", "test:ci:check"],
        "group-validation-check": ["pnpm", "test:groups:check"],
        "targeted-eslint": ["pnpm", "exec", "eslint", *code],
        "maintained-prettier": ["pnpm", "exec", "prettier", "--check", "--config-path", ".prettierrc", *maintained],
        "verified-actionlint": ["_tmp-ci-dag-04-accept-HHjMox/actionlint/actionlint", "-shellcheck=", "-pyflakes=", ".github/workflows/test.yml"],
    }
    expected_input = {
        "immutableSnapshot": {"path": str(SNAPSHOT), **fp(SNAPSHOT)},
        "protectedRegularFiles": 2771, "filesTableSha256": snapshot["filesTableSha256"],
        "maintainedInputs": snapshot["reviewedMaintainedFingerprints"],
        "groupValidationInputs": {p: snapshot["files"][p] for p in ("scripts/test-groups.mjs", "scripts/test-groups.test.mjs")},
        "validationAndQualityConfigInputs": {p: snapshot["files"][p] for p in ("package.json", "pnpm-lock.yaml", ".tool-versions", ".prettierrc", "eslint.config.mjs")},
        "head": snapshot["head"], "projectRefsSha256": snapshot["projectRefsSha256"],
    }
    facts, previous = [], None
    package = load("package.json")
    for row in summary["records"]:
        label = row["label"]
        source_record(row["originalRecord"])
        receipt = load(row["originalRecord"]["path"])
        reservation = load(REVIEW / (label + ".started.json"))
        need(reservation == {k: receipt[k] for k in ("label", "startedAt", "command", "inputsBefore")}, "Reservation exactly matches receipt: " + label)
        common(row, receipt, label, ("streams",))
        need(receipt["command"] == commands[label], "Exact authorized argv: " + label)
        need(receipt["recorderCommand"] == ["python3", str(REVIEW / "run_review_check.py"), label], "Recorder argv: " + label)
        need(receipt["inputsBefore"] == receipt["inputsAfter"] == expected_input and receipt["inputsUnchangedDuringRun"] is True, "Exact protected before/after inputs: " + label)
        start, finish = (datetime.fromisoformat(receipt[k]) for k in ("startedAt", "finishedAt"))
        need(start < finish and (previous is None or start > previous), "Serial one-shot interval: " + label)
        need(0 <= receipt["durationSeconds"] <= (finish - start).total_seconds(), "Recorded subprocess duration fits interval: " + label)
        previous = finish
        streams = {}
        for name in ("stdout", "stderr"):
            stream = receipt["streams"][name]
            retained = raw(stream["path"])
            need(len(retained) == stream["retainedBytes"] and sha(retained) == stream["retainedSha256"], "Independently readable retained stream: " + label + "." + name)
            need(stream["rawBytes"] == stream["retainedBytes"] and stream["rawSha256"] == stream["retainedSha256"], "Recorder-reported raw/retained equality: " + label + "." + name)
            need(row["streams"][name]["path"] == stream["path"] and row["streams"][name]["bytes"] == len(retained) and row["streams"][name]["sha256"] == sha(retained), "Curated stream identity: " + label + "." + name)
            streams[name] = {"path": stream["path"], **fp(stream["path"]), "rawEquality": "Recorder-reported only"}
        stdout = raw(receipt["streams"]["stdout"]["path"])
        parsed = tap(stdout)
        need((parsed or None) == receipt["counts"], "Retained TAP counts: " + label)
        if "packageScriptAtInvocation" in row:
            script = package["scripts"][receipt["command"][1]]
            need(row["packageScriptAtInvocation"] == script, "Exact complete validator script: " + label)
            need(raw(receipt["streams"]["stderr"]["path"]).decode() == "$ " + script + "\n", "Retained validator script announcement: " + label)
            need(len(re.findall(r"^✔ ", stdout.decode(), re.M)) == parsed["pass"], "Individual retained passing rows: " + label)
        if "stdoutExcerpt" in row:
            lines = stdout.decode().splitlines()
            excerpt = row["stdoutExcerpt"]["lines"]
            need(excerpt == (lines[1:4] if label == "static-review" else lines[-len(excerpt):]), "Exact labeled selected stdout: " + label)
        expected_exit = 1 if label == "maintained-prettier" else 0
        need(receipt["exitCode"] == expected_exit and receipt["signalNumber"] is None, "Actual saved quality/validator status: " + label)
        facts.append({
            "label": label, "originalReceipt": row["originalRecord"],
            "reservation": {"path": str(REVIEW / (label + ".started.json")), **fp(REVIEW / (label + ".started.json"))},
            "command": receipt["command"], "startedAt": receipt["startedAt"], "finishedAt": receipt["finishedAt"],
            "exitCode": receipt["exitCode"], "signalNumber": receipt["signalNumber"],
            "independentlyParsedCounts": parsed or None, "streams": streams,
            "selectedInputs": len(code) if label == "targeted-eslint" else len(maintained) if label == "maintained-prettier" else receipt["scope"]["selected"],
        })
    need(facts[1]["independentlyParsedCounts"]["pass"] == 611 and facts[2]["independentlyParsedCounts"]["pass"] == 18, "611 CI / 18 group passes")
    for index in (1, 2):
        need(all(facts[index]["independentlyParsedCounts"][k] == 0 for k in ("fail", "cancelled", "skipped", "todo")), "No validator omissions/failures")
    failure = summary["records"][4]
    original_stdout, original_stderr = (raw(failure["streams"][name]["path"]) for name in ("stdout", "stderr"))
    need(original_stderr == b"[warn] .github/workflows/test.yml\n[warn] Code style issues found in 1 file. Run Prettier with --write to fix.\n", "Sole Q1 warning retained exactly")
    need(original_stdout.count(b"\r\n") == 1 and len(original_stdout) == 24, "One CRLF in original retained failure stdout")
    for name, original in (("stdout", original_stdout), ("stderr", original_stderr)):
        archive = failure["streams"][name]["durableArchive"]
        source_record(archive)
        need(raw(archive["path"]) == (original.replace(b"\r\n", b"\n") if name == "stdout" else original), "Only declared failure-stream archive transformation: " + name)
    provenance = summary["actionlintProvenance"]
    source_record(provenance["originalRecord"])
    original = load(provenance["originalRecord"]["path"])
    source_record(provenance["archive"])
    source_record(provenance["installedBinary"])
    with tarfile.open(provenance["archive"]["path"], "r:gz") as archive:
        member = archive.getmember("actionlint")
        need(member.isfile() and member.mode == 0o755, "Pinned actionlint regular archive member")
        data = archive.extractfile(member).read()
        need(data == raw(provenance["installedBinary"]["path"]), "Existing binary equals archive member; no extraction/execution")
    need(provenance["archive"] == original["archive"] and provenance["installedBinary"] == original["installedBinary"], "Saved provenance projection")
    FACTS["sixSerialOneShotChecks"] = facts
    FACTS["qualityFailure"] = {
        "finding": "Q1", "path": ".github/workflows/test.yml",
        "reviewedFingerprint": snapshot["files"][".github/workflows/test.yml"],
        "exitCode": 1, "baseline": "No baseline establishes a pre-existing failure",
        "correction": "Unauthorized and not made", "selectedMaintainedPaths": 24,
        "failureArchiveStdoutBytes": 23, "failureArchiveStderrBytes": 110,
        "historicalException": "The earlier sealed four-entry coordinator-manifest formatting exception is not a Prettier pass and is separate from Q1.",
        "actionlintLimit": "Existing local pin/member equality only; shellcheck and pyflakes disabled; no new network/signature verification",
    }


def evidence_audits(snapshot):
    summary = load(SUPPORT / "evidence-reconciliation.json")
    attempts = []
    for row in summary["attempts"]:
        source_record(row["originalRecord"])
        source_record(row.get("driver", row.get("driverAtInvocationPreservedAs")))
        original = load(row["originalRecord"]["path"])
        common(row, original, "Audit attempt " + str(row["attempt"]))
        need(row["observedExitCode"] == (0 if original["result"] == "PASS" else 1), "Saved audit result/exit interpretation")
        attempts.append(original)
    need(attempts[0]["checks"] == 3257 and len(attempts[0]["problems"]) == 7, "Failed first audit retained")
    need(attempts[1]["checks"] == 3507 and not attempts[1]["problems"], "Corrected audit receipt retained")
    need([r["problem"] for r in summary["firstAttemptDispositions"]] == attempts[0]["problems"], "All seven audit discrepancies disposed explicitly")
    second = attempts[1]
    for name in ("r1", "r2", "setup"):
        common(summary["correctedAttempt2Summary"][name], second[name], "Corrected summary " + name)
        need(attempts[0][name]["records"] == second[name]["records"], "Audit corrections did not change saved executions: " + name)

    setup_pre = load("_tmp-c5-setup-stage2-oNPuwiq6/preflight.json")
    setup_before = table("_tmp-c5-setup-stage2-oNPuwiq6/preflight.json")
    maintained = sorted(set(setup_pre["allowedMaintainedPaths"]) | {"scripts/ci-test-workspace.test.mjs"})
    preimages = {p: Path("_tmp-c5-setup-stage2-oNPuwiq6/before") / p for p in maintained if p in setup_before}
    preimages["scripts/ci-test-workspace.test.mjs"] = Path("_tmp-c5f-ovtrnV/setup-scope-amendment-M5CVmx/workspace-test-before.mjs")
    for p, source in preimages.items():
        match(source, setup_before[p], True)

    r1 = load(BUNDLE / "ci-dag-05-r1-support/manifest.json")
    r1sources = set()
    for entry in r1["files"]:
        match(entry["archivedPath"], entry["archivedSha256"], True)
        for source in entry["sources"]:
            p = source["path"]
            match(preimages[p] if p in ("README.md", "scripts/ci-test-workspace.test.mjs") else p, source["sha256"], True)
            r1sources.add(p)
        if entry["transformation"].startswith("UTF-8 text copy"):
            original = raw(entry["sources"][0]["path"]).decode().replace(str(ROOT), "<repo-root>").encode()
            need(original == raw(entry["archivedPath"]), "R1 declared text curation")
    r1before = table("_tmp-r1-mwGWUn/before.json")
    r1later = table("_tmp-ci-dag-05-r2-J2LqEF/preflight.json")
    r1paths = [v["path"] for v in r1["protectedScope"]["changedFiles"]]
    documents = sorted(load(BUNDLE / "ci-dag-05-r1-support/protected-files.json")["coordinatorBaseline"]["initialDifferencesRetained"])
    need(changes(r1before, r1later) == sorted(r1paths + documents), "R1 five changes plus four later coordinator documents")
    need(changes(table("_tmp-fix-w72mgx/baseline.json"), r1before) == documents, "Distinct R1 earlier coordinator baseline")
    final, original = {}, {}
    for p in r1paths:
        before = Path("_tmp-r1-mwGWUn/before") / Path(p).name
        match(before, r1before[p], True)
        final_path = preimages[p] if p in ("README.md", "scripts/ci-test-workspace.test.mjs") else Path(p)
        match(final_path, r1later[p], True)
        final[p], original[p] = raw(final_path), raw(before)
    need(invert_delta(final, raw(BUNDLE / "ci-dag-05-r1-support/implementation.diff").decode()) == original, "All five R1 implementation preimages reconstructed")
    formatter = "\n".join(load(BUNDLE / "ci-dag-05-r1-support/formatting-review.json")["lines"])
    need(formatter == raw("_tmp-r1-mwGWUn/format-review.log").decode().replace(str(ROOT), "<repo-root>"), "Formatter encoded terminal empty line, no additional LF")
    preformat = {**final, **invert_delta(final, formatter)}
    preformat_hashes = load(BUNDLE / "ci-dag-05-r1-support/preformat-fingerprints.json")["hashes"]
    need(all(sha(preformat[p]) == h for p, h in preformat_hashes.items() if p != "README.md"), "Four helper formatting preimages")
    need(preformat_hashes["README.md"] != sha(final["README.md"]), "README preformat provenance limit retained")
    r1records = []
    for row in load(BUNDLE / "ci-dag-05-r1-support/results.json")["records"]:
        source_record(row["originalResult"], True)
        source_record(row["originalLog"], True)
        result = load(row["originalResult"]["path"])
        counts = tap(raw(row["originalLog"]["path"]))
        need(result == row["savedResult"] and counts == row["loggedCounts"], "R1 original result and independently read counts")
        r1records.append({"label": row["label"], "exit": result["exit"], "signal": result.get("signal"), "counts": counts})
    need(r1records == second["r1"]["records"] and len(r1sources) == 48 and len(r1["files"]) == 21, "R1 second-audit accounting independently matched")

    r2 = load(BUNDLE / "ci-dag-05-r2-support/manifest.json")
    payloads = [v for v in r2["files"] if v["kind"] == "curated-support-payload"]
    r2sources = set()
    for entry in r2["files"]:
        match(entry["archivedPath"], {"bytes": entry["bytes"], "sha256": entry["archivedSha256"]}, True)
        for source in entry["sources"]:
            source_record(source, True)
            r2sources.add(source["originalPath"])
        if "stagedPath" in entry:
            match(entry["stagedPath"], {"bytes": entry["stagedBytes"], "sha256": entry["stagedSha256"]}, True)
            stage = raw(entry["stagedPath"])
            delta = entry["archiveOnlyTransformation"]
            if delta:
                lines = stage.splitlines(keepends=True)
                index = delta["stagedLine"] - 1
                need(lines[index].endswith(b" \n"), "R2 one-space archive preimage")
                lines[index] = lines[index][:-2] + b"\n"
                stage = b"".join(lines)
            need(stage == raw(entry["archivedPath"]), "R2 exact staged/archive bytes")
            patch = "*** Begin Patch\n*** Add File: " + entry["archivedPath"] + "\n" + "".join("+" + line + "\n" for line in raw(entry["stagedPath"]).decode().splitlines()) + "*** End Patch\n"
            match(entry["stagedPath"] + ".patch", entry["stagedPatchSha256"], True)
            need(sha(patch.encode()) == entry["stagedPatchSha256"], "R2 exact immutable staging patch")
    need(len(payloads) == 10 and sum(v["bytes"] for v in payloads) == 99546 and len(r2sources) == 45, "R2 payload/source accounting")
    source_record(r2["preservationStaging"], True)
    source_record(r2["preservationStaging"]["generator"], True)
    staging = load(r2["preservationStaging"]["originalPath"])
    need(len(staging["files"]) == 10 and all(v["archivedSha256"] == e["stagedSha256"] and v["bytes"] == e["stagedBytes"] for v, e in zip(staging["files"], payloads)), "Staging plan is not post-curation archive")
    seal_source = r2["documentationFinalization"]["closeoutValidation"]["appliedInspectedManifest"]["resultSource"]["originalPath"]
    seals = load(seal_source)["planningAndStagingSeals"]
    need(len(seals) == 34, "R2 planning/staging seal count")
    for p, expected in seals.items():
        match(p, expected, True)
    commands = [json.loads(line, object_pairs_hook=pairs, parse_constant=reject_constant) for line in raw(BUNDLE / "ci-dag-05-r2-support/commands.jsonl").decode().splitlines()]
    completed, interrupted = commands[:-1], commands[-1]
    r2records = []
    for row in completed:
        match(row["recordSource"], row["recordSourceSha256"], True)
        saved = load(row["recordSource"])
        need(saved == {k: v for k, v in row.items() if k not in ("recordSource", "recordSourceSha256")}, "R2 unchanged recorder values")
        match(saved["log"], saved["logSha256"], True)
        r2records.append({"label": saved["label"], "exit": saved["exitCode"], "durationSeconds": saved["durationSeconds"], "counts": vitest(raw(saved["log"]))})
    need(r2records == second["r2"]["records"] and len(completed) == 17, "R2 saved counts independently parsed")
    need(interrupted["recorderResultProduced"] is False and not Path("_tmp-ci-dag-05-r2-J2LqEF/complete-affected-package.json").exists(), "No invented complete-package recorder result")
    verification_entry = next(e for e in payloads if e["archivedPath"].endswith("/verification.log"))
    selections = {v["originalPath"]: v for v in verification_entry["sources"]}
    verification = "Curated historical check output; headings are archive annotations.\nFull logs, skipped-test listings and duplicate success output are omitted. Original line ranges are in the manifest.\n"
    for row in completed:
        if row["label"] == "conditions":
            verification += "\n[conditions]\nRead-only condition record; see conditions.json. Its Redis image-inspection subcommand exited 1 (both named images absent).\n"
        else:
            verification += f"\n[{row['label']}; recorder exit {row['exitCode']}]\n"
            if row["log"] in selections:
                verification += scrub_r2(selected_text(selections[row["log"]]))
    need(verification.encode() == raw(verification_entry["archivedPath"]), "R2 independently reconstructed verification excerpts")
    observations, omitted, failures = [], 0, 0
    observation_entry = next(e for e in payloads if e["archivedPath"].endswith("/observations.jsonl"))
    for source in observation_entry["sources"]:
        for line in selected_text(source).splitlines():
            value = json.loads(line.removeprefix("Installed causal observation "), object_pairs_hook=pairs, parse_constant=reject_constant)
            events = value["native"]["events"]
            retained = [event for event in events if event.get("resource") in {"api", "discovery", "key-module", "runtime-module"} or event["kind"] not in {"request", "response"}]
            need(value["fixture"]["dropped"] == value["native"]["dropped"] == 0, "Original R2 dropped counters")
            value["native"]["events"] = retained
            value["archivedNativeSetupEventsOmitted"] = len(events) - len(retained)
            omitted += len(events) - len(retained)
            failures += sum(event["kind"] == "request-failed" for event in retained)
            observations.append(value)
    archived = [json.loads(line, object_pairs_hook=pairs, parse_constant=reject_constant) for line in raw(observation_entry["archivedPath"]).decode().splitlines()]
    need(observations == archived and len(observations) == 10 and omitted == 100 and failures == 16, "R2 selected observations/omissions/failures independently reconstructed")
    for name in ("historical-failure.log", "interrupted-package.log"):
        entry = next(e for e in payloads if e["archivedPath"].endswith("/" + name))
        need(scrub_r2(selected_text(entry["sources"][0])).encode() == raw(entry["stagedPath"]), "R2 raw-to-stage failure excerpt")
    formatting = load(BUNDLE / "ci-dag-05-r2-support/formatting.json")
    need(formatting["formatterPlan"] == load("_tmp-ci-dag-05-r2-J2LqEF/formatter-plan/results.json") and formatting["savedStaticAudit"] == load("_tmp-ci-dag-05-r2-J2LqEF/final-static-audit.log"), "R2 compound formatter audit projection")
    for entry in formatting["formatterPlan"]:
        match(entry["path"], entry["formattedSha256"], True)
        if "patch" in entry:
            match(entry["patch"], entry["patchSha256"], True)
    ownership = load(BUNDLE / "ci-dag-05-r2-support/ownership.json")
    r2pre, r2docs = table("_tmp-ci-dag-05-r2-J2LqEF/preflight.json"), table("_tmp-ci-dag-05-r2-docs-muxm6m2b/baseline.json")
    need(changes(r2pre, r2docs) == sorted(ownership["changedOriginalFiles"]) and len(changes(r2pre, r2docs)) == 10, "R2 five edits plus five coordinator documents")
    for p, value in ownership["productionFingerprints"].items():
        match(p, value, True)
        need(normalize(value) == r2pre[p] == r2docs[p], "R2 production bytes preserved")
    for history in ownership["historicalComparisons"]:
        source_record(history, True)
        before = table(history["originalPath"])
        need(changes(before, r2docs) == sorted(history["differences"]) and len(before) - len(changes(before, r2docs)) == history["unchanged"], "R2 historical stage accounting")

    entries, setup_observations = [], list(load(SETUP / "observations.json")["observations"])
    for path in [SETUP / "manifest.json", *sorted((SETUP / "delivery").glob("provenance-*.json"))]:
        value = load(path)
        entries.extend(value["sourceArchiveProvenance"])
        setup_observations.extend(value.get("observations", []))
    sources, transforms = set(), Counter()
    for entry in entries:
        source_record(entry["archive"], True)
        transforms[entry["transformation"]] += 1
        if "source" in entry:
            source_record(entry["source"], True)
            sources.add(entry["source"]["path"])
            original = raw(entry["source"]["path"])
            need((scrub_setup(original) if entry["transformation"].startswith("Replace absolute") else original) == raw(entry["archive"]["path"]), "Setup declared source/archive transformation")
    combined = ""
    for p in maintained:
        before = raw(preimages[p]) if p in setup_before else b""
        combined += "".join(difflib.unified_diff(before.decode().splitlines(True), raw(p).decode().splitlines(True), fromfile="stage2-preflight/" + p if before else "/dev/null", tofile="selected-final/" + p))
    need(combined.encode() == raw(SETUP / "sources/maintained.diff"), "Exact thirteen-path setup diff")
    amendment = load(BUNDLE / "ci-dag-05-checkout-setup-contract-amendment.json")["allowedChange"]
    p = "scripts/ci-test-workspace.test.mjs"
    before = raw(preimages[p])
    need(before.count(amendment["previousLine"].encode()) == 1 and before.replace(amendment["previousLine"].encode(), amendment["replacementLine"].encode()) == raw(p), "Only approved R1-test source-list line changed")
    setup_observations.sort(key=lambda value: value["startedAt"])
    setup_records, raw_outputs, previous = [], set(), None
    final_fingerprints = {p: fp(p) for p in maintained}
    for row in setup_observations:
        source_record(row["result"], True)
        original_result = Path(row["historicalDirectory"]) / "result.json"
        need(raw(original_result) == raw(row["result"]["path"]), "Exact original/archived setup receipt")
        saved = load(original_result)
        for key in ("label", "command", "cwd", "tmpdir", "startedAt", "finishedAt", "durationMs", "status", "signal", "error", "runtime"):
            need(row.get(key) == saved.get(key), "Setup receipt field: " + row["label"] + "." + key)
        inputs_before, inputs_after = saved.get("inputsBefore", {}), saved.get("inputsAfter", {})
        need(row["inputFingerprintCount"] == len(inputs_before), "Setup receipt input count")
        if inputs_before:
            need((inputs_before == inputs_after) == row["inputsUnchangedDuringRun"], "Setup exact saved input flag")
            if inputs_before != inputs_after:
                need(row["label"] == "format-owned-files" and changes(inputs_before, inputs_after) == [".github/actions/ci-checkout/index.mjs", "scripts/ci-test-checkout.test.mjs", "scripts/ci-test-plan.mjs", "scripts/ci-test-plan.test.mjs"], "Four legitimate owned formatter changes")
        counts = tap(raw(row["streams"]["stdout"]["archive"]["path"]))
        counts.pop("duration_ms", None)
        need((counts or None) == row["counts"], "Setup independently parsed stdout counters")
        for stream in row["streams"].values():
            source_record(stream["retainedObservation"], True)
            source_record(stream["archive"], True)
            need(raw(stream["retainedObservation"]["path"]) == raw(stream["archive"]["path"]), "Setup exact retained/archive stream")
            if stream.get("rawAtExecution"):
                source_record(stream["rawAtExecution"], True)
                raw_outputs.add(stream["rawAtExecution"]["path"])
                need(scrub_setup(raw(stream["rawAtExecution"]["path"])) == raw(stream["archive"]["path"]), "Setup independently readable raw scrub")
        need(previous is None or row["startedAt"] >= previous, "Serial saved setup observations")
        previous = row["finishedAt"]
        if row["label"] in summary["correctedAttempt2Summary"]["setup"]["finalFingerprintRecordLabels"]:
            need(inputs_before == final_fingerprints, "Final setup receipt matches thirteen delivered inputs")
        setup_records.append({"label": row["label"], "status": row["status"], "counts": row["counts"], "inputFingerprintCount": row["inputFingerprintCount"]})
    need(setup_records == second["setup"]["records"], "All 35 setup receipt/count/status projections")
    need(len(entries) == 162 and len(sources) == 156 and len(raw_outputs) == 64 and len(setup_records) == 35 and sum(r["status"] != 0 for r in setup_records) == 11, "Setup source/observation/nonzero totals")
    captured = load(BUNDLE / "ci-dag-05-checkout-setup-stage2-coordinator-evidence.json")["capturedSetupFiles"]
    names = {str(p) for p in SETUP.rglob("*") if p.is_file()} | {str(BUNDLE / "ci-dag-05-checkout-setup.md")}
    need(set(captured) == names and len(names) == 169, "Setup captured file set")
    for path, expected in captured.items():
        match(path, expected, True)
    for path in [p for p in names if p.endswith(".json")]:
        load(path)
    need(sum(p.endswith(".json") for p in names) == 57, "57 strict setup JSON files")
    current_changes = changes(setup_before, snapshot["files"])
    need(len(current_changes) == 17 and len(set(current_changes) & set(maintained)) == 10 and len(set(maintained) - set(setup_before)) == 3, "Current setup ten edits/three additions/seven coordinator documents")
    historical = load(SETUP / "scope/scope-before-archive.json")
    byte_scope = load(BUNDLE / "ci-dag-05-checkout-setup-stage2-coordinator-reconciliation.json")
    docs = historical["coordinatorOnlyDocumentChanges"]
    need(len(docs) == 4 and historical["unchangedOriginalFilesOutsideMaintainedAndCoordinatorDeltas"] == byte_scope["protectedScope"]["unchangedOriginals"] == 2568, "Historical four-doc/2568 capture, not current seven-doc/2565 capture")
    for p, values in docs.items():
        need(normalize(values["before"]) == setup_before[p] and normalize(values["after"]) == byte_scope["coordinatorOnlyDeltas"]["changedDocuments"][p], "Historical setup document inventory projection")
    need(dict(transforms) == second["setup"]["transformations"], "Setup transformation accounting")

    ledger = raw(BUNDLE / "ci-dag-05-local-evidence.md").decode()
    ledger_rows = {name: {"files": int(files.replace(",", "")), "tests": int(tests.replace(",", "")), "todo": int(todo), "runs": int(runs)} for name, files, tests, todo, runs in re.findall(r"^\| ([a-z][a-z0-9-]+)\s*\| ([\d,]+)\s*\| ([\d,]+)\s*\| (\d+)\s*\| (\d+)\s*\|", ledger, re.M)}
    v5 = raw(second["v5"]["rawLog"])
    need(fp(second["v5"]["rawLog"]) == normalize(second["v5"]), "Historical V5 raw identity")
    rows = defaultdict(lambda: {"files": 0, "tests": 0, "todo": 0, "runs": 0})
    done, commands = Counter(), Counter()
    for line in v5.decode().splitlines():
        record = re.match(r"(.+?) test: (.*)", line)
        if record:
            names = [name for name in ledger_rows if record[1].endswith("/" + name)]
            if len(names) == 1:
                name, rest = names[0], record[2]
                if rest == "Done":
                    done[name] += 1
                values = vitest((rest + "\n").encode())
                for value in values:
                    need(not value.get("failed") and not value.get("skipped"), "Historical V5 failure/skip accounting")
                    rows[name]["files" if value["kind"] == "Test Files" else "tests"] += value.get("passed", 0)
                    if value["kind"] == "Tests":
                        rows[name]["todo"] += value.get("todo", 0)
                        rows[name]["runs"] += 1
        command = re.match(r"(.+?) test\$ ", line)
        if command:
            for name in ledger_rows:
                if command[1].endswith("/" + name):
                    commands[name] += 1
    need(dict(rows) == ledger_rows and len(rows) == 25 and all(done[p] == commands[p] == 1 for p in rows), "All historical 25 complete scripts/ledger rows")
    totals = {k: sum(row[k] for row in rows.values()) for k in ("files", "tests", "todo", "runs")}
    need(totals == second["v5"]["totals"] == {"files": 689, "tests": 21224, "todo": 1, "runs": 34}, "Historical V5 execution totals")
    need(len(re.findall(r"^Test group \d+:", v5.decode(), re.M)) == 12, "Historical twelve groups")
    inventory = {"entries": len(AUDIT_SOURCES), "canonicalSha256": sha(canonical(AUDIT_SOURCES))}
    need(inventory == attempts[0]["checkedSourceInventory"] == second["checkedSourceInventory"], "Independently reconstructed 582-source inventory equals both saved audits")
    FACTS["savedEvidenceAudits"] = {
        "attempts": [{"originalReceipt": row["originalRecord"], "checksReported": row["checks"], "exitCodeAttributed": row["observedExitCode"], "problems": row["problems"]} for row in summary["attempts"]],
        "firstAttemptDispositions": summary["firstAttemptDispositions"],
        "independentlyReconstructedSourceInventory": inventory,
        "r1": {"archiveEntries": 21, "declaredSources": 48, "savedRecords": r1records, "formatterHelperPreimages": 4, "readmeFormattingOnlyProvenance": "Not established"},
        "r2": {"payloads": 10, "payloadBytes": 99546, "declaredSources": 45, "planningStagingSeals": 34, "savedRecords": r2records, "observations": 10, "omittedSetupEvents": 100, "retainedRequestFailures": 16, "completePackageRecorder": "Absent; interruption metadata remains separately attributed"},
        "setup": {"capturedFiles": 169, "strictJsonFiles": 57, "archiveEntries": 162, "originalSources": 156, "readableRawOutputs": 64, "savedRecords": setup_records, "nonzeroRecords": 11, "finalFingerprints": 13, "historicalCoordinatorDocuments": 4, "historicalUnchangedOriginals": 2568, "reviewInputCoordinatorDocuments": 7, "reviewInputUnchangedOriginals": 2565},
        "historicalV5": {"groups": 12, "completeScripts": 25, **totals},
        "limit": "Saved audit counters 3257/3507 were not rerun. Independent reconstruction of source identities, counts, stage deltas and curation does not establish runtime equivalence, R2 causality or rollout acceptance.",
    }


def final_delivery(snapshot):
    inputs = load(SUPPORT / "inputs.json")
    need(inputs["maintainedInputs"] == snapshot["reviewedMaintainedFingerprints"], "Curated 24 maintained inputs")
    closing = load(SUPPORT / "closing-integrity.json")
    delivery = load(SUPPORT / "delivery-check.json")
    for section in ("recordsAudit", "formatPreview", "deliverablePrettier", "contentClosure", "deliveryProtectedScope"):
        row = delivery[section]
        source_record(row["originalRecord"])
        original = load(row["originalRecord"]["path"])
        common(row, original, "Delivery " + section, ("streams", "selection"))
        need(row["invocationCount"] == 1, "One recorded delivery phase: " + section)
        if section in ("recordsAudit", "contentClosure"):
            need(original["result"] == "PASS" and not original["problems"], "Saved content audit passed")
            need(original["checks"] == (449 if section == "recordsAudit" else 591), "Saved delivery counters separate from test totals")
    source_record(closing["originalRecord"])
    common(closing, load(closing["originalRecord"]["path"]), "Closing inventory")
    seals = [load(path) for path in REVIEW.glob("*seal.json")]
    need(len(seals) == 56 and all(value["result"] == "PASS" and not value["problems"] for value in seals), "56 retained standalone inventory receipts")
    created = datetime.fromisoformat(re.search(r"Created: \*\*([^*]+)\*\*", raw(BUNDLE / "ci-dag-05-corrective-review.md").decode())[1])
    support_cutoff = datetime.fromisoformat(load(inputs["inventorySummaryAtSupportEntry"]["entryOriginalRecord"]["path"])["finishedAt"])
    closing_cutoff = datetime.fromisoformat(load(closing["originalRecord"]["path"])["finishedAt"])
    delivery_cutoff = datetime.fromisoformat(load(delivery["deliveryProtectedScope"]["originalRecord"]["path"])["finishedAt"])
    counts = {
        "beforeReportCreation": sum(datetime.fromisoformat(s["finishedAt"]) < created for s in seals),
        "atSupportEntry": sum(datetime.fromisoformat(s["finishedAt"]) <= support_cutoff for s in seals),
        "atClosingCapture": sum(datetime.fromisoformat(s["finishedAt"]) <= closing_cutoff for s in seals),
        "atLaterDeliveryScope": sum(datetime.fromisoformat(s["finishedAt"]) <= delivery_cutoff for s in seals),
    }
    need(counts == {"beforeReportCreation": 52, "atSupportEntry": 53, "atClosingCapture": 55, "atLaterDeliveryScope": 56}, "52/53/55/56 inventory capture stages")
    for seal in seals:
        need(seal["protectedRegularFiles"] == 2771 and seal["maintainedFingerprintsMatched"] == 24 and seal["historicalSealsMatched"] == 33, "Inventory receipt match counts")
        need(seal["observedProtectedFilesTableSha256"] == snapshot["filesTableSha256"] and seal["gitStatusMatchesSnapshot"] and not any(seal["drift"].values()), "Inventory receipt protected identities")
    preview = load(delivery["formatPreview"]["originalRecord"]["path"])
    for entry in preview["records"]:
        if not entry["unchanged"]:
            need(Path(entry["path"]).name in ("inputs.json", "checks.json") and raw(entry["proposal"]) == raw(entry["path"]) and sha(raw(entry["path"])) == entry["formattedSha256"], "Exact two reviewer-owned formatter proposals")
    cli = load(delivery["deliverablePrettier"]["originalRecord"]["path"])
    need(cli["inputsBefore"] == cli["inputsAfter"] and cli["exitCode"] == 0 and cli["selectedFiles"] == 7, "Saved seven-file CLI formatter did not mutate inputs")
    historical_summary = cli["inputsBefore"][-1]
    need(historical_summary["bytes"] == 1630 and historical_summary["sha256"] == delivery["deliverablePrettier"]["ownSummaryAtCliCapture"]["sha256"], "Historical intermediate summary is explicitly identified")
    for entry in cli["inputsBefore"][:-1]:
        source_record(entry)
    for name, stream in cli["streams"].items():
        data = raw(stream["path"])
        need(len(data) == stream["retainedBytes"] and sha(data) == stream["retainedSha256"], "Readable retained delivery CLI stream")
        need(stream["rawBytes"] == stream["retainedBytes"] and stream["rawSha256"] == stream["retainedSha256"], "Delivery CLI raw equality is receipt metadata")
    for entry in delivery["recordedFingerprintManifest"]:
        source_record(entry)
    final_format = load(REVIEW / "delivery-final-format.json")
    need(final_format["command"] == delivery["postCaptureChecks"]["formatCommand"] and final_format["result"] == "PASS" and final_format["selectedFiles"] == 7, "Actual saved post-curation formatter receipt")
    for row in final_format["records"]:
        current = fp(row["path"])
        need(row["unchanged"] and row["inputBytes"] == row["formattedBytes"] == current["bytes"] and row["inputSha256"] == row["formattedSha256"] == current["sha256"], "Post-curation receipt matches final bytes")
    metadata = load(REVIEW / "delivery-final-metadata.json")
    need(metadata["command"] == delivery["postCaptureChecks"]["metadataCommand"] and metadata["result"] == "PASS" and metadata["checks"] == 5922 and not metadata["problems"], "Actual final metadata receipt, not presumed command success")
    for key in ("reportFingerprint", "finalSummaryFingerprint"):
        source_record(metadata["selection"][key])
    own = [BUNDLE / "ci-dag-05-corrective-review.md", *SUPPORT.iterdir()]
    need(len(own) == 9 and sum(p.suffix == ".json" for p in own) == 5, "Nine delivered reviewer files/five support JSON")
    links, anchors = 0, 0
    for path in own:
        data = raw(path)
        text = data.decode()
        need(data.endswith(b"\n") and b"\r" not in data and b"\x00" not in data and all(line.rstrip(" \t") == line for line in text.splitlines()), "Reviewer file encoding/whitespace")
        if path.suffix == ".md":
            for target in re.findall(r"\[[^\]]*\]\(([^\s)]+)\)", text):
                part, _, anchor = target.partition("#")
                destination = path.parent / part if part else path
                need(destination.is_file(), "Reviewer local link resolves: " + target)
                links += 1
                if anchor:
                    headings = [re.sub(r"[^\w -]", "", h.lower()).strip().replace(" ", "-") for h in re.findall(r"^#{1,6}\s+(.+)$", destination.read_text(), re.M)]
                    need(anchor in headings, "Reviewer anchor resolves")
                    anchors += 1
    need(links == 31 and anchors == 1, "31 reviewer links/one anchor")
    FACTS["deliveryCaptureBoundaries"] = {
        "inventoryReceiptStages": counts,
        "staticJsonCounterReported": 476, "staticStdoutCounterReported": 482,
        "staticCounterCause": "Six metadata fingerprint assertions after counter capture; driver inspected, not executed",
        "recordsAuditCounterReported": 449, "contentClosureCounterReported": 591,
        "finalMetadataCounterReported": 5922,
        "intermediateSummaryAtCliCapture": historical_summary,
        "finalSummary": {"path": str(SUPPORT / "delivery-check.json"), **fp(SUPPORT / "delivery-check.json")},
        "report": {"path": str(BUNDLE / "ci-dag-05-corrective-review.md"), **fp(BUNDLE / "ci-dag-05-corrective-review.md")},
        "savedFinalFormatReceipt": {"path": str(REVIEW / "delivery-final-format.json"), **fp(REVIEW / "delivery-final-format.json")},
        "savedFinalMetadataReceipt": {"path": str(REVIEW / "delivery-final-metadata.json"), **fp(REVIEW / "delivery-final-metadata.json")},
        "formatterInputs": 7, "excludedFailureStreams": 2, "reviewerFiles": 9,
        "localLinks": links, "anchors": anchors,
        "limit": "No historical intermediate summary bytes were retained. Its 1630-byte identity is receipt metadata; final 13411-byte summary has a distinct independently readable hash. Saved formatter success was not repeated.",
    }


def main():
    destination = Path(sys.argv[1])
    need(destination.parent == WORK and not destination.exists(), "Fresh coordinator-scratch receipt required")
    need(Path(os.environ["TMPDIR"]).resolve() == ROOT / WORK and git("check-ignore", "--", str(WORK)).returncode == 0, "Ignored coordinator scratch/TMPDIR")
    started = datetime.now(timezone.utc).isoformat()
    problems = []
    try:
        match(SNAPSHOT, {"mode": "0644", "bytes": 610017, "sha256": "ad378fec69c87bb1b750c9f1bb3b47b23861ebf4f1d40a3aabb9ebe4678ef696"})
        snapshot = load(SNAPSHOT)
        before = protected_inputs(snapshot)
        byte_scope = load(BYTE_RUN / "coordinator-review-byte-scope.json")
        need(byte_scope["protectedOriginals"] == byte_scope["unchangedOriginals"] == 2771 and byte_scope["reviewerNewFileCount"] == 9, "Successful idle-delivery byte/scope receipt")
        need(len(before) == byte_scope["allCurrentRegularFiles"] == 2782 and sha(canonical(before)) == byte_scope["currentFilesTableSha256"], "Current file table matches saved idle-delivery scope")
        FACTS["priorByteScopeReceipt"] = {"path": str(BYTE_RUN / "coordinator-review-byte-scope.json"), **fp(BYTE_RUN / "coordinator-review-byte-scope.json")}
        inspect_drivers()
        six_checks(snapshot)
        evidence_audits(snapshot)
        final_delivery(snapshot)
        static = load(REVIEW / "static-review.json")
        static_stdout = load(REVIEW / "static-review.stdout.log")
        need(static["checks"] == 476 and static_stdout["checks"] == 482 and static["result"] == "PASS" and not static["problems"], "Static saved counters/result")
        need(static["runtime"] == {"node": "26.12.1", "v8": "14.6.202.34-node.40", "typescript": "6.0.3"}, "Saved runtime is Node 26, not Node 20")
        need(len(static["r2"]["paths"]) == 8 and sum(v.get("originalExpectChains", 0) for v in static["r2"]["paths"]) == 239, "Saved eight-file/239-chain static map")
        for path in static["r2"]["paths"]:
            source_record(path["delivered"])
            if path["original"] is not None:
                source_record(path["original"])
                order = path["retainedOrder"]
                need(len(order) == path["originalExpectChains"] and path["originalAssertionsRetainedInOrder"], "Complete saved original-chain map")
                need(all(a["deliveredOrdinal"] < b["deliveredOrdinal"] for a, b in zip(order, order[1:])), "Ordered saved chain map")
        after = protected_inputs(snapshot)
        need(before == after, "No protected bytes/modes, additions, HEAD/refs/status changed during reconciliation")
        FACTS["protectedScope"] = {
            "originalRegularFiles": 2771, "reviewedMaintainedFingerprints": 24,
            "historicalSeals": 33, "reviewerAdditions": 9, "otherAllowedAdditions": 2,
            "currentRegularFiles": len(after), "currentFilesTableSha256": sha(canonical(after)),
            "unchangedDuringCoordinatorAudit": True,
            "head": snapshot["head"], "projectRefsSha256": snapshot["projectRefsSha256"],
            "snapshot": {"path": str(SNAPSHOT), **fp(SNAPSHOT)},
        }
    except (AssertionError, OSError, ValueError, KeyError, TypeError) as error:
        problems.append(str(error).replace(str(ROOT), "<repo-root>").replace(str(Path.home()), "<user-home>"))
    driver = {"path": str(WORK / "reconcile-saved-review.py"), **fp(WORK / "reconcile-saved-review.py")}
    result = {
        "ownerAlias": "CI-DAG-05 remediation coordinator",
        "startedAt": started, "finishedAt": datetime.now(timezone.utc).isoformat(),
        "verdict": "PASS: saved-evidence reconciliation only; CHANGES REQUIRED / BLOCKED remains" if not problems else "STOP: SAVED-EVIDENCE DISCREPANCY",
        "command": ["python3", str(WORK / "reconcile-saved-review.py"), str(destination)],
        "cwd": ".", "runtimeTmpdir": "'<repo-root>/" + str(WORK) + "'",
        "evidenceAssertions": CHECKS, "problems": problems, **FACTS,
        "readFileInventory": {"entries": len(READ_FILES), "canonicalSha256": sha(canonical(READ_FILES))},
        "coordinatorDriver": driver,
        "limits": "This new evidence reader did not execute historical/reviewer/project drivers or repeat validators, packages, quality checks or probes. Saved counters and execution facts remain attributed to their original receipts. Raw reviewer streams were not persisted; equality to retained streams is recorder metadata. Original source trees/dependencies/private diagnostics and intermediate summary bytes are not an archive-only reproducer. Independent review acceptance is scoped; Q1, native/Node-20/runner, unresolved R2 and R3 remain blockers.",
    }
    with destination.open("x") as stream:
        json.dump(result, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
    print(json.dumps({k: result[k] for k in ("verdict", "evidenceAssertions", "problems")}, indent=2))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
