> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Every final comparison — independent raw recomputation

Negative = candidate lower/faster. Median of paired percent AND absolute deltas; no pooling. Initial and final views remain separate. N is paired rounds (100 samples/job; guards 50). H2/H3 allowance = old flow + matching OLD query; no synthetic p95.

| Case | New / old profile | Initial N | Initial Δ median; p95; CPU | Repeated? | Final N | Final Δ median; p95; CPU | Final gate / reason |
|---|---|---:|---|---|---:|---|---|
| primary/plain-wide/100 | isolated / default | 2 | -54.01% / -17.5673 ms; -52.74% / -18.5811 ms; -53.30% / -19.8105 ms | no | 2 | -54.01% / -17.5673 ms; -52.74% / -18.5811 ms; -53.30% / -19.8105 ms | PASS |
| primary/plain-wide/100 | trusted / active | 2 | +11.24% / +1.3445 ms; +8.75% / +1.1955 ms; -2.58% / -0.4078 ms | yes | 4 | +14.35% / +1.6983 ms; +5.90% / +0.8425 ms; -2.11% / -0.3383 ms | FAIL: confirmed adverse: medianMs |
| primary/document-rules/100 | isolated / default | 2 | -91.40% / -161.6874 ms; -90.64% / -172.5821 ms; -90.28% / -167.6237 ms | no | 2 | -91.40% / -161.6874 ms; -90.64% / -172.5821 ms; -90.28% / -167.6237 ms | PASS |
| primary/document-rules/100 | trusted / active | 2 | -7.79% / -1.0722 ms; -8.05% / -1.2756 ms; -14.03% / -2.3675 ms | no | 2 | -7.79% / -1.0722 ms; -8.05% / -1.2756 ms; -14.03% / -2.3675 ms | PASS |
| primary/embedded/100 | isolated / default | 2 | -95.09% / -483.5958 ms; -94.73% / -499.8746 ms; -94.45% / -502.9789 ms | no | 2 | -95.09% / -483.5958 ms; -94.73% / -499.8746 ms; -94.45% / -502.9789 ms | PASS |
| primary/embedded/100 | trusted / active | 2 | +0.19% / +0.0540 ms; -1.50% / -0.3845 ms; -4.29% / -1.2152 ms | yes | 4 | +1.29% / +0.3111 ms; -0.49% / -0.1357 ms; -4.29% / -1.2152 ms | FAIL: unresolved sign instability: p95Ms |
| guard/plain-narrow/10 | isolated / default | 2 | -30.92% / -1.4208 ms; -18.57% / -1.1945 ms; -31.42% / -2.1591 ms | no | 2 | -30.92% / -1.4208 ms; -18.57% / -1.1945 ms; -31.42% / -2.1591 ms | PASS |
| guard/plain-narrow/10 | trusted / active | 2 | +2.53% / +0.0682 ms; +13.72% / +0.5668 ms; +8.48% / +0.3136 ms | no | 2 | +2.53% / +0.0682 ms; +13.72% / +0.5668 ms; +8.48% / +0.3136 ms | PASS |
| guard/hydrated/10 | isolated / default | 2 | -36.03% / -2.4391 ms; -38.68% / -3.7929 ms; -33.26% / -3.2042 ms | no | 2 | -36.03% / -2.4391 ms; -38.68% / -3.7929 ms; -33.26% / -3.2042 ms | PASS |
| guard/hydrated/10 | trusted / active | 2 | +17.88% / +0.6488 ms; +7.92% / +0.4772 ms; +25.25% / +1.2369 ms | yes | 4 | +10.31% / +0.4152 ms; +16.18% / +1.0227 ms; +13.06% / +0.7874 ms | PASS |
| guard/global-rules/10 | isolated / default | 2 | -81.12% / -17.3554 ms; -76.70% / -18.9474 ms; -75.93% / -17.6009 ms | no | 2 | -81.12% / -17.3554 ms; -76.70% / -18.9474 ms; -75.93% / -17.6009 ms | PASS |
| guard/global-rules/10 | trusted / active | 2 | +0.35% / +0.0139 ms; -2.42% / -0.1567 ms; -1.55% / -0.0905 ms | yes | 4 | -0.28% / -0.0119 ms; +1.39% / +0.0808 ms; -1.99% / -0.1193 ms | PASS |
| guard/large-config/10 | isolated / default | 2 | -35.39% / -2.5118 ms; -24.33% / -2.5660 ms; -31.39% / -2.8822 ms | no | 2 | -35.39% / -2.5118 ms; -24.33% / -2.5660 ms; -31.39% / -2.8822 ms | PASS |
| guard/large-config/10 | trusted / active | 2 | +4.14% / +0.1747 ms; +8.11% / +0.4819 ms; +13.22% / +0.6972 ms | yes | 4 | +2.21% / +0.0858 ms; +7.98% / +0.4566 ms; +6.55% / +0.3616 ms | FAIL: unresolved sign instability: p95Ms |
| guard/populate/10 | isolated / default | 2 | -43.25% / -4.3455 ms; -35.34% / -4.4880 ms; -40.28% / -5.0550 ms | no | 2 | -43.25% / -4.3455 ms; -35.34% / -4.4880 ms; -40.28% / -5.0550 ms | PASS |
| guard/populate/10 | trusted / active | 2 | +5.29% / +0.2931 ms; -0.22% / -0.0257 ms; -0.53% / -0.0237 ms | yes | 4 | +6.30% / +0.3540 ms; +0.97% / +0.0724 ms; +6.22% / +0.4367 ms | PASS |
| guard/virtuals/10 | isolated / default | 2 | -42.50% / -3.5677 ms; -44.40% / -5.3065 ms; -46.51% / -5.3982 ms | no | 2 | -42.50% / -3.5677 ms; -44.40% / -5.3065 ms; -46.51% / -5.3982 ms | PASS |
| guard/virtuals/10 | trusted / active | 2 | +19.04% / +0.7807 ms; +13.92% / +0.8062 ms; +29.77% / +1.5314 ms | yes | 4 | +13.92% / +0.6188 ms; +9.66% / +0.5797 ms; +26.63% / +1.4311 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| guard/plain-narrow/100 | isolated / default | 2 | -57.12% / -10.0189 ms; -43.90% / -8.6533 ms; -52.66% / -10.5158 ms | no | 2 | -57.12% / -10.0189 ms; -43.90% / -8.6533 ms; -52.66% / -10.5158 ms | PASS |
| guard/plain-narrow/100 | trusted / active | 2 | +4.29% / +0.2847 ms; +9.55% / +0.8705 ms; -0.23% / -0.0115 ms | yes | 4 | +3.92% / +0.2471 ms; +11.46% / +0.9306 ms; -0.37% / -0.0313 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/hydrated/100 | isolated / default | 2 | -53.98% / -19.2144 ms; -52.33% / -20.6861 ms; -51.57% / -21.2910 ms | no | 2 | -53.98% / -19.2144 ms; -52.33% / -20.6861 ms; -51.57% / -21.2910 ms | PASS |
| guard/hydrated/100 | trusted / active | 2 | +10.28% / +1.4142 ms; +4.81% / +0.8042 ms; -0.20% / -0.0356 ms | yes | 4 | +11.05% / +1.5276 ms; +5.32% / +0.9124 ms; -0.20% / -0.0356 ms | FAIL: confirmed adverse: medianMs, unresolved sign instability: cpuMsPerRequest |
| guard/global-rules/100 | isolated / default | 2 | -91.34% / -157.3633 ms; -90.75% / -166.0472 ms; -89.82% / -161.8915 ms | no | 2 | -91.34% / -157.3633 ms; -90.75% / -166.0472 ms; -89.82% / -161.8915 ms | PASS |
| guard/global-rules/100 | trusted / active | 2 | -4.93% / -0.7220 ms; -1.54% / -0.2668 ms; -7.44% / -1.3771 ms | no | 2 | -4.93% / -0.7220 ms; -1.54% / -0.2668 ms; -7.44% / -1.3771 ms | PASS |
| guard/large-config/100 | isolated / default | 2 | -54.93% / -19.0855 ms; -52.82% / -20.1075 ms; -53.11% / -21.6203 ms | no | 2 | -54.93% / -19.0855 ms; -52.82% / -20.1075 ms; -53.11% / -21.6203 ms | PASS |
| guard/large-config/100 | trusted / active | 2 | +6.72% / +0.8488 ms; +7.37% / +1.1287 ms; -3.84% / -0.6588 ms | no | 2 | +6.72% / +0.8488 ms; +7.37% / +1.1287 ms; -3.84% / -0.6588 ms | PASS |
| guard/populate/100 | isolated / default | 2 | -61.00% / -29.5107 ms; -62.13% / -34.7183 ms; -59.84% / -33.8478 ms | no | 2 | -61.00% / -29.5107 ms; -62.13% / -34.7183 ms; -59.84% / -33.8478 ms | PASS |
| guard/populate/100 | trusted / active | 2 | +16.15% / +2.3054 ms; +15.92% / +2.6780 ms; +5.61% / +1.0625 ms | yes | 4 | +16.15% / +2.3490 ms; +13.17% / +2.2966 ms; +4.27% / +0.8464 ms | FAIL: confirmed adverse: medianMs |
| guard/virtuals/100 | isolated / default | 2 | -58.51% / -28.9033 ms; -57.29% / -30.1854 ms; -56.44% / -31.7190 ms | no | 2 | -58.51% / -28.9033 ms; -57.29% / -30.1854 ms; -56.44% / -31.7190 ms | PASS |
| guard/virtuals/100 | trusted / active | 2 | +32.40% / +4.8352 ms; +24.54% / +4.2787 ms; +13.44% / +2.7847 ms | yes | 4 | +32.40% / +4.8352 ms; +27.15% / +4.6963 ms; +15.69% / +3.2121 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| read/http-id/plain-wide/100 | isolated / default | 2 | -48.18% / -2.3993 ms; -38.88% / -2.5123 ms; -47.90% / -2.7880 ms | no | 2 | -48.18% / -2.3993 ms; -38.88% / -2.5123 ms; -47.90% / -2.7880 ms | PASS |
| read/http-id/plain-wide/100 | trusted / active | 2 | +5.68% / +0.1404 ms; +1.13% / +0.0406 ms; +12.27% / +0.3476 ms | yes | 4 | +9.20% / +0.2355 ms; +1.81% / +0.0652 ms; +6.78% / +0.2032 ms | PASS |
| read/http-id/document-rules/100 | isolated / default | 2 | -42.95% / -2.0770 ms; -34.83% / -2.2746 ms; -42.65% / -2.5142 ms | no | 2 | -42.95% / -2.0770 ms; -34.83% / -2.2746 ms; -42.65% / -2.5142 ms | PASS |
| read/http-id/document-rules/100 | trusted / active | 2 | +2.41% / +0.0611 ms; -1.01% / -0.0371 ms; +4.71% / +0.1301 ms | no | 2 | +2.41% / +0.0611 ms; -1.01% / -0.0371 ms; +4.71% / +0.1301 ms | PASS |
| read/http-id/embedded/100 | isolated / default | 2 | -65.76% / -5.6956 ms; -54.18% / -5.6280 ms; -63.26% / -6.1417 ms | no | 2 | -65.76% / -5.6956 ms; -54.18% / -5.6280 ms; -63.26% / -6.1417 ms | PASS |
| read/http-id/embedded/100 | trusted / active | 2 | +5.44% / +0.1477 ms; +2.95% / +0.1200 ms; +2.63% / +0.0857 ms | yes | 4 | +4.25% / +0.1206 ms; +5.15% / +0.2081 ms; +3.85% / +0.1280 ms | PASS |
| read/http-id/hydrated/100 | isolated / default | 2 | -42.03% / -2.0068 ms; +301.33% / +17.5717 ms; -43.46% / -2.4495 ms | yes | 4 | -43.62% / -2.2137 ms; -35.27% / -2.3377 ms; -44.01% / -2.5583 ms | PASS |
| read/http-id/hydrated/100 | trusted / active | 2 | +0.90% / +0.0227 ms; -3.01% / -0.1239 ms; +1.76% / +0.0528 ms | yes | 4 | +6.04% / +0.1549 ms; +2.49% / +0.0936 ms; +3.22% / +0.0974 ms | PASS |
| read/http-id/virtuals/100 | isolated / default | 2 | -46.19% / -2.3801 ms; -41.47% / -2.8229 ms; -48.03% / -2.9976 ms | no | 2 | -46.19% / -2.3801 ms; -41.47% / -2.8229 ms; -48.03% / -2.9976 ms | PASS |
| read/http-id/virtuals/100 | trusted / active | 2 | +4.34% / +0.1146 ms; +9.25% / +0.3547 ms; +5.85% / +0.1798 ms | no | 2 | +4.34% / +0.1146 ms; +9.25% / +0.3547 ms; +5.85% / +0.1798 ms | PASS |
| read/http-filter/plain-wide/100 | isolated / default | 2 | -41.49% / -1.9421 ms; -36.69% / -2.2449 ms; -43.37% / -2.4389 ms | no | 2 | -41.49% / -1.9421 ms; -36.69% / -2.2449 ms; -43.37% / -2.4389 ms | PASS |
| read/http-filter/plain-wide/100 | trusted / active | 2 | +4.38% / +0.1084 ms; +5.03% / +0.1829 ms; +4.49% / +0.1258 ms | no | 2 | +4.38% / +0.1084 ms; +5.03% / +0.1829 ms; +4.49% / +0.1258 ms | PASS |
| read/http-filter/document-rules/100 | isolated / default | 2 | -42.00% / -2.0595 ms; -37.33% / -2.3812 ms; -44.02% / -2.4912 ms | no | 2 | -42.00% / -2.0595 ms; -37.33% / -2.3812 ms; -44.02% / -2.4912 ms | PASS |
| read/http-filter/document-rules/100 | trusted / active | 2 | +5.49% / +0.1394 ms; +11.01% / +0.3998 ms; +14.20% / +0.4025 ms | yes | 4 | +6.68% / +0.1749 ms; +6.67% / +0.2595 ms; +14.45% / +0.4125 ms | PASS |
| read/http-filter/embedded/100 | isolated / default | 2 | -64.35% / -5.6119 ms; -57.13% / -5.8277 ms; -60.92% / -5.8890 ms | no | 2 | -64.35% / -5.6119 ms; -57.13% / -5.8277 ms; -60.92% / -5.8890 ms | PASS |
| read/http-filter/embedded/100 | trusted / active | 2 | +0.76% / +0.0201 ms; +7.48% / +0.2979 ms; +2.98% / +0.0991 ms | yes | 4 | +0.76% / +0.0201 ms; +5.15% / +0.2164 ms; +2.46% / +0.0836 ms | FAIL: unresolved sign instability: medianMs |
| read/http-filter/hydrated/100 | isolated / default | 2 | -46.41% / -2.2614 ms; -35.17% / -2.1423 ms; -46.15% / -2.6351 ms | no | 2 | -46.41% / -2.2614 ms; -35.17% / -2.1423 ms; -46.15% / -2.6351 ms | PASS |
| read/http-filter/hydrated/100 | trusted / active | 2 | +5.56% / +0.1332 ms; -0.83% / -0.0390 ms; +8.67% / +0.2531 ms | yes | 4 | +4.83% / +0.1301 ms; +4.30% / +0.1644 ms; +5.35% / +0.1628 ms | FAIL: unresolved sign instability: medianMs |
| read/http-filter/virtuals/100 | isolated / default | 2 | -46.31% / -2.3732 ms; -37.16% / -2.4030 ms; -46.24% / -2.7555 ms | no | 2 | -46.31% / -2.3732 ms; -37.16% / -2.4030 ms; -46.24% / -2.7555 ms | PASS |
| read/http-filter/virtuals/100 | trusted / active | 2 | +11.02% / +0.2764 ms; +17.70% / +0.6832 ms; +16.86% / +0.4960 ms | yes | 4 | +6.47% / +0.1859 ms; +8.71% / +0.3491 ms; +5.64% / +0.1786 ms | PASS |
| helper/H0/100 | isolated / default | 2 | -43.92% / -2.0395 ms; -37.97% / -2.2717 ms; -45.20% / -2.4489 ms | no | 2 | -43.92% / -2.0395 ms; -37.97% / -2.2717 ms; -45.20% / -2.4489 ms | PASS |
| helper/H0/100 | trusted / active | 2 | +4.43% / +0.1088 ms; -0.19% / -0.0198 ms; +10.42% / +0.2974 ms | yes | 4 | +1.83% / +0.0469 ms; +0.12% / +0.0026 ms; +2.84% / +0.0849 ms | FAIL: unresolved sign instability: p95Ms |
| helper/H1/100 | isolated / default | 2 | -38.50% / -1.2650 ms; -40.43% / -2.0313 ms; -31.24% / -1.2677 ms | no | 2 | -38.50% / -1.2650 ms; -40.43% / -2.0313 ms; -31.24% / -1.2677 ms | PASS |
| helper/H1/100 | trusted / active | 2 | -37.80% / -1.2410 ms; -37.70% / -1.8481 ms; -34.90% / -1.4010 ms | no | 2 | -37.80% / -1.2410 ms; -37.70% / -1.8481 ms; -34.90% / -1.4010 ms | PASS |
| helper/H1-scoped/100 | isolated / default | 2 | -15.85% / -0.2179 ms; +9.09% / +0.1665 ms; +5.03% / +0.0773 ms | no | 2 | -15.85% / -0.2179 ms; +9.09% / +0.1665 ms; +5.03% / +0.0773 ms | PASS |
| helper/H1-scoped/100 | trusted / active | 2 | -10.87% / -0.1454 ms; -10.38% / -0.1992 ms; -12.20% / -0.1868 ms | no | 2 | -10.87% / -0.1454 ms; -10.38% / -0.1992 ms; -12.20% / -0.1868 ms | PASS |
| helper/H2/100 | isolated / default | 2 | -58.13% / -6.1225 ms; N/A component p95; -61.34% / -7.6886 ms | no | 2 | -58.13% / -6.1225 ms; N/A component p95; -61.34% / -7.6886 ms | PASS |
| helper/H2/100 | trusted / active | 2 | -21.18% / -1.1197 ms; N/A component p95; -25.62% / -1.5647 ms | no | 2 | -21.18% / -1.1197 ms; N/A component p95; -25.62% / -1.5647 ms | PASS |
| helper/H2-query/100 | isolated / default | 2 | -48.47% / -2.3774 ms; -43.35% / -2.9035 ms; -50.30% / -2.9912 ms | no | 2 | -48.47% / -2.3774 ms; -43.35% / -2.9035 ms; -50.30% / -2.9912 ms | PASS |
| helper/H2-query/100 | trusted / active | 2 | +5.62% / +0.1342 ms; +3.40% / +0.1229 ms; +11.89% / +0.3349 ms | yes | 4 | +5.62% / +0.1342 ms; +2.05% / +0.0849 ms; +8.12% / +0.2334 ms | PASS |
| helper/H2-global/100 | isolated / default | 2 | -44.11% / -2.3854 ms; -33.87% / -2.3154 ms; -40.33% / -2.5885 ms | no | 2 | -44.11% / -2.3854 ms; -33.87% / -2.3154 ms; -40.33% / -2.5885 ms | PASS |
| helper/H2-global/100 | trusted / active | 2 | +8.85% / +0.2380 ms; +14.46% / +0.5403 ms; +14.59% / +0.4507 ms | yes | 4 | +11.04% / +0.3153 ms; +14.46% / +0.5403 ms; +19.18% / +0.6127 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H4/100 | isolated / default | 2 | -4.49% / -0.1204 ms; -2.23% / -0.0869 ms; -1.48% / -0.0438 ms | no | 2 | -4.49% / -0.1204 ms; -2.23% / -0.0869 ms; -1.48% / -0.0438 ms | PASS |
| helper/H4/100 | trusted / active | 2 | +16.69% / +0.3652 ms; +19.09% / +0.5914 ms; +37.13% / +0.8276 ms | yes | 4 | +16.73% / +0.3839 ms; +21.70% / +0.7160 ms; +30.56% / +0.7332 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3/10 | isolated / default | 2 | -86.18% / -43.5238 ms; N/A component p95; -84.94% / -45.0498 ms | no | 2 | -86.18% / -43.5238 ms; N/A component p95; -84.94% / -45.0498 ms | PASS |
| helper/H3/10 | trusted / active | 2 | -27.21% / -2.4604 ms; N/A component p95; -35.06% / -4.0200 ms | no | 2 | -27.21% / -2.4604 ms; N/A component p95; -35.06% / -4.0200 ms | PASS |
| helper/H3-query/10 | isolated / default | 2 | -81.12% / -16.8944 ms; -75.55% / -17.0240 ms; -77.23% / -16.9481 ms | no | 2 | -81.12% / -16.8944 ms; -75.55% / -17.0240 ms; -77.23% / -16.9481 ms | PASS |
| helper/H3-query/10 | trusted / active | 2 | -0.88% / -0.0332 ms; -4.64% / -0.2485 ms; -1.86% / -0.0890 ms | yes | 4 | -0.88% / -0.0332 ms; -3.25% / -0.1788 ms; -2.74% / -0.1387 ms | PASS |
| helper/H3-global/10 | isolated / default | 2 | -74.28% / -21.5683 ms; -69.18% / -22.2572 ms; -67.47% / -20.5454 ms | no | 2 | -74.28% / -21.5683 ms; -69.18% / -22.2572 ms; -67.47% / -20.5454 ms | PASS |
| helper/H3-global/10 | trusted / active | 2 | +39.66% / +2.0743 ms; +10.51% / +0.8426 ms; +41.29% / +2.7644 ms | yes | 4 | +41.47% / +2.1664 ms; +22.87% / +1.6534 ms; +42.16% / +2.8204 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3/100 | isolated / default | 2 | -93.03% / -404.1434 ms; N/A component p95; -92.67% / -424.9387 ms | no | 2 | -93.03% / -404.1434 ms; N/A component p95; -92.67% / -424.9387 ms | PASS |
| helper/H3/100 | trusted / active | 2 | -38.89% / -16.3587 ms; N/A component p95; -43.48% / -22.0047 ms | no | 2 | -38.89% / -16.3587 ms; N/A component p95; -43.48% / -22.0047 ms | PASS |
| helper/H3-query/100 | isolated / default | 2 | -91.03% / -161.7045 ms; -90.45% / -170.7768 ms; -90.29% / -167.7654 ms | no | 2 | -91.03% / -161.7045 ms; -90.45% / -170.7768 ms; -90.29% / -167.7654 ms | PASS |
| helper/H3-query/100 | trusted / active | 2 | -6.35% / -0.9419 ms; -8.95% / -1.5461 ms; -10.47% / -1.8477 ms | no | 2 | -6.35% / -0.9419 ms; -8.95% / -1.5461 ms; -10.47% / -1.8477 ms | PASS |
| helper/H3-global/100 | isolated / default | 2 | -81.73% / -203.2894 ms; -81.86% / -224.5603 ms; -79.01% / -207.8771 ms | no | 2 | -81.73% / -203.2894 ms; -81.86% / -224.5603 ms; -79.01% / -207.8771 ms | PASS |
| helper/H3-global/100 | trusted / active | 2 | +64.65% / +17.6629 ms; +65.18% / +19.6328 ms; +68.14% / +22.2730 ms | yes | 4 | +62.12% / +17.4852 ms; +63.34% / +20.0334 ms; +66.76% / +22.6764 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| native-adapter/direct-read/100 | isolated / default | 2 | -78.78% / -7.6718 ms; -71.71% / -8.0163 ms; -71.53% / -7.5489 ms | no | 2 | -78.78% / -7.6718 ms; -71.71% / -8.0163 ms; -71.53% / -7.5489 ms | PASS |
| native-adapter/direct-read/100 | trusted / active | 2 | -1.86% / -0.0365 ms; +9.03% / +0.2505 ms; +8.23% / +0.2054 ms | no | 2 | -1.86% / -0.0365 ms; +9.03% / +0.2505 ms; +8.23% / +0.2054 ms | PASS |
| native-adapter/direct-list/100 | isolated / default | 2 | -96.64% / -723.7263 ms; -96.48% / -763.1295 ms; -96.29% / -749.7157 ms | no | 2 | -96.64% / -723.7263 ms; -96.48% / -763.1295 ms; -96.29% / -749.7157 ms | PASS |
| native-adapter/direct-list/100 | trusted / active | 2 | -12.86% / -2.5281 ms; -15.21% / -3.4844 ms; -17.46% / -4.3908 ms | no | 2 | -12.86% / -2.5281 ms; -15.21% / -3.4844 ms; -17.46% / -4.3908 ms | PASS |
| facts/owner-only/100 | isolated / default | 2 | -91.74% / -168.2487 ms; -91.68% / -193.5061 ms; -91.11% / -178.4626 ms | no | 2 | -91.74% / -168.2487 ms; -91.68% / -193.5061 ms; -91.11% / -178.4626 ms | PASS |
| facts/owner-only/100 | trusted / active | 2 | -10.48% / -1.4703 ms; -7.81% / -1.2508 ms; -14.72% / -2.4304 ms | no | 2 | -10.48% / -1.4703 ms; -7.81% / -1.2508 ms; -14.72% / -2.4304 ms | PASS |
| facts/unused-checksum/100 | isolated / default | 2 | -86.03% / -157.7686 ms; -85.68% / -167.9492 ms; -85.47% / -163.6818 ms | no | 2 | -86.03% / -157.7686 ms; -85.68% / -167.9492 ms; -85.47% / -163.6818 ms | PASS |
| facts/unused-checksum/100 | trusted / active | 2 | -7.24% / -1.8395 ms; -10.05% / -2.9102 ms; -10.96% / -3.1107 ms | no | 2 | -7.24% / -1.8395 ms; -10.05% / -2.9102 ms; -10.96% / -3.1107 ms | PASS |
| retention/held-released/100/4 | isolated / default | 2 | -77.09% / -24.9788 ms; -73.23% / -24.9988 ms; -72.91% / -25.3080 ms | no | 2 | -77.09% / -24.9788 ms; -73.23% / -24.9988 ms; -72.91% / -25.3080 ms | PASS |
| retention/held-released/100/4 | trusted / active | 2 | -6.08% / -0.3748 ms; -6.71% / -0.5471 ms; -7.79% / -0.6013 ms | no | 2 | -6.08% / -0.3748 ms; -6.71% / -0.5471 ms; -7.79% / -0.6013 ms | PASS |
| retention/held-released/100/24 | isolated / default | 2 | -91.32% / -161.9940 ms; -90.73% / -167.5554 ms; -90.49% / -167.5812 ms | no | 2 | -91.32% / -161.9940 ms; -90.73% / -167.5554 ms; -90.49% / -167.5812 ms | PASS |
| retention/held-released/100/24 | trusted / active | 2 | -9.20% / -1.3059 ms; -10.51% / -1.7242 ms; -14.52% / -2.4090 ms | no | 2 | -9.20% / -1.3059 ms; -10.51% / -1.7242 ms; -14.52% / -2.4090 ms | PASS |
| retention/held-released/100/48 | isolated / default | 2 | -95.38% / -531.3308 ms; -95.22% / -554.3833 ms; -95.04% / -552.8937 ms | no | 2 | -95.38% / -531.3308 ms; -95.22% / -554.3833 ms; -95.04% / -552.8937 ms | PASS |
| retention/held-released/100/48 | trusted / active | 2 | -7.26% / -1.7050 ms; -4.74% / -1.2377 ms; -8.06% / -2.1150 ms | no | 2 | -7.26% / -1.7050 ms; -4.74% / -1.2377 ms; -8.06% / -2.1150 ms | PASS |
