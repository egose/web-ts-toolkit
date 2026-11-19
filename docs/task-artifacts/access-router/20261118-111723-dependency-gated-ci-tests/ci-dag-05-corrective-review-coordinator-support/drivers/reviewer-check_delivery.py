"""Reviewer deliverable-only checks; no product or historical helper execution."""

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from urllib.parse import unquote

ROOT = Path.cwd()
S = Path("_tmp-c5cr-5m91q69w")
B = Path("docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests")
D = B / "ci-dag-05-corrective-review-support"
REPORT = B / "ci-dag-05-corrective-review.md"
checks = 0
problems = []
fingerprint_count = 0


def require(value, label):
    global checks
    checks += 1
    if not value:
        problems.append(label)


def pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError("Duplicate JSON key: " + key)
        result[key] = value
    return result


def load(path):
    return json.loads(Path(path).read_text(), object_pairs_hook=pairs)


def fp(path):
    p = Path(path)
    info = p.lstat()
    require(stat.S_ISREG(info.st_mode), "Regular file: " + str(p))
    data = p.read_bytes()
    return {"path": str(p), "mode": format(stat.S_IMODE(info.st_mode), "04o"), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def match_recorded_fingerprints(value):
    global fingerprint_count
    if isinstance(value, dict):
        if {"path", "bytes", "sha256"}.issubset(value):
            observed = fp(value["path"])
            require(all(observed[k] == value[k] for k in ("bytes", "sha256", "mode") if k in value), "Recorded fingerprint: " + value["path"])
            fingerprint_count += 1
        for nested in value.values():
            match_recorded_fingerprints(nested)
    elif isinstance(value, list):
        for nested in value:
            match_recorded_fingerprints(nested)


def common_fields(summary, source, label):
    for key in summary.keys() & source.keys():
        require(summary[key] == source[key], label + "." + key)


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, env=dict(os.environ, GIT_OPTIONAL_LOCKS="0"))


