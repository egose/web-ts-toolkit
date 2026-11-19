# CI-DAG-03 handoff

Created: 2026-11-18 14:58 PST. Related: [CI-DAG-03](../../../tasks/20261118-111723-dependency-gated-ci-tests.md#task-ci-dag-03-implement-isolated-test-setup-and-build-output-transfer).

**Delivered and ready for coordinator acceptance of local CI-DAG-03; not accepted by this handoff.** The newly authorized complete PDF and three-engine DPoP scripts both passed under the demonstrated checkout-owner prerequisite, after separate pristine verified restores and genuine starter readiness. Clean preparation, real resource preflights, independent non-browser consumers, complete non-browser scripts, and cross-checkout isolation also pass. Earlier browser failures remain historical evidence, not rewritten passes. The coordinator owns task statuses; this document does not start CI-DAG-04/05 or certify committed/live Actions execution.

## Delivered scope and CI-DAG-04 interface

- Three unwired composites: [`ci-setup`](../../../../.github/actions/ci-setup/action.yml), [`ci-prepare`](../../../../.github/actions/ci-prepare/action.yml), and [`ci-test`](../../../../.github/actions/ci-test/action.yml).
- [`ci-test-artifacts.mjs`](../../../../scripts/ci-test-artifacts.mjs) and [tests](../../../../scripts/ci-test-artifacts.test.mjs): clean full-build preparation, required-output inventory, bounded gzip/USTAR encoding and strict in-process parsing, staged restore, identity/digest checks, and genuine starter readiness.
- [`ci-test-workspace.mjs`](../../../../scripts/ci-test-workspace.mjs) and [tests](../../../../scripts/ci-test-workspace.test.mjs): lean tool probes, job-local browser/Mongo resources, actual Redis image preflight, and exact-argv execution.
- Narrow synchronized [plan contracts](../../../../scripts/ci-test-plan.mjs)/[independent fixtures](../../../../scripts/ci-test-plan.test.mjs) and root `test:ci:check` expansion. Accepted CI-DAG-02 YAML dependency/lock changes remain intact. No package scripts, pins, shared setup, real workflow, result evaluator, commits, pushes, dispatches, settings files, publication, or subagents were changed/used by this continuation.

CI-DAG-04 must preserve the 25 static package jobs plus `validate`, `prepare`, and stable `unit-test`, with the accepted declared/fixture success gates. Preparation exposes only `artifact-name` and `artifact-digest`. Every test composite requires exactly `workspace`, `artifact-name`, and `artifact-digest`; workspace is the exact discovered manifest name, including unscoped `create-access-router-mongo-starter` and `oidc-vault-dpop-example`.

The test composite frozen-installs independently, downloads the exact same-run artifact, restores and validates it, selects download-only caches, then invokes `node scripts/ci-test-workspace.mjs`. That runner verifies outputs before resource preflight and rechecks source/output/checkout identity afterward, immediately before executing exactly `pnpm --filter <validated manifest name> test` once. It never substitutes a smaller lane, adds retries, or removes package worker/rebuild controls.

`artifact-digest` is the SHA-256 of the gzip archive bytes, supplied outside the downloaded artifact by preparation—not the upload action's service digest. Browser caches contain downloads only; Mongo caches contain the exact binary and optional `.md5`. Redis images are pulled/preflighted, not archived. CI-DAG-04 must add mandatory actual workflow/helper agreement to `test:ci:check`; the current staged command deliberately does not accept or validate the legacy workflow as the new DAG.

## Tested-source provenance

Clean local clones `p` (preparation), `c` (browser consumer), and `r` (additional consumer) under historical ignored `_tmp-c3-Uo71M6/` retain committed package/test sources at `0fda5197c5b950e865af73681225c8bbf5533775`. The preparation/consumer harness imports the saved uncommitted helpers from the enclosing installed working tree, passing each clone as the explicit helper root. This is real execution against clean package source, **not a claim that this SHA contains the proposed helpers or that a committed Actions revision ran**.

The independent proposed-source setup copy `s` copies the accepted root manifest/lock, six scripts, and three composites byte-for-byte into another clone: all 11 fingerprints matched. Its actual `pnpm install --frozen-lockfile --ignore-scripts` passed in 8,009 ms; direct `node scripts/ci-test-workspace.mjs setup` and `node scripts/ci-test-plan.mjs --check` passed, covering 33 locations and resolving `yaml@2.9.0` inside its own install. Setup plus the following model check took 96,546 ms under concurrent isolated local verification, not a hosted/cold performance baseline. That copy is intentionally uncommitted/dirty; it is not used to bypass the clean-source preparation/runner contract.

- Package-build/consumer lock SHA-256: `8685e0d36b941dcf7e7fa18ed4cb35fe3b8512d175ee0aecba241902979bcede`.
- Proposed root lock SHA-256: `10165ddd054bfa1db935d20bd2428af94638b57430f71a3d386eadc2ca28546d` (accepted CI-DAG-02 direct `yaml@2.9.0` importer).
- Node `26.12.1`, root/template packageManager pnpm `11.18.0`, npm `11.20.0`; `.tool-versions` pnpm `11.24.0` is preserved, not selected for this CI setup. Platform: Linux x64, Ubuntu 24.04/noble.
- Separate dependency trees/virtual stores and checkout-local ignored `TMPDIR` locations are used. Installs reuse the local pnpm content-addressed store; no dependency store/tree is transferred in the build artifact. These are not cold hosted-runner timings.

Saved proposed-source fingerprints (SHA-256):

- `scripts/ci-test-plan.mjs`: `dc65f5f261288c0d9e69e78428a52e47ee43130316ee8959f57edbf4c0e9496c`
- `scripts/ci-test-plan.test.mjs`: `fa9e5e443d65b2882f2027a3557a3135cddc8924242fb11da99c38deb81bfd60`
- `scripts/ci-test-artifacts.mjs`: `606e40dac5ae77462ab03100aea1b2b32cfd3ae39f450f7c074f08eb91c490cc`
- `scripts/ci-test-artifacts.test.mjs`: `97e1840df656940bc54e445e367247c34a0fb6e63126265c88ce635b014679e7`
- `scripts/ci-test-workspace.mjs`: `d91514e2b57651e4c620fe895935fb00eb14bc00af2d967ff7acb87ec5291fc8`
- `scripts/ci-test-workspace.test.mjs`: `6f27022d853464b94050ee3bc7f2378a1fc2423b80b8fe1565d68ec5b0fa1ebd`
- `.github/actions/ci-setup/action.yml`: `0bcffecbe5d059050e25840aa1d8cccfedfe697c5e286554ff4b1747db86ff92`
- `.github/actions/ci-prepare/action.yml`: `71f2bca5f051a7419be9ef9b3c823e8a6ae04e680eef56b600718ad9eea266dd`
- `.github/actions/ci-test/action.yml`: `4e2f0efafcfc11d750e62481b4e83766659e557139d8f449dc5128ae5deab9ff`
- `package.json`: `d8a14ecdc1bb5424b20b13fa6cd8e775c4c6eaeb7acf9ff267a1a9b8728b2c2a`

## Real clean preparation and artifact

The successful `prepareArtifacts(p, env)` invocation performed one unchanged full `pnpm build`, with all designated outputs absent at entry, clean-source checks before/after, and post-build checkout/run/toolchain/lock identity agreement. Elapsed preparation: **166,305 ms**. The frozen `--ignore-scripts` preparation install reported 5.7 seconds; the independently installed `c` consumer reported 5.8 seconds, both using pnpm 11.18.0 and the reused local store.

Local verification identity (not a dispatched Actions run): run `30306`, attempt `1`, tested SHA above, Linux/x64, Node/pnpm above, package-source lock above.

- Exact artifact name: `ci-test-build-30306-1-0fda5197c5b950e865af73681225c8bbf5533775`.
- Archive SHA-256: `1c9622805df74e10d08d7519bc162787191d871b8388ea82a09d1543731c58c7`.
- Archive size: **2,585,645 bytes**; inventoried payload: **11,350,508 bytes**.
- **31 explicit pnpm-discovered dist roots, 173 required files, 333 entries: 274 files and 59 directories**. Includes DPoP client assets/server output and reverse runtime/express/starter fixtures, not just library root entries.
- Five executable entries: runtime `dist/cli.js`, express `dist/cli.js`, and starter `dist/bin/{cli,deploy-netlify,deploy-shared}.js`.
- Eight hidden files: six staged `.agents/skills/*/SKILL.md` files, `.dockerignore`, and legitimate `.env.example`. The generated starter lock is included; checkout root source/config/lock files are not restored.

The genuine starter was staged for repository `VERSION=0.68.0`, with packageManager `pnpm@11.18.0` and all four toolkit dependencies at `^0.68.0`. The real `assertStagedTemplateReady` publication gate verified complete source-file agreement, placeholders/substitutions, hidden files, generated lock resolution and importer specifiers. The build's actual registry contract was used; no release was manufactured to force staging. Unpublished-release skips and stale/incomplete templates remain fatal.

Only `packages/express-oidc-vault/dist/wire.mjs` may be empty: actual tsup output is 0 bytes and its source must parse as interfaces/type aliases only. Presence and hash are still mandatory; other empty runtime outputs fail. Archive parsing rejects links/hardlinks/special files, unsafe modes, escapes, duplicates, source overwrite, forbidden dependency/cache/binary/credential content, malformed inventory and excessive sizes. Allowed modes are files `0644`/`0755`, directories `0700`/`0755`.

## Real resource verification, separate from fixture tests

The original browser resource certification completed once in the owned disposable Ubuntu container; it was neither polled nor restarted. Node/pnpm/npm versions were verified there. Each successful browser hit ran actual `install-deps`, skipped only the download, then launched every selected engine. Browser package/engines were resolved from the independently installed workspace's Playwright **1.62.1**.

The recorded resource argv used `node`, that workspace's resolved Playwright `cli.js`, `install-deps`, and the selected engines; misses additionally invoked `install` with the same engines. These calls are generated by the fingerprinted `prepareResources` helper, not `npx` or a globally resolved Playwright. Mongo/Redis observations likewise come from the real helper's subprocesses, not fabricated cache metadata.

- Attestation Chromium miss: **passed**, 228,241 ms; Chromium `151.0.7922.34`, install-deps + download + launch.
- Attestation Chromium hit: **passed**, 8,420 ms; install-deps + launch, no download.
- DPoP Chromium/Firefox/WebKit miss: **passed**, 590,923 ms; versions `151.0.7922.34` / `153.0` / `26.5`, all three launched.
- DPoP Chromium/Firefox/WebKit hit: **passed**, 11,742 ms; install-deps + all three launches, no download.
- Independent PDF Chromium miss/hit: **passed/passed**, 57,477/20,591 ms; Playwright `1.62.1`, Chromium `151.0.7922.34`, actual install-deps on both attempts, download on miss only.
- Mongo `c` miss/hit: **passed/passed**, 14,230/2,352 ms; memory-server/core `11.2.0`, mongod/server `8.2.6`, replica-set startup, ping and buildInfo.
- Independent Mongo `p` miss/hit: **passed/passed**, 7,932/1,465 ms; distinct job-local binary, exact version/hash checks.
- Additional independent Mongo `r` miss/hit: **passed/passed**, 10,061/1,978 ms; distinct path and inode from `p`, same verified server version/hash, no global-cache fallback.
- Redis image preflight: **passed**, 27,723 ms; working Docker CLI/daemon `29.9.3`, real pulls and actual server versions.

Mongo binary SHA-256: `08b192e3fcfe01ef1046c379e83e21ccdd20694fd49c816ef642dec6d9cf1882`. Resolution includes actual Ubuntu/noble OS, memory-server/core/server versions, and direct isolated download from `https://fastdl.mongodb.org/`. `MONGOMS_SYSTEM_BINARY` is the exact checked job-local path; no global-cache fallback. Actual negative hit probes rejected missing and symlinked binaries.

Redis `redis:6.2-alpine` resolved to server `6.2.24`, digest `redis@sha256:3f9c6e23ed6bea3b41d0ef709fc164c1a0b7c00d5a21a60e0e9c33ada5496881`; `redis:7.2-alpine` to `7.2.17`, digest `redis@sha256:2f66de68111e64c3927859f158f8e666066dae2b97d9f82770a6f37a5aa1c335`. These are preflight observations, not a claim that complete Redis-backed package suites ran.

Resource caches are separate download/binary directories keyed by resolved OS/architecture, package/runtime versions and selected engines; they are not uploaded as build outputs. Successful launch/evaluation preflights did not detect the later Chromium renderer/compositor crashes; actual package-browser results and their diagnosis are recorded below.

## Independent consumer and isolation verification

The `r` consumer driver completed **12/12 certification phases successfully**. Actual frozen installation reported 4.4 seconds using pnpm 11.18.0; installation plus root/all-workspace/generated-consumer tool probes took 89,376 ms. It verified its clean checkout identity and separate `node_modules/.pnpm` realpath before restoring anything. Output-only restore/readiness validation passed in 4,041 ms, reproducing all 333 inventory entries and executable modes. Executable entries had one link and different inodes from preparation.

Before any package build, it directly executed `packages/access-router-runtime/dist/cli.js --help`, `packages/express-runtime/dist/cli.js --help`, and `packages/create-access-router-mongo-starter/dist/bin/cli.js --help`: **3/3 passed**, 1,145 ms. On this real archive, the wrong externally supplied SHA-256 and omission of mandatory empty `wire.mjs` both failed deterministically before tests could start; restore then returned to pristine verified output.

Each following focused invocation ran **serially from `r`'s checkout root**, after restoring/verifying the complete archive and without a driver prebuild. Source cleanliness passed afterward. These are additional real consumer certification checks, not replacements for manifest scripts:

- `pnpm --filter @web-ts-toolkit/access-router-runtime exec vitest run --config vitest.config.mts test/cli-runtime.test.ts test/strict-consumer-types.test.ts test/packed-consumer.test.ts`: **3 files / 19 tests passed**, 107,948 ms including restore. CLI spawning, strict installed types and packed consumer entrypoints exercised.
- `pnpm --filter @web-ts-toolkit/express-runtime exec vitest run --config vitest.config.mts test/export-contract.test.ts test/dev-readiness.test.ts`: **2 files / 11 tests passed**, 15,561 ms including restore.
- `pnpm --filter create-access-router-mongo-starter exec vitest run --config vitest.config.ts tests/generated-tooling.test.ts tests/packed-consumer.test.ts`: **2 files / 8 tests passed**, 55,638 ms including restore. Genuine generated-tool resolution, frozen installation, packed-template generation and compiled-runtime checks exercised.
- `pnpm --filter @web-ts-toolkit/access-router exec vitest run --config vitest.config.ts test/contracts/packed-consumer-compatibility.test.ts`: **1 file / 13 tests passed**, 593,550 ms including restore. Reverse compiled runtime/express/starter consumer fixtures worked before those workspace test jobs ran.

Next, the production `runWorkspace` helper verified pristine restored outputs and executed each unchanged complete manifest script **exactly once as argv**, keeping all transitive rebuilds and worker controls:

- `pnpm --filter @web-ts-toolkit/access-router-runtime test`: **12 files / 135 tests passed**, 246,539 ms including verification/resources/rebuilds; Vitest duration 168.96 seconds.
- `pnpm --filter @web-ts-toolkit/express-runtime test`: **11 files / 341 tests passed**, 55,948 ms including verification/resources/rebuilds; Vitest duration 33.95 seconds.

Both complete runs changed `r`'s own output metadata while **all preparation file hashes, inodes and mtimes and the preparation Mongo binary SHA-256 remained unchanged**. The final isolation phase reasserted these observations and clean source in both `p` and `r`. Preparation inventory SHA-256 (JSON of sorted entry metadata): `6a338a91bfb198fd54b7759db080765c6ad0268db64a53130c59cd7693455414`. Dependency trees and Mongo binaries have distinct realpaths/inodes; only the local content-addressed pnpm store was reused. This is real local rebuild-isolation evidence, not an assertion based on separate directory names alone.

The four focused invocations and two complete scripts total **527 passing test executions** (51 focused + 476 complete), with no reported failed/skipped tests. These are overlapping suites, not 527 unique tests or complete coverage of all 25 main workspaces.

### Historical browser consumer: completed failures

The original `c` follow-up finished with exit code **1: 3/8 phases passed, 5 failed**. Its first attempt stopped before tests on Git's bind-mount ownership guard; the retry used an environment-only `safe.directory` entry for this owned checkout, not a wildcard or persisted setting. Verified 31-root/333-entry restore and genuine starter readiness passed before any consumer build (66,140 ms); independent PDF miss/hit setup and the final real source-clean check also passed.

Each focused command ran serially from `c`'s root after pristine verified restore and actual browser-cache-hit dependency installation, without a driver prebuild:

- `pnpm --filter @web-ts-toolkit/express-request-attestation exec vitest run --config vitest.browser.config.mts`: **failed**, 30,563 ms including restore/setup; reported **2 failed / 15 passed of 18**, plus **1 unhandled error**.
- `pnpm --filter @web-ts-toolkit/pdf-reader exec vitest run --config vitest.browser.config.mts`: **failed**, 32,527 ms including restore/setup; reported **8 passed of 28**, plus **1 unhandled error**.
- `pnpm --filter oidc-vault-dpop-example exec vitest run --config vitest.browser.config.ts`, with `DPOP_TEST_BROWSERS=chromium,firefox,webkit`: **failed**, 550,241 ms including restore/setup; **9 failed files / 75 failed / 150 passed of 225**. Chromium cases failed; Firefox/WebKit cases passed.

The production runner then invoked each unchanged complete manifest script **once**, serially, preserving all rebuilds and worker controls:

- `pnpm --filter @web-ts-toolkit/pdf-reader test`: **failed**, 99,653 ms including verification/setup/rebuilds. Node lane: **4 files / 205 tests passed**. Browser lane: **8 passed of 28**, plus **1 unhandled error**.
- `pnpm --filter oidc-vault-dpop-example test`, with the same three-engine selection: **failed**, 504,232 ms including verification/setup/rebuilds. Node lane: **5 files / 55 tests passed**. Browser lane: **9 failed files / 75 failed / 150 passed of 225**.

Failures included `Target crashed`, `Page crashed`, and `[vitest] Browser connection was closed while running tests. Was the page closed unexpectedly?`. Interrupted attestation/PDF counts are the actual partial reports, not complete-suite coverage or inferred skips. The complete-script success/execution-count assertions were not reached after subprocess failure; the single invocations are evidenced by the serial driver and corresponding phase/run logs. Neither complete script was repeated during diagnosis.

### Chromium diagnosis and earlier local acceptance blocker

[Curated diagnostic evidence](ci-dag-03-browser-diagnostic.md) preserves the minimal reproduction, sanitized stderr, environment observations and local prerequisite. With workspace-resolved Playwright `1.62.1` / Chromium `151.0.7922.34`, root execution passed blank-page evaluation, loopback module navigation, WebCrypto and canvas readback, then failed a screenshot with `Target crashed` and temporary shared-memory `Permission denied` errors. The same probe under the checkout-owning user passed all four operations, including a 4,362-byte screenshot, with the same private **64 MiB `/dev/shm`** and browser flags. No configured memory/PID limits or recorded cgroup OOM/PID-limit events were observed. Shared-memory capacity is not an established cause; Chromium's exact child-credential mechanism was not traced.

Task-local setup keeps actual `install-deps` privileged, then runs browsers/tests as the checkout owner with fresh owner-writable `TMPDIR`/`HOME`. Only owned `c` output/temp and Vite cache ownership was corrected; output contents/modes were reverified. An initial diagnostic-only setup attempt failed before tests because its `tsx` Unix socket paths were 113–121 bytes; fresh shorter ignored names resolved that 108-byte Linux socket-path prerequisite without changing helpers or tests.

All three owner-mode focused invocations used the exact existing configs/argv above, after separate pristine verified restores. Their preparation phases passed in **14,227 / 14,017 / 16,472 ms** for attestation/PDF/DPoP: 31 roots / 333 entries, genuine starter readiness, actual cache-hit `install-deps`, no download, and every selected engine launched/evaluated. Observed versions remained Chromium `151.0.7922.34`, Firefox `153.0`, WebKit `26.5`.

- Attestation: **3 files / 141 tests passed**, 6,706 ms including owner-mode verification/tool probes.
- PDF: **2 files / 32 tests passed**, 15,289 ms including owner-mode verification/tool probes.
- DPoP: **focused subprocess exit 0**, 349,975 ms including owner-mode verification/tool probes, with `DPOP_TEST_BROWSERS=chromium,firefox,webkit`. The final driver report passed, but console test/file/failure/skip totals were not retained after the controller timeout; no count is inferred from the earlier 225-test failed run.

All three had zero driver prebuilds and zero complete-manifest executions. Source cleanliness and all restored output hashes/modes remained unchanged afterward. Failed-run attestation/PDF collection was incomplete, so its partial totals are not full suite sizes. These successes establish functioning restored browser paths under the checkout-owner prerequisite, not successful complete package scripts or a traced Chromium permission mechanism.

The host controller ended at its **120-second timeout (SIGTERM)** while the existing DPoP process continued; it was not restarted. Its five completed orchestration records and partial console log remain unchanged. Completion was established from the existing DPoP driver's final report, whose command helper rejects every nonzero subprocess status, not from an invalid host-PID wait or an unobserved Docker completion event. The diagnostic preserves this evidence limit separately from suite failure.

At diagnosis closure, local acceptance remained blocked by the unsuccessful complete PDF/DPoP script certification; repeating those scripts was then unauthorized. Focused remediation evidence did not turn their recorded failures into passes. The later authorization and actual complete-script results below resolve that local blocker without changing the earlier reports or the unavailable focused DPoP console totals. No committed/live Actions run was authorized or performed; that remains a distinct downstream CI-DAG-04/05 boundary.

## Authorized final complete-script verification

One newly authorized attempt of each complete script ran **serially**, PDF then DPoP, in the existing usable `c` consumer. The background controller completed normally with **exit 0** during `2026-11-19T00:05:20.883Z`–`2026-11-19T00:14:23.333Z` (November 18 PST), elapsed **542,450 ms**. All four Docker preparation/run subprocesses exited **0**, without signals/errors. Full test output was file-backed; each exact test subprocess had a 30-minute timeout and its Docker execution a 32-minute timeout. Neither timeout was reached; no attempt was retried or overlapped.

Before touching `c`, preparation output/archive/Mongo hashes, inodes and mtimes were snapshotted and checked against the original inventory/digests. Before **each** script, a fresh output-only restore reproduced **31 roots / 333 entries: 274 files and 59 directories**, passed the genuine `assertStagedTemplateReady` publication gate for `0.68.0`, and was reverified after narrow owned-output/temp/Vite-cache ownership correction. Privileged cache-hit `install-deps` actually ran via that workspace's resolved Playwright **1.62.1**; only downloads were skipped, and every selected engine launched/evaluated. PDF selected Chromium `151.0.7922.34`; DPoP selected Chromium `151.0.7922.34`, Firefox `153.0`, and WebKit `26.5`.

Preparation drivers passed in **29,440 ms** (PDF) and **20,813 ms** (DPoP); fresh restore/genuine-readiness portions took **2,662/2,145 ms**, and resource portions **21,929/14,143 ms**, respectively. Tests then ran as the checkout owner with fresh owner-writable ignored `HOME`/`TMPDIR`, checked Unix-socket path headroom and environment-only checkout-scoped Git trust. All 274 restored consumer file inodes were distinct from preparation before each script. Node **26.12.1** and packageManager pnpm **11.18.0** remained selected.

Exact commands, from `c`'s checkout root:

- `pnpm --filter @web-ts-toolkit/pdf-reader test`
- `pnpm --filter oidc-vault-dpop-example test`, with `DPOP_TEST_BROWSERS=chromium,firefox,webkit`

Both kept **all unchanged manifest rebuilds**, including PDF's nested browser rebuild and DPoP's `--workspace-concurrency=1`, plus existing worker/file-serialization controls. There were **zero driver prebuilds**, no reduced subset/config edits and no omitted engine. Counts below are the actual retained final console summaries; elapsed test time covers the exact manifest subprocess, including its rebuilds, but excludes the separate preparation and driver verification.

| Complete script      | Test exit | Test elapsed (ms) | Node passed files/tests | Browser passed files/tests | Combined passed files/tests |
| -------------------- | --------- | ----------------- | ----------------------- | -------------------------- | --------------------------- |
| PDF                  | 0         | 87,505            | 4 / 205                 | 2 / 32                     | 6 / 237                     |
| DPoP (three engines) | 0         | 380,555           | 5 / 55                  | 9 / 225                    | 14 / 280                    |

All four lanes reported **0 failed/skipped/todo files or tests**, with **0 reported unhandled errors**. These two complete scripts total **20 passing file executions / 517 passing test executions**, not unique combined repository coverage. DPoP's full log records all three actual browser versions for each of its nine browser files. Run-driver elapsed times, including pre/post verification but excluding the separate preparation phases, were **93,047/385,646 ms** for PDF/DPoP.

After **each** script, `c` and `p` source-clean/identity checks passed; every preparation output hash, inode and mtime, the preparation archive hash/inode/mtime, and preparation Mongo hash/inode/mtime stayed unchanged. Each unchanged script legitimately changed `c`'s own output metadata. Final `p`/`c`/`r` sources/identities remained clean/consistent, and zero owned certification subprocesses remained active. The preparation checkout stayed read-only in the container; its build/archive was not regenerated or altered, and `/dev/shm` stayed **64 MiB**. All **124 pre-run fingerprints**, including **11 saved-source fingerprints** and **24 original protected historical/coordinator paths**, matched through the completed run, before this authorized handoff edit.

Reviewed complete-log SHA-256 values (originals remain omitted disposable scratch):

- PDF: `6cd0e39bc11defc8ed65608182df8e7cb099fcbf6280a1951687df9f1e666ced`.
- DPoP: `c575a2d09e544bbff33e5ebad8bf63936349d60b1286982812a40693fde48be8`.

Historical run provenance: `_tmp-c3-Uo71M6/d/_tmp-final-owner-H8IyAf/`, not a required archived input. The unchanged bundle index and diagnostic describe the earlier finishing state; **this authorized follow-up supersedes their earlier readiness statements, not their recorded failures or evidence limitations**. Both required complete certifications now pass and no local CI-DAG-03 verification blocker remains. Coordinator acceptance is still pending and is not claimed here; coordinator-owned statuses and all implementation/history files remain unchanged. CI-DAG-04/05 work and all publication/live-run/settings operations remain unperformed.

Post-update lightweight checks **passed**: three-document formatting/privacy/newline/whitespace review, **19 local links/anchors**, **17 original diagnostic evidence hashes**, **1 matching valid JSON excerpt**, and `git diff --check`. All **11 saved-source** and **24 original protected-history** fingerprints still matched. Of the broader **124 pre-run fingerprints**, **123 remained unchanged**; only this authorized handoff changed. Both complete-log hashes and all four final lane summaries matched the saved successful reports; the DPoP log contained **9 actual launch records per engine**. Durable destinations are not ignored and check scratch is ignored. These document/evidence checks ran no builds, package suites, resource preflights or additional complete attempts.

## Saved helper and hygiene results

The original finishing checks below ran from the enclosing repository root with fresh ignored checkout-local scratch/TMPDIR where applicable. They preceded the authorized complete-script follow-up; saved implementation fingerprints still matched afterward, and no helper/runtime suite was repeated merely to update this document:

- `pnpm test:ci:check`: **273 passed; 0 failed/skipped/cancelled**. Model: 25 tested workspaces, 26 declared + 1 fixture gates, 6 build-only workspaces.
- `pnpm test:groups:check`: **18 passed; 0 failed/skipped/cancelled**; 12 safe groups / 25 workspaces.
- `pnpm exec eslint` on the six `scripts/ci-test-*.mjs` files: **passed**.
- `pnpm exec prettier --check --config-path .prettierrc` on those six scripts, three composites and `package.json`: **passed**.
- Same formatting check additionally including inherited `pnpm-lock.yaml`: **failed**, only that inherited lockfile was reported. It was not edited by CI-DAG-03; strict YAML parsing passed. No pins or lock formatting were rewritten to broaden this task.
- `pre-commit run check-yaml --files .github/workflows/test.yml .github/actions/ci-setup/action.yml .github/actions/ci-prepare/action.yml .github/actions/ci-test/action.yml`: **passed**.
- `validateHelperContracts` over the three actual composites: **passed**, without relaxing independent fixtures/contracts.
- `git diff --check` plus explicit new-script/action final-newline/trailing-whitespace assertions: **passed**.
- `actionlint -shellcheck= -pyflakes= .github/workflows/test.yml`: **passed** with checksum-pinned **1.7.7**, unchanged legacy workflow only. Composite definitions are checked by YAML/strict helper contracts, not claimed as direct actionlint coverage.
- `pnpm exec prettier --check --config-path .prettierrc` on this handoff, bundle index and diagnostic evidence: **passed**. Manual content/privacy review, marker scan, explicit untracked whitespace/newline checks, **19 local Markdown links/anchors**, **17 original diagnostic evidence hashes** and the selected JSON excerpt's validity/agreement passed. All **11 saved source fingerprints** and **24 protected historical paths**, including the coordinator-owned task and CI-DAG-01/02 evidence, still matched; durable destinations are not ignored and owned scratch is ignored. These checks do not recertify runtime results.
- Historical final read-only invariants, before the authorized complete-script follow-up: **passed**. Preparation/browser inventories still matched all 333 original entries; the preparation archive/inventory/Mongo hashes matched accepted values; `p`/`c`/`r` sources and identities stayed clean/consistent; restored `c` executable inodes remained distinct from `p`. No owned browser-certification subprocesses remained active, and `/dev/shm` stayed 64 MiB. Those invariant/document checks did not execute runtime suites, complete manifest scripts or resource preflights; the later complete scripts and legitimate consumer metadata changes are recorded separately above.

Actionlint archive: `https://github.com/rhysd/actionlint/releases/download/v1.7.7/actionlint_1.7.7_linux_amd64.tar.gz`, independently downloaded and SHA-256 checked against `023070a287cd8cccd71515fedc843f1985bf96c436b7effaecce67290e7e0757` before execution.

The 273 maintained checks include real filesystem/parser/security mutations but synthetic workspaces and injected git/pnpm/resource executors. They **do not establish real browsers, databases, package consumer compatibility, or Actions scheduling**. Real successes and failures are separately identified above; fixture checks cannot override failed runtime certification.

## Failure history, remaining boundaries, and preservation

- Earlier preparation attempts failed on the genuinely empty type-only ESM entry; the narrow source-AST/presence/hash guard resolved that rejection. The accepted archive comes from the later clean full preparation, not stale rejected output.
- Earlier Mongo miss/hit probes failed because the direct downloader lacked resolved OS configuration. The saved fix passes real c/p miss/hit probes and OS regressions; missing/symlink cache hits still fail.
- Host browser preparation failed on misses and hits because sudo required a password/terminal. No dependency installation was skipped; mandatory installation succeeded in the disposable Ubuntu container after installing `libatomic1`/certificates/git. The bind-mount Git ownership failure belongs to the later consumer harness, not the earlier successful browser preflights.
- Root-run browser consumer failures and later owner-mode diagnosis are retained separately above. No package regression or pre-existing package defect is inferred from these environment-sensitive crashes, and no package tests/configurations were changed to avoid them.
- Full 25-workspace grouped coverage, live artifact service upload/download, real workflow/helper agreement, result-state integration, scheduling/skip/failure UI certification, performance comparison and quota/required-check decisions are **not run/implemented here**; CI-DAG-04/05 retain ownership. No hosted-runner or committed-workflow acceptance is implied.
- Setup currently probes root + all 31 workspaces + one generated consumer: 33 locations / 66 pnpm subprocesses before additional probes. The CI setup has no root dependency-store cache. These are measurement/maintainability notes for CI-DAG-05, not correctness failures or permission for speculative optimization. Measure repeated setup, critical path and aggregate job time separately; browser/system-dependency and Mongo/Redis checks remain mandatory on hits.

This is curated, sanitized **summary-only evidence**, with selected diagnostic observations/excerpts, not a self-contained reproduction bundle. Original task-local checkouts, drivers, full logs, archives, generated consumers, dependencies, store/cache data, browser/database binaries and database state remain disposable ignored scratch and are omitted; their historical records are not rewritten. Historical scratch names above describe provenance, not required archived inputs; archiving does not rerun or recertify results. Reproduction requires the repository/source fingerprints, pinned tools, registry/download/Docker access and a fresh independent consumer, using the exported helpers and exact package commands. No credentials, private session identifiers or machine-specific absolute paths are preserved.
