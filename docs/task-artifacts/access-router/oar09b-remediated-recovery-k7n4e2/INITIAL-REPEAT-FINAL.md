> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Every comparison — explicit initial/repeat/final N and outcome

Numeric deltas: ALL-GATES.md, REPEAT-ONLY-SUMMARY.md and PAIR-DETAILS.md. Repeat-only N=2 is descriptive, never a new acceptance gate; final uses all four pairs after a trigger.

| Case | Profile | Initial N / outcome | Repeat N / outcome | Final N / outcome | Final reasons |
|---|---|---|---|---|---|
| primary/plain-wide/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| primary/plain-wide/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| primary/document-rules/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| primary/document-rules/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| primary/embedded/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| primary/embedded/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/plain-narrow/10 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/plain-narrow/10 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / FAIL | unresolved sign instability: cpuMsPerRequest |
| guard/hydrated/10 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/hydrated/10 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / PASS | none |
| guard/global-rules/10 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/global-rules/10 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / FAIL | unresolved sign instability: cpuMsPerRequest |
| guard/large-config/10 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/large-config/10 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / PASS | none |
| guard/populate/10 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/populate/10 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/virtuals/10 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/virtuals/10 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / PASS | none |
| guard/plain-narrow/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/plain-narrow/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/hydrated/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/hydrated/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/global-rules/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/global-rules/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/large-config/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/large-config/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/populate/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/populate/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / PASS | none |
| guard/virtuals/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| guard/virtuals/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / PASS | none |
| read/http-id/plain-wide/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| read/http-id/plain-wide/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / FAIL | unresolved sign instability: p95Ms |
| read/http-id/document-rules/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| read/http-id/document-rules/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / PASS | none |
| read/http-id/embedded/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| read/http-id/embedded/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / PASS | none |
| read/http-id/hydrated/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| read/http-id/hydrated/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / PASS | none |
| read/http-id/virtuals/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| read/http-id/virtuals/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / PASS | none |
| read/http-filter/plain-wide/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| read/http-filter/plain-wide/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / FAIL | unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| read/http-filter/document-rules/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| read/http-filter/document-rules/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| read/http-filter/embedded/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| read/http-filter/embedded/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| read/http-filter/hydrated/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| read/http-filter/hydrated/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / FAIL | unresolved sign instability: p95Ms |
| read/http-filter/virtuals/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| read/http-filter/virtuals/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / PASS | none |
| helper/H0/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H0/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / PASS | none |
| helper/H1/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H1/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H1-scoped/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H1-scoped/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H2/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H2/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H2-query/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H2-query/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / PASS | none |
| helper/H2-global/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H2-global/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H4/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H4/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / FAIL | confirmed adverse: cpuMsPerRequest |
| helper/H3/10 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H3/10 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H3-query/10 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H3-query/10 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H3-global/10 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H3-global/10 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / FAIL | confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H3/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H3-query/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H3-query/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H3-global/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| helper/H3-global/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / FAIL | confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| native-adapter/direct-read/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| native-adapter/direct-read/100 | trusted | 2 / REPEAT REQUIRED | 2 / descriptive only | 4 / FAIL | unresolved sign instability: cpuMsPerRequest |
| native-adapter/direct-list/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| native-adapter/direct-list/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| facts/owner-only/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| facts/owner-only/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| facts/unused-checksum/100 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| facts/unused-checksum/100 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| retention/held-released/100/4 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| retention/held-released/100/4 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| retention/held-released/100/24 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| retention/held-released/100/24 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| retention/held-released/100/48 | isolated | 2 / PASS | 0 / not triggered | 2 / PASS | none |
| retention/held-released/100/48 | trusted | 2 / PASS | 0 / not triggered | 2 / PASS | none |
