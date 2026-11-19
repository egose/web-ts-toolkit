"""Read-only evidence reconciliation; never imports or executes delivered/historical drivers.

Original ignored inputs are required. This is not an archive-only runtime reproducer.
Only the reviewer-owned destination named on the command line is written.
"""

from collections import Counter, defaultdict
from datetime import datetime, timezone
import difflib
import hashlib
import json
from pathlib import Path
import re
import stat
import sys

ROOT = Path.cwd()
B = Path("docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests")
S = B / "ci-dag-05-checkout-setup-support"
problems = []
checks = 0
sources_checked = {}


def require(value, label):
    global checks
    checks += 1
    if not value:
        problems.append(label)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(Path(path).read_text())


def fp(path):
    path = Path(path)
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode), "Nonregular evidence: " + str(path))
    data = path.read_bytes()
    return {"mode": f"{stat.S_IMODE(info.st_mode):04o}", "bytes": len(data), "sha256": sha(data)}


def normalized(value):
    if isinstance(value, str):
        return {"sha256": value}
    result = {k: value[k] for k in ("mode", "bytes", "sha256") if k in value}
    if isinstance(result.get("mode"), int):
        result["mode"] = f"{result['mode']:04o}"
    return result


def match(path, expected, label=None):
    expected = normalized(expected)
    actual = fp(path)
    require(all(actual[k] == v for k, v in expected.items()), label or "Fingerprint mismatch: " + str(path))
    sources_checked[str(path)] = actual
    return actual


def check_record(record):
    path = record.get("path", record.get("originalPath"))
    expected = {"sha256": record.get("sha256", record.get("originalSha256"))}
    for k in ("bytes", "mode"):
        if k in record:
            expected[k] = record[k]
        elif "original" + k.title() in record:
            expected[k] = record["original" + k.title()]
    return match(path, expected)


def table(path):
    data = load(path)
    return {k: normalized(v) for k, v in data.get("files", data.get("hashes", {})).items()}


def different(before, after):
    return sorted(p for p, v in before.items() if p not in after or any(after[p].get(k) != x for k, x in v.items()))


def setup_scrub(data):
    text = data.decode().replace(str(ROOT), "<repo-root>").replace(str(Path.home()), "<user-home>")
    text = re.sub(r"\bses_[A-Za-z0-9_-]+", "<private-session-id>", text)
    # Public synthetic-auth fixture; never copy its literal credential-like text into results.
    text = text.replace("https://" + "user:secret" + "@example.org/", "https://example.org/<redacted-synthetic-auth>/")
    return text.encode()


def r2_scrub(text):
    text = text.replace(str(ROOT), "<repo-root>")
    text = re.sub(r"http://127\.0\.0\.1:\d+", "<api-origin>", text)
    return re.sub(r"\(node:\d+\)", "(node:<pid>)", text)


def tap_counts(text):
    result = {}
    for key, number in re.findall(r"^(?:# |ℹ )(tests|suites|pass|fail|cancelled|skipped|todo|duration_ms)\s+([\d.]+)", text, re.M):
        result[key] = float(number) if "." in number else int(number)
    return result


def vitest_counts(text):
    result = []
    for kind, rest in re.findall(r"^\s*(Test Files|Tests)\s+(.+)$", text, re.M):
        counts = {k: int(n.replace(",", "")) for n, k in re.findall(r"([\d,]+) (passed|failed|skipped|todo)", rest)}
        total = re.search(r"\(([\d,]+)\)", rest)
        if total:
            counts["total"] = int(total[1].replace(",", ""))
        result.append({"kind": kind, **counts})
    return result


def selected_lines(value):
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return list(range(value["first"], value["last"] + 1))
    numbers = []
    for item in value.split(",") if value else []:
        parts = item.split("-")
        numbers.extend(range(int(parts[0]), int(parts[-1]) + 1))
    return numbers


