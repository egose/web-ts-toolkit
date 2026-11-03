> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Every material-adverse pair/metric, including unconfirmed observations

The SAME metric must cross BOTH percent and ms thresholds in >=3/4 pairs AND its median paired delta to confirm.

| Case | Profile | Round | Metric | Delta | Old/new jobs | Confirmed metric? | Final outcome |
|---|---|---|---|---|---|---|---|
| primary/plain-wide/100 | trusted | 2 | medianMs | +12.21% / +1.5542 ms | 358 / 357 | False | PASS |
| guard/plain-narrow/10 | trusted | 2 | cpuMsPerRequest | +13.76% / +0.5113 ms | 346 / 345 | False | PASS |
| guard/virtuals/100 | trusted | 2 | medianMs | +10.37% / +1.5880 ms | 302 / 301 | False | PASS |
| helper/H2-global/100 | trusted | 3 | cpuMsPerRequest | +15.99% / +0.5018 ms | 425 / 426 | False | FAIL |
| helper/H4/100 | trusted | 2 | cpuMsPerRequest | +24.37% / +0.5679 ms | 234 / 233 | True | FAIL |
| helper/H4/100 | trusted | 3 | cpuMsPerRequest | +29.81% / +0.6642 ms | 429 / 430 | True | FAIL |
| helper/H4/100 | trusted | 4 | cpuMsPerRequest | +37.90% / +0.9057 ms | 432 / 431 | True | FAIL |
| helper/H3-global/10 | trusted | 1 | cpuMsPerRequest | +23.20% / +1.6139 ms | 139 / 140 | True | FAIL |
| helper/H3-global/10 | trusted | 2 | cpuMsPerRequest | +19.76% / +1.3352 ms | 222 / 221 | True | FAIL |
| helper/H3-global/10 | trusted | 3 | cpuMsPerRequest | +11.81% / +0.8439 ms | 433 / 434 | True | FAIL |
| helper/H3-global/10 | trusted | 4 | cpuMsPerRequest | +18.33% / +1.2574 ms | 436 / 435 | True | FAIL |
| helper/H3-global/100 | trusted | 1 | medianMs | +13.10% / +3.7194 ms | 151 / 152 | True | FAIL |
| helper/H3-global/100 | trusted | 1 | cpuMsPerRequest | +14.59% / +5.1384 ms | 151 / 152 | True | FAIL |
| helper/H3-global/100 | trusted | 2 | medianMs | +13.23% / +3.7933 ms | 210 / 209 | True | FAIL |
| helper/H3-global/100 | trusted | 2 | cpuMsPerRequest | +15.49% / +5.4367 ms | 210 / 209 | True | FAIL |
| helper/H3-global/100 | trusted | 3 | p95Ms | +15.85% / +5.1713 ms | 437 / 438 | False | FAIL |
| helper/H3-global/100 | trusted | 3 | cpuMsPerRequest | +15.60% / +5.6054 ms | 437 / 438 | True | FAIL |
| helper/H3-global/100 | trusted | 4 | medianMs | +12.60% / +3.6657 ms | 440 / 439 | True | FAIL |
| helper/H3-global/100 | trusted | 4 | cpuMsPerRequest | +17.40% / +6.0660 ms | 440 / 439 | True | FAIL |
