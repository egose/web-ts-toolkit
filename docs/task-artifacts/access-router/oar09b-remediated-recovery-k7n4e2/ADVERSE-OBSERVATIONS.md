> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Every material-adverse pair/metric, including unconfirmed observations

An individual adverse pair is not automatically confirmed. Same metric must trigger in >=3/4 pairs AND on the median paired delta.

| Case | Profile | Round | Metric | Delta | Old/new jobs | Metric confirmed? | Final outcome |
|---|---|---|---|---|---|---|---|
| guard/virtuals/10 | trusted | 3 | cpuMsPerRequest | +16.57% / +0.8706 ms | 377 / 378 | False | PASS |
| guard/virtuals/10 | trusted | 4 | cpuMsPerRequest | +18.96% / +0.9883 ms | 380 / 379 | False | PASS |
| read/http-id/hydrated/100 | trusted | 3 | cpuMsPerRequest | +17.35% / +0.5185 ms | 401 / 402 | False | PASS |
| helper/H4/100 | trusted | 1 | cpuMsPerRequest | +27.74% / +0.6495 ms | 127 / 128 | True | FAIL |
| helper/H4/100 | trusted | 2 | cpuMsPerRequest | +26.03% / +0.6094 ms | 234 / 233 | True | FAIL |
| helper/H4/100 | trusted | 4 | cpuMsPerRequest | +27.35% / +0.6320 ms | 432 / 431 | True | FAIL |
| helper/H3-global/10 | trusted | 1 | medianMs | +23.33% / +1.2862 ms | 139 / 140 | True | FAIL |
| helper/H3-global/10 | trusted | 1 | cpuMsPerRequest | +30.73% / +2.1271 ms | 139 / 140 | True | FAIL |
| helper/H3-global/10 | trusted | 2 | medianMs | +24.82% / +1.3054 ms | 222 / 221 | True | FAIL |
| helper/H3-global/10 | trusted | 2 | cpuMsPerRequest | +24.21% / +1.6330 ms | 222 / 221 | True | FAIL |
| helper/H3-global/10 | trusted | 3 | medianMs | +18.02% / +1.0112 ms | 433 / 434 | True | FAIL |
| helper/H3-global/10 | trusted | 3 | cpuMsPerRequest | +23.52% / +1.6446 ms | 433 / 434 | True | FAIL |
| helper/H3-global/10 | trusted | 4 | cpuMsPerRequest | +21.01% / +1.4459 ms | 436 / 435 | True | FAIL |
| helper/H3-global/100 | trusted | 1 | medianMs | +22.60% / +6.5371 ms | 151 / 152 | True | FAIL |
| helper/H3-global/100 | trusted | 1 | p95Ms | +19.91% / +6.3748 ms | 151 / 152 | True | FAIL |
| helper/H3-global/100 | trusted | 1 | cpuMsPerRequest | +22.20% / +7.8101 ms | 151 / 152 | True | FAIL |
| helper/H3-global/100 | trusted | 2 | medianMs | +26.11% / +7.3678 ms | 210 / 209 | True | FAIL |
| helper/H3-global/100 | trusted | 2 | p95Ms | +22.80% / +7.0540 ms | 210 / 209 | True | FAIL |
| helper/H3-global/100 | trusted | 2 | cpuMsPerRequest | +26.65% / +9.0896 ms | 210 / 209 | True | FAIL |
| helper/H3-global/100 | trusted | 3 | medianMs | +24.29% / +7.0669 ms | 437 / 438 | True | FAIL |
| helper/H3-global/100 | trusted | 3 | p95Ms | +25.49% / +7.8968 ms | 437 / 438 | True | FAIL |
| helper/H3-global/100 | trusted | 3 | cpuMsPerRequest | +23.53% / +8.3624 ms | 437 / 438 | True | FAIL |
| helper/H3-global/100 | trusted | 4 | medianMs | +25.67% / +7.4724 ms | 440 / 439 | True | FAIL |
| helper/H3-global/100 | trusted | 4 | p95Ms | +25.84% / +8.1926 ms | 440 / 439 | True | FAIL |
| helper/H3-global/100 | trusted | 4 | cpuMsPerRequest | +28.25% / +9.7820 ms | 440 / 439 | True | FAIL |