def reverse_diff(final, patch):
    """Invert a unified text delta in memory, validating its entire new-side context."""
    lines = patch.splitlines(keepends=True)
    sections = {}
    index = 0
    while index < len(lines):
        if not lines[index].startswith("--- "):
            index += 1
            continue
        name = lines[index + 1][4:].strip()
        index += 2
        current = final[name].decode().splitlines(keepends=True)
        original = []
        cursor = 0
        while index < len(lines) and not lines[index].startswith("--- "):
            header = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", lines[index])
            if not header:
                index += 1
                continue
            old_count = int(header[2] or 1)
            count = int(header[4] or 1)
            old_start = int(header[1]) - (1 if old_count else 0)
            start = int(header[3]) - (1 if count else 0)
            require(start >= cursor, "Delta hunk ordering: " + name)
            original.extend(current[cursor:start])
            require(len(original) == old_start, "Delta old-side hunk position: " + name)
            old, new = [], []
            index += 1
            while index < len(lines) and not lines[index].startswith(("@@ ", "--- ")):
                line = lines[index]
                if line.startswith((" ", "-")):
                    old.append(line[1:])
                if line.startswith((" ", "+")):
                    new.append(line[1:])
                index += 1
            require(len(old) == old_count and len(new) == count, "Delta exact hunk line counts: " + name)
            require(current[start:start + len(new)] == new, "Delta new-side context: " + name)
            original.extend(old)
            cursor = start + len(new)
        original.extend(current[cursor:])
        sections[name] = "".join(original).encode()
    return sections


started = datetime.now(timezone.utc).isoformat()
snapshot = load(B / "ci-dag-05-corrective-review-inputs.json")
current = {p: normalized(v) for p, v in snapshot["files"].items()}
setup_preflight_path = "_tmp-c5-setup-stage2-oNPuwiq6/preflight.json"
setup_preflight = load(setup_preflight_path)
setup_before = table(setup_preflight_path)
maintained = sorted(set(setup_preflight["allowedMaintainedPaths"]) | {"scripts/ci-test-workspace.test.mjs"})
setup_originals = {p: Path("_tmp-c5-setup-stage2-oNPuwiq6/before") / p for p in maintained if p in setup_before}
setup_originals["scripts/ci-test-workspace.test.mjs"] = Path("_tmp-c5f-ovtrnV/setup-scope-amendment-M5CVmx/workspace-test-before.mjs")
for path, original in setup_originals.items():
    match(original, setup_before[path])

# R1 archive, original records, original-to-delivery scope and formatting-only provenance.
r1m = load(B / "ci-dag-05-r1-support/manifest.json")
r1sources = set()
for entry in r1m["files"]:
    match(entry["archivedPath"], {"sha256": entry["archivedSha256"]})
    for source in entry["sources"]:
        path = source["path"]
        actual_path = setup_originals[path] if path in ("README.md", "scripts/ci-test-workspace.test.mjs") else path
        match(actual_path, {"sha256": source["sha256"]})
        r1sources.add(path)
    if entry["transformation"].startswith("UTF-8 text copy"):
        source = Path(entry["sources"][0]["path"]).read_bytes()
        require(source.decode().replace(str(ROOT), "<repo-root>").encode() == Path(entry["archivedPath"]).read_bytes(), "R1 text transformation: " + entry["archivedPath"])
r1baseline = table("_tmp-r1-mwGWUn/before.json")
r1delivered = table("_tmp-ci-dag-05-r2-J2LqEF/preflight.json")
r1paths = [x["path"] for x in r1m["protectedScope"]["changedFiles"]]
r1later_documents = sorted(load(B / "ci-dag-05-r1-support/protected-files.json")["coordinatorBaseline"]["initialDifferencesRetained"])
require(different(r1baseline, r1delivered) == sorted(r1paths + r1later_documents), "R1 five-file implementation scope plus four later coordinator documents")
r1fix = table("_tmp-fix-w72mgx/baseline.json")
require(different(r1fix, r1baseline) == r1later_documents, "R1 four earlier fix-baseline coordinator-document differences")
r1final_bytes = {p: (setup_originals[p] if p in ("README.md", "scripts/ci-test-workspace.test.mjs") else Path(p)).read_bytes() for p in r1paths}
original_r1_bytes = {}
for path in r1paths:
    before = Path("_tmp-r1-mwGWUn/before") / Path(path).name
    match(before, r1baseline[path])
    match(setup_originals[path] if path in ("README.md", "scripts/ci-test-workspace.test.mjs") else path, r1delivered[path])
    original_r1_bytes[path] = before.read_bytes()
