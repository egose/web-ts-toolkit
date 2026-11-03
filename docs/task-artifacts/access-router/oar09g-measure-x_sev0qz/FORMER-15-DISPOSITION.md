> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# All fifteen formerly sign-unstable comparisons

Old evidence remains undisposed; this is a new measurement on e131, not relabeling old samples. All values are median paired percent AND ms deltas.

| Former unstable ID | Mode | Old unresolved metrics | New median delta | New p95 delta | New CPU delta | New pairs | Actual new disposition |
|---|---|---|---|---|---|---|---|
| guard/plain-narrow/10 | trusted | p95Ms, cpuMsPerRequest | +13.99% / +0.5351 ms | +6.12% / +0.3437 ms | +12.12% / +0.6313 ms | 4 | FAIL: unresolved sign instability: p95Ms |
| guard/hydrated/10 | trusted | cpuMsPerRequest | +2.55% / +0.1267 ms | +7.38% / +0.5353 ms | +1.30% / +0.0463 ms | 4 | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/large-config/10 | trusted | p95Ms | +0.87% / +0.0379 ms | -2.52% / -0.2070 ms | -1.44% / -0.1154 ms | 4 | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/populate/10 | trusted | medianMs, p95Ms | -2.78% / -0.2090 ms | -11.93% / -1.4375 ms | -1.66% / -0.2254 ms | 4 | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/plain-narrow/100 | trusted | p95Ms | -5.83% / -0.5043 ms | -15.16% / -1.9231 ms | -4.77% / -0.5341 ms | 2 | PASS |
| guard/populate/100 | trusted | p95Ms | -1.32% / -0.2415 ms | -3.48% / -0.7790 ms | -8.27% / -2.0045 ms | 2 | PASS |
| read/http-id/document-rules/100 | trusted | medianMs | +3.78% / +0.1460 ms | +8.35% / +0.4287 ms | +3.85% / +0.1511 ms | 4 | FAIL: unresolved sign instability: cpuMsPerRequest |
| read/http-id/virtuals/100 | trusted | medianMs, p95Ms | +14.40% / +0.5368 ms | +10.26% / +0.6010 ms | +12.49% / +0.5079 ms | 4 | PASS |
| read/http-filter/document-rules/100 | trusted | medianMs, p95Ms | -13.62% / -0.5684 ms | -8.42% / -0.4998 ms | -8.01% / -0.3557 ms | 4 | FAIL: unresolved sign instability: cpuMsPerRequest |
| read/http-filter/embedded/100 | trusted | medianMs, p95Ms | -1.28% / -0.0540 ms | +0.39% / +0.0279 ms | -1.16% / -0.0550 ms | 4 | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/hydrated/100 | trusted | medianMs, p95Ms | +7.27% / +0.3102 ms | +2.65% / +0.1548 ms | +3.29% / +0.1398 ms | 2 | PASS |
| read/http-filter/virtuals/100 | trusted | p95Ms | -0.31% / -0.0140 ms | +12.59% / +0.6624 ms | +5.52% / +0.2422 ms | 4 | FAIL: unresolved sign instability: medianMs |
| helper/H0/100 | trusted | medianMs, p95Ms | -8.38% / -0.3105 ms | -9.39% / -0.5051 ms | -15.51% / -0.6926 ms | 2 | PASS |
| helper/H2-query/100 | trusted | p95Ms | -2.39% / -0.0862 ms | +6.11% / +0.3164 ms | +0.18% / +0.0075 ms | 4 | FAIL: unresolved sign instability: medianMs |
| native-adapter/direct-read/100 | trusted | medianMs, p95Ms | -15.54% / -0.5732 ms | -25.20% / -2.1297 ms | -14.75% / -0.7856 ms | 2 | PASS |

