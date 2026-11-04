# OAM-05 root-gate follow-up — REVIEW-05

## Decision

**Scoped code review remains ACCEPTED. Full-gate acceptance is BLOCKED.** The
required, unmodified root `pnpm test` was run once with suitable short scratch and
failed in a different, real-Chromium application test. All OAM-05 acceptance is
therefore **not yet satisfied**. Coordinator alone updates the
[task](../../../tasks/20261103-172737-access-router-output-authorization-modes.md).

Same independent REVIEW-05, 2026-11-04; verification/environment follow-up only.
The [original rejection](../oam-20261103-172737-review/README.md) and
[accepted scoped re-review with historical root failures](../oam-20261103-172737-review-revalidation/README.md)
remain byte-identical. [verification.json](verification.json) records results,
input identities, commands and limits. No source/test/guidance/task edits, manual
dependency changes, host/Docker configuration changes, subagents or commits.

## Short scratch and historical blocker reconciliation

- Created **fresh** root `_tmpJQMxCL` using `mktemp -d "$PWD/_tmpXXXXXX"` from the
  checkout root; basename **10 characters**, confirmed ignored by `_tmp*`.
  Resolved its absolute path and supplied it as `TMPDIR` to every runtime command.
  No old failed socket directory or another task's scratch was reused or cleared.
- The installed `broadcast-channel@7.4.0` helpers generated a **95-byte** socket
  path under this scratch and actually listened successfully. Preflight used
  `socketPath`, `ensureFoldersExist` and `createSocketEventEmitter`, then closed
  only that socket; no backend override, monkeypatch or harness change.
- Docker read-only server check passed: **29.9.2**. Node **v26.12.1**, pnpm
  **11.18.0**, Vitest **4.1.11**; existing prerequisites/dependencies.
- **B1 resolved in the required run:** mongoose-rxdb **45 files / 632 passed**,
  including the previously failing SQLite/BroadcastChannel cases. No socket errors
  or unhandled rejections were reported. The old 123–124-byte failures remain
  historical observations, not current blockers.
- Both real-Docker Redis suites passed: attestation **62**, Redis store **462**.
  Docker is not the remaining blocker.

## Vault reset investigation — not reproduced; cause undetermined

Read the exact prior supplementary failure: `Error: read ECONNRESET` in
`packages/express-oidc-vault/test/logout-navigation.test.ts`,
`rejects text/plain before form parsing`; that invocation had **2,448 passed /
1 failed**, unlike its earlier mandatory **2,449 passed**.

Bounded inspection covered that file's fixture and local HTTP provider, the
pre-parser media guard in `packages/express-oidc-vault/src/index.ts:1396–1407`
and `1573–1594`, async error handling at `510–565`, and
`packages/express-oidc-vault/src/vault-route-proof.ts:124–129`. The test sends a
repeated text body using Supertest's ephemeral local HTTP server, expecting 415 JSON/headers and no store
read. The guard precedes body parsing; the inspected error path emits JSON. This
does not establish why the historical connection reset occurred.

Predeclared **three** complete-file invocations, separate processes and serial:
**199/199 passed each**, zero failed/pending/todo, including the exact text/plain
case. No name filter, retry option or retry-to-pass loop. The required root run
then passed the entire Vault package: **41 files / 2,449 tests**. **B2 was not
reproduced; cause remains undetermined.** No fix, flakiness dismissal or
infrastructure-only attribution is claimed.

## Fresh required V3

Repository-root workdir for every command. Replace `<repo-root>` before execution;
runtime environment was `TMPDIR='<repo-root>/_tmpJQMxCL'`. For a new run, create new
short ignored scratch rather than reusing this historical directory.

Executed whole-file commands for `n=1`, then `2`, then `3` (replace `<n>`):

```sh
pnpm --filter @web-ts-toolkit/express-oidc-vault exec vitest run --config ../../vitest.config.ts test/logout-navigation.test.ts --reporter=default --reporter=json --outputFile.json=../../_tmpJQMxCL/vault-file-<n>.json
```

Then awaited these exact commands in order, without flags or altered scripts:

```sh
pnpm build
pnpm test
pnpm lint
```