# GNU diff and difflib select different valid zero-context blank-line hunks.
# Validate every archive hunk against the final bytes, then require exact preimages.
r1diff = (B / "ci-dag-05-r1-support/implementation.diff").read_text()
require(reverse_diff(r1final_bytes, r1diff) == original_r1_bytes, "R1 exact archive-delta reversal to all five original preimages")
formatter = "\n".join(load(B / "ci-dag-05-r1-support/formatting-review.json")["lines"])
require(formatter == Path("_tmp-r1-mwGWUn/format-review.log").read_text().replace(str(ROOT), "<repo-root>"), "R1 formatter encoded-lines transformation")
preformat_bytes = {**r1final_bytes, **reverse_diff(r1final_bytes, formatter)}
preformat = load(B / "ci-dag-05-r1-support/preformat-fingerprints.json")["hashes"]
require(all(sha(preformat_bytes[p]) == h for p, h in preformat.items() if p != "README.md"), "R1 inverse formatter delta exactly matches all four helper preformat hashes")
r1_readme_preformat_limit = {"preformatSha256": preformat["README.md"], "deliveredSha256": sha(r1final_bytes["README.md"]), "limit": "The preformat inventory captures an earlier README; the reviewed formatter delta covers only the two workspace helper files, not that later documentation update. No format-only README preimage is inferred; the separate implementation delta reconstructs the exact delivered README from its pre-R1 source."}
r1results = []
for record in load(B / "ci-dag-05-r1-support/results.json")["records"]:
    check_record(record["originalResult"])
    check_record(record["originalLog"])
    raw = load(record["originalResult"]["path"])
    require(raw == record["savedResult"], "R1 original result values: " + record["label"])
    counts = tap_counts(Path(record["originalLog"]["path"]).read_text())
    require(counts == record["loggedCounts"], "R1 parsed raw counts: " + record["label"])
    r1results.append({"label": record["label"], "exit": raw["exit"], "signal": raw.get("signal"), "counts": counts})

# R2 original/staged/archive bytes and curation, without reexecuting the generator.
r2m = load(B / "ci-dag-05-r2-support/manifest.json")
payloads = [e for e in r2m["files"] if e["kind"] == "curated-support-payload"]
unique_r2_sources = set()
for entry in r2m["files"]:
    match(entry["archivedPath"], {"sha256": entry["archivedSha256"], "bytes": entry["bytes"]})
    for source in entry["sources"]:
        check_record(source)
        unique_r2_sources.add(source["originalPath"])
    if "stagedPath" not in entry:
        continue
    match(entry["stagedPath"], {"sha256": entry["stagedSha256"], "bytes": entry["stagedBytes"]})
    staged = Path(entry["stagedPath"]).read_bytes()
    delta = entry["archiveOnlyTransformation"]
    if delta:
        lines = staged.splitlines(keepends=True)
        index = delta["stagedLine"] - 1
        require(lines[index].endswith(b" \n"), "R2 explicit one-space preimage")
        lines[index] = lines[index][:-2] + b"\n"
        staged = b"".join(lines)
    require(staged == Path(entry["archivedPath"]).read_bytes(), "R2 exact staged/archive delta: " + entry["archivedPath"])
    patch = "*** Begin Patch\n*** Add File: " + entry["archivedPath"] + "\n" + "".join("+" + x + "\n" for x in Path(entry["stagedPath"]).read_text().splitlines()) + "*** End Patch\n"
    require(sha(patch.encode()) == entry["stagedPatchSha256"], "R2 reconstructed staging patch")
    match(entry["stagedPath"] + ".patch", {"sha256": entry["stagedPatchSha256"]})
require(len(payloads) == r2m["payloadCount"] == 10 and sum(e["bytes"] for e in payloads) == r2m["payloadBytes"] == 99546, "R2 payload accounting")
require(len(unique_r2_sources) == r2m["uniquePayloadOriginalSources"] == 45, "R2 unique original-source accounting")
check_record(r2m["preservationStaging"])
check_record(r2m["preservationStaging"]["generator"])
plan = load(r2m["preservationStaging"]["originalPath"])
require(len(plan["files"]) == 10 and all(p["archivedSha256"] == e["stagedSha256"] and p["bytes"] == e["stagedBytes"] for p, e in zip(plan["files"], payloads)), "R2 immutable plan fields mean staging, not post-curation archive")
starting = load(r2m["documentationFinalization"]["closeoutValidation"]["appliedInspectedManifest"]["resultSource"]["originalPath"])
for path, expected in starting["planningAndStagingSeals"].items():
    match(path, expected)
