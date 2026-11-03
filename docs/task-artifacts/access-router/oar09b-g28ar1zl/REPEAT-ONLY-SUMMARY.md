> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Initial, repeat-only and final paired aggregates — all triggered comparisons

Negative = candidate lower. Each cell is median-of-pair percent / absolute milliseconds, never pooled requests. Repeat-only N=2 is descriptive, NOT a replacement final gate: acceptance still uses all four pairs with the original confirmation rules. Component H2/H3 never synthesize a p95. Every original/repeat pair remains in PAIR-DETAILS.md.

| Case | Profile | Metric | Initial N=2 | Repeat-only N=2 (rounds 3,4) | Final N=4 | Final gate |
|---|---|---|---|---|---|---|
| primary/plain-wide/100 | trusted | medianMs | +11.24% / +1.3445 ms | +14.88% / +1.7656 ms | +14.35% / +1.6983 ms | FAIL: confirmed adverse: medianMs |
| primary/plain-wide/100 | trusted | p95Ms | +8.75% / +1.1955 ms | +5.90% / +0.8425 ms | +5.90% / +0.8425 ms | FAIL: confirmed adverse: medianMs |
| primary/plain-wide/100 | trusted | cpuMsPerRequest | -2.58% / -0.4078 ms | -1.03% / -0.1698 ms | -2.11% / -0.3383 ms | FAIL: confirmed adverse: medianMs |
| primary/embedded/100 | trusted | medianMs | +0.19% / +0.0540 ms | +3.36% / +0.7691 ms | +1.29% / +0.3111 ms | FAIL: unresolved sign instability: p95Ms |
| primary/embedded/100 | trusted | p95Ms | -1.50% / -0.3845 ms | +0.15% / +0.0160 ms | -0.49% / -0.1357 ms | FAIL: unresolved sign instability: p95Ms |
| primary/embedded/100 | trusted | cpuMsPerRequest | -4.29% / -1.2152 ms | -1.52% / -0.4944 ms | -4.29% / -1.2152 ms | FAIL: unresolved sign instability: p95Ms |
| guard/hydrated/10 | trusted | medianMs | +17.88% / +0.6488 ms | +8.77% / +0.3515 ms | +10.31% / +0.4152 ms | PASS |
| guard/hydrated/10 | trusted | p95Ms | +7.92% / +0.4772 ms | +26.02% / +1.7812 ms | +16.18% / +1.0227 ms | PASS |
| guard/hydrated/10 | trusted | cpuMsPerRequest | +25.25% / +1.2369 ms | +13.06% / +0.7874 ms | +13.06% / +0.7874 ms | PASS |
| guard/global-rules/10 | trusted | medianMs | +0.35% / +0.0139 ms | -1.66% / -0.0721 ms | -0.28% / -0.0119 ms | PASS |
| guard/global-rules/10 | trusted | p95Ms | -2.42% / -0.1567 ms | +1.39% / +0.0808 ms | +1.39% / +0.0808 ms | PASS |
| guard/global-rules/10 | trusted | cpuMsPerRequest | -1.55% / -0.0905 ms | -2.29% / -0.1414 ms | -1.99% / -0.1193 ms | PASS |
| guard/large-config/10 | trusted | medianMs | +4.14% / +0.1747 ms | -6.09% / -0.2993 ms | +2.21% / +0.0858 ms | FAIL: unresolved sign instability: p95Ms |
| guard/large-config/10 | trusted | p95Ms | +8.11% / +0.4819 ms | +0.85% / -0.0411 ms | +7.98% / +0.4566 ms | FAIL: unresolved sign instability: p95Ms |
| guard/large-config/10 | trusted | cpuMsPerRequest | +13.22% / +0.6972 ms | +2.07% / +0.1138 ms | +6.55% / +0.3616 ms | FAIL: unresolved sign instability: p95Ms |
| guard/populate/10 | trusted | medianMs | +5.29% / +0.2931 ms | +13.41% / +0.7312 ms | +6.30% / +0.3540 ms | PASS |
| guard/populate/10 | trusted | p95Ms | -0.22% / -0.0257 ms | +13.92% / +0.9929 ms | +0.97% / +0.0724 ms | PASS |
| guard/populate/10 | trusted | cpuMsPerRequest | -0.53% / -0.0237 ms | +11.65% / +0.8101 ms | +6.22% / +0.4367 ms | PASS |
| guard/virtuals/10 | trusted | medianMs | +19.04% / +0.7807 ms | +11.86% / +0.5103 ms | +13.92% / +0.6188 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| guard/virtuals/10 | trusted | p95Ms | +13.92% / +0.8062 ms | +3.20% / +0.1884 ms | +9.66% / +0.5797 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| guard/virtuals/10 | trusted | cpuMsPerRequest | +29.77% / +1.5314 ms | +11.86% / +0.6277 ms | +26.63% / +1.4311 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| guard/plain-narrow/100 | trusted | medianMs | +4.29% / +0.2847 ms | +3.92% / +0.2471 ms | +3.92% / +0.2471 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/plain-narrow/100 | trusted | p95Ms | +9.55% / +0.8705 ms | +11.46% / +0.9306 ms | +11.46% / +0.9306 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/plain-narrow/100 | trusted | cpuMsPerRequest | -0.23% / -0.0115 ms | -0.37% / -0.0313 ms | -0.37% / -0.0313 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/hydrated/100 | trusted | medianMs | +10.28% / +1.4142 ms | +11.05% / +1.5276 ms | +11.05% / +1.5276 ms | FAIL: confirmed adverse: medianMs, unresolved sign instability: cpuMsPerRequest |
| guard/hydrated/100 | trusted | p95Ms | +4.81% / +0.8042 ms | +5.45% / +0.9295 ms | +5.32% / +0.9124 ms | FAIL: confirmed adverse: medianMs, unresolved sign instability: cpuMsPerRequest |
| guard/hydrated/100 | trusted | cpuMsPerRequest | -0.20% / -0.0356 ms | -2.43% / -0.4922 ms | -0.20% / -0.0356 ms | FAIL: confirmed adverse: medianMs, unresolved sign instability: cpuMsPerRequest |
| guard/populate/100 | trusted | medianMs | +16.15% / +2.3054 ms | +16.54% / +2.5009 ms | +16.15% / +2.3490 ms | FAIL: confirmed adverse: medianMs |
| guard/populate/100 | trusted | p95Ms | +15.92% / +2.6780 ms | +10.27% / +1.8875 ms | +13.17% / +2.2966 ms | FAIL: confirmed adverse: medianMs |
| guard/populate/100 | trusted | cpuMsPerRequest | +5.61% / +1.0625 ms | +3.52% / +0.7132 ms | +4.27% / +0.8464 ms | FAIL: confirmed adverse: medianMs |
| guard/virtuals/100 | trusted | medianMs | +32.40% / +4.8352 ms | +31.67% / +4.9138 ms | +32.40% / +4.8352 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| guard/virtuals/100 | trusted | p95Ms | +24.54% / +4.2787 ms | +29.10% / +5.1941 ms | +27.15% / +4.6963 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| guard/virtuals/100 | trusted | cpuMsPerRequest | +13.44% / +2.7847 ms | +17.93% / +3.7385 ms | +15.69% / +3.2121 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| read/http-id/plain-wide/100 | trusted | medianMs | +5.68% / +0.1404 ms | +9.93% / +0.2584 ms | +9.20% / +0.2355 ms | PASS |
| read/http-id/plain-wide/100 | trusted | p95Ms | +1.13% / +0.0406 ms | +3.53% / +0.1385 ms | +1.81% / +0.0652 ms | PASS |
| read/http-id/plain-wide/100 | trusted | cpuMsPerRequest | +12.27% / +0.3476 ms | +6.78% / +0.2032 ms | +6.78% / +0.2032 ms | PASS |
| read/http-id/embedded/100 | trusted | medianMs | +5.44% / +0.1477 ms | +3.12% / +0.0899 ms | +4.25% / +0.1206 ms | PASS |
| read/http-id/embedded/100 | trusted | p95Ms | +2.95% / +0.1200 ms | +5.64% / +0.2368 ms | +5.15% / +0.2081 ms | PASS |
| read/http-id/embedded/100 | trusted | cpuMsPerRequest | +2.63% / +0.0857 ms | +4.62% / +0.1572 ms | +3.85% / +0.1280 ms | PASS |
| read/http-id/hydrated/100 | isolated | medianMs | -42.03% / -2.0068 ms | -43.62% / -2.2280 ms | -43.62% / -2.2137 ms | PASS |
| read/http-id/hydrated/100 | isolated | p95Ms | +301.33% / +17.5717 ms | -35.27% / -2.3407 ms | -35.27% / -2.3377 ms | PASS |
| read/http-id/hydrated/100 | isolated | cpuMsPerRequest | -43.46% / -2.4495 ms | -44.73% / -2.6700 ms | -44.01% / -2.5583 ms | PASS |
| read/http-id/hydrated/100 | trusted | medianMs | +0.90% / +0.0227 ms | +11.60% / +0.3036 ms | +6.04% / +0.1549 ms | PASS |
| read/http-id/hydrated/100 | trusted | p95Ms | -3.01% / -0.1239 ms | +8.67% / +0.3417 ms | +2.49% / +0.0936 ms | PASS |
| read/http-id/hydrated/100 | trusted | cpuMsPerRequest | +1.76% / +0.0528 ms | +10.81% / +0.3389 ms | +3.22% / +0.0974 ms | PASS |
| read/http-filter/document-rules/100 | trusted | medianMs | +5.49% / +0.1394 ms | +6.68% / +0.1749 ms | +6.68% / +0.1749 ms | PASS |
| read/http-filter/document-rules/100 | trusted | p95Ms | +11.01% / +0.3998 ms | +6.67% / +0.2595 ms | +6.67% / +0.2595 ms | PASS |
| read/http-filter/document-rules/100 | trusted | cpuMsPerRequest | +14.20% / +0.4025 ms | +15.40% / +0.4454 ms | +14.45% / +0.4125 ms | PASS |
| read/http-filter/embedded/100 | trusted | medianMs | +0.76% / +0.0201 ms | +0.76% / +0.0206 ms | +0.76% / +0.0201 ms | FAIL: unresolved sign instability: medianMs |
| read/http-filter/embedded/100 | trusted | p95Ms | +7.48% / +0.2979 ms | +1.97% / +0.0854 ms | +5.15% / +0.2164 ms | FAIL: unresolved sign instability: medianMs |
| read/http-filter/embedded/100 | trusted | cpuMsPerRequest | +2.98% / +0.0991 ms | +1.86% / +0.0644 ms | +2.46% / +0.0836 ms | FAIL: unresolved sign instability: medianMs |
| read/http-filter/hydrated/100 | trusted | medianMs | +5.56% / +0.1332 ms | +4.83% / +0.1301 ms | +4.83% / +0.1301 ms | FAIL: unresolved sign instability: medianMs |
| read/http-filter/hydrated/100 | trusted | p95Ms | -0.83% / -0.0390 ms | +8.28% / +0.3318 ms | +4.30% / +0.1644 ms | FAIL: unresolved sign instability: medianMs |
| read/http-filter/hydrated/100 | trusted | cpuMsPerRequest | +8.67% / +0.2531 ms | +5.35% / +0.1628 ms | +5.35% / +0.1628 ms | FAIL: unresolved sign instability: medianMs |
| read/http-filter/virtuals/100 | trusted | medianMs | +11.02% / +0.2764 ms | +6.47% / +0.1859 ms | +6.47% / +0.1859 ms | PASS |
| read/http-filter/virtuals/100 | trusted | p95Ms | +17.70% / +0.6832 ms | +8.23% / +0.3361 ms | +8.71% / +0.3491 ms | PASS |
| read/http-filter/virtuals/100 | trusted | cpuMsPerRequest | +16.86% / +0.4960 ms | +4.96% / +0.1602 ms | +5.64% / +0.1786 ms | PASS |
| helper/H0/100 | trusted | medianMs | +4.43% / +0.1088 ms | +0.48% / +0.0101 ms | +1.83% / +0.0469 ms | FAIL: unresolved sign instability: p95Ms |
| helper/H0/100 | trusted | p95Ms | -0.19% / -0.0198 ms | +0.12% / +0.0026 ms | +0.12% / +0.0026 ms | FAIL: unresolved sign instability: p95Ms |
| helper/H0/100 | trusted | cpuMsPerRequest | +10.42% / +0.2974 ms | -0.30% / -0.0106 ms | +2.84% / +0.0849 ms | FAIL: unresolved sign instability: p95Ms |
| helper/H2-query/100 | trusted | medianMs | +5.62% / +0.1342 ms | +5.62% / +0.1438 ms | +5.62% / +0.1342 ms | PASS |
| helper/H2-query/100 | trusted | p95Ms | +3.40% / +0.1229 ms | +2.05% / +0.0849 ms | +2.05% / +0.0849 ms | PASS |
| helper/H2-query/100 | trusted | cpuMsPerRequest | +11.89% / +0.3349 ms | +3.84% / +0.1128 ms | +8.12% / +0.2334 ms | PASS |
| helper/H2-global/100 | trusted | medianMs | +8.85% / +0.2380 ms | +12.68% / +0.3756 ms | +11.04% / +0.3153 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H2-global/100 | trusted | p95Ms | +14.46% / +0.5403 ms | +13.31% / +0.5700 ms | +14.46% / +0.5403 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H2-global/100 | trusted | cpuMsPerRequest | +14.59% / +0.4507 ms | +23.31% / +0.7633 ms | +19.18% / +0.6127 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H4/100 | trusted | medianMs | +16.69% / +0.3652 ms | +20.27% / +0.4774 ms | +16.73% / +0.3839 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H4/100 | trusted | p95Ms | +19.09% / +0.5914 ms | +21.70% / +0.7609 ms | +21.70% / +0.7160 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H4/100 | trusted | cpuMsPerRequest | +37.13% / +0.8276 ms | +30.03% / +0.7332 ms | +30.56% / +0.7332 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3-query/10 | trusted | medianMs | -0.88% / -0.0332 ms | -1.12% / -0.0472 ms | -0.88% / -0.0332 ms | PASS |
| helper/H3-query/10 | trusted | p95Ms | -4.64% / -0.2485 ms | -1.01% / -0.0605 ms | -3.25% / -0.1788 ms | PASS |
| helper/H3-query/10 | trusted | cpuMsPerRequest | -1.86% / -0.0890 ms | -2.74% / -0.1387 ms | -2.74% / -0.1387 ms | PASS |
| helper/H3-global/10 | trusted | medianMs | +39.66% / +2.0743 ms | +42.46% / +2.2176 ms | +41.47% / +2.1664 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/10 | trusted | p95Ms | +10.51% / +0.8426 ms | +31.28% / +2.1859 ms | +22.87% / +1.6534 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/10 | trusted | cpuMsPerRequest | +41.29% / +2.7644 ms | +43.62% / +2.9052 ms | +42.16% / +2.8204 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | medianMs | +64.65% / +17.6629 ms | +62.12% / +17.4852 ms | +62.12% / +17.4852 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | p95Ms | +65.18% / +19.6328 ms | +63.34% / +20.0334 ms | +63.34% / +20.0334 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | cpuMsPerRequest | +68.14% / +22.2730 ms | +66.76% / +22.6764 ms | +66.76% / +22.6764 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
