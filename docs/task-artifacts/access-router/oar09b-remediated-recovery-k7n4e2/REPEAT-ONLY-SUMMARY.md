> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Every triggered comparison: initial, repeat-only and final

Negative = candidate lower. Repeat-only N=2 is descriptive, never a substitute for the fixed all-four-pair gate. No observations discarded. Exact individual pairs remain in PAIR-DETAILS.md.

| Case | Profile | Metric | Initial N=2 | Repeat-only N=2 (3,4) | Final N=4 | Final outcome |
|---|---|---|---|---|---|---|
| guard/plain-narrow/10 | trusted | medianMs | -4.30% / -0.1324 ms | -1.90% / -0.0586 ms | -2.58% / -0.0784 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/plain-narrow/10 | trusted | p95Ms | -18.38% / -1.0981 ms | -4.78% / -0.2308 ms | -7.69% / -0.3557 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/plain-narrow/10 | trusted | cpuMsPerRequest | -0.04% / -0.0049 ms | +0.44% / +0.0141 ms | -0.04% / -0.0049 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/hydrated/10 | trusted | medianMs | -5.70% / -0.2449 ms | +0.85% / +0.0333 ms | -2.63% / -0.1124 ms | PASS |
| guard/hydrated/10 | trusted | p95Ms | -3.35% / -0.2023 ms | -9.18% / -0.5683 ms | -7.98% / -0.4709 ms | PASS |
| guard/hydrated/10 | trusted | cpuMsPerRequest | -6.86% / -0.4015 ms | -5.70% / -0.3377 ms | -6.77% / -0.4000 ms | PASS |
| guard/global-rules/10 | trusted | medianMs | -7.13% / -0.2970 ms | -6.75% / -0.2795 ms | -6.75% / -0.2795 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/global-rules/10 | trusted | p95Ms | -13.35% / -0.8125 ms | -9.46% / -0.5545 ms | -13.35% / -0.8125 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/global-rules/10 | trusted | cpuMsPerRequest | -9.05% / -0.5508 ms | -1.94% / -0.1379 ms | -2.96% / -0.1857 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/large-config/10 | trusted | medianMs | -2.67% / -0.1083 ms | -6.08% / -0.2575 ms | -2.84% / -0.1157 ms | PASS |
| guard/large-config/10 | trusted | p95Ms | -1.45% / -0.0803 ms | -10.98% / -0.6484 ms | -7.73% / -0.4537 ms | PASS |
| guard/large-config/10 | trusted | cpuMsPerRequest | -1.51% / -0.0833 ms | -3.22% / -0.1786 ms | -2.55% / -0.1416 ms | PASS |
| guard/virtuals/10 | trusted | medianMs | -0.51% / -0.0239 ms | +10.60% / +0.4412 ms | +5.48% / +0.2410 ms | PASS |
| guard/virtuals/10 | trusted | p95Ms | -14.84% / -1.0491 ms | +2.54% / +0.0659 ms | -12.73% / -0.8828 ms | PASS |
| guard/virtuals/10 | trusted | cpuMsPerRequest | -4.59% / -0.2787 ms | +17.76% / +0.9294 ms | +8.97% / +0.4769 ms | PASS |
| guard/populate/100 | trusted | medianMs | -5.33% / -0.8020 ms | -7.07% / -1.0650 ms | -6.23% / -0.9347 ms | PASS |
| guard/populate/100 | trusted | p95Ms | +0.64% / +0.0972 ms | -6.73% / -1.2059 ms | -4.58% / -0.8040 ms | PASS |
| guard/populate/100 | trusted | cpuMsPerRequest | -10.73% / -2.1064 ms | -13.79% / -2.7209 ms | -12.26% / -2.4207 ms | PASS |
| guard/virtuals/100 | trusted | medianMs | +6.52% / +0.9992 ms | +6.89% / +1.0323 ms | +6.89% / +1.0323 ms | PASS |
| guard/virtuals/100 | trusted | p95Ms | +4.22% / +0.7502 ms | +7.34% / +1.2843 ms | +6.83% / +1.1973 ms | PASS |
| guard/virtuals/100 | trusted | cpuMsPerRequest | -1.93% / -0.3985 ms | -1.91% / -0.3897 ms | -1.91% / -0.3897 ms | PASS |
| read/http-id/plain-wide/100 | trusted | medianMs | +5.46% / +0.1414 ms | +1.34% / +0.0320 ms | +4.15% / +0.1060 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-id/plain-wide/100 | trusted | p95Ms | -2.37% / -0.0981 ms | +0.46% / +0.0160 ms | -0.56% / -0.0213 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-id/plain-wide/100 | trusted | cpuMsPerRequest | +1.90% / +0.0572 ms | +2.38% / +0.0704 ms | +2.14% / +0.0645 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-id/document-rules/100 | trusted | medianMs | -0.68% / -0.0204 ms | +4.32% / +0.1103 ms | +2.31% / +0.0604 ms | PASS |
| read/http-id/document-rules/100 | trusted | p95Ms | +1.68% / +0.0615 ms | +3.42% / +0.1275 ms | +3.10% / +0.1140 ms | PASS |
| read/http-id/document-rules/100 | trusted | cpuMsPerRequest | +1.64% / +0.0473 ms | -0.72% / -0.0329 ms | +1.64% / +0.0473 ms | PASS |
| read/http-id/embedded/100 | trusted | medianMs | +0.63% / +0.0181 ms | -3.27% / -0.0957 ms | -1.29% / -0.0366 ms | PASS |
| read/http-id/embedded/100 | trusted | p95Ms | -4.42% / -0.1943 ms | -4.86% / -0.2160 ms | -4.86% / -0.2160 ms | PASS |
| read/http-id/embedded/100 | trusted | cpuMsPerRequest | -0.07% / -0.0029 ms | -1.24% / -0.0420 ms | -1.23% / -0.0420 ms | PASS |
| read/http-id/hydrated/100 | trusted | medianMs | -1.52% / -0.0438 ms | +4.85% / +0.1273 ms | +3.08% / +0.0816 ms | PASS |
| read/http-id/hydrated/100 | trusted | p95Ms | +5.06% / +0.1815 ms | +6.94% / +0.2555 ms | +5.06% / +0.1815 ms | PASS |
| read/http-id/hydrated/100 | trusted | cpuMsPerRequest | +3.63% / +0.1106 ms | +14.25% / +0.4292 ms | +7.80% / +0.2381 ms | PASS |
| read/http-id/virtuals/100 | trusted | medianMs | +2.51% / +0.0694 ms | -0.03% / -0.0015 ms | +1.84% / +0.0503 ms | PASS |
| read/http-id/virtuals/100 | trusted | p95Ms | -0.97% / -0.0474 ms | +7.52% / +0.2916 ms | +2.65% / +0.1031 ms | PASS |
| read/http-id/virtuals/100 | trusted | cpuMsPerRequest | +0.86% / +0.0265 ms | +2.97% / +0.0954 ms | +2.81% / +0.0893 ms | PASS |
| read/http-filter/plain-wide/100 | trusted | medianMs | -0.68% / -0.0184 ms | +1.39% / +0.0361 ms | +0.29% / +0.0078 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| read/http-filter/plain-wide/100 | trusted | p95Ms | +2.33% / +0.0880 ms | -3.17% / -0.1386 ms | +0.76% / +0.0281 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| read/http-filter/plain-wide/100 | trusted | cpuMsPerRequest | -2.15% / -0.0737 ms | -2.25% / -0.0803 ms | -2.15% / -0.0737 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| read/http-filter/hydrated/100 | trusted | medianMs | +1.58% / +0.0421 ms | +2.33% / +0.0622 ms | +1.58% / +0.0421 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/hydrated/100 | trusted | p95Ms | +1.66% / +0.0626 ms | -0.98% / -0.0458 ms | +0.41% / +0.0173 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/hydrated/100 | trusted | cpuMsPerRequest | +2.48% / +0.0749 ms | +8.46% / +0.2613 ms | +3.14% / +0.0966 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/virtuals/100 | trusted | medianMs | +3.98% / +0.1114 ms | -0.51% / -0.0156 ms | +2.47% / +0.0701 ms | PASS |
| read/http-filter/virtuals/100 | trusted | p95Ms | +1.55% / +0.0495 ms | +3.47% / +0.1403 ms | +3.47% / +0.1403 ms | PASS |
| read/http-filter/virtuals/100 | trusted | cpuMsPerRequest | +3.47% / +0.1106 ms | +1.35% / +0.0437 ms | +1.72% / +0.0556 ms | PASS |
| helper/H0/100 | trusted | medianMs | -5.15% / -0.1386 ms | +0.17% / +0.0042 ms | -0.86% / -0.0228 ms | PASS |
| helper/H0/100 | trusted | p95Ms | +3.32% / +0.1266 ms | +2.08% / +0.0785 ms | +3.32% / +0.1266 ms | PASS |
| helper/H0/100 | trusted | cpuMsPerRequest | -4.11% / -0.1364 ms | +1.42% / +0.0413 ms | +0.64% / +0.0187 ms | PASS |
| helper/H2-query/100 | trusted | medianMs | -1.20% / -0.0317 ms | -0.76% / -0.0205 ms | -1.20% / -0.0317 ms | PASS |
| helper/H2-query/100 | trusted | p95Ms | +0.98% / +0.0287 ms | +2.64% / +0.1032 ms | +2.64% / +0.0951 ms | PASS |
| helper/H2-query/100 | trusted | cpuMsPerRequest | +0.33% / +0.0097 ms | -7.05% / -0.2317 ms | -3.64% / -0.1189 ms | PASS |
| helper/H4/100 | trusted | medianMs | +17.30% / +0.3961 ms | +15.44% / +0.3538 ms | +16.70% / +0.3811 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H4/100 | trusted | p95Ms | +24.83% / +0.7687 ms | +22.03% / +0.7156 ms | +22.03% / +0.7156 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H4/100 | trusted | cpuMsPerRequest | +26.88% / +0.6294 ms | +20.26% / +0.4910 ms | +26.69% / +0.6207 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3-global/10 | trusted | medianMs | +24.08% / +1.2958 ms | +17.52% / +0.9711 ms | +20.67% / +1.1487 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/10 | trusted | p95Ms | +16.47% / +1.2245 ms | +9.53% / +0.7202 ms | +10.84% / +0.8018 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/10 | trusted | cpuMsPerRequest | +27.47% / +1.8801 ms | +22.27% / +1.5453 ms | +23.86% / +1.6388 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | medianMs | +24.35% / +6.9525 ms | +24.98% / +7.2697 ms | +24.98% / +7.2173 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | p95Ms | +21.35% / +6.7144 ms | +25.67% / +8.0447 ms | +24.14% / +7.4754 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | cpuMsPerRequest | +24.42% / +8.4499 ms | +25.89% / +9.0722 ms | +25.09% / +8.7260 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: p95Ms, confirmed adverse: cpuMsPerRequest |
| native-adapter/direct-read/100 | trusted | medianMs | +1.83% / +0.0358 ms | -0.90% / -0.0180 ms | -0.90% / -0.0180 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| native-adapter/direct-read/100 | trusted | p95Ms | +2.31% / +0.0719 ms | +0.10% / +0.0031 ms | +1.01% / +0.0308 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| native-adapter/direct-read/100 | trusted | cpuMsPerRequest | -2.88% / -0.0816 ms | -0.49% / -0.0146 ms | -0.49% / -0.0146 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