require(len(starting["planningAndStagingSeals"]) == 34, "R2 planning/staging seal count")
r2commands = [json.loads(x) for x in (B / "ci-dag-05-r2-support/commands.jsonl").read_text().splitlines()]
completed, interrupted = r2commands[:-1], r2commands[-1]
r2results = []
for command in completed:
    match(command["recordSource"], {"sha256": command["recordSourceSha256"]})
    raw = load(command["recordSource"])
    require(raw == {k: v for k, v in command.items() if k not in ("recordSource", "recordSourceSha256")}, "R2 completed recorder values: " + command["label"])
    match(raw["log"], {"sha256": raw["logSha256"]})
    r2results.append({"label": raw["label"], "exit": raw["exitCode"], "durationSeconds": raw["durationSeconds"], "counts": vitest_counts(Path(raw["log"]).read_text())})
require(len(completed) == 17 and interrupted["recorderResultProduced"] is False and not Path("_tmp-ci-dag-05-r2-J2LqEF/complete-affected-package.json").exists(), "R2 no synthesized complete-package recorder result")
verification_entry = next(e for e in payloads if e["archivedPath"].endswith("/verification.log"))
selection = {x["originalPath"]: selected_lines(x["selectedLines"]) for x in verification_entry["sources"]}
verification = "Curated historical check output; headings are archive annotations.\nFull logs, skipped-test listings and duplicate success output are omitted. Original line ranges are in the manifest.\n"
for raw in completed:
    if raw["label"] == "conditions":
        verification += "\n[conditions]\nRead-only condition record; see conditions.json. Its Redis image-inspection subcommand exited 1 (both named images absent).\n"
        continue
    verification += f"\n[{raw['label']}; recorder exit {raw['exitCode']}]\n"
    lines = Path(raw["log"]).read_text().splitlines()
    verification += "".join(r2_scrub(lines[n - 1]) + "\n" for n in selection.get(raw["log"], []))
require(verification.encode() == Path(verification_entry["archivedPath"]).read_bytes(), "R2 verification excerpt exact selected-line reconstruction")
observed = []
omitted_events = 0
failure_events = 0
observation_entry = next(e for e in payloads if e["archivedPath"].endswith("/observations.jsonl"))
for source in observation_entry["sources"]:
    lines = Path(source["originalPath"]).read_text().splitlines()
    for n in selected_lines(source["selectedLines"]):
        raw = json.loads(lines[n - 1].removeprefix("Installed causal observation "))
        events = raw["native"]["events"]
        keep = [x for x in events if x.get("resource") in {"api", "discovery", "key-module", "runtime-module"} or x["kind"] not in {"request", "response"}]
        require(all(x in keep for x in events if x["kind"] == "request-failed"), "R2 every request-failed event retained")
        require(raw["fixture"]["dropped"] == raw["native"]["dropped"] == 0, "R2 original dropped counters retained separately from archive omission")
        raw["native"]["events"] = keep
        raw["archivedNativeSetupEventsOmitted"] = len(events) - len(keep)
        omitted_events += len(events) - len(keep)
        failure_events += sum(x["kind"] == "request-failed" for x in keep)
        observed.append(raw)
archived_observations = [json.loads(x) for x in Path(observation_entry["archivedPath"]).read_text().splitlines()]
require(observed == archived_observations and len(observed) == 10 and omitted_events == 100, "R2 exact observation value/filter reconstruction")
for name in ("historical-failure.log", "interrupted-package.log"):
    entry = next(e for e in payloads if e["archivedPath"].endswith("/" + name))
    source = entry["sources"][0]
    lines = Path(source["originalPath"]).read_text().splitlines()
    chosen = selected_lines(source["selectedLines"])
    reconstructed = r2_scrub("".join(lines[n - 1] + "\n" for n in chosen))
    require(reconstructed.encode() == Path(entry["stagedPath"]).read_bytes(), "R2 raw-to-stage excerpt transformation: " + name)
