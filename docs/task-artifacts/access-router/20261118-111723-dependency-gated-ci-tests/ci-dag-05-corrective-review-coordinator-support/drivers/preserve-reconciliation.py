"""Copy selected reconciled evidence and freeze six coordinator document preimages."""

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys

ROOT = Path.cwd().resolve()
WORK = Path("_tmp-c5cr-coord-3ovrro4e")
REVIEW = Path("_tmp-c5cr-5m91q69w")
BYTE = Path("_tmp-c5f-ovtrnV/corrective-reconcile-e8x4a97c")
BUNDLE = Path("docs/task-artifacts/access-router/20261118-111723-dependency-gated-ci-tests")
DESTINATION = BUNDLE / "ci-dag-05-corrective-review-coordinator-support"
DOCUMENTS = [
    Path("docs/tasks/20261118-111723-dependency-gated-ci-tests.md"),
    BUNDLE / "ci-dag-05-remediation-coordination.md",
    BUNDLE / "ci-dag-05-corrective-review-handoff.md",
    BUNDLE / "ci-dag-05-handoff.md",
    BUNDLE / "ci-dag-05-local-evidence.md",
    BUNDLE / "README.md",
]


def fp(path):
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode)
    data = path.read_bytes()
    return {"path": str(path), "mode": format(stat.S_IMODE(info.st_mode), "04o"), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def copy(source, destination):
    record = fp(source)
    raw = source.read_bytes()
    text = raw.decode("utf-8")
    assert not re.search(r"/(?:home|Users|var/tmp|root)/|\bses_[A-Za-z0-9_-]+|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|\bBearer\s+[A-Za-z0-9._-]{20,}", text)
    if source.suffix == ".json":
        json.loads(raw)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("xb") as stream:
        stream.write(raw)
    destination.chmod(stat.S_IMODE(source.lstat().st_mode))
    assert destination.read_bytes() == raw
    return {"source": record, "archive": fp(destination), "transformation": "None; byte-exact already-sanitized copy; original retained unchanged"}


def main():
    assert sys.argv[1:] == ["--preserve-reconciled-idle-delivery"]
    assert Path(os.environ["TMPDIR"]).resolve() == ROOT / WORK
    assert not DESTINATION.exists()
    result_path = WORK / "saved-evidence-reconciliation-attempt-2.json"
    result = json.loads(result_path.read_bytes())
    assert result["verdict"].startswith("PASS: saved-evidence reconciliation only;") and not result["problems"]
    assert fp(WORK / "reconcile-saved-review.py") == result["coordinatorDriver"]
    snapshot = json.loads((BUNDLE / "ci-dag-05-corrective-review-inputs.json").read_bytes())
    document_preimages = []
    for path in DOCUMENTS:
        assert {k: fp(path)[k] for k in ("mode", "bytes", "sha256")} == snapshot["files"][str(path)]
        source = WORK / "pre-update" / path
        document_preimages.append(copy(path, source))
    mapping = [
        (BYTE / "coordinator-review-byte-scope.json", "coordinator-byte-scope.json"),
        (BYTE / "reconcile-idle-corrective-review.py", "drivers/reconcile-idle-corrective-review.py"),
        (BYTE / "launch-seal.json", "receipts/coordinator-launch-seal.json"),
        (BYTE / "checker-static-preflight.json", "receipts/coordinator-static-preflight.json"),
        (WORK / "saved-evidence-reconciliation-attempt-1.json", "receipts/coordinator-evidence-attempt-1.json"),
        (result_path, "coordinator-saved-evidence.json"),
        (WORK / "reconcile-saved-review.attempt-1.py", "drivers/reconcile-saved-review.attempt-1.py"),
        (WORK / "reconcile-saved-review.py", "drivers/reconcile-saved-review.py"),
        (REVIEW / "reconciliation-attempt-1.json", "receipts/reviewer-evidence-attempt-1.json"),
        (REVIEW / "reconciliation-attempt-2.json", "receipts/reviewer-evidence-attempt-2.json"),
        (REVIEW / "delivery-final-format.json", "receipts/reviewer-final-format.json"),
        (REVIEW / "delivery-final-metadata.json", "receipts/reviewer-final-metadata.json"),
    ]
    for name in (
        "run_review_check.py", "verify_seal.py", "reconcile_evidence.attempt-1.py",
        "reconcile_evidence.py", "static-review.mjs", "check_delivery.py",
        "format_delivery.mjs", "run_delivery_prettier.py", "check_delivery_metadata.py",
    ):
        mapping.append((REVIEW / name, "drivers/reviewer-" + name))
    entries = [copy(source, DESTINATION / relative) for source, relative in mapping]
    failed = json.loads((WORK / "saved-evidence-reconciliation-attempt-1.json").read_bytes())
    assert failed["coordinatorDriver"]["sha256"] == fp(WORK / "reconcile-saved-review.attempt-1.py")["sha256"]
    manifest = {
        "preservedAt": datetime.now(timezone.utc).isoformat(),
        "ownerAlias": "CI-DAG-05 remediation coordinator",
        "purpose": "Selected exact byte/scope and independently reconciled saved-evidence receipts, retained audit failures and inspected drivers; not corrective or rollout acceptance",
        "entries": entries,
        "entryCount": len(entries),
        "payloadBytes": sum(entry["archive"]["bytes"] for entry in entries),
        "coordinatorDocumentPreimages": document_preimages,
        "coordinatorAuditDispositions": [{
            "failedReceipt": "receipts/coordinator-evidence-attempt-1.json",
            "failedDriver": "drivers/reconcile-saved-review.attempt-1.py",
            "problem": "invalid literal for int() with base 10: ''",
            "cause": "Coordinator reader treated four explicitly empty selectedLines encodings in the R2 verification manifest as integer ranges rather than empty excerpts",
            "correction": "Only the new coordinator reader accepts the explicit empty selection; all original receipts/streams/drivers and maintained files remained unchanged. Separately fix its own read-inventory capture order before adding driver metadata.",
            "successfulReceipt": "coordinator-saved-evidence.json",
            "scope": "Evidence-reader correction only; no test/validator/quality retry, source/native/runner probe or implementation correction",
        }],
        "formattingBoundary": "Raw captured receipt/driver copies are immutable byte-exact preservation inputs, not a new Prettier selection or pass. Newly authored coordinator documents/index/manifest require their own formatter and metadata checks. The prior four-entry setup-coordinator-manifest exception remains historical, not a pass; maintained workflow Q1 remains a distinct current failure.",
        "captureBoundary": "The two successful coordinator receipts precede the six later authorized coordinator document edits. All 2771 originals matched at those captures; later documentation scope must separately allow only these six document paths and new coordinator support. This manifest covers only the listed 21 payloads, not itself, its index or later document-check evidence.",
        "omitted": [
            "Full six one-shot JSON input tables, verbose successful streams and 56 repetitive inventory records; original paths/hashes and independent counts remain in reconciled summaries",
            "Raw reviewer execution streams were never persisted; raw/retained equality is recorder metadata, not independently readable raw evidence",
            "Historical intermediate 1630-byte delivery summary; only its receipt identity was retained, distinct from final 13411-byte summary",
            "Original source trees, full coordinator preimages, dependencies, binaries, caches, fixture Git objects, browser/database state, private raw diagnostics and harness/session mappings",
        ],
        "reproductionLimit": "Copies preserve original scratch paths and capture-specific inputs. Do not execute archival drivers: they require omitted originals and current authorization. Summaries and saved receipts do not reproduce R2 causality/timing, native full-root/Node-20/runner or hosted behavior. Archiving executes no historical driver, test, probe, formatter, resource or network operation.",
        "command": ["python3", str(WORK / "preserve-reconciliation.py"), "--preserve-reconciled-idle-delivery"],
        "cwd": ".",
        "runtimeTmpdir": "'<repo-root>/" + str(WORK) + "'",
        "preservationDriver": fp(WORK / "preserve-reconciliation.py"),
    }
    with (DESTINATION / "manifest.json").open("x") as stream:
        json.dump(manifest, stream, indent=2, ensure_ascii=False)
        stream.write("\n")
    print(json.dumps({k: manifest[k] for k in ("preservedAt", "entryCount", "payloadBytes")}, indent=2))


if __name__ == "__main__":
    main()
