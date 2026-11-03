> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

| Case | Mode | Median before → after | p95 before → after | CPU before → after |
| --- | --- | ---: | ---: | ---: |
| plain-narrow/100 | strict | 23.87 → 19.68 | 25.97 → 21.93 | 27.12 → 22.77 |
| plain-narrow/100 | six ON | 12.31 → 12.57 | 13.77 → 14.68 | 15.99 → 16.42 |
| plain-narrow/100 | eight ON | 12.34 → 11.45 | 14.64 → 14.06 | 16.13 → 15.36 |
| hydrated/100 | strict | 55.19 → 40.03 | 58.53 → 43.87 | 62.56 → 47.62 |
| hydrated/100 | six ON | 25.67 → 22.90 | 29.28 → 24.84 | 33.03 → 30.08 |
| hydrated/100 | eight ON | 24.04 → 21.67 | 26.76 → 24.65 | 30.92 → 29.27 |
| global-rules/100 | strict | 318.72 → 188.29 | 337.83 → 202.94 | 331.72 → 200.35 |
| global-rules/100 | six ON | 26.83 → 23.06 | 30.01 → 25.24 | 33.75 → 30.14 |
| global-rules/100 | eight ON | 25.06 → 23.08 | 27.71 → 26.34 | 32.57 → 30.93 |
| large-config/100 | strict | 54.93 → 39.93 | 59.67 → 44.73 | 62.03 → 46.63 |
| large-config/100 | six ON | 25.43 → 21.83 | 29.21 → 24.75 | 32.67 → 29.03 |
| large-config/100 | eight ON | 23.24 → 21.09 | 26.13 → 24.15 | 30.21 → 28.25 |
| populate/100 | strict | 73.24 → 53.92 | 76.08 → 56.63 | 79.99 → 61.57 |
| populate/100 | six ON | 29.53 → 26.53 | 34.24 → 30.03 | 38.41 → 33.70 |
| populate/100 | eight ON | 28.80 → 26.25 | 33.80 → 29.07 | 36.71 → 33.40 |
| virtuals/100 | strict | 84.75 → 58.39 | 94.58 → 64.69 | 93.43 → 65.74 |
| virtuals/100 | six ON | 31.93 → 26.46 | 36.31 → 29.70 | 39.33 → 33.42 |
| virtuals/100 | eight ON | 30.11 → 24.88 | 33.79 → 27.74 | 36.99 → 32.21 |