formatting = load(B / "ci-dag-05-r2-support/formatting.json")
require(formatting["formatterPlan"] == load("_tmp-ci-dag-05-r2-J2LqEF/formatter-plan/results.json") and formatting["savedStaticAudit"] == load("_tmp-ci-dag-05-r2-J2LqEF/final-static-audit.log"), "R2 formatting compound values unchanged")
for entry in formatting["formatterPlan"]:
    match(entry["path"], {"sha256": entry["formattedSha256"]})
    if "patch" in entry:
        match(entry["patch"], {"sha256": entry["patchSha256"]})
ownership = load(B / "ci-dag-05-r2-support/ownership.json")
r2pre = table("_tmp-ci-dag-05-r2-J2LqEF/preflight.json")
r2docs = table("_tmp-ci-dag-05-r2-docs-muxm6m2b/baseline.json")
require(different(r2pre, r2docs) == sorted(ownership["changedOriginalFiles"]), "R2 independent preflight-to-document-baseline exact changed scope")
for path, pair in ownership["changedOriginalFiles"].items():
    require(normalized(pair["before"]) == r2pre[path] and normalized(pair["after"]) == r2docs[path], "R2 before/after ownership fingerprints: " + path)
require(len(r2pre) == 2561 and len(different(r2pre, r2docs)) == 10, "R2 five maintained edits plus five coordinator documents")
require(set(r2docs) - set(r2pre) == set(ownership["preArchiveAdditions"]) | {e["archivedPath"] for e in payloads}, "R2 three diagnostics/two coordinator additions/ten payloads separately accounted")
for path, value in ownership["productionFingerprints"].items():
    match(path, value)
    require(normalized(value) == r2pre[path] == r2docs[path], "R2 production source preserved across snapshots: " + path)
require(len(ownership["productionFingerprints"]) == 24, "R2 unchanged production source count")
for history in ownership["historicalComparisons"]:
    check_record(history)
    baseline = table(history["originalPath"])
    changes = different(baseline, r2docs)
    require(changes == sorted(history["differences"]) and len(changes) == 14 and len(baseline) - len(changes) == history["unchanged"], "R2 independently reconstructed historical scope: " + history["originalPath"])
    for path, pair in history["differences"].items():
        require(pair["beforeSha256"] == baseline[path]["sha256"] and pair["afterSha256"] == r2docs[path]["sha256"], "R2 historical difference fingerprints: " + path)

# Setup: 162 archive records, 156 originals, 35 serial observations, raw transformations.
provenance_paths = [S / "manifest.json", *sorted((S / "delivery").glob("provenance-*.json"))]
setup_entries = []
setup_obs = load(S / "observations.json")["observations"]
for path in provenance_paths:
    data = load(path)
    setup_entries.extend(data["sourceArchiveProvenance"])
    setup_obs.extend(data.get("observations", []))
setup_sources = set()
transforms = Counter()
for entry in setup_entries:
    check_record(entry["archive"])
    transforms[entry["transformation"]] += 1
    if "source" in entry:
        check_record(entry["source"])
        setup_sources.add(entry["source"]["path"])
        data = Path(entry["source"]["path"]).read_bytes()
        if entry["transformation"].startswith("Replace absolute"):
            data = setup_scrub(data)
        require(data == Path(entry["archive"]["path"]).read_bytes(), "Setup exact source/archive transformation: " + entry["archive"]["path"])
require(len(setup_entries) == 162 and len(setup_sources) == 156, "Setup archive/original-source accounting")
combined = ""
for path in maintained:
    before = setup_originals[path].read_bytes() if path in setup_before else b""
    after = Path(path).read_bytes()
    combined += "".join(difflib.unified_diff(before.decode().splitlines(True), after.decode().splitlines(True), fromfile="stage2-preflight/" + path if before else "/dev/null", tofile="selected-final/" + path))
