> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Every adverse pair/metric, including unconfirmed observations

The SAME metric must cross BOTH percent and ms thresholds in >=3/4 pairs AND its median paired delta.

| Case | Profile | Round | Metric | Delta | Old/new jobs | Confirmed metric? | Final outcome |
|---|---|---|---|---|---|---|---|
| guard/hydrated/10 | trusted | 2 | cpuMsPerRequest | +12.03% / +0.6276 ms | 342 / 341 | False | FAIL |
| guard/hydrated/10 | trusted | 3 | cpuMsPerRequest | +13.19% / +0.6762 ms | 365 / 366 | False | FAIL |
| helper/H2-global/100 | trusted | 2 | cpuMsPerRequest | +18.55% / +0.5803 ms | 238 / 237 | False | PASS |
| helper/H3-global/10 | trusted | 1 | cpuMsPerRequest | +21.28% / +1.4470 ms | 139 / 140 | True | FAIL |
| helper/H3-global/10 | trusted | 2 | cpuMsPerRequest | +16.95% / +1.1509 ms | 222 / 221 | True | FAIL |
| helper/H3-global/10 | trusted | 3 | cpuMsPerRequest | +19.07% / +1.3024 ms | 429 / 430 | True | FAIL |
| helper/H3-global/10 | trusted | 4 | cpuMsPerRequest | +13.25% / +0.9675 ms | 432 / 431 | True | FAIL |
| helper/H3-global/100 | trusted | 1 | medianMs | +13.45% / +3.7687 ms | 151 / 152 | True | FAIL |
| helper/H3-global/100 | trusted | 1 | p95Ms | +15.57% / +4.8294 ms | 151 / 152 | False | FAIL |
| helper/H3-global/100 | trusted | 1 | cpuMsPerRequest | +16.84% / +5.6231 ms | 151 / 152 | True | FAIL |
| helper/H3-global/100 | trusted | 2 | medianMs | +15.05% / +4.1946 ms | 210 / 209 | True | FAIL |
| helper/H3-global/100 | trusted | 2 | p95Ms | +20.56% / +6.1710 ms | 210 / 209 | False | FAIL |
| helper/H3-global/100 | trusted | 2 | cpuMsPerRequest | +20.06% / +6.7229 ms | 210 / 209 | True | FAIL |
| helper/H3-global/100 | trusted | 3 | medianMs | +16.95% / +4.7441 ms | 433 / 434 | True | FAIL |
| helper/H3-global/100 | trusted | 3 | cpuMsPerRequest | +14.80% / +5.1624 ms | 433 / 434 | True | FAIL |
| helper/H3-global/100 | trusted | 4 | medianMs | +12.41% / +3.5266 ms | 436 / 435 | True | FAIL |
| helper/H3-global/100 | trusted | 4 | cpuMsPerRequest | +13.14% / +4.6135 ms | 436 / 435 | True | FAIL |