def records():
    inputs = load(D / "inputs.json")
    commands = load(D / "checks.json")
    evidence = load(D / "evidence-reconciliation.json")
    snapshot = load(B / "ci-dag-05-corrective-review-inputs.json")
    for value in (inputs, commands, evidence):
        match_recorded_fingerprints(value)
    require(inputs["maintainedInputs"] == snapshot["reviewedMaintainedFingerprints"], "All 24 maintained fingerprints equal snapshot")
    for path, value in {**inputs["maintainedInputs"], **inputs["controlInputs"]}.items():
        require(value == snapshot["files"][path], "Protected table selection: " + path)
        require(value == {k: fp(path)[k] for k in value}, "Current selected input: " + path)
    for key in ("head", "projectRefsSha256"):
        require(inputs[key] == snapshot[key], "Snapshot identity: " + key)
    initial = inputs["initialIndependentMatching"]
    source = load(initial["originalRecord"]["path"])
    common_fields(initial, source, "Initial inventory")
    require(initial["maintainedMatched"] == source["maintainedFingerprintsMatched"], "Initial 24 maintained matches")
    require(initial["historicalMatched"] == source["historicalSealsMatched"], "Initial 33 historical matches")
    entry = inputs["inventorySummaryAtSupportEntry"]
    cutoff = load(entry["entryOriginalRecord"]["path"])["finishedAt"]
    seals = [load(p) for p in S.glob("*seal.json")]
    earlier = [x for x in seals if x["finishedAt"] <= cutoff]
    created = re.search(r"Created: \*\*([^*]+)\*\*", REPORT.read_text()).group(1)
    require(len(earlier) == entry["count"] == 53, "53 inventory records at support entry")
    require(sum(x["finishedAt"] < created for x in seals) == entry["includingBeforeReportCreation"] == 52, "52 inventory records before report creation")
    require(all(x["result"] == "PASS" and not x["problems"] for x in seals), "All retained inventory results passed")
    labels = [x["label"] for x in commands["records"]]
    require(labels == ["static-review", "ci-contract-check", "group-validation-check", "targeted-eslint", "maintained-prettier", "verified-actionlint"], "Exact six recorded invocations")
    previous = ""
    package = load("package.json")
    for record in commands["records"]:
        source = load(record["originalRecord"]["path"])
        for key in ("label", "command", "startedAt", "finishedAt", "durationSeconds", "exitCode", "signalNumber", "counts"):
            require(record[key] == source[key], record["label"] + " exact " + key)
        require(source["inputsUnchangedDuringRun"] is True and source["inputsBefore"] == source["inputsAfter"], record["label"] + " original before/after equality")
        require(source["inputsBefore"]["maintainedInputs"] == inputs["maintainedInputs"], record["label"] + " 24 maintained inputs")
        require(record["startedAt"] > previous, record["label"] + " serial chronology")
        previous = record["finishedAt"]
        if "packageScriptAtInvocation" in record:
            require(record["packageScriptAtInvocation"] == package["scripts"][record["command"][1]], record["label"] + " exact package script")
        if "selectedPathCount" in record:
            require(record["selectedPathCount"] == len(source["scope"]["selected"]), record["label"] + " selected path count")
        for name, stream in record["streams"].items():
            saved = source["streams"][name]
            require(stream["path"] == saved["path"] and stream["bytes"] == saved["retainedBytes"] == saved["rawBytes"] and stream["sha256"] == saved["retainedSha256"] == saved["rawSha256"], record["label"] + " original/raw stream " + name)
        if "stdoutExcerpt" in record:
            lines = Path(record["streams"]["stdout"]["path"]).read_text().splitlines()
            excerpt = record["stdoutExcerpt"]["lines"]
            require(excerpt == (lines[1:4] if record["label"] == "static-review" else lines[-len(excerpt):]), record["label"] + " exact labeled excerpt")
    failure = next(x for x in commands["records"] if x["label"] == "maintained-prettier")
    for name in ("stdout", "stderr"):
        stream = failure["streams"][name]
        before = Path(stream["path"]).read_bytes()
        after = Path(stream["durableArchive"]["path"]).read_bytes()
        require(after == (before.replace(b"\r\n", b"\n") if name == "stdout" else before), "Exact Prettier archival transformation: " + name)
    require(Path(failure["streams"]["stdout"]["path"]).read_bytes().count(b"\r\n") == 1, "Exactly one CRLF normalization")
    provenance = commands["actionlintProvenance"]
    original = load(provenance["originalRecord"]["path"])
    for target, key in (("archive", "archive"), ("installedBinary", "installedBinary"), ("archiveMember", "verifiedArchiveMember")):
        require(provenance[target] == original[key], "Actionlint original provenance: " + target)
    for attempt in evidence["attempts"]:
        original = load(attempt["originalRecord"]["path"])
        common_fields(attempt, original, "Reconciliation " + str(attempt["attempt"]))
        require(attempt["observedExitCode"] == (0 if original["result"] == "PASS" else 1), "Audit exit retained")
    attempt2 = load(evidence["attempts"][1]["originalRecord"]["path"])
    summary = evidence["correctedAttempt2Summary"]
    require(summary["checkedSourceInventory"] == attempt2["checkedSourceInventory"], "Audit source inventory identity")
    for name in ("r1", "r2", "setup"):
        common_fields(summary[name], attempt2[name], "Corrected " + name)
    for name in ("r1", "setup"):
        source = {x["label"]: x for x in attempt2[name]["records"]}
        labels = summary[name]["reviewedHistoricalFailedRecordLabels" if name == "r1" else "nonzeroRecordLabels"]
        require(labels == [x["label"] for x in attempt2[name]["records"] if x["exit" if name == "r1" else "status"] != 0], name + " all nonzero labels retained")
        if name == "setup":
            for label, counts in summary[name]["selectedHistoricalCounts"].items():
                require(all(value == (source[label]["status"] if key == "status" else source[label]["counts"][key]) for key, value in counts.items()), "Setup saved counts: " + label)
    original_static = load(evidence["freshStaticPreservation"]["originalRecord"]["path"])
    static = evidence["freshStaticPreservation"]
    require(static["checkedAt"] == original_static["checkedAt"] and static["runtime"] == original_static["runtime"], "Static timestamp/runtime")
    require(static["savedJsonChecks"] == original_static["checks"] == 476, "Static saved counter")
    require(static["stdoutChecks"] == load(S / "static-review.stdout.log")["checks"] == 482, "Static stdout counter")
    paths = original_static["r2"]["paths"]
    require(len(paths) == static["r2SyntaxFiles"] == 8 and sum(x["original"] is not None for x in paths) == static["savedR2PreimagesMatched"] == 5, "Static 8 files/5 preimages")
    require(sum(x.get("originalExpectChains", 0) for x in paths) == static["expectChains"]["originalRetainedInOrder"] == 239, "Static 239 retained chains")
    for suffix, key in (("fetch-client.test.ts", "fetchClient"), ("packed-consumer.test.ts", "packedConsumer")):
        original = next(x for x in paths if x["delivered"]["path"].endswith(suffix))
        selected = static["expectChains"][key]
        require(selected["original"] == original["originalExpectChains"] and selected["delivered"] == original["deliveredExpectChains"] and selected["originalSyntaxSha256"] == original["originalAssertionSyntaxSha256"], "Static assertion projection: " + suffix)
    setup = original_static["setup"]
    common_fields(static["graphPrefix"], setup["graphPrefix"], "Static graph prefix")
    require(static["exactApprovedResultTestReplacementCount"] == setup["resultTest"]["exactApprovedReplacementCount"] == 2, "Static exact two test amendments")
    require(static["evaluatorSha256"] == setup["evaluator"]["sha256"], "Unchanged production evaluator")
    workflow = static["workflowPreservation"]
    original = setup["workflow"]
    common_fields(workflow, {"jobIdsAndOrder": len(original["jobs"]), "aggregateNeeds": len(original["aggregateNeeds"]), "preservedOriginalCheckoutSteps": original["preservedOriginalCheckoutSteps"], "completePackageTestScripts": len(setup["packageScripts"]), "independentIds": original["independentIds"], "strictYamlFiles": original["strictYamlFiles"]}, "Static workflow projection")
    v5 = evidence["historicalV5"]
    original = attempt2["v5"]
    require(v5["fileExecutions"] == original["totals"]["files"] and v5["passes"] == original["totals"]["tests"] and v5["todo"] == original["totals"]["todo"] and v5["invocations"] == original["totals"]["runs"], "Historical V5 projection")
    return {"freshInvocationRecords": len(commands["records"]), "retainedReconciliationAttempts": 2, "maintainedSelections": 24, "recordedFingerprintEntries": fingerprint_count}


