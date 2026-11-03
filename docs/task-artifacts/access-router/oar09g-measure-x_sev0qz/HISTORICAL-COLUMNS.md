> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Four historical campaigns and this new campaign — separate columns

Every column is a distinct artifact/host-time campaign with its own interleaved sealed comparators. No pooling, cross-time paired estimates, gate waiver or causal attribution. Earlier H4 v1/v2 count/semantic series remain exactly as originally recorded. Current H4 is the accepted facts-only-v1 contract bound to e131.

| Case | Profile | Original 75/90 | Remediated 81/90 | Final-remediation 78/90 | H+G 73/90 | New e131 70/90 |
|---|---|---|---|---|---|---|
| primary/plain-wide/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| primary/plain-wide/100 | trusted | FAIL: confirmed adverse: medianMs | PASS | PASS | PASS | PASS |
| primary/document-rules/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| primary/document-rules/100 | trusted | PASS | PASS | PASS | PASS | PASS |
| primary/embedded/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| primary/embedded/100 | trusted | FAIL: unresolved sign instability: p95Ms | PASS | PASS | PASS | PASS |
| guard/plain-narrow/10 | isolated | PASS | PASS | PASS | PASS | PASS |
| guard/plain-narrow/10 | trusted | PASS | FAIL: unresolved sign instability: cpuMsPerRequest | PASS | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest | FAIL: unresolved sign instability: p95Ms |
| guard/hydrated/10 | isolated | PASS | PASS | PASS | PASS | PASS |
| guard/hydrated/10 | trusted | PASS | PASS | PASS | FAIL: unresolved sign instability: cpuMsPerRequest | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/global-rules/10 | isolated | PASS | PASS | PASS | PASS | PASS |
| guard/global-rules/10 | trusted | PASS | FAIL: unresolved sign instability: cpuMsPerRequest | PASS | PASS | PASS |
| guard/large-config/10 | isolated | PASS | PASS | PASS | PASS | PASS |
| guard/large-config/10 | trusted | FAIL: unresolved sign instability: p95Ms | PASS | PASS | FAIL: unresolved sign instability: p95Ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/populate/10 | isolated | PASS | PASS | PASS | PASS | PASS |
| guard/populate/10 | trusted | PASS | PASS | PASS | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/virtuals/10 | isolated | PASS | PASS | PASS | PASS | PASS |
| guard/virtuals/10 | trusted | FAIL: confirmed adverse: cpuMsPerRequest | PASS | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest | PASS | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/plain-narrow/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| guard/plain-narrow/100 | trusted | FAIL: unresolved sign instability: cpuMsPerRequest | PASS | PASS | FAIL: unresolved sign instability: p95Ms | PASS |
| guard/hydrated/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| guard/hydrated/100 | trusted | FAIL: confirmed adverse: medianMs, unresolved sign instability: cpuMsPerRequest | PASS | PASS | PASS | FAIL: unresolved sign instability: p95Ms |
| guard/global-rules/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| guard/global-rules/100 | trusted | PASS | PASS | PASS | PASS | PASS |
| guard/large-config/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| guard/large-config/100 | trusted | PASS | PASS | PASS | PASS | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| guard/populate/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| guard/populate/100 | trusted | FAIL: confirmed adverse: medianMs | PASS | PASS | FAIL: unresolved sign instability: p95Ms | PASS |
| guard/virtuals/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| guard/virtuals/100 | trusted | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest | PASS | PASS | PASS | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms |
| read/http-id/plain-wide/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| read/http-id/plain-wide/100 | trusted | PASS | FAIL: unresolved sign instability: p95Ms | PASS | PASS | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-id/document-rules/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| read/http-id/document-rules/100 | trusted | PASS | PASS | FAIL: unresolved sign instability: p95Ms | FAIL: unresolved sign instability: medianMs | FAIL: unresolved sign instability: cpuMsPerRequest |
| read/http-id/embedded/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| read/http-id/embedded/100 | trusted | PASS | PASS | PASS | PASS | PASS |
| read/http-id/hydrated/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| read/http-id/hydrated/100 | trusted | PASS | PASS | FAIL: unresolved sign instability: cpuMsPerRequest | PASS | FAIL: unresolved sign instability: medianMs, unresolved sign instability: cpuMsPerRequest |
| read/http-id/virtuals/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| read/http-id/virtuals/100 | trusted | PASS | PASS | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms | PASS |
| read/http-filter/plain-wide/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| read/http-filter/plain-wide/100 | trusted | PASS | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest | PASS | PASS | PASS |
| read/http-filter/document-rules/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| read/http-filter/document-rules/100 | trusted | PASS | PASS | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| read/http-filter/embedded/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| read/http-filter/embedded/100 | trusted | FAIL: unresolved sign instability: medianMs | PASS | PASS | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/hydrated/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| read/http-filter/hydrated/100 | trusted | FAIL: unresolved sign instability: medianMs | FAIL: unresolved sign instability: p95Ms | PASS | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms | PASS |
| read/http-filter/virtuals/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| read/http-filter/virtuals/100 | trusted | PASS | PASS | FAIL: unresolved sign instability: p95Ms | FAIL: unresolved sign instability: p95Ms | FAIL: unresolved sign instability: medianMs |
| helper/H0/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| helper/H0/100 | trusted | FAIL: unresolved sign instability: p95Ms | PASS | PASS | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms | PASS |
| helper/H1/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| helper/H1/100 | trusted | PASS | PASS | PASS | PASS | PASS |
| helper/H1-scoped/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| helper/H1-scoped/100 | trusted | PASS | PASS | PASS | PASS | PASS |
| helper/H2/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| helper/H2/100 | trusted | PASS | PASS | PASS | PASS | PASS |
| helper/H2-query/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| helper/H2-query/100 | trusted | PASS | PASS | FAIL: unresolved sign instability: cpuMsPerRequest | FAIL: unresolved sign instability: p95Ms | FAIL: unresolved sign instability: medianMs |
| helper/H2-global/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| helper/H2-global/100 | trusted | FAIL: confirmed adverse: cpuMsPerRequest | PASS | FAIL: unresolved sign instability: medianMs | PASS | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| helper/H4/100 | isolated | PASS | PASS | PASS | PASS | FAIL: unresolved sign instability: cpuMsPerRequest |
| helper/H4/100 | trusted | FAIL: confirmed adverse: cpuMsPerRequest | FAIL: confirmed adverse: cpuMsPerRequest | FAIL: confirmed adverse: cpuMsPerRequest | PASS | FAIL: unresolved sign instability: p95Ms |
| helper/H3/10 | isolated | PASS | PASS | PASS | PASS | PASS |
| helper/H3/10 | trusted | PASS | PASS | PASS | PASS | PASS |
| helper/H3-query/10 | isolated | PASS | PASS | PASS | PASS | PASS |
| helper/H3-query/10 | trusted | PASS | PASS | PASS | PASS | PASS |
| helper/H3-global/10 | isolated | PASS | PASS | PASS | PASS | PASS |
| helper/H3-global/10 | trusted | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest | FAIL: confirmed adverse: cpuMsPerRequest, unresolved sign instability: p95Ms | FAIL: confirmed adverse: cpuMsPerRequest | FAIL: confirmed adverse: cpuMsPerRequest, unresolved sign instability: p95Ms |
| helper/H3/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| helper/H3/100 | trusted | PASS | PASS | PASS | PASS | PASS |
| helper/H3-query/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| helper/H3-query/100 | trusted | PASS | PASS | PASS | PASS | PASS |
| helper/H3-global/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| helper/H3-global/100 | trusted | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| native-adapter/direct-read/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| native-adapter/direct-read/100 | trusted | PASS | FAIL: unresolved sign instability: cpuMsPerRequest | FAIL: unresolved sign instability: medianMs | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms | PASS |
| native-adapter/direct-list/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| native-adapter/direct-list/100 | trusted | PASS | PASS | PASS | PASS | PASS |
| facts/owner-only/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| facts/owner-only/100 | trusted | PASS | PASS | PASS | PASS | PASS |
| facts/unused-checksum/100 | isolated | PASS | PASS | PASS | PASS | PASS |
| facts/unused-checksum/100 | trusted | PASS | PASS | PASS | PASS | PASS |
| retention/held-released/100/4 | isolated | PASS | PASS | PASS | PASS | PASS |
| retention/held-released/100/4 | trusted | PASS | PASS | PASS | PASS | PASS |
| retention/held-released/100/24 | isolated | PASS | PASS | PASS | PASS | PASS |
| retention/held-released/100/24 | trusted | PASS | PASS | PASS | PASS | PASS |
| retention/held-released/100/48 | isolated | PASS | PASS | PASS | PASS | PASS |
| retention/held-released/100/48 | trusted | PASS | PASS | PASS | PASS | PASS |