require(combined.encode() == (S / "sources/maintained.diff").read_bytes(), "Setup exact thirteen-path diff against preflight, not HEAD")
amendment = load(B / "ci-dag-05-checkout-setup-contract-amendment.json")["allowedChange"]
p = "scripts/ci-test-workspace.test.mjs"
before, after = setup_originals[p].read_bytes(), Path(p).read_bytes()
old, new = amendment["previousLine"].encode(), amendment["replacementLine"].encode()
require(before.count(old) == 1 and before.replace(old, new) == after, "Setup sole R1-test amendment and all other bytes protected")
one_line = "".join(difflib.unified_diff(before.decode().splitlines(True), after.decode().splitlines(True), fromfile="stage2-preflight/" + p, tofile="selected-final/" + p))
require(one_line.encode() == (S / "sources/r1-one-line.diff").read_bytes(), "Setup isolated amendment diff")
setup_obs.sort(key=lambda x: x["startedAt"])
raw_outputs = set()
last_finished = None
setup_results = []
final_fingerprints = {p: fp(p) for p in maintained}
for observation in setup_obs:
    check_record(observation["result"])
    original_result = Path(observation["historicalDirectory"]) / "result.json"
    require(original_result.read_bytes() == Path(observation["result"]["path"]).read_bytes(), "Setup exact original result: " + observation["label"])
    raw = load(original_result)
    for key in ("label", "command", "cwd", "tmpdir", "startedAt", "finishedAt", "durationMs", "status", "signal", "error", "runtime"):
        require(observation.get(key) == raw.get(key), "Setup original result field " + key + ": " + observation["label"])
    inputs_before, inputs_after = raw.get("inputsBefore", {}), raw.get("inputsAfter", {})
    require(observation["inputFingerprintCount"] == len(inputs_before), "Setup input count: " + observation["label"])
    if inputs_before:
        require((inputs_before == inputs_after) == observation["inputsUnchangedDuringRun"], "Setup saved before/after inputs and exact unchanged flag: " + observation["label"])
        if inputs_before != inputs_after:
            require(observation["label"] == "format-owned-files" and sorted(p for p, value in inputs_before.items() if value != inputs_after.get(p)) == [".github/actions/ci-checkout/index.mjs", "scripts/ci-test-checkout.test.mjs", "scripts/ci-test-plan.mjs", "scripts/ci-test-plan.test.mjs"], "Setup only explicitly recorded four-owned-file formatting changes within a command")
    stdout = Path(observation["streams"]["stdout"]["archive"]["path"]).read_text()
    counts = tap_counts(stdout)
    counts.pop("duration_ms", None)
    require((counts or None) == observation["counts"], "Setup independent stdout counts: " + observation["label"])
    for stream in observation["streams"].values():
        check_record(stream["retainedObservation"])
        check_record(stream["archive"])
        require(Path(stream["retainedObservation"]["path"]).read_bytes() == Path(stream["archive"]["path"]).read_bytes(), "Setup exact retained output")
        if stream.get("rawAtExecution"):
            check_record(stream["rawAtExecution"])
            raw_outputs.add(stream["rawAtExecution"]["path"])
            require(setup_scrub(Path(stream["rawAtExecution"]["path"]).read_bytes()) == Path(stream["archive"]["path"]).read_bytes(), "Setup independent raw-output scrub")
    require(last_finished is None or observation["startedAt"] >= last_finished, "Setup observation overlap: " + observation["label"])
    last_finished = observation["finishedAt"]
    if observation["label"] in ("ci-check-final", "groups-check-final", "lint-final-fingerprint", "format-check-after-cause-wrap", "yaml-check-final", "actionlint-final"):
        require(inputs_before == final_fingerprints, "Setup final verification thirteen-path fingerprints: " + observation["label"])
    setup_results.append({"label": observation["label"], "status": observation["status"], "counts": observation["counts"], "inputFingerprintCount": observation["inputFingerprintCount"]})
require(len(setup_obs) == 35 and len(raw_outputs) == 64 and sum(x["status"] != 0 for x in setup_obs) == 11, "Setup serial-observation/raw-output/nonzero accounting")
captured = load(B / "ci-dag-05-checkout-setup-stage2-coordinator-evidence.json")["capturedSetupFiles"]
observed_files = {str(p) for p in S.rglob("*") if p.is_file()} | {str(B / "ci-dag-05-checkout-setup.md")}
require(set(captured) == observed_files and len(captured) == 169, "Setup independent file inventory agrees with coordinator capture")
for path, value in captured.items():
    match(path, value)
json_paths = [p for p in observed_files if p.endswith(".json")]
for path in json_paths:
    load(path)
