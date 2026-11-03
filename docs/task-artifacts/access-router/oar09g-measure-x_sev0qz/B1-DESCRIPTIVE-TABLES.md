> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# B1: report-only raw and full-query comparisons

No acceptance gates or pass/fail. Negative means Many lower; median of paired percent and ms deltas, not pooled. Query p95 directly observed. One vs N capture is NOT freshness equivalence.

## raw-only

| Rows | Mode | Comparator | Initial pairs | Initial median; p95; CPU delta | Exact repeat trigger | Final pairs | Final median; p95; CPU delta | Lower / higher / zero pairs (median;p95;CPU) |
|---:|---|---|---:|---|---|---:|---|---|
| 10 | isolated | current-independent (independent) | 2 | +6.71% / +0.2793 ms; +1.57% / +0.0896 ms; +4.48% / +0.2597 ms | {'materialAbsoluteDelta': True, 'signDisagreement': True} | 4 | +4.16% / +0.1648 ms; -8.16% / -0.5139 ms; -1.37% / -0.0809 ms | 1/3/0; 3/1/0; 3/1/0 |
| 10 | isolated | historical (old-raw) | 2 | -75.37% / -13.4684 ms; -66.59% / -13.1458 ms; -67.93% / -13.6021 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | -75.84% / -13.7161 ms; -70.47% / -13.7737 ms; -69.21% / -13.7597 ms | 4/0/0; 4/0/0; 4/0/0 |
| 10 | trusted | current-independent (independent) | 2 | +11.85% / +0.4788 ms; +0.30% / +0.0248 ms; +7.56% / +0.4574 ms | {'materialAbsoluteDelta': True, 'signDisagreement': True} | 4 | +10.19% / +0.3958 ms; -8.77% / -0.5617 ms; +5.14% / +0.2952 ms | 0/4/0; 3/1/0; 0/4/0 |
| 10 | trusted | historical (old-raw) | 2 | -76.56% / -13.7811 ms; -71.61% / -14.1554 ms; -70.89% / -14.2735 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | -75.81% / -13.3483 ms; -71.34% / -13.6748 ms; -70.89% / -13.8867 ms | 4/0/0; 4/0/0; 4/0/0 |
| 100 | isolated | current-independent (independent) | 2 | +6.20% / +1.5593 ms; -0.75% / -0.2241 ms; -5.23% / -1.7063 ms | {'materialAbsoluteDelta': False, 'signDisagreement': False} | 2 | +6.20% / +1.5593 ms; -0.75% / -0.2241 ms; -5.23% / -1.7063 ms | 0/2/0; 2/0/0; 2/0/0 |
| 100 | isolated | historical (old-raw) | 2 | -83.31% / -137.7238 ms; -84.33% / -160.8671 ms; -82.36% / -150.5478 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | -83.51% / -139.2357 ms; -84.56% / -163.2539 ms; -82.86% / -152.5142 ms | 4/0/0; 4/0/0; 4/0/0 |
| 100 | trusted | current-independent (independent) | 2 | +0.97% / +0.2035 ms; -6.23% / -2.1371 ms; -10.11% / -3.5306 ms | {'materialAbsoluteDelta': True, 'signDisagreement': True} | 4 | +5.20% / +1.3292 ms; -0.22% / -0.0640 ms; -6.46% / -2.1234 ms | 1/3/0; 2/2/0; 3/1/0 |
| 100 | trusted | historical (old-raw) | 2 | -84.24% / -141.7397 ms; -85.33% / -168.2948 ms; -83.77% / -156.9816 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | -83.88% / -140.3129 ms; -84.53% / -164.2754 ms; -83.25% / -154.0451 ms | 4/0/0; 4/0/0; 4/0/0 |

## query-plus-helper

| Rows | Mode | Comparator | Initial pairs | Initial median; p95; CPU delta | Exact repeat trigger | Final pairs | Final median; p95; CPU delta | Lower / higher / zero pairs (median;p95;CPU) |
|---:|---|---|---:|---|---|---:|---|---|
| 10 | isolated | current-independent (independent) | 2 | -2.83% / -0.2265 ms; -5.30% / -0.5812 ms; -6.88% / -0.7309 ms | {'materialAbsoluteDelta': False, 'signDisagreement': True} | 4 | -0.44% / -0.0361 ms; -4.44% / -0.4748 ms; -5.78% / -0.5991 ms | 2/2/0; 2/2/0; 4/0/0 |
| 10 | isolated | historical (old-query-handles) | 2 | -70.48% / -18.8356 ms; -65.26% / -18.8673 ms; -65.50% / -18.7750 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | -70.42% / -18.8356 ms; -66.90% / -19.3793 ms; -65.40% / -18.7599 ms | 4/0/0; 4/0/0; 4/0/0 |
| 10 | trusted | current-independent (independent) | 2 | +6.76% / +0.4924 ms; -3.26% / -0.3537 ms; +0.09% / +0.0026 ms | {'materialAbsoluteDelta': False, 'signDisagreement': True} | 4 | +6.76% / +0.4924 ms; -3.26% / -0.3537 ms; -1.43% / -0.1445 ms | 1/3/0; 2/2/0; 3/1/0 |
| 10 | trusted | historical (old-query-handles) | 2 | +20.26% / +1.2594 ms; +6.23% / +0.5444 ms; +22.57% / +1.7333 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | +19.31% / +1.2205 ms; +8.44% / +0.7528 ms; +22.32% / +1.7355 ms | 0/4/0; 0/4/0; 0/4/0 |
| 100 | isolated | current-independent (independent) | 2 | +5.52% / +2.1470 ms; -0.12% / -0.0936 ms; -2.20% / -1.0765 ms | {'materialAbsoluteDelta': False, 'signDisagreement': True} | 4 | +5.52% / +2.1470 ms; +0.78% / +0.3426 ms; -2.20% / -1.0765 ms | 0/4/0; 2/2/0; 3/1/0 |
| 100 | isolated | historical (old-query-handles) | 2 | -82.09% / -189.4804 ms; -82.02% / -210.0389 ms; -81.11% / -206.3558 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | -82.14% / -188.7433 ms; -82.19% / -206.6653 ms; -81.04% / -203.0804 ms | 4/0/0; 4/0/0; 4/0/0 |
| 100 | trusted | current-independent (independent) | 2 | +3.93% / +1.4711 ms; -1.39% / -0.6198 ms; -3.40% / -1.5974 ms | {'materialAbsoluteDelta': False, 'signDisagreement': True} | 4 | +5.39% / +2.0152 ms; -1.07% / -0.4955 ms; -2.82% / -1.3256 ms | 0/4/0; 2/2/0; 3/1/0 |
| 100 | trusted | historical (old-query-handles) | 2 | +41.59% / +11.4430 ms; +41.47% / +12.5714 ms; +37.48% / +12.3122 ms | {'materialAbsoluteDelta': True, 'signDisagreement': False} | 4 | +41.59% / +11.4430 ms; +41.47% / +12.5714 ms; +37.48% / +12.3122 ms | 0/4/0; 0/4/0; 0/4/0 |
