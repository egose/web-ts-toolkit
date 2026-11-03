> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Original campaign preservation audit

`OLD-WORKLOAD-AUDIT.json` contains hashes of all 13 incoming benchmark files,
the exact 45-case catalog/settings/gates, family counts and actual H3-global code.
The old 12 code/test files are byte-identical. The entire original 24,972-byte
README is unchanged, followed only by the additive B1 section. Thus original
fixture construction, routing, request/Core freshness, sampling, CPU windows,
getters, hydration, counts and paired/gate calculations remain unchanged—not
merely copied case labels.

- Original primary 3, guards 12, READ 10, helper 13, native 2, facts 2, retention 3
  total **45 cases / 90 comparisons / 360 initial jobs**.
- Three primary LISTs: 100 rows, 24 fields/32 bytes, one client/hook concurrency
  10, five warmups, 100 samples. Six guard families retain both 10/100 rows and
  50 samples. READ/helper/native/fact/retention settings are not replaced by B1.
- Exact unchanged H3-global/100 executes its initial LIST and then
  `Promise.all(first.data.map(...svc.pickAllowedFields(...)))`: 100 independently
  fresh current helpers. The old comparator uses its 100 actual issued handles.
  No original file calls `pickAllowedFieldsMany`.
- Paired two-round profile/case reversal; original gate miss/adverse/sign trigger
  means exactly two more pairs at the original settings. After four pairs, original
  three-of-four sign/confirmation rules still include tiny/zero effects. No new
  sign exemption, samples, thresholds, component p95 or historical pooling.
- The accepted H4 facts-only/no-DTO contract is unchanged. Metadata binds that
  exact revision to e131. Actual smoke observes one read/hook, zero callbacks;
  untimed ordinary DTO controls observe 24, in both modes and lean/hydrated paths.
- All three old runner files pass **45/45** in command 20. The original 180-job
  smoke covers all 45 cases/four profiles and eight preflights. Independent Python
  reconstruction checks expected full-output fingerprints, actual raw counts,
  hydration, getter proofs, READ direct APIs and CPU/sample summaries for all jobs.
- The old untimed helper control still observes 100 captures/catalogs, 100 detached
  copies, 2,400 field evaluations and 100 cleared stages in both current modes.
  No current bundle regex fix or expected-count tolerance was required.

`PERFORMANCE-GATES.md` and `MEASUREMENT-PLAN.md` in original OAR-01 remain hashed,
unchanged authority. Original retained heap >15% AND >1 MiB and superlinear graph
rules are untouched. Smoke is not retention evidence; its retained observations
are correctness-shape checks only. Allocation totals remain unavailable.

All four past campaigns remain read-only, separately labeled 75/90, 81/90, 78/90,
73/90. The latest trusted H3-global/10 CPU (+18.01%, +1.2266 ms) and H3-global/100
median (+14.25%, +3.9816 ms) / CPU (+15.82%, +5.3927 ms) are historical confirmed
failures, with fifteen unresolved signs. They remain undisposed, not pooled with
this packet or erased by B1. The newly prepared e131 artifact has no final timing.
