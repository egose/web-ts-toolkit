> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# All triggered comparisons: initial, repeat-only and final

Negative = candidate lower. Repeat-only N=2 is descriptive, NEVER a substitute for the all-four gate. No observations discarded; individual pairs in PAIR-DETAILS.md. No repeat means final N=2.

| Case | Profile | Metric | Initial N=2 | Trigger | Repeat-only N | Repeat-only delta | Final N | Final delta | Final outcome |
|---|---|---|---|---|---|---|---|---|---|
| primary/plain-wide/100 | trusted | medianMs | +0.65% / +0.1103 ms | mixed signs: medianMs, mixed signs: p95Ms, material adverse pair: medianMs | 2 | -11.55% / -1.4106 ms | 4 | -11.20% / -1.3671 ms | PASS |
| primary/plain-wide/100 | trusted | p95Ms | -5.60% / -0.7657 ms | mixed signs: medianMs, mixed signs: p95Ms, material adverse pair: medianMs | 2 | -13.79% / -2.0263 ms | 4 | -12.75% / -1.8448 ms | PASS |
| primary/plain-wide/100 | trusted | cpuMsPerRequest | -10.81% / -1.7439 ms | mixed signs: medianMs, mixed signs: p95Ms, material adverse pair: medianMs | 2 | -19.86% / -3.1682 ms | 4 | -19.08% / -3.0237 ms | PASS |
| guard/plain-narrow/10 | trusted | medianMs | -0.77% / -0.0248 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest, material adverse pair: cpuMsPerRequest | 2 | -3.91% / -0.1199 ms | 4 | -2.00% / -0.0610 ms | PASS |
| guard/plain-narrow/10 | trusted | p95Ms | +6.31% / +0.2629 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest, material adverse pair: cpuMsPerRequest | 2 | +8.79% / +0.3654 ms | 4 | +8.79% / +0.3654 ms | PASS |
| guard/plain-narrow/10 | trusted | cpuMsPerRequest | +6.86% / +0.2549 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest, material adverse pair: cpuMsPerRequest | 2 | +6.33% / +0.2458 ms | 4 | +6.33% / +0.2458 ms | PASS |
| guard/populate/10 | trusted | medianMs | +0.34% / +0.0197 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -8.73% / -0.4894 ms | 4 | -2.41% / -0.1263 ms | PASS |
| guard/populate/10 | trusted | p95Ms | -8.98% / -0.6883 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -7.40% / -0.5335 ms | 4 | -7.40% / -0.5335 ms | PASS |
| guard/populate/10 | trusted | cpuMsPerRequest | -5.40% / -0.3574 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -1.13% / -0.1044 ms | 4 | -5.40% / -0.3574 ms | PASS |
| guard/virtuals/10 | trusted | medianMs | +3.15% / +0.1354 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | +1.40% / +0.0633 ms | 4 | +1.90% / +0.0845 ms | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/virtuals/10 | trusted | p95Ms | -8.61% / -0.6039 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | +4.44% / +0.3043 ms | 4 | -3.38% / -0.2095 ms | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/virtuals/10 | trusted | cpuMsPerRequest | -0.77% / -0.0481 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -1.03% / -0.0620 ms | 4 | -1.03% / -0.0620 ms | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/virtuals/100 | trusted | medianMs | +7.30% / +1.1215 ms | material adverse pair: medianMs | 2 | +7.86% / +1.1666 ms | 4 | +7.86% / +1.1666 ms | PASS |
| guard/virtuals/100 | trusted | p95Ms | +5.64% / +1.0082 ms | material adverse pair: medianMs | 2 | +7.07% / +1.2487 ms | 4 | +5.64% / +1.0082 ms | PASS |
| guard/virtuals/100 | trusted | cpuMsPerRequest | -1.27% / -0.2666 ms | material adverse pair: medianMs | 2 | -1.26% / -0.2552 ms | 4 | -1.27% / -0.2666 ms | PASS |
| read/http-id/plain-wide/100 | trusted | medianMs | +3.61% / +0.0914 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -4.77% / -0.1428 ms | 4 | +1.99% / +0.0488 ms | PASS |
| read/http-id/plain-wide/100 | trusted | p95Ms | -2.13% / -0.0812 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -8.67% / -0.3487 ms | 4 | -5.99% / -0.2243 ms | PASS |
| read/http-id/plain-wide/100 | trusted | cpuMsPerRequest | +4.12% / +0.1245 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -4.60% / -0.1437 ms | 4 | -0.42% / -0.0122 ms | PASS |
| read/http-id/document-rules/100 | trusted | medianMs | +2.05% / +0.0540 ms | mixed signs: p95Ms | 2 | -1.58% / -0.0431 ms | 4 | +2.05% / +0.0540 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-id/document-rules/100 | trusted | p95Ms | +1.44% / +0.0488 ms | mixed signs: p95Ms | 2 | +0.83% / +0.0324 ms | 4 | +1.44% / +0.0488 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-id/document-rules/100 | trusted | cpuMsPerRequest | +5.60% / +0.1678 ms | mixed signs: p95Ms | 2 | +0.24% / +0.0046 ms | 4 | +1.48% / +0.0427 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-id/embedded/100 | trusted | medianMs | -1.74% / -0.0520 ms | mixed signs: cpuMsPerRequest | 2 | -4.13% / -0.1159 ms | 4 | -2.67% / -0.0769 ms | PASS |
| read/http-id/embedded/100 | trusted | p95Ms | -6.36% / -0.2744 ms | mixed signs: cpuMsPerRequest | 2 | -4.97% / -0.2332 ms | 4 | -6.36% / -0.2744 ms | PASS |
| read/http-id/embedded/100 | trusted | cpuMsPerRequest | +1.80% / +0.0613 ms | mixed signs: cpuMsPerRequest | 2 | -7.64% / -0.2799 ms | 4 | -1.82% / -0.0613 ms | PASS |
| read/http-id/hydrated/100 | trusted | medianMs | +4.00% / +0.1018 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -1.46% / -0.0362 ms | 4 | -0.36% / -0.0093 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| read/http-id/hydrated/100 | trusted | p95Ms | -0.11% / -0.0060 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -9.95% / -0.3991 ms | 4 | -5.81% / -0.2233 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| read/http-id/hydrated/100 | trusted | cpuMsPerRequest | +7.44% / +0.2239 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -2.79% / -0.0829 ms | 4 | +0.03% / +0.0005 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| read/http-id/virtuals/100 | trusted | medianMs | +0.65% / +0.0183 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | +1.29% / +0.0329 ms | 4 | +0.65% / +0.0183 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| read/http-id/virtuals/100 | trusted | p95Ms | -2.88% / -0.1219 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -1.61% / -0.0822 ms | 4 | -2.88% / -0.1219 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| read/http-id/virtuals/100 | trusted | cpuMsPerRequest | -2.17% / -0.0713 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | +2.49% / +0.0799 ms | 4 | -0.86% / -0.0268 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| read/http-filter/document-rules/100 | trusted | medianMs | -2.11% / -0.0598 ms | mixed signs: medianMs | 2 | -2.99% / -0.0823 ms | 4 | -2.99% / -0.0823 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/document-rules/100 | trusted | p95Ms | +5.72% / +0.2202 ms | mixed signs: medianMs | 2 | -9.59% / -0.3738 ms | 4 | -2.15% / -0.0773 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/document-rules/100 | trusted | cpuMsPerRequest | +2.55% / +0.0743 ms | mixed signs: medianMs | 2 | -3.09% / -0.0940 ms | 4 | +1.31% / +0.0372 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/embedded/100 | trusted | medianMs | -2.20% / -0.0625 ms | mixed signs: p95Ms | 2 | -2.86% / -0.0827 ms | 4 | -2.20% / -0.0625 ms | PASS |
| read/http-filter/embedded/100 | trusted | p95Ms | +0.85% / +0.0341 ms | mixed signs: p95Ms | 2 | -8.29% / -0.3589 ms | 4 | -3.42% / -0.1429 ms | PASS |
| read/http-filter/embedded/100 | trusted | cpuMsPerRequest | -3.72% / -0.1268 ms | mixed signs: p95Ms | 2 | -3.40% / -0.1132 ms | 4 | -3.72% / -0.1268 ms | PASS |
| read/http-filter/virtuals/100 | trusted | medianMs | +1.03% / +0.0312 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -2.72% / -0.0753 ms | 4 | -1.37% / -0.0375 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/virtuals/100 | trusted | p95Ms | +3.39% / +0.1200 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -0.30% / -0.0178 ms | 4 | +0.72% / +0.0175 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/virtuals/100 | trusted | cpuMsPerRequest | +3.08% / +0.1013 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -7.41% / -0.2504 ms | 4 | -3.18% / -0.1019 ms | FAIL: unresolved sign instability: p95Ms |
| helper/H0/100 | trusted | medianMs | -2.68% / -0.0705 ms | mixed signs: p95Ms | 2 | -5.77% / -0.1519 ms | 4 | -4.59% / -0.1215 ms | PASS |
| helper/H0/100 | trusted | p95Ms | -1.98% / -0.0857 ms | mixed signs: p95Ms | 2 | -7.00% / -0.2736 ms | 4 | -7.00% / -0.2736 ms | PASS |
| helper/H0/100 | trusted | cpuMsPerRequest | -2.25% / -0.0656 ms | mixed signs: p95Ms | 2 | -9.37% / -0.2967 ms | 4 | -4.65% / -0.1376 ms | PASS |
| helper/H1-scoped/100 | isolated | medianMs | -23.28% / -0.3284 ms | mixed signs: p95Ms | 2 | -27.40% / -0.4037 ms | 4 | -24.90% / -0.3535 ms | PASS |
| helper/H1-scoped/100 | isolated | p95Ms | -4.51% / -0.0939 ms | mixed signs: p95Ms | 2 | -27.03% / -0.5823 ms | 4 | -16.14% / -0.3252 ms | PASS |
| helper/H1-scoped/100 | isolated | cpuMsPerRequest | -13.95% / -0.2267 ms | mixed signs: p95Ms | 2 | -33.27% / -0.6061 ms | 4 | -26.30% / -0.4328 ms | PASS |
| helper/H2-query/100 | trusted | medianMs | -4.50% / -0.1209 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -2.97% / -0.0778 ms | 4 | -4.50% / -0.1209 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| helper/H2-query/100 | trusted | p95Ms | +0.38% / +0.0136 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -5.46% / -0.2191 ms | 4 | -2.08% / -0.0823 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| helper/H2-query/100 | trusted | cpuMsPerRequest | +0.70% / +0.0227 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -2.44% / -0.0731 ms | 4 | -0.69% / -0.0205 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| helper/H2-global/100 | trusted | medianMs | +0.70% / +0.0187 ms | mixed signs: medianMs | 2 | +4.14% / +0.1055 ms | 4 | +1.07% / +0.0291 ms | FAIL: unresolved sign instability: medianMs |
| helper/H2-global/100 | trusted | p95Ms | -2.55% / -0.1047 ms | mixed signs: medianMs | 2 | +6.16% / +0.2293 ms | 4 | -0.35% / -0.0146 ms | FAIL: unresolved sign instability: medianMs |
| helper/H2-global/100 | trusted | cpuMsPerRequest | +5.67% / +0.1829 ms | mixed signs: medianMs | 2 | +10.18% / +0.3198 ms | 4 | +7.83% / +0.2508 ms | FAIL: unresolved sign instability: medianMs |
| helper/H4/100 | trusted | medianMs | +4.84% / +0.0839 ms | mixed signs: medianMs, material adverse pair: cpuMsPerRequest | 2 | +20.73% / +0.4576 ms | 4 | +16.96% / +0.3770 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H4/100 | trusted | p95Ms | +7.13% / +0.2406 ms | mixed signs: medianMs, material adverse pair: cpuMsPerRequest | 2 | +20.49% / +0.6266 ms | 4 | +10.94% / +0.3703 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H4/100 | trusted | cpuMsPerRequest | +15.88% / +0.3855 ms | mixed signs: medianMs, material adverse pair: cpuMsPerRequest | 2 | +33.85% / +0.7849 ms | 4 | +27.09% / +0.6161 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3-global/10 | trusted | medianMs | +12.31% / +0.6676 ms | mixed signs: p95Ms, material adverse pair: cpuMsPerRequest | 2 | +7.68% / +0.4229 ms | 4 | +11.49% / +0.6267 ms | FAIL: confirmed adverse: cpuMsPerRequest, unresolved sign instability: p95Ms |
| helper/H3-global/10 | trusted | p95Ms | +1.46% / +0.1213 ms | mixed signs: p95Ms, material adverse pair: cpuMsPerRequest | 2 | +0.42% / +0.0039 ms | 4 | +1.46% / +0.1213 ms | FAIL: confirmed adverse: cpuMsPerRequest, unresolved sign instability: p95Ms |
| helper/H3-global/10 | trusted | cpuMsPerRequest | +21.48% / +1.4746 ms | mixed signs: p95Ms, material adverse pair: cpuMsPerRequest | 2 | +15.07% / +1.0507 ms | 4 | +19.04% / +1.2963 ms | FAIL: confirmed adverse: cpuMsPerRequest, unresolved sign instability: p95Ms |
| helper/H3-global/100 | trusted | medianMs | +13.16% / +3.7564 ms | material adverse pair: medianMs, material adverse pair: cpuMsPerRequest | 2 | +11.19% / +3.2966 ms | 4 | +12.85% / +3.6926 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | p95Ms | +13.90% / +4.3507 ms | material adverse pair: medianMs, material adverse pair: cpuMsPerRequest | 2 | +14.13% / +4.5949 ms | 4 | +13.90% / +4.3507 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | cpuMsPerRequest | +15.04% / +5.2876 ms | material adverse pair: medianMs, material adverse pair: cpuMsPerRequest | 2 | +16.50% / +5.8357 ms | 4 | +15.54% / +5.5210 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| native-adapter/direct-read/100 | trusted | medianMs | -1.10% / -0.0202 ms | mixed signs: medianMs, mixed signs: cpuMsPerRequest | 2 | +1.44% / +0.0255 ms | 4 | -0.47% / -0.0092 ms | FAIL: unresolved sign instability: medianMs |
| native-adapter/direct-read/100 | trusted | p95Ms | +5.00% / +0.1467 ms | mixed signs: medianMs, mixed signs: cpuMsPerRequest | 2 | +4.45% / +0.1388 ms | 4 | +5.00% / +0.1467 ms | FAIL: unresolved sign instability: medianMs |
| native-adapter/direct-read/100 | trusted | cpuMsPerRequest | +2.56% / +0.0628 ms | mixed signs: medianMs, mixed signs: cpuMsPerRequest | 2 | +1.48% / +0.0428 ms | 4 | +1.48% / +0.0428 ms | FAIL: unresolved sign instability: medianMs |