require(len(json_paths) == 57, "Setup structured-file validity and count")
setup_changes = different(setup_before, current)
setup_maintained_changes = sorted(set(setup_changes) & set(maintained))
setup_coordinator_changes = sorted(set(setup_changes) - set(maintained))
setup_later_documents = sorted(setup_coordinator_changes)
require(len(setup_before) == 2582 and len(setup_maintained_changes) == 10 and len(set(maintained) - set(setup_before)) == 3 and len(setup_later_documents) == 7 and all(p.startswith("docs/") for p in setup_later_documents), "Setup ten maintained changes/three new/seven current coordinator-document changes separately reconciled")
setup_delivery_scope = load(S / "scope/scope-before-archive.json")
setup_captured_changes = load(B / "ci-dag-05-checkout-setup-stage2-coordinator-reconciliation.json")
setup_delivery_documents = setup_delivery_scope["coordinatorOnlyDocumentChanges"]
require(set(setup_delivery_documents) == set(setup_captured_changes["coordinatorOnlyDeltas"]["changedDocuments"]) and len(setup_delivery_documents) == 4, "Setup historical four coordinator-document delivery records agree separately from current seven")
for p, pair in setup_delivery_documents.items():
    require(normalized(pair["before"]) == setup_before[p] and normalized(pair["after"]) == setup_captured_changes["coordinatorOnlyDeltas"]["changedDocuments"][p], "Setup historical coordinator-document before/after inventory agreement: " + p)
require(setup_delivery_scope["unchangedOriginalFilesOutsideMaintainedAndCoordinatorDeltas"] == len(setup_before) - len(setup_maintained_changes) - len(setup_delivery_documents) == setup_captured_changes["protectedScope"]["unchangedOriginals"] == 2568, "Setup historical unchanged count, not current-readiness count")

# Historical V5 accounting: read raw summary rows and exact script completion only.
v5path = Path("_tmp-05c-G8SORQ/grouped.log")
v5 = v5path.read_text()
ledger = (B / "ci-dag-05-local-evidence.md").read_text()
ledger_rows = {}
for name, files, tests, todo, runs in re.findall(r"^\| ([a-z][a-z0-9-]+)\s*\| ([\d,]+)\s*\| ([\d,]+)\s*\| (\d+)\s*\| (\d+)\s*\|", ledger, re.M):
    ledger_rows[name] = {"files": int(files.replace(",", "")), "tests": int(tests.replace(",", "")), "todo": int(todo), "runs": int(runs)}
v5rows = defaultdict(lambda: {"files": 0, "tests": 0, "todo": 0, "runs": 0})
done = Counter()
commands = Counter()
for line in v5.splitlines():
    record = re.match(r"(.+?) test: (.*)", line)
    if record:
        prefix, rest = record.groups()
        names = [n for n in ledger_rows if prefix.endswith("/" + n)]
        if len(names) != 1:
            continue
        name = names[0]
        if rest == "Done":
            done[name] += 1
        summary = re.match(r"\s*(Test Files|Tests)\s+(.+)", rest)
        if summary:
            kind, counts = summary.groups()
            pairs = {k: int(n.replace(",", "")) for n, k in re.findall(r"([\d,]+) (passed|failed|skipped|todo)", counts)}
            require(not pairs.get("failed") and not pairs.get("skipped"), "V5 preserved failure/skip accounting: " + name)
            v5rows[name]["files" if kind == "Test Files" else "tests"] += pairs.get("passed", 0)
            if kind == "Tests":
                v5rows[name]["todo"] += pairs.get("todo", 0)
                v5rows[name]["runs"] += 1
    cmd = re.match(r"(.+?) test\$ (.*)", line)
    if cmd:
        names = [n for n in ledger_rows if cmd[1].endswith("/" + n)]
        if len(names) == 1:
            commands[names[0]] += 1
require(dict(v5rows) == ledger_rows and len(v5rows) == 25, "V5 independent per-workspace ledger equality")
require(len(re.findall(r"^Test group \d+:", v5, re.M)) == 12 and all(done[n] == 1 and commands[n] == 1 for n in ledger_rows), "V5 twelve groups/twenty-five complete script invocations and Done markers")
totals = {key: sum(row[key] for row in v5rows.values()) for key in ("files", "tests", "todo", "runs")}
require(totals == {"files": 689, "tests": 21224, "todo": 1, "runs": 34}, "V5 execution-count totals, not unique tests or fresh coverage")

