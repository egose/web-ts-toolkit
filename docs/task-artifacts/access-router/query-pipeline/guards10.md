> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

| Case | Mode | Median before → after | p95 before → after | CPU before → after |
| --- | --- | ---: | ---: | ---: |
| plain-narrow/10 | strict | 6.51 → 5.88 | 8.20 → 7.49 | 10.60 → 9.27 |
| plain-narrow/10 | six ON | 4.84 → 4.86 | 6.02 → 6.63 | 6.84 → 7.72 |
| plain-narrow/10 | eight ON | 4.51 → 4.23 | 6.34 → 6.14 | 7.23 → 6.27 |
| plain-wide/10 | strict | 10.23 → 7.96 | 12.68 → 13.10 | 14.30 → 11.55 |
| plain-wide/10 | six ON | 6.46 → 5.95 | 8.60 → 8.46 | 8.86 → 8.39 |
| plain-wide/10 | eight ON | 6.44 → 6.32 | 9.03 → 8.93 | 9.69 → 9.46 |
| hydrated/10 | strict | 10.16 → 8.37 | 14.36 → 11.96 | 14.71 → 12.93 |
| hydrated/10 | six ON | 7.37 → 7.09 | 9.58 → 9.51 | 9.69 → 10.40 |
| hydrated/10 | eight ON | 6.98 → 7.18 | 9.87 → 9.52 | 10.50 → 10.37 |
| global-rules/10 | strict | 38.16 → 24.41 | 41.85 → 26.88 | 40.20 → 27.05 |
| global-rules/10 | six ON | 7.48 → 6.70 | 12.06 → 9.77 | 11.02 → 9.94 |
| global-rules/10 | eight ON | 7.07 → 6.80 | 10.70 → 9.38 | 10.73 → 9.34 |
| document-rules/10 | strict | 37.23 → 23.70 | 40.05 → 28.03 | 40.18 → 28.68 |
| document-rules/10 | six ON | 6.78 → 6.49 | 10.18 → 8.76 | 10.11 → 8.87 |
| document-rules/10 | eight ON | 6.55 → 6.35 | 9.41 → 8.96 | 9.08 → 8.68 |
| large-config/10 | strict | 10.50 → 8.92 | 14.03 → 12.02 | 13.69 → 12.93 |
| large-config/10 | six ON | 7.38 → 6.58 | 9.39 → 8.65 | 10.57 → 8.80 |
| large-config/10 | eight ON | 7.05 → 6.64 | 9.48 → 9.08 | 9.87 → 8.86 |
| embedded/10 | strict | 86.43 → 63.98 | 92.93 → 72.80 | 89.70 → 69.46 |
| embedded/10 | six ON | 11.62 → 10.45 | 16.61 → 15.87 | 14.49 → 13.28 |
| embedded/10 | eight ON | 11.18 → 9.59 | 16.32 → 16.19 | 14.90 → 12.68 |
| populate/10 | strict | 14.32 → 12.37 | 21.68 → 18.98 | 19.96 → 17.22 |
| populate/10 | six ON | 9.14 → 9.06 | 11.97 → 12.00 | 12.30 → 12.42 |
| populate/10 | eight ON | 9.05 → 8.59 | 11.58 → 12.43 | 12.01 → 11.54 |
| virtuals/10 | strict | 13.07 → 10.34 | 17.23 → 14.47 | 17.92 → 15.63 |
| virtuals/10 | six ON | 7.60 → 7.20 | 10.09 → 9.75 | 11.30 → 10.42 |
| virtuals/10 | eight ON | 7.25 → 6.54 | 10.49 → 9.89 | 11.00 → 10.34 |
