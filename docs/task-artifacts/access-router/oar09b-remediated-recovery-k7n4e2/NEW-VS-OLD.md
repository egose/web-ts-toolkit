> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Original FAILED artifact versus remediated artifact — all cases kept separate

Each column is that artifact’s OWN matched/interleaved campaign delta against old default/active. This is descriptive cross-campaign context, NOT new-versus-old-candidate paired data, pooling, significance or a second acceptance series. Original 464 jobs/39,800 responses remain immutable; new 444 jobs/38,200 responses remain separate.

Old failed comparisons: 15; confirmed adverse: 9; sign unstable: 7. New failed comparisons: 9; confirmed adverse: 3; sign unstable: 6.

| Case | Profile | Old N | Old Δ median | Old Δ p95 | Old Δ CPU | Old outcome | New N | New Δ median | New Δ p95 | New Δ CPU | New outcome |
|---|---|---|---|---|---|---|---|---|---|---|---|
| primary/plain-wide/100 | isolated | 2 | -54.01% / -17.5673 ms | -52.74% / -18.5811 ms | -53.30% / -19.8105 ms | PASS | 2 | -64.23% / -21.6407 ms | -63.08% / -23.1829 ms | -62.75% / -24.2415 ms | PASS |
| primary/plain-wide/100 | trusted | 4 | +14.35% / +1.6983 ms | +5.90% / +0.8425 ms | -2.11% / -0.3383 ms | FAIL: confirmed adverse: medianMs | 2 | -8.90% / -1.0776 ms | -8.38% / -1.1729 ms | -18.09% / -2.8685 ms | PASS |
| primary/document-rules/100 | isolated | 2 | -91.40% / -161.6874 ms | -90.64% / -172.5821 ms | -90.28% / -167.6237 ms | PASS | 2 | -92.25% / -164.1976 ms | -91.78% / -171.5864 ms | -91.50% / -171.4421 ms | PASS |
| primary/document-rules/100 | trusted | 2 | -7.79% / -1.0722 ms | -8.05% / -1.2756 ms | -14.03% / -2.3675 ms | PASS | 2 | -19.86% / -2.7875 ms | -20.31% / -3.3082 ms | -24.31% / -4.1835 ms | PASS |
| primary/embedded/100 | isolated | 2 | -95.09% / -483.5958 ms | -94.73% / -499.8746 ms | -94.45% / -502.9789 ms | PASS | 2 | -96.29% / -515.6044 ms | -95.95% / -524.6549 ms | -95.78% / -536.4674 ms | PASS |
| primary/embedded/100 | trusted | 4 | +1.29% / +0.3111 ms | -0.49% / -0.1357 ms | -4.29% / -1.2152 ms | FAIL: unresolved sign instability: p95Ms | 2 | -23.60% / -5.5499 ms | -23.86% / -6.3685 ms | -26.17% / -7.4847 ms | PASS |
| guard/plain-narrow/10 | isolated | 2 | -30.92% / -1.4208 ms | -18.57% / -1.1945 ms | -31.42% / -2.1591 ms | PASS | 2 | -35.29% / -1.6396 ms | -34.33% / -2.1273 ms | -40.01% / -2.7726 ms | PASS |
| guard/plain-narrow/10 | trusted | 2 | +2.53% / +0.0682 ms | +13.72% / +0.5668 ms | +8.48% / +0.3136 ms | PASS | 4 | -2.58% / -0.0784 ms | -7.69% / -0.3557 ms | -0.04% / -0.0049 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/hydrated/10 | isolated | 2 | -36.03% / -2.4391 ms | -38.68% / -3.7929 ms | -33.26% / -3.2042 ms | PASS | 2 | -40.22% / -2.8377 ms | -40.05% / -3.9130 ms | -33.41% / -3.1240 ms | PASS |
| guard/hydrated/10 | trusted | 4 | +10.31% / +0.4152 ms | +16.18% / +1.0227 ms | +13.06% / +0.7874 ms | PASS | 4 | -2.63% / -0.1124 ms | -7.98% / -0.4709 ms | -6.77% / -0.4000 ms | PASS |
| guard/global-rules/10 | isolated | 2 | -81.12% / -17.3554 ms | -76.70% / -18.9474 ms | -75.93% / -17.6009 ms | PASS | 2 | -80.74% / -16.9990 ms | -76.46% / -17.6899 ms | -74.86% / -16.8677 ms | PASS |
| guard/global-rules/10 | trusted | 4 | -0.28% / -0.0119 ms | +1.39% / +0.0808 ms | -1.99% / -0.1193 ms | PASS | 4 | -6.75% / -0.2795 ms | -13.35% / -0.8125 ms | -2.96% / -0.1857 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/large-config/10 | isolated | 2 | -35.39% / -2.5118 ms | -24.33% / -2.5660 ms | -31.39% / -2.8822 ms | PASS | 2 | -47.62% / -3.5928 ms | -52.62% / -5.9997 ms | -46.52% / -4.6790 ms | PASS |
| guard/large-config/10 | trusted | 4 | +2.21% / +0.0858 ms | +7.98% / +0.4566 ms | +6.55% / +0.3616 ms | FAIL: unresolved sign instability: p95Ms | 4 | -2.84% / -0.1157 ms | -7.73% / -0.4537 ms | -2.55% / -0.1416 ms | PASS |
| guard/populate/10 | isolated | 2 | -43.25% / -4.3455 ms | -35.34% / -4.4880 ms | -40.28% / -5.0550 ms | PASS | 2 | -44.60% / -4.6528 ms | -42.49% / -5.6083 ms | -44.63% / -5.7230 ms | PASS |
| guard/populate/10 | trusted | 4 | +6.30% / +0.3540 ms | +0.97% / +0.0724 ms | +6.22% / +0.4367 ms | PASS | 2 | -3.29% / -0.1782 ms | +9.65% / +0.7091 ms | -1.21% / -0.0756 ms | PASS |
| guard/virtuals/10 | isolated | 2 | -42.50% / -3.5677 ms | -44.40% / -5.3065 ms | -46.51% / -5.3982 ms | PASS | 2 | -43.89% / -3.6621 ms | -44.23% / -5.4962 ms | -41.36% / -4.6094 ms | PASS |
| guard/virtuals/10 | trusted | 4 | +13.92% / +0.6188 ms | +9.66% / +0.5797 ms | +26.63% / +1.4311 ms | FAIL: confirmed adverse: cpuMsPerRequest | 4 | +5.48% / +0.2410 ms | -12.73% / -0.8828 ms | +8.97% / +0.4769 ms | PASS |
| guard/plain-narrow/100 | isolated | 2 | -57.12% / -10.0189 ms | -43.90% / -8.6533 ms | -52.66% / -10.5158 ms | PASS | 2 | -63.36% / -11.7934 ms | -52.34% / -10.8380 ms | -58.60% / -12.5618 ms | PASS |
| guard/plain-narrow/100 | trusted | 4 | +3.92% / +0.2471 ms | +11.46% / +0.9306 ms | -0.37% / -0.0313 ms | FAIL: unresolved sign instability: cpuMsPerRequest | 2 | -11.01% / -0.7275 ms | +12.61% / +1.0228 ms | -11.44% / -0.9980 ms | PASS |
| guard/hydrated/100 | isolated | 2 | -53.98% / -19.2144 ms | -52.33% / -20.6861 ms | -51.57% / -21.2910 ms | PASS | 2 | -62.11% / -22.9184 ms | -60.75% / -24.5868 ms | -59.04% / -25.1393 ms | PASS |
| guard/hydrated/100 | trusted | 4 | +11.05% / +1.5276 ms | +5.32% / +0.9124 ms | -0.20% / -0.0356 ms | FAIL: confirmed adverse: medianMs, unresolved sign instability: cpuMsPerRequest | 2 | -8.15% / -1.1436 ms | -8.79% / -1.5508 ms | -15.95% / -3.0772 ms | PASS |
| guard/global-rules/100 | isolated | 2 | -91.34% / -157.3633 ms | -90.75% / -166.0472 ms | -89.82% / -161.8915 ms | PASS | 2 | -92.98% / -165.5763 ms | -91.79% / -169.1473 ms | -91.39% / -167.9733 ms | PASS |
| guard/global-rules/100 | trusted | 2 | -4.93% / -0.7220 ms | -1.54% / -0.2668 ms | -7.44% / -1.3771 ms | PASS | 2 | -22.85% / -3.3750 ms | -21.99% / -3.7519 ms | -24.00% / -4.4559 ms | PASS |
| guard/large-config/100 | isolated | 2 | -54.93% / -19.0855 ms | -52.82% / -20.1075 ms | -53.11% / -21.6203 ms | PASS | 2 | -63.92% / -22.3272 ms | -61.75% / -24.0925 ms | -61.17% / -24.6956 ms | PASS |
| guard/large-config/100 | trusted | 2 | +6.72% / +0.8488 ms | +7.37% / +1.1287 ms | -3.84% / -0.6588 ms | PASS | 2 | -10.53% / -1.3392 ms | -12.12% / -1.9137 ms | -17.95% / -3.1070 ms | PASS |
| guard/populate/100 | isolated | 2 | -61.00% / -29.5107 ms | -62.13% / -34.7183 ms | -59.84% / -33.8478 ms | PASS | 2 | -66.92% / -32.8848 ms | -65.57% / -34.7517 ms | -64.07% / -36.4084 ms | PASS |
| guard/populate/100 | trusted | 4 | +16.15% / +2.3490 ms | +13.17% / +2.2966 ms | +4.27% / +0.8464 ms | FAIL: confirmed adverse: medianMs | 4 | -6.23% / -0.9347 ms | -4.58% / -0.8040 ms | -12.26% / -2.4207 ms | PASS |
| guard/virtuals/100 | isolated | 2 | -58.51% / -28.9033 ms | -57.29% / -30.1854 ms | -56.44% / -31.7190 ms | PASS | 2 | -65.81% / -33.1664 ms | -62.72% / -33.3116 ms | -60.52% / -34.0318 ms | PASS |
| guard/virtuals/100 | trusted | 4 | +32.40% / +4.8352 ms | +27.15% / +4.6963 ms | +15.69% / +3.2121 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest | 4 | +6.89% / +1.0323 ms | +6.83% / +1.1973 ms | -1.91% / -0.3897 ms | PASS |
| read/http-id/plain-wide/100 | isolated | 2 | -48.18% / -2.3993 ms | -38.88% / -2.5123 ms | -47.90% / -2.7880 ms | PASS | 2 | -45.83% / -2.3186 ms | -40.02% / -2.5804 ms | -47.03% / -2.7878 ms | PASS |
| read/http-id/plain-wide/100 | trusted | 4 | +9.20% / +0.2355 ms | +1.81% / +0.0652 ms | +6.78% / +0.2032 ms | PASS | 4 | +4.15% / +0.1060 ms | -0.56% / -0.0213 ms | +2.14% / +0.0645 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-id/document-rules/100 | isolated | 2 | -42.95% / -2.0770 ms | -34.83% / -2.2746 ms | -42.65% / -2.5142 ms | PASS | 2 | -46.61% / -2.3671 ms | -36.67% / -2.3607 ms | -47.12% / -2.7620 ms | PASS |
| read/http-id/document-rules/100 | trusted | 2 | +2.41% / +0.0611 ms | -1.01% / -0.0371 ms | +4.71% / +0.1301 ms | PASS | 4 | +2.31% / +0.0604 ms | +3.10% / +0.1140 ms | +1.64% / +0.0473 ms | PASS |
| read/http-id/embedded/100 | isolated | 2 | -65.76% / -5.6956 ms | -54.18% / -5.6280 ms | -63.26% / -6.1417 ms | PASS | 2 | -66.59% / -5.9729 ms | -57.41% / -5.7709 ms | -63.37% / -6.3042 ms | PASS |
| read/http-id/embedded/100 | trusted | 4 | +4.25% / +0.1206 ms | +5.15% / +0.2081 ms | +3.85% / +0.1280 ms | PASS | 4 | -1.29% / -0.0366 ms | -4.86% / -0.2160 ms | -1.23% / -0.0420 ms | PASS |
| read/http-id/hydrated/100 | isolated | 4 | -43.62% / -2.2137 ms | -35.27% / -2.3377 ms | -44.01% / -2.5583 ms | PASS | 2 | -45.67% / -2.2832 ms | -35.02% / -2.1869 ms | -45.84% / -2.6925 ms | PASS |
| read/http-id/hydrated/100 | trusted | 4 | +6.04% / +0.1549 ms | +2.49% / +0.0936 ms | +3.22% / +0.0974 ms | PASS | 4 | +3.08% / +0.0816 ms | +5.06% / +0.1815 ms | +7.80% / +0.2381 ms | PASS |
| read/http-id/virtuals/100 | isolated | 2 | -46.19% / -2.3801 ms | -41.47% / -2.8229 ms | -48.03% / -2.9976 ms | PASS | 2 | -46.60% / -2.4614 ms | -39.48% / -2.7033 ms | -47.72% / -2.9687 ms | PASS |
| read/http-id/virtuals/100 | trusted | 2 | +4.34% / +0.1146 ms | +9.25% / +0.3547 ms | +5.85% / +0.1798 ms | PASS | 4 | +1.84% / +0.0503 ms | +2.65% / +0.1031 ms | +2.81% / +0.0893 ms | PASS |
| read/http-filter/plain-wide/100 | isolated | 2 | -41.49% / -1.9421 ms | -36.69% / -2.2449 ms | -43.37% / -2.4389 ms | PASS | 2 | -43.60% / -2.1602 ms | -41.64% / -2.7353 ms | -47.58% / -2.8392 ms | PASS |
| read/http-filter/plain-wide/100 | trusted | 2 | +4.38% / +0.1084 ms | +5.03% / +0.1829 ms | +4.49% / +0.1258 ms | PASS | 4 | +0.29% / +0.0078 ms | +0.76% / +0.0281 ms | -2.15% / -0.0737 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| read/http-filter/document-rules/100 | isolated | 2 | -42.00% / -2.0595 ms | -37.33% / -2.3812 ms | -44.02% / -2.4912 ms | PASS | 2 | -44.78% / -2.2379 ms | -35.67% / -2.2535 ms | -46.08% / -2.6482 ms | PASS |
| read/http-filter/document-rules/100 | trusted | 4 | +6.68% / +0.1749 ms | +6.67% / +0.2595 ms | +14.45% / +0.4125 ms | PASS | 2 | +2.05% / +0.0528 ms | -2.06% / -0.0785 ms | +2.73% / +0.0793 ms | PASS |
| read/http-filter/embedded/100 | isolated | 2 | -64.35% / -5.6119 ms | -57.13% / -5.8277 ms | -60.92% / -5.8890 ms | PASS | 2 | -67.26% / -6.0266 ms | -58.10% / -6.0209 ms | -65.20% / -6.4386 ms | PASS |
| read/http-filter/embedded/100 | trusted | 4 | +0.76% / +0.0201 ms | +5.15% / +0.2164 ms | +2.46% / +0.0836 ms | FAIL: unresolved sign instability: medianMs | 2 | +6.31% / +0.1768 ms | +5.37% / +0.2253 ms | +3.58% / +0.1192 ms | PASS |
| read/http-filter/hydrated/100 | isolated | 2 | -46.41% / -2.2614 ms | -35.17% / -2.1423 ms | -46.15% / -2.6351 ms | PASS | 2 | -44.58% / -2.2716 ms | -34.84% / -2.2478 ms | -45.10% / -2.6501 ms | PASS |
| read/http-filter/hydrated/100 | trusted | 4 | +4.83% / +0.1301 ms | +4.30% / +0.1644 ms | +5.35% / +0.1628 ms | FAIL: unresolved sign instability: medianMs | 4 | +1.58% / +0.0421 ms | +0.41% / +0.0173 ms | +3.14% / +0.0966 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/virtuals/100 | isolated | 2 | -46.31% / -2.3732 ms | -37.16% / -2.4030 ms | -46.24% / -2.7555 ms | PASS | 2 | -43.82% / -2.3310 ms | -34.29% / -2.2711 ms | -46.22% / -2.8565 ms | PASS |
| read/http-filter/virtuals/100 | trusted | 4 | +6.47% / +0.1859 ms | +8.71% / +0.3491 ms | +5.64% / +0.1786 ms | PASS | 4 | +2.47% / +0.0701 ms | +3.47% / +0.1403 ms | +1.72% / +0.0556 ms | PASS |
| helper/H0/100 | isolated | 2 | -43.92% / -2.0395 ms | -37.97% / -2.2717 ms | -45.20% / -2.4489 ms | PASS | 2 | -47.02% / -2.3024 ms | -37.95% / -2.4089 ms | -47.69% / -2.7374 ms | PASS |
| helper/H0/100 | trusted | 4 | +1.83% / +0.0469 ms | +0.12% / +0.0026 ms | +2.84% / +0.0849 ms | FAIL: unresolved sign instability: p95Ms | 4 | -0.86% / -0.0228 ms | +3.32% / +0.1266 ms | +0.64% / +0.0187 ms | PASS |
| helper/H1/100 | isolated | 2 | -38.50% / -1.2650 ms | -40.43% / -2.0313 ms | -31.24% / -1.2677 ms | PASS | 2 | -51.09% / -1.7652 ms | -52.26% / -2.8152 ms | -49.44% / -2.1219 ms | PASS |
| helper/H1/100 | trusted | 2 | -37.80% / -1.2410 ms | -37.70% / -1.8481 ms | -34.90% / -1.4010 ms | PASS | 2 | -50.53% / -1.7100 ms | -48.16% / -2.4847 ms | -47.61% / -1.9868 ms | PASS |
| helper/H1-scoped/100 | isolated | 2 | -15.85% / -0.2179 ms | +9.09% / +0.1665 ms | +5.03% / +0.0773 ms | PASS | 2 | -22.11% / -0.3134 ms | -8.09% / -0.1678 ms | -12.79% / -0.2046 ms | PASS |
| helper/H1-scoped/100 | trusted | 2 | -10.87% / -0.1454 ms | -10.38% / -0.1992 ms | -12.20% / -0.1868 ms | PASS | 2 | -22.10% / -0.3167 ms | -25.00% / -0.5696 ms | -23.20% / -0.3914 ms | PASS |
| helper/H2/100 | isolated | 2 | -58.13% / -6.1225 ms | N/A component p95 | -61.34% / -7.6886 ms | PASS | 2 | -61.37% / -6.7625 ms | N/A component p95 | -65.58% / -8.5784 ms | PASS |
| helper/H2/100 | trusted | 2 | -21.18% / -1.1197 ms | N/A component p95 | -25.62% / -1.5647 ms | PASS | 2 | -17.52% / -0.9445 ms | N/A component p95 | -27.03% / -1.6709 ms | PASS |
| helper/H2-query/100 | isolated | 2 | -48.47% / -2.3774 ms | -43.35% / -2.9035 ms | -50.30% / -2.9912 ms | PASS | 2 | -46.62% / -2.3201 ms | -38.89% / -2.4804 ms | -48.35% / -2.8271 ms | PASS |
| helper/H2-query/100 | trusted | 4 | +5.62% / +0.1342 ms | +2.05% / +0.0849 ms | +8.12% / +0.2334 ms | PASS | 4 | -1.20% / -0.0317 ms | +2.64% / +0.0951 ms | -3.64% / -0.1189 ms | PASS |
| helper/H2-global/100 | isolated | 2 | -44.11% / -2.3854 ms | -33.87% / -2.3154 ms | -40.33% / -2.5885 ms | PASS | 2 | -48.73% / -2.8704 ms | -37.37% / -2.7785 ms | -48.47% / -3.3306 ms | PASS |
| helper/H2-global/100 | trusted | 4 | +11.04% / +0.3153 ms | +14.46% / +0.5403 ms | +19.18% / +0.6127 ms | FAIL: confirmed adverse: cpuMsPerRequest | 2 | +2.37% / +0.0680 ms | +11.73% / +0.4771 ms | +7.51% / +0.2431 ms | PASS |
| helper/H4/100 | isolated | 2 | -4.49% / -0.1204 ms | -2.23% / -0.0869 ms | -1.48% / -0.0438 ms | PASS | 2 | -5.55% / -0.1602 ms | -7.07% / -0.3028 ms | -3.56% / -0.1114 ms | PASS |
| helper/H4/100 | trusted | 4 | +16.73% / +0.3839 ms | +21.70% / +0.7160 ms | +30.56% / +0.7332 ms | FAIL: confirmed adverse: cpuMsPerRequest | 4 | +16.70% / +0.3811 ms | +22.03% / +0.7156 ms | +26.69% / +0.6207 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3/10 | isolated | 2 | -86.18% / -43.5238 ms | N/A component p95 | -84.94% / -45.0498 ms | PASS | 2 | -87.71% / -45.3399 ms | N/A component p95 | -86.30% / -46.7675 ms | PASS |
| helper/H3/10 | trusted | 2 | -27.21% / -2.4604 ms | N/A component p95 | -35.06% / -4.0200 ms | PASS | 2 | -37.50% / -3.5718 ms | N/A component p95 | -44.09% / -5.3335 ms | PASS |
| helper/H3-query/10 | isolated | 2 | -81.12% / -16.8944 ms | -75.55% / -17.0240 ms | -77.23% / -16.9481 ms | PASS | 2 | -81.88% / -17.6942 ms | -75.89% / -17.3827 ms | -78.28% / -17.6981 ms | PASS |
| helper/H3-query/10 | trusted | 4 | -0.88% / -0.0332 ms | -3.25% / -0.1788 ms | -2.74% / -0.1387 ms | PASS | 2 | -11.34% / -0.4566 ms | -3.83% / -0.2119 ms | -12.74% / -0.6634 ms | PASS |
| helper/H3-global/10 | isolated | 2 | -74.28% / -21.5683 ms | -69.18% / -22.2572 ms | -67.47% / -20.5454 ms | PASS | 2 | -77.53% / -23.0195 ms | -72.37% / -22.9554 ms | -71.43% / -22.3212 ms | PASS |
| helper/H3-global/10 | trusted | 4 | +41.47% / +2.1664 ms | +22.87% / +1.6534 ms | +42.16% / +2.8204 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest | 4 | +20.67% / +1.1487 ms | +10.84% / +0.8018 ms | +23.86% / +1.6388 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3/100 | isolated | 2 | -93.03% / -404.1434 ms | N/A component p95 | -92.67% / -424.9387 ms | PASS | 2 | -93.73% / -418.4118 ms | N/A component p95 | -93.52% / -442.6793 ms | PASS |
| helper/H3/100 | trusted | 2 | -38.89% / -16.3587 ms | N/A component p95 | -43.48% / -22.0047 ms | PASS | 2 | -48.89% / -21.7273 ms | N/A component p95 | -52.96% / -28.3709 ms | PASS |
| helper/H3-query/100 | isolated | 2 | -91.03% / -161.7045 ms | -90.45% / -170.7768 ms | -90.29% / -167.7654 ms | PASS | 2 | -91.57% / -165.8126 ms | -91.23% / -173.4339 ms | -90.76% / -171.7480 ms | PASS |
| helper/H3-query/100 | trusted | 2 | -6.35% / -0.9419 ms | -8.95% / -1.5461 ms | -10.47% / -1.8477 ms | PASS | 2 | -19.99% / -3.1485 ms | -18.75% / -3.2626 ms | -22.19% / -4.0869 ms | PASS |
| helper/H3-global/100 | isolated | 2 | -81.73% / -203.2894 ms | -81.86% / -224.5603 ms | -79.01% / -207.8771 ms | PASS | 2 | -85.69% / -218.4501 ms | -85.02% / -229.4318 ms | -83.60% / -227.4813 ms | PASS |
| helper/H3-global/100 | trusted | 4 | +62.12% / +17.4852 ms | +63.34% / +20.0334 ms | +66.76% / +22.6764 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest | 4 | +24.98% / +7.2173 ms | +24.14% / +7.4754 ms | +25.09% / +8.7260 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| native-adapter/direct-read/100 | isolated | 2 | -78.78% / -7.6718 ms | -71.71% / -8.0163 ms | -71.53% / -7.5489 ms | PASS | 2 | -79.65% / -8.3195 ms | -71.15% / -8.5054 ms | -74.18% / -8.3665 ms | PASS |
| native-adapter/direct-read/100 | trusted | 2 | -1.86% / -0.0365 ms | +9.03% / +0.2505 ms | +8.23% / +0.2054 ms | PASS | 4 | -0.90% / -0.0180 ms | +1.01% / +0.0308 ms | -0.49% / -0.0146 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| native-adapter/direct-list/100 | isolated | 2 | -96.64% / -723.7263 ms | -96.48% / -763.1295 ms | -96.29% / -749.7157 ms | PASS | 2 | -96.94% / -747.8916 ms | -96.75% / -762.7758 ms | -96.63% / -774.3657 ms | PASS |
| native-adapter/direct-list/100 | trusted | 2 | -12.86% / -2.5281 ms | -15.21% / -3.4844 ms | -17.46% / -4.3908 ms | PASS | 2 | -19.95% / -3.7121 ms | -22.10% / -4.6029 ms | -23.14% / -5.4616 ms | PASS |
| facts/owner-only/100 | isolated | 2 | -91.74% / -168.2487 ms | -91.68% / -193.5061 ms | -91.11% / -178.4626 ms | PASS | 2 | -92.58% / -166.1743 ms | -92.17% / -173.1871 ms | -91.93% / -173.1233 ms | PASS |
| facts/owner-only/100 | trusted | 2 | -10.48% / -1.4703 ms | -7.81% / -1.2508 ms | -14.72% / -2.4304 ms | PASS | 2 | -25.12% / -3.5473 ms | -24.36% / -3.9212 ms | -28.65% / -4.7781 ms | PASS |
| facts/unused-checksum/100 | isolated | 2 | -86.03% / -157.7686 ms | -85.68% / -167.9492 ms | -85.47% / -163.6818 ms | PASS | 2 | -87.16% / -165.7424 ms | -86.78% / -173.8253 ms | -86.67% / -172.1826 ms | PASS |
| facts/unused-checksum/100 | trusted | 2 | -7.24% / -1.8395 ms | -10.05% / -2.9102 ms | -10.96% / -3.1107 ms | PASS | 2 | -14.00% / -3.4923 ms | -13.76% / -3.7142 ms | -16.34% / -4.4744 ms | PASS |
| retention/held-released/100/4 | isolated | 2 | -77.09% / -24.9788 ms | -73.23% / -24.9988 ms | -72.91% / -25.3080 ms | PASS | 2 | -77.80% / -24.8437 ms | -69.72% / -23.2405 ms | -72.81% / -24.7380 ms | PASS |
| retention/held-released/100/4 | trusted | 2 | -6.08% / -0.3748 ms | -6.71% / -0.5471 ms | -7.79% / -0.6013 ms | PASS | 2 | -15.28% / -0.9686 ms | -9.82% / -0.8100 ms | -14.23% / -1.1130 ms | PASS |
| retention/held-released/100/24 | isolated | 2 | -91.32% / -161.9940 ms | -90.73% / -167.5554 ms | -90.49% / -167.5812 ms | PASS | 2 | -92.51% / -165.0304 ms | -91.95% / -173.4949 ms | -91.92% / -173.2244 ms | PASS |
| retention/held-released/100/24 | trusted | 2 | -9.20% / -1.3059 ms | -10.51% / -1.7242 ms | -14.52% / -2.4090 ms | PASS | 2 | -23.38% / -3.3078 ms | -23.12% / -3.7385 ms | -26.50% / -4.3897 ms | PASS |
| retention/held-released/100/48 | isolated | 2 | -95.38% / -531.3308 ms | -95.22% / -554.3833 ms | -95.04% / -552.8937 ms | PASS | 2 | -96.12% / -536.1195 ms | -95.71% / -544.5081 ms | -95.72% / -555.7522 ms | PASS |
| retention/held-released/100/48 | trusted | 2 | -7.26% / -1.7050 ms | -4.74% / -1.2377 ms | -8.06% / -2.1150 ms | PASS | 2 | -27.92% / -6.5357 ms | -28.03% / -7.1935 ms | -29.11% / -7.5881 ms | PASS |