result = {
    "reviewAlias": "CI-DAG-05 fresh corrective-review session",
    "startedAt": started,
    "finishedAt": datetime.now(timezone.utc).isoformat(),
    "result": "PASS" if not problems else "EVIDENCE DISCREPANCIES",
    "checks": checks,
    "problems": problems,
    "method": "Independent regular-file SHA-256/mode checks, in-memory delta/curation reconstruction, JSON value comparison, raw TAP/Vitest summary parsing and snapshot comparison; no delivered or historical driver execution, product imports, tests, build, resource, source operation or network access.",
    "r1": {"archiveEntries": len(r1m["files"]), "uniqueDeclaredSources": len(r1sources), "preflightFiles": len(r1baseline), "changed": r1paths, "unchangedAtCapturedR1Delivery": len(r1baseline) - len(r1paths), "laterCoordinatorDocumentChangesAtR2Preflight": r1later_documents, "formatterHelperPreimageHashesReconstructed": 4, "readmePreformatLimit": r1_readme_preformat_limit, "records": r1results},
    "r2": {"payloads": len(payloads), "payloadBytes": sum(e["bytes"] for e in payloads), "uniquePayloadSources": len(unique_r2_sources), "planningStagingSeals": 34, "stagingExactPayloads": sum(not e["archiveOnlyTransformation"] for e in payloads), "archiveOnlyOneSpaceDeltas": [{"path": e["archivedPath"], **e["archiveOnlyTransformation"]} for e in payloads if e["archiveOnlyTransformation"]], "observations": len(observed), "omittedSetupEvents": omitted_events, "requestFailedEventsRetained": failure_events, "completedRecorderObjects": len(completed), "interruptedInvocations": 1, "productionSourceFilesUnchanged": 24, "records": r2results, "riskLimits": ["No original retry-preparation exception", "Focused abort failure retained, not disposed", "Mapped load/signer identity is changed; static assertion retention does not establish timing neutrality", "Packed-consumer completion/result absent; timeout/exit/signal are separately attributed harness metadata"]},
    "setup": {"capturedFiles": len(captured), "jsonFilesParsed": len(json_paths), "archiveEntries": len(setup_entries), "uniqueOriginalSources": len(setup_sources), "rawOutputs": len(raw_outputs), "observations": len(setup_obs), "nonzeroObservations": sum(x["status"] != 0 for x in setup_obs), "preflightFiles": len(setup_before), "maintainedChanges": setup_maintained_changes, "newMaintainedPaths": sorted(set(maintained) - set(setup_before)), "historicalCoordinatorDocumentDeliveryCount": len(setup_delivery_documents), "historicalDeliveryUnchangedOriginalCount": 2568, "historicalDocumentLimit": "Independently matched original/archived inventory records and their before/after fields; no omitted historical document preimages or state are synthesized.", "coordinatorDocumentChangesAtCurrentReview": setup_later_documents, "unchangedOriginalsAtCurrentReview": len(setup_before) - len(setup_changes), "transformations": dict(transforms), "records": setup_results},
    "v5": {"rawLog": str(v5path), **fp(v5path), "groups": 12, "completeScripts": 25, "totals": totals, "matchesLedger": dict(v5rows) == ledger_rows, "limits": "Historical accounting only; no suite repeated. Earlier failures, cache/resource omissions and Chromium-only selection remain in the preserved ledger; no R1/R2/setup or hosted runtime recertification."},
    "checkedSourceInventory": {"entries": len(sources_checked), "canonicalSha256": sha(json.dumps(sources_checked, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode())},
    "omissions": "Full original inventories, raw private diagnostics, unselected logs and executable dependencies remain in ignored original scratch or existing support; this summary alone cannot rerun or independently reproduce runtime/historical state.",
    "command": ["python3", "_tmp-c5cr-5m91q69w/reconcile_evidence.py", sys.argv[1]],
    "cwd": ".",
    "runtimeTmpdir": "'<repo-root>/_tmp-c5cr-5m91q69w'",
}
Path(sys.argv[1]).write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({k: result[k] for k in ("result", "checks", "problems")}, indent=2))
raise SystemExit(0 if not problems else 1)