def final_files():
    files = [REPORT, D / "README.md", *(D / name for name in ("inputs.json", "checks.json", "evidence-reconciliation.json", "closing-integrity.json", "delivery-check.json", "maintained-prettier.stdout.log", "maintained-prettier.stderr.log"))]
    expected = sorted(str(p) for p in files)
    visible = git("ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", str(REPORT), str(D))
    require(visible.returncode == 0 and sorted(set(visible.stdout.decode().split("\0")) - {""}) == expected, "Exactly nine reviewer-owned visible files")
    ignored = git("check-ignore", "--", *expected)
    require(ignored.returncode == 1 and not ignored.stdout, "All nine durable destinations unignored")
    require(git("check-ignore", "--", str(S)).returncode == 0, "Reviewer scratch ignored")
    require(Path(os.environ["TMPDIR"]).resolve() == ROOT / S, "Runtime TMPDIR is reviewer-owned scratch")
    links = 0
    anchors = 0
    for p in files:
        raw = p.read_bytes()
        text = raw.decode("utf-8")
        require(raw.endswith(b"\n") and b"\r" not in raw and b"\x00" not in raw, "UTF-8 LF/newline/NUL: " + str(p))
        require(not any(line.rstrip(" \t") != line for line in text.splitlines()), "Trailing whitespace: " + str(p))
        require(not re.search(r"/(?:home|Users|tmp|var/tmp|root)/|\bses_[A-Za-z0-9_-]+|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bBearer\s+[A-Za-z0-9._-]{20,}", text), "Privacy-sensitive patterns: " + str(p))
        if p.suffix == ".json":
            load(p)
            require(True, "Strict JSON without duplicate keys: " + str(p))
        if p.suffix == ".md":
            for target in re.findall(r"\[[^\]]*\]\(([^\s)]+)\)", text):
                parts = unquote(target).split("#", 1)
                require(not re.match(r"^[a-zA-Z]+:", parts[0]), "Local-only Markdown link: " + target)
                destination = (p.parent / parts[0]).resolve() if parts[0] else p.resolve()
                require(destination.is_file() and destination.is_relative_to(ROOT), "Markdown link resolves: " + target)
                links += 1
                if len(parts) == 2:
                    headings = [re.sub(r"[^\w -]", "", h.lower()).strip().replace(" ", "-") for h in re.findall(r"^#{1,6}\s+(.+)$", destination.read_text(), re.M)]
                    require(parts[1] in headings, "Markdown anchor resolves: " + target)
                    anchors += 1
    diff = git("diff", "--check", "--", str(REPORT), str(D))
    require(diff.returncode == 0 and not diff.stdout and not diff.stderr, "Scoped git diff --check")
    closing = load(D / "closing-integrity.json")
    match_recorded_fingerprints(closing)
    if "originalRecord" in closing:
        original = load(closing["originalRecord"]["path"])
        common_fields(closing, original, "Closing inventory projection")
    delivery = load(D / "delivery-check.json")
    if "recordedFingerprintManifest" in delivery:
        match_recorded_fingerprints(delivery["recordedFingerprintManifest"])
    return {"files": len(files), "markdownFiles": 2, "jsonFiles": 5, "completeFailureStreams": 2, "localLinks": links, "anchors": anchors, "fingerprintsExcludingOwnSummary": [fp(p) for p in files if p.name != "delivery-check.json"]}


def main():
    phase, destination = sys.argv[1:]
    started = datetime.now(timezone.utc).isoformat()
    detail = records()
    if phase != "records":
        detail.update(final_files())
    result = {"reviewAlias": "CI-DAG-05 fresh corrective-review session", "phase": phase, "startedAt": started, "finishedAt": datetime.now(timezone.utc).isoformat(), "result": "PASS" if not problems else "DELIVERABLE DISCREPANCIES", "checks": checks, "problems": problems, "command": ["python3", str(S / "check_delivery.py"), phase, destination], "cwd": ".", "runtimeTmpdir": "'<repo-root>/" + str(S) + "'", "selection": detail, "limits": "Deliverable summaries, exact recorded evidence fingerprints and local links only. No original historical audit/helper, product, test, build, resource, source/native/runner, install, fetch or hosted invocation. Own post-capture result summary digest is intentionally excluded; tracked diff check is complemented by explicit new-file whitespace checks."}
    Path(destination).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({k: result[k] for k in ("phase", "result", "checks", "problems")}, indent=2))
    return 0 if not problems else 1


if __name__ == "__main__":
    raise SystemExit(main())
