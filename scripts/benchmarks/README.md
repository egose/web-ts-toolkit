# One-off access-router version benchmark

From the repository root, after `pnpm install`:

```sh
pnpm bench:access-router
```

Requires Node **22+**, Git, `tar`, pnpm, network access for tag/dependency fetching,
and a runnable MongoDB binary (`mongodb-memory-server` downloads one if necessary).
Run in an interactive terminal. No existing MongoDB or application is used.
Do not run other builds in this checkout during measurement. Each worker checks
the prepared entrypoint hash before importing it.

## Prompts and execution

1. Fetch tags with `git fetch --tags <remote>` before listing them. No forced tag
   replacement, checkout, reset, or changes to the current source tree.
   Fetch inherits the terminal so SSH key passphrases and Git credentials can be
   prompted normally (without a spinner); authentication output is not logged.
2. Select tags to prepare (none is allowed for a current-only run). The current
   checkout, **including uncommitted changes**, is built with its workspace deps.
   Each tag is resolved to a commit, exported with `git archive`, installed using
   its own frozen lockfile, and built in a separate temporary directory. Install
   lifecycle scripts are disabled; explicitly selected tag build scripts still
   execute repository code, so select only trusted tags.
3. After preparation, multiselect the ready builds to measure (**at least one**),
   a baseline, and scenarios (**at least one**). Failed preparations retain logs
   and are not offered as runnable builds. Old incompatible tags fail explicitly
   instead of silently using a different workload.
4. Choose row counts, schema width, field payload size, measured requests, warmup,
   concurrent client counts, and request hook concurrency. Comma-separated size/
   client inputs produce a matrix. Start small: 10/100 rows, 24 fields, 25 requests.
5. Jobs run **sequentially**, interleaving versions within each scenario/size.
   Concurrent clients exist only inside the current job. Each job starts a fresh
   Node process importing that version's built `dist/index.mjs` and its own peers,
   with an independently seeded database on one disposable MongoDB server.

Scenarios include narrow/wide plain lists, hydrated lists, global string rules,
document-dependent grants/callbacks, large unused read configuration, embedded
arrays, public population, and two synchronous virtual getters. No private-populate
feature is required, so v0.51.0 can exercise the same public workload.

Hydration uses modern `hydration.publicList` when the built declarations expose
`ModelHydrationOptions`, otherwise historical `defaults.publicListOptions.lean`.
The actual Mongoose query mode is checked. Response data is fully checked before
and after timing, including denied fields, selection, row ordering and children.
The document-grant scenario uses non-skim mode in every build so older versions
actually resolve those grants; its rule callbacks tolerate the historical
request-only planning invocation. Embedded arrays declare an empty traversal
scope (no getter) so both generations apply the nested field rules.

## Results and interpretation

The terminal table and `.wip/benchmarks/access-router-*/report.md` show median/p95
HTTP latency, requests/second, worker CPU milliseconds/request, Mongoose read ops/
request, and median latency relative to the selected baseline. **Below 1.00x is
faster.** Ratios are suppressed for failures, missing baselines or different
validated output fingerprints. `report.json` includes raw samples, settings,
commits, dirty-worktree status, build/lock hashes, actual dependency and MongoDB
versions, and failures. Each build/job also has a persistent log.

- Build/install/startup, connection, seeding, indexes and warmup are outside timing.
- HTTP timing includes loopback I/O, JSON serialization and client parsing. CPU
  includes both the Node HTTP server and client; it excludes the MongoDB process.
- Measured DB reads exclude seeding, preflight, warmup and final validation.
- Tags use their **historical dependencies**, not just different access-router
  sources. Peer/dependency differences, GC/JIT, fixed ordering, host load and small
  sample sizes can affect results. This is a diagnostic harness, not a CI speed gate.
- Request-entry work and required per-document authorization remain; do not
  assume a faster result proves equivalent authorization without checking outputs.

Ctrl+C stops active child work and cleans only the runner-owned temporary tag
trees/server. Partial reports and logs survive. Run failures do not stop later
jobs; a failed preparation/job makes the final exit code nonzero. Scratch files
prefer `/tmp/opencode`, otherwise the OS temporary directory; override with
`WTT_BENCH_TMP` pointing at an existing directory. Nothing is published/committed.

If fetching still reports `Permission denied (publickey)`, verify
`git fetch --tags origin` works in the same terminal. Load the appropriate GitHub
SSH key into your running agent (`ssh-add /path/to/key`) or configure GitHub access
normally. The runner does not alter remotes, SSH configuration, keys or permissions.
Installing `ssh-askpass` is not required for terminal passphrase entry.

Runner checks (no benchmarks, no network or MongoDB required):

```sh
node --test scripts/benchmarks/access-router.test.mjs
pnpm exec eslint scripts/benchmarks
```
