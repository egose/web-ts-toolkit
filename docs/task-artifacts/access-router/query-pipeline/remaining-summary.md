> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

## Final phase vs original baseline

| Case | Mode | Median before → after | p95 before → after | CPU before → after |
| --- | --- | ---: | ---: | ---: |
| plain-wide/100 | strict | 54.69 → 37.29 | 58.96 → 41.67 | 60.07 → 42.71 |
| plain-wide/100 | six ON | 23.65 → 19.33 | 25.83 → 23.03 | 28.78 → 25.20 |
| plain-wide/100 | eight ON | 22.71 → 19.11 | 26.04 → 22.16 | 27.98 → 24.62 |
| document-rules/100 | strict | 328.70 → 196.61 | 343.59 → 218.00 | 340.17 → 212.21 |
| document-rules/100 | six ON | 27.13 → 23.45 | 30.08 → 26.67 | 32.56 → 28.95 |
| document-rules/100 | eight ON | 25.97 → 22.70 | 29.87 → 26.10 | 32.02 → 28.49 |
| embedded/100 | strict | 799.89 → 565.64 | 813.80 → 578.34 | 829.98 → 592.62 |
| embedded/100 | six ON | 68.77 → 58.51 | 73.94 → 62.39 | 80.82 → 69.17 |
| embedded/100 | eight ON | 65.61 → 57.23 | 70.90 → 62.44 | 77.65 → 70.24 |

## Catalog incremental batch 1

| Case | Mode | Median before → after | p95 before → after | CPU before → after |
| --- | --- | ---: | ---: | ---: |
| plain-wide/100 | strict | 37.93 → 37.10 | 41.25 → 40.92 | 43.14 → 42.28 |
| plain-wide/100 | six ON | 20.29 → 18.92 | 22.63 → 22.34 | 25.17 → 24.50 |
| plain-wide/100 | eight ON | 19.93 → 18.55 | 23.05 → 22.12 | 25.09 → 23.93 |
| document-rules/100 | strict | 195.29 → 191.39 | 223.22 → 205.65 | 212.65 → 204.02 |
| document-rules/100 | six ON | 23.74 → 23.22 | 26.71 → 27.23 | 29.62 → 29.15 |
| document-rules/100 | eight ON | 23.37 → 23.63 | 27.07 → 27.96 | 29.25 → 29.71 |
| embedded/100 | strict | 565.65 → 558.92 | 588.39 → 579.13 | 594.47 → 585.41 |
| embedded/100 | six ON | 57.18 → 57.61 | 62.50 → 61.79 | 68.44 → 69.17 |
| embedded/100 | eight ON | 56.20 → 56.13 | 61.77 → 60.29 | 68.50 → 68.12 |

## Catalog incremental batch 2

| Case | Mode | Median before → after | p95 before → after | CPU before → after |
| --- | --- | ---: | ---: | ---: |
| plain-wide/100 | strict | 38.13 → 37.25 | 41.77 → 41.52 | 43.17 → 42.30 |
| plain-wide/100 | six ON | 20.32 → 19.67 | 22.82 → 23.06 | 25.72 → 25.05 |
| plain-wide/100 | eight ON | 19.80 → 18.59 | 22.42 → 21.70 | 25.41 → 24.02 |
| document-rules/100 | strict | 193.80 → 192.34 | 209.39 → 199.43 | 207.00 → 199.40 |
| document-rules/100 | six ON | 23.36 → 23.32 | 26.49 → 26.45 | 29.86 → 28.89 |
| document-rules/100 | eight ON | 22.96 → 22.69 | 26.04 → 26.66 | 29.38 → 28.58 |
| embedded/100 | strict | 565.00 → 562.69 | 585.42 → 623.41 | 593.09 → 595.77 |
| embedded/100 | six ON | 58.01 → 58.07 | 62.27 → 62.85 | 69.39 → 69.61 |
| embedded/100 | eight ON | 57.07 → 56.56 | 61.13 → 61.40 | 70.16 → 70.36 |

## 100-row guards

| Case | Mode | Median before → after | p95 before → after | CPU before → after |
| --- | --- | ---: | ---: | ---: |
| plain-narrow/100 | strict | 19.32 → 18.94 | 21.38 → 21.35 | 21.91 → 21.55 |
| plain-narrow/100 | six ON | 10.80 → 10.71 | 13.01 → 12.78 | 13.82 → 13.59 |
| plain-narrow/100 | eight ON | 10.61 → 10.38 | 12.92 → 13.07 | 13.81 → 13.53 |
| hydrated/100 | strict | 39.19 → 38.45 | 42.66 → 42.36 | 44.12 → 44.00 |
| hydrated/100 | six ON | 21.93 → 20.83 | 24.66 → 23.68 | 27.46 → 26.31 |
| hydrated/100 | eight ON | 21.07 → 20.05 | 25.76 → 22.86 | 26.70 → 25.91 |
| global-rules/100 | strict | 188.87 → 187.18 | 208.81 → 205.25 | 203.01 → 199.90 |
| global-rules/100 | six ON | 23.37 → 23.33 | 26.14 → 26.05 | 29.07 → 28.81 |
| global-rules/100 | eight ON | 22.69 → 22.44 | 25.22 → 25.48 | 28.23 → 28.09 |
| large-config/100 | strict | 38.73 → 37.82 | 42.26 → 42.07 | 43.96 → 44.01 |
| large-config/100 | six ON | 21.30 → 19.38 | 24.20 → 22.51 | 26.69 → 25.36 |
| large-config/100 | eight ON | 20.44 → 19.30 | 23.67 → 22.02 | 25.66 → 24.66 |
| populate/100 | strict | 54.12 → 53.11 | 58.04 → 56.82 | 61.49 → 60.59 |
| populate/100 | six ON | 26.54 → 24.75 | 29.47 → 28.22 | 32.15 → 30.46 |
| populate/100 | eight ON | 25.05 → 24.05 | 28.38 → 27.03 | 30.49 → 29.60 |
| virtuals/100 | strict | 56.12 → 54.43 | 59.53 → 58.62 | 61.98 → 61.93 |
| virtuals/100 | six ON | 26.36 → 23.97 | 31.86 → 27.63 | 34.04 → 29.80 |
| virtuals/100 | eight ON | 24.58 → 23.38 | 29.22 → 26.65 | 30.84 → 29.01 |