- Root build: **exit 0; 31 top-level workspace build completions**.
- Required root test: **exit 1; 22 completed Vitest lanes / 9,222 passed /
  1 failed / 1 todo / zero skipped**. File summaries: **287 passed / 1 failed**.
  **Zero reported unhandled rejections/exceptions.** The existing todo is
  `packages/asset-inliner/test/legacy-contract.test.ts:453–455` (ASSET-06 image
  replacement); it was neither added nor substituted for a test.
- Attestation Node/Redis/Mongo/browser/packed lanes: **618/62/31/141/12 passed**.
  mongoose-rxdb **632**, Vault **2,449**, Redis store **462** passed.
- Root lint: **exit 0** after the failed test command settled.

Root test kept its default `--workspace-concurrency=1` and first-failure behavior.
No root retry, no-bail, filters, exclusions or substitutions. Later workspace
scripts, including access-router/decorator, have **no completed result in this
root invocation**; prior accepted V2 evidence is separate, not a root-pass claim.

## Remaining blocker B3 — browser fallback assertion

Package: `apps/oidc-vault-dpop-example`; real **Chromium 151.0.7922.34**.
Its Node lane passed **5 files / 55 tests**. Browser lane: **8 passed / 1 failed
files; 74 passed / 1 failed tests**. Failing case:

```text
test/browser/logout-navigation.browser.ts
OVAPP-07 real chromium logout navigation
navigates only to fixed fallback on unavailable (cookie)
line 207: expect(dto.navigationUrl === bare).toBe(failure !== 'consume-error')
expected true; received false
```

Inspected the unchanged case at lines 170–221, browser harness, page bridge and
local IdP. The case selects unavailable discovery, advances the controller clock
by 600,001 ms to expire discovery cache, and holds the actual successful POST
response before navigation. The page bridge clones the response JSON at
`test/browser/page-bridge.ts:262–270`. Its URL-equality assertion failed before
releasing the navigation gate. **The actual URL was not logged**; this does not
prove a particular ticket, upstream redirect or completed browser navigation.
These app/Vault files match HEAD and are outside the OAM diff, but no clean-baseline
comparison or root cause is established. This is not proven infrastructure-only.

**Next owner action:** Vault application/browser-test owner investigate why the
held response URL is not the bare endpoint under unavailable discovery/cookie
transport, checking discovery-cache expiration and sanitized response/request
observations. Establish the complete application test script passing, then rerun
the complete required root `pnpm test` serially in fresh short ignored scratch.
Do not weaken this assertion or bypass the real browser. This reviewer made no
unrelated fix and did not retry the failure into a pass.

## Evidence freshness, preservation and hygiene

HEAD remains `c68451e40b99ca545dc52a46c287b32949980d26` plus incoming OAM work.
**2,238 pre-existing nonignored repository files** stayed identical before/after
these checks, as did **19 built files** across router/decorator `dist/`. Against
the accepted re-review, **68/69 protected inputs plus all 13 additional inputs**
match; the sole expected difference is the coordinator-updated task, protected
from this follow-up's start. Current candidate root ESM still hashes to
`897ab60e087dc749044d85a96bbd4626e0cac98d12bd21ec50e2d4af2521230c`.
The prior **15 probes, 7,743 V2 tests and both 29/29 benchmark selections** remain
applicable to unchanged product inputs; they were not rerun or relabeled as fresh.

Seven selected original historical descriptor/sealer/dependency-descriptor/gate/
ESM/CJS/lock hashes match the prior report before and after. The original artifact
was not rebuilt, installed, resealed or modified; its sealer was not imported or
executed. Prior six complete historical inventories remain historical; this
follow-up does **not** claim a fresh full artifact/dependency inventory.

Only this new README/JSON is preserved. Reviewed scratch contents; omitted raw
logs/assertion trees, disposable verification scripts/manifests, generated
consumers/builds, dependencies, databases and sockets. Commands referencing those
omitted scratch scripts are not executable from this summary-only bundle. No
private IDs, credentials, raw URL identities or machine-local paths are archived.
Final formatting, JSON/count/hash reconciliation, links/source references,
targeted privacy, scratch-ignore/destination-non-ignore and tracked/untracked
whitespace checks **passed**. All four relative links resolve; the nine inspected
app/Vault inputs match HEAD. Only these two report files are new nonignored work.
ESLint explicitly excludes root `_tmp*/**`.

**Final scope:** code ACCEPT remains valid; full-gate ACCEPT is withheld solely
because the new required root run failed at B3. No exhaustive security,
performance, heap, freshness, transaction or rollback certification.
