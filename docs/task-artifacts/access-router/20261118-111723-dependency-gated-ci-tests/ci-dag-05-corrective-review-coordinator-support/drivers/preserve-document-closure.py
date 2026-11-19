"""Preserve new documentation closure; no test or historical driver execution."""

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

ROOT = Path.cwd().resolve()
WORK = Path("_tmp-c5cr-coord-3ovrro4e")
BUNDLE = Path("docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests")
SUPPORT = BUNDLE / "ci-dag-05-corrective-review-coordinator-support"


def fp(path):
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode)
    data = path.read_bytes()
    return {"path": str(path), "mode": format(stat.S_IMODE(info.st_mode), "04o"), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def copy(source, relative, normalize_stdout=False):
    destination = SUPPORT / relative
    assert not destination.exists()
    before = source.read_bytes()
    after = before.replace(b"\r\n", b"\n") if normalize_stdout else before
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("xb") as stream:
        stream.write(after)
    destination.chmod(stat.S_IMODE(source.lstat().st_mode))
    assert destination.read_bytes() == after
    return {
        "source": fp(source), "archive": fp(destination),
        "transformation": "Normalize CRLF to LF in this new documentation-only success stdout; no other byte change; original retained unchanged" if normalize_stdout else "None; byte-exact already-sanitized copy; original retained unchanged",
        "crlfCountBefore": before.count(b"\r\n") if normalize_stdout else None,
    }


def main():
    assert sys.argv[1:] == ["--preserve-passing-document-closure"]
    assert Path(os.environ["TMPDIR"]).resolve() == ROOT / WORK
    receipt_path = WORK / "coordinator-document-check.json"
    receipt = json.loads(receipt_path.read_bytes())
    assert receipt["verdict"].startswith("PASS: coordinator documentation/hygiene/scope only;") and not receipt["problems"]
    assert fp(WORK / "check-coordinator-documents.py") == receipt["coordinatorDriver"]
    for path, record in receipt["documentationDelta"]["changedDocuments"].items():
        assert {k: fp(Path(path))[k] for k in ("mode", "bytes", "sha256")} == record["after"]
        assert {k: fp(Path(record["retainedPreimage"]))[k] for k in ("mode", "bytes", "sha256")} == record["before"]
    for path, expected in receipt["documentationFormatter"]["inputsAfter"].items():
        assert {k: fp(Path(path))[k] for k in ("mode", "bytes", "sha256")} == expected
    entries = [
        copy(receipt_path, "coordinator-document-check.json"),
        copy(WORK / "coordinator-document-update.diff", "coordinator-document-update.diff"),
        copy(WORK / "check-coordinator-documents.py", "drivers/check-coordinator-documents.py"),
        copy(WORK / "preserve-reconciliation.py", "drivers/preserve-reconciliation.py"),
        copy(WORK / "preview-coordinator-documents.mjs", "drivers/preview-coordinator-documents.mjs"),
        copy(WORK / "coordinator-document-format-preview.json", "receipts/coordinator-document-format-preview.json"),
        copy(WORK / "coordinator-document-prettier.stdout.log", "receipts/coordinator-document-prettier.stdout.log", True),
        copy(WORK / "preserve-document-closure.py", "drivers/preserve-document-closure.py"),
    ]
    manifest = {
        "preservedAt": datetime.now(timezone.utc).isoformat(),
        "ownerAlias": "CI-DAG-05 remediation coordinator",
        "purpose": "Later documentation closure evidence, separate from the 21-payload saved-review manifest and all runtime/test acceptance",
        "entryCount": len(entries),
        "payloadBytes": sum(entry["archive"]["bytes"] for entry in entries),
        "entries": entries,
        "documentationCheck": {
            "originalReceipt": fp(receipt_path),
            "verdict": receipt["verdict"],
            "selectedMarkdownFiles": 8,
            "strictJsonFilesAtCapture": 10,
            "localLinksAtCapture": 188,
            "anchorsAtCapture": 6,
            "existingExternalHttpsReferencesNotFetched": 2,
            "formatterExitCode": 0,
            "formatterSelection": "Eight coordinator Markdown files plus the newly authored initial copy manifest only",
            "excludedFromFormatter": "Maintained code/workflow paths, unchanged reviewer deliverables and immutable captured receipt/driver copies; exclusions are not formatter passes",
            "protectedOriginalsUnchanged": 2764,
            "changedCoordinatorDocuments": 7,
            "maintainedFingerprintsUnchanged": 24,
            "historicalSealsUnchanged": 33,
            "reviewerDeliverablesUnchanged": 9,
        },
        "captureBoundary": "The document receipt precedes these eight copies and this later manifest. Its own hash is external here, not self-sealed. Seven changed coordinator documents are distinct from earlier snapshots' zero-drift captures; original snapshot/assignment, reviewer outputs, maintained files and historical seals remain unchanged. This later manifest is separately formatted/checked before handoff and does not rewrite the initial copy manifest or saved receipts.",
        "omitted": "Seven full document preimages remain unchanged in ignored scratch; exact maintained seven-path diff and before/after fingerprints are preserved instead. Empty successful formatter stderr is omitted and fingerprinted in the receipt. No raw reviewer output/intermediate summary, dependency/build/resource state, binaries, private diagnostics or session mappings are added.",
        "reproductionLimit": "Documentation receipts, source/driver copies and an exact seven-path diff, not archive-only runtime reproduction. Current postimages are fingerprinted; future document changes require those capture-specific bytes for inverse reconstruction. Historical/project/reviewer drivers were not executed. No validator/package/probe/hosted acceptance is inferred.",
        "command": ["python3", str(WORK / "preserve-document-closure.py"), "--preserve-passing-document-closure"],
        "cwd": ".",
        "runtimeTmpdir": "'<repo-root>/" + str(WORK) + "'",
        "selfReferenceLimit": "Covers only the eight entries listed; not this manifest, the initial manifest/index or a later final metadata receipt",
    }
    destination = WORK / "documentation-support-manifest.json"
    with destination.open("x") as stream:
        json.dump(manifest, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
    print(json.dumps({"preservedAt": manifest["preservedAt"], "entryCount": manifest["entryCount"], "payloadBytes": manifest["payloadBytes"], "newManifestProposal": str(destination)}, indent=2))


if __name__ == "__main__":
    main()