## 10-row guards

| Case | Mode | Median before → after | p95 before → after | CPU before → after |
| --- | --- | ---: | ---: | ---: |
| plain-narrow/10 | strict | 5.16 → 5.03 | 7.26 → 7.43 | 6.81 → 6.92 |
| plain-narrow/10 | six ON | 4.32 → 4.15 | 6.09 → 6.11 | 5.15 → 5.25 |
| plain-narrow/10 | eight ON | 3.82 → 3.99 | 5.49 → 6.24 | 4.79 → 5.15 |
| plain-wide/10 | strict | 7.25 → 7.25 | 9.95 → 10.83 | 9.12 → 9.28 |
| plain-wide/10 | six ON | 5.39 → 5.24 | 8.02 → 7.86 | 7.05 → 6.94 |
| plain-wide/10 | eight ON | 5.15 → 5.17 | 8.00 → 7.57 | 6.51 → 6.80 |
| hydrated/10 | strict | 7.63 → 7.32 | 11.10 → 10.60 | 10.13 → 9.80 |
| hydrated/10 | six ON | 5.94 → 5.62 | 9.61 → 8.44 | 8.06 → 7.27 |
| hydrated/10 | eight ON | 5.59 → 5.50 | 8.91 → 8.78 | 7.55 → 7.25 |
| global-rules/10 | strict | 22.76 → 24.92 | 24.98 → 71.13 | 24.31 → 35.19 |
| global-rules/10 | six ON | 5.70 → 5.72 | 8.52 → 8.89 | 7.44 → 7.92 |
| global-rules/10 | eight ON | 5.67 → 5.47 | 8.24 → 8.39 | 7.20 → 7.25 |
| document-rules/10 | strict | 23.66 → 23.58 | 26.79 → 25.70 | 25.97 → 25.19 |
| document-rules/10 | six ON | 5.76 → 5.67 | 8.22 → 8.72 | 7.69 → 7.83 |
| document-rules/10 | eight ON | 5.60 → 5.58 | 8.36 → 8.43 | 7.53 → 7.49 |
| large-config/10 | strict | 8.00 → 8.20 | 11.65 → 11.01 | 10.11 → 10.27 |
| large-config/10 | six ON | 6.04 → 5.79 | 8.37 → 8.84 | 7.64 → 7.38 |
| large-config/10 | eight ON | 5.99 → 5.98 | 8.21 → 8.48 | 7.64 → 7.46 |
| embedded/10 | strict | 61.60 → 63.32 | 67.89 → 69.59 | 64.87 → 66.57 |
| embedded/10 | six ON | 9.50 → 9.37 | 12.82 → 12.43 | 11.57 → 11.30 |
| embedded/10 | eight ON | 9.39 → 9.17 | 13.33 → 12.34 | 11.78 → 11.39 |
| populate/10 | strict | 11.67 → 11.76 | 15.76 → 15.71 | 13.80 → 13.93 |
| populate/10 | six ON | 8.17 → 7.84 | 10.97 → 11.61 | 9.78 → 9.74 |
| populate/10 | eight ON | 7.79 → 7.59 | 10.82 → 10.20 | 9.71 → 9.20 |
| virtuals/10 | strict | 9.44 → 9.52 | 13.27 → 13.32 | 11.64 → 12.07 |
| virtuals/10 | six ON | 6.06 → 6.13 | 9.27 → 9.21 | 8.14 → 8.03 |
| virtuals/10 | eight ON | 6.03 → 5.93 | 9.26 → 8.61 | 7.77 → 7.69 |

## 250-sample short repeats

| Case | Mode | Median before → after | p95 before → after | CPU before → after |
| --- | --- | ---: | ---: | ---: |
| plain-narrow/10 | strict | 4.47 → 4.47 | 6.49 → 6.54 | 4.99 → 5.07 |
| plain-narrow/10 | six ON | 3.52 → 3.54 | 4.96 → 5.22 | 4.01 → 4.04 |
| plain-narrow/10 | eight ON | 3.52 → 3.53 | 5.08 → 5.17 | 4.00 → 4.02 |
| global-rules/10 | strict | 22.26 → 22.30 | 24.40 → 24.46 | 22.93 → 22.97 |
| global-rules/10 | six ON | 4.88 → 4.90 | 6.69 → 6.77 | 5.70 → 5.72 |
| global-rules/10 | eight ON | 4.94 → 4.93 | 6.70 → 6.86 | 5.77 → 5.78 |
| embedded/10 | strict | 59.83 → 59.75 | 65.78 → 66.23 | 64.48 → 63.65 |
| embedded/10 | six ON | 9.14 → 9.17 | 11.17 → 11.43 | 10.49 → 10.42 |
| embedded/10 | eight ON | 9.09 → 9.17 | 11.65 → 11.66 | 10.44 → 10.46 |
| virtuals/10 | strict | 8.66 → 8.67 | 10.78 → 10.60 | 9.57 → 9.51 |
| virtuals/10 | six ON | 5.46 → 5.50 | 7.47 → 7.58 | 6.22 → 6.17 |
| virtuals/10 | eight ON | 5.47 → 5.25 | 7.51 → 7.35 | 6.33 → 6.07 |
