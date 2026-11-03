> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# All 90 comparisons: initial, repeat-only and final

Negative = candidate lower. Repeat-only N=2 is descriptive, NEVER a substitute for the all-four gate. No observations discarded; individual pairs in PAIR-DETAILS.md. No repeat means final N=2.

| Case | Profile | Metric | Initial N=2 | Trigger | Repeat-only N | Repeat-only delta | Final N | Final delta | Final outcome |
|---|---|---|---|---|---|---|---|---|---|
| primary/plain-wide/100 | isolated | medianMs | -63.75% / -21.8186 ms | none | 0 | — | 2 | -63.75% / -21.8186 ms | PASS |
| primary/plain-wide/100 | isolated | p95Ms | -62.32% / -23.7348 ms | none | 0 | — | 2 | -62.32% / -23.7348 ms | PASS |
| primary/plain-wide/100 | isolated | cpuMsPerRequest | -62.70% / -24.8806 ms | none | 0 | — | 2 | -62.70% / -24.8806 ms | PASS |
| primary/plain-wide/100 | trusted | medianMs | +0.65% / +0.1103 ms | mixed signs: medianMs, mixed signs: p95Ms, material adverse pair: medianMs | 2 | -11.55% / -1.4106 ms | 4 | -11.20% / -1.3671 ms | PASS |
| primary/plain-wide/100 | trusted | p95Ms | -5.60% / -0.7657 ms | mixed signs: medianMs, mixed signs: p95Ms, material adverse pair: medianMs | 2 | -13.79% / -2.0263 ms | 4 | -12.75% / -1.8448 ms | PASS |
| primary/plain-wide/100 | trusted | cpuMsPerRequest | -10.81% / -1.7439 ms | mixed signs: medianMs, mixed signs: p95Ms, material adverse pair: medianMs | 2 | -19.86% / -3.1682 ms | 4 | -19.08% / -3.0237 ms | PASS |
| primary/document-rules/100 | isolated | medianMs | -92.41% / -165.1150 ms | none | 0 | — | 2 | -92.41% / -165.1150 ms | PASS |
| primary/document-rules/100 | isolated | p95Ms | -91.90% / -180.0678 ms | none | 0 | — | 2 | -91.90% / -180.0678 ms | PASS |
| primary/document-rules/100 | isolated | cpuMsPerRequest | -91.65% / -173.5365 ms | none | 0 | — | 2 | -91.65% / -173.5365 ms | PASS |
| primary/document-rules/100 | trusted | medianMs | -23.02% / -3.2645 ms | none | 0 | — | 2 | -23.02% / -3.2645 ms | PASS |
| primary/document-rules/100 | trusted | p95Ms | -27.16% / -4.6602 ms | none | 0 | — | 2 | -27.16% / -4.6602 ms | PASS |
| primary/document-rules/100 | trusted | cpuMsPerRequest | -28.48% / -5.0247 ms | none | 0 | — | 2 | -28.48% / -5.0247 ms | PASS |
| primary/embedded/100 | isolated | medianMs | -96.21% / -508.2274 ms | none | 0 | — | 2 | -96.21% / -508.2274 ms | PASS |
| primary/embedded/100 | isolated | p95Ms | -95.93% / -521.1703 ms | none | 0 | — | 2 | -95.93% / -521.1703 ms | PASS |
| primary/embedded/100 | isolated | cpuMsPerRequest | -95.78% / -531.5988 ms | none | 0 | — | 2 | -95.78% / -531.5988 ms | PASS |
| primary/embedded/100 | trusted | medianMs | -24.48% / -5.7953 ms | none | 0 | — | 2 | -24.48% / -5.7953 ms | PASS |
| primary/embedded/100 | trusted | p95Ms | -22.73% / -6.1421 ms | none | 0 | — | 2 | -22.73% / -6.1421 ms | PASS |
| primary/embedded/100 | trusted | cpuMsPerRequest | -27.92% / -8.1394 ms | none | 0 | — | 2 | -27.92% / -8.1394 ms | PASS |
| guard/plain-narrow/10 | isolated | medianMs | -30.97% / -1.4454 ms | none | 0 | — | 2 | -30.97% / -1.4454 ms | PASS |
| guard/plain-narrow/10 | isolated | p95Ms | -27.38% / -1.7909 ms | none | 0 | — | 2 | -27.38% / -1.7909 ms | PASS |
| guard/plain-narrow/10 | isolated | cpuMsPerRequest | -30.57% / -2.0577 ms | none | 0 | — | 2 | -30.57% / -2.0577 ms | PASS |
| guard/plain-narrow/10 | trusted | medianMs | -0.77% / -0.0248 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest, material adverse pair: cpuMsPerRequest | 2 | -3.91% / -0.1199 ms | 4 | -2.00% / -0.0610 ms | PASS |
| guard/plain-narrow/10 | trusted | p95Ms | +6.31% / +0.2629 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest, material adverse pair: cpuMsPerRequest | 2 | +8.79% / +0.3654 ms | 4 | +8.79% / +0.3654 ms | PASS |
| guard/plain-narrow/10 | trusted | cpuMsPerRequest | +6.86% / +0.2549 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest, material adverse pair: cpuMsPerRequest | 2 | +6.33% / +0.2458 ms | 4 | +6.33% / +0.2458 ms | PASS |
| guard/hydrated/10 | isolated | medianMs | -39.41% / -2.7245 ms | none | 0 | — | 2 | -39.41% / -2.7245 ms | PASS |
| guard/hydrated/10 | isolated | p95Ms | -41.23% / -3.9343 ms | none | 0 | — | 2 | -41.23% / -3.9343 ms | PASS |
| guard/hydrated/10 | isolated | cpuMsPerRequest | -41.18% / -4.0237 ms | none | 0 | — | 2 | -41.18% / -4.0237 ms | PASS |
| guard/hydrated/10 | trusted | medianMs | -6.15% / -0.2478 ms | none | 0 | — | 2 | -6.15% / -0.2478 ms | PASS |
| guard/hydrated/10 | trusted | p95Ms | -18.59% / -1.1752 ms | none | 0 | — | 2 | -18.59% / -1.1752 ms | PASS |
| guard/hydrated/10 | trusted | cpuMsPerRequest | -10.85% / -0.6608 ms | none | 0 | — | 2 | -10.85% / -0.6608 ms | PASS |
| guard/global-rules/10 | isolated | medianMs | -82.32% / -17.4033 ms | none | 0 | — | 2 | -82.32% / -17.4033 ms | PASS |
| guard/global-rules/10 | isolated | p95Ms | -72.91% / -16.4869 ms | none | 0 | — | 2 | -72.91% / -16.4869 ms | PASS |
| guard/global-rules/10 | isolated | cpuMsPerRequest | -77.13% / -17.4768 ms | none | 0 | — | 2 | -77.13% / -17.4768 ms | PASS |
| guard/global-rules/10 | trusted | medianMs | -8.59% / -0.3525 ms | none | 0 | — | 2 | -8.59% / -0.3525 ms | PASS |
| guard/global-rules/10 | trusted | p95Ms | -13.67% / -0.8084 ms | none | 0 | — | 2 | -13.67% / -0.8084 ms | PASS |
| guard/global-rules/10 | trusted | cpuMsPerRequest | -15.79% / -0.9289 ms | none | 0 | — | 2 | -15.79% / -0.9289 ms | PASS |
| guard/large-config/10 | isolated | medianMs | -45.23% / -3.2578 ms | none | 0 | — | 2 | -45.23% / -3.2578 ms | PASS |
| guard/large-config/10 | isolated | p95Ms | -49.94% / -5.1648 ms | none | 0 | — | 2 | -49.94% / -5.1648 ms | PASS |
| guard/large-config/10 | isolated | cpuMsPerRequest | -44.00% / -4.3082 ms | none | 0 | — | 2 | -44.00% / -4.3082 ms | PASS |
| guard/large-config/10 | trusted | medianMs | -8.94% / -0.3691 ms | none | 0 | — | 2 | -8.94% / -0.3691 ms | PASS |
| guard/large-config/10 | trusted | p95Ms | -14.74% / -1.0553 ms | none | 0 | — | 2 | -14.74% / -1.0553 ms | PASS |
| guard/large-config/10 | trusted | cpuMsPerRequest | -13.75% / -0.7807 ms | none | 0 | — | 2 | -13.75% / -0.7807 ms | PASS |
| guard/populate/10 | isolated | medianMs | -45.55% / -4.6098 ms | none | 0 | — | 2 | -45.55% / -4.6098 ms | PASS |
| guard/populate/10 | isolated | p95Ms | -46.55% / -6.9486 ms | none | 0 | — | 2 | -46.55% / -6.9486 ms | PASS |
| guard/populate/10 | isolated | cpuMsPerRequest | -44.00% / -5.5912 ms | none | 0 | — | 2 | -44.00% / -5.5912 ms | PASS |
| guard/populate/10 | trusted | medianMs | +0.34% / +0.0197 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -8.73% / -0.4894 ms | 4 | -2.41% / -0.1263 ms | PASS |
| guard/populate/10 | trusted | p95Ms | -8.98% / -0.6883 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -7.40% / -0.5335 ms | 4 | -7.40% / -0.5335 ms | PASS |
| guard/populate/10 | trusted | cpuMsPerRequest | -5.40% / -0.3574 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -1.13% / -0.1044 ms | 4 | -5.40% / -0.3574 ms | PASS |
| guard/virtuals/10 | isolated | medianMs | -44.60% / -3.7340 ms | none | 0 | — | 2 | -44.60% / -3.7340 ms | PASS |
| guard/virtuals/10 | isolated | p95Ms | -49.97% / -6.0600 ms | none | 0 | — | 2 | -49.97% / -6.0600 ms | PASS |
| guard/virtuals/10 | isolated | cpuMsPerRequest | -48.72% / -5.6082 ms | none | 0 | — | 2 | -48.72% / -5.6082 ms | PASS |
| guard/virtuals/10 | trusted | medianMs | +3.15% / +0.1354 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | +1.40% / +0.0633 ms | 4 | +1.90% / +0.0845 ms | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/virtuals/10 | trusted | p95Ms | -8.61% / -0.6039 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | +4.44% / +0.3043 ms | 4 | -3.38% / -0.2095 ms | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/virtuals/10 | trusted | cpuMsPerRequest | -0.77% / -0.0481 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -1.03% / -0.0620 ms | 4 | -1.03% / -0.0620 ms | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/plain-narrow/100 | isolated | medianMs | -63.05% / -11.2173 ms | none | 0 | — | 2 | -63.05% / -11.2173 ms | PASS |
| guard/plain-narrow/100 | isolated | p95Ms | -50.55% / -10.0510 ms | none | 0 | — | 2 | -50.55% / -10.0510 ms | PASS |
| guard/plain-narrow/100 | isolated | cpuMsPerRequest | -57.02% / -11.5959 ms | none | 0 | — | 2 | -57.02% / -11.5959 ms | PASS |
| guard/plain-narrow/100 | trusted | medianMs | -13.28% / -0.9220 ms | none | 0 | — | 2 | -13.28% / -0.9220 ms | PASS |
| guard/plain-narrow/100 | trusted | p95Ms | -8.20% / -0.8173 ms | none | 0 | — | 2 | -8.20% / -0.8173 ms | PASS |
| guard/plain-narrow/100 | trusted | cpuMsPerRequest | -13.51% / -1.2033 ms | none | 0 | — | 2 | -13.51% / -1.2033 ms | PASS |
| guard/hydrated/100 | isolated | medianMs | -61.71% / -22.5774 ms | none | 0 | — | 2 | -61.71% / -22.5774 ms | PASS |
| guard/hydrated/100 | isolated | p95Ms | -60.59% / -24.3476 ms | none | 0 | — | 2 | -60.59% / -24.3476 ms | PASS |
| guard/hydrated/100 | isolated | cpuMsPerRequest | -58.43% / -24.7092 ms | none | 0 | — | 2 | -58.43% / -24.7092 ms | PASS |
| guard/hydrated/100 | trusted | medianMs | -10.89% / -1.5382 ms | none | 0 | — | 2 | -10.89% / -1.5382 ms | PASS |
| guard/hydrated/100 | trusted | p95Ms | -10.01% / -1.6503 ms | none | 0 | — | 2 | -10.01% / -1.6503 ms | PASS |
| guard/hydrated/100 | trusted | cpuMsPerRequest | -16.79% / -3.1943 ms | none | 0 | — | 2 | -16.79% / -3.1943 ms | PASS |
| guard/global-rules/100 | isolated | medianMs | -92.94% / -167.0479 ms | none | 0 | — | 2 | -92.94% / -167.0479 ms | PASS |
| guard/global-rules/100 | isolated | p95Ms | -92.28% / -176.2758 ms | none | 0 | — | 2 | -92.28% / -176.2758 ms | PASS |
| guard/global-rules/100 | isolated | cpuMsPerRequest | -91.69% / -173.9377 ms | none | 0 | — | 2 | -91.69% / -173.9377 ms | PASS |
| guard/global-rules/100 | trusted | medianMs | -24.85% / -3.6939 ms | none | 0 | — | 2 | -24.85% / -3.6939 ms | PASS |
| guard/global-rules/100 | trusted | p95Ms | -20.59% / -3.4792 ms | none | 0 | — | 2 | -20.59% / -3.4792 ms | PASS |
| guard/global-rules/100 | trusted | cpuMsPerRequest | -24.43% / -4.5372 ms | none | 0 | — | 2 | -24.43% / -4.5372 ms | PASS |
| guard/large-config/100 | isolated | medianMs | -63.73% / -22.3414 ms | none | 0 | — | 2 | -63.73% / -22.3414 ms | PASS |
| guard/large-config/100 | isolated | p95Ms | -58.12% / -22.0717 ms | none | 0 | — | 2 | -58.12% / -22.0717 ms | PASS |
| guard/large-config/100 | isolated | cpuMsPerRequest | -60.53% / -24.5585 ms | none | 0 | — | 2 | -60.53% / -24.5585 ms | PASS |
| guard/large-config/100 | trusted | medianMs | -10.18% / -1.2916 ms | none | 0 | — | 2 | -10.18% / -1.2916 ms | PASS |
| guard/large-config/100 | trusted | p95Ms | -7.29% / -1.0750 ms | none | 0 | — | 2 | -7.29% / -1.0750 ms | PASS |
| guard/large-config/100 | trusted | cpuMsPerRequest | -17.00% / -2.9131 ms | none | 0 | — | 2 | -17.00% / -2.9131 ms | PASS |
| guard/populate/100 | isolated | medianMs | -67.17% / -33.3328 ms | none | 0 | — | 2 | -67.17% / -33.3328 ms | PASS |
| guard/populate/100 | isolated | p95Ms | -64.71% / -35.2011 ms | none | 0 | — | 2 | -64.71% / -35.2011 ms | PASS |
| guard/populate/100 | isolated | cpuMsPerRequest | -64.31% / -36.9776 ms | none | 0 | — | 2 | -64.31% / -36.9776 ms | PASS |
| guard/populate/100 | trusted | medianMs | -5.32% / -0.8048 ms | none | 0 | — | 2 | -5.32% / -0.8048 ms | PASS |
| guard/populate/100 | trusted | p95Ms | -7.49% / -1.3561 ms | none | 0 | — | 2 | -7.49% / -1.3561 ms | PASS |
| guard/populate/100 | trusted | cpuMsPerRequest | -13.43% / -2.6867 ms | none | 0 | — | 2 | -13.43% / -2.6867 ms | PASS |
| guard/virtuals/100 | isolated | medianMs | -65.85% / -32.8412 ms | none | 0 | — | 2 | -65.85% / -32.8412 ms | PASS |
| guard/virtuals/100 | isolated | p95Ms | -62.78% / -33.2170 ms | none | 0 | — | 2 | -62.78% / -33.2170 ms | PASS |
| guard/virtuals/100 | isolated | cpuMsPerRequest | -61.23% / -34.3387 ms | none | 0 | — | 2 | -61.23% / -34.3387 ms | PASS |
| guard/virtuals/100 | trusted | medianMs | +7.30% / +1.1215 ms | material adverse pair: medianMs | 2 | +7.86% / +1.1666 ms | 4 | +7.86% / +1.1666 ms | PASS |
| guard/virtuals/100 | trusted | p95Ms | +5.64% / +1.0082 ms | material adverse pair: medianMs | 2 | +7.07% / +1.2487 ms | 4 | +5.64% / +1.0082 ms | PASS |
| guard/virtuals/100 | trusted | cpuMsPerRequest | -1.27% / -0.2666 ms | material adverse pair: medianMs | 2 | -1.26% / -0.2552 ms | 4 | -1.27% / -0.2666 ms | PASS |
| read/http-id/plain-wide/100 | isolated | medianMs | -48.47% / -2.4470 ms | none | 0 | — | 2 | -48.47% / -2.4470 ms | PASS |
| read/http-id/plain-wide/100 | isolated | p95Ms | -44.07% / -3.0269 ms | none | 0 | — | 2 | -44.07% / -3.0269 ms | PASS |
| read/http-id/plain-wide/100 | isolated | cpuMsPerRequest | -49.78% / -2.9523 ms | none | 0 | — | 2 | -49.78% / -2.9523 ms | PASS |
| read/http-id/plain-wide/100 | trusted | medianMs | +3.61% / +0.0914 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -4.77% / -0.1428 ms | 4 | +1.99% / +0.0488 ms | PASS |
| read/http-id/plain-wide/100 | trusted | p95Ms | -2.13% / -0.0812 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -8.67% / -0.3487 ms | 4 | -5.99% / -0.2243 ms | PASS |
| read/http-id/plain-wide/100 | trusted | cpuMsPerRequest | +4.12% / +0.1245 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -4.60% / -0.1437 ms | 4 | -0.42% / -0.0122 ms | PASS |
| read/http-id/document-rules/100 | isolated | medianMs | -48.66% / -2.4932 ms | none | 0 | — | 2 | -48.66% / -2.4932 ms | PASS |
| read/http-id/document-rules/100 | isolated | p95Ms | -42.48% / -2.9343 ms | none | 0 | — | 2 | -42.48% / -2.9343 ms | PASS |
| read/http-id/document-rules/100 | isolated | cpuMsPerRequest | -48.46% / -2.9627 ms | none | 0 | — | 2 | -48.46% / -2.9627 ms | PASS |
| read/http-id/document-rules/100 | trusted | medianMs | +2.05% / +0.0540 ms | mixed signs: p95Ms | 2 | -1.58% / -0.0431 ms | 4 | +2.05% / +0.0540 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-id/document-rules/100 | trusted | p95Ms | +1.44% / +0.0488 ms | mixed signs: p95Ms | 2 | +0.83% / +0.0324 ms | 4 | +1.44% / +0.0488 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-id/document-rules/100 | trusted | cpuMsPerRequest | +5.60% / +0.1678 ms | mixed signs: p95Ms | 2 | +0.24% / +0.0046 ms | 4 | +1.48% / +0.0427 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-id/embedded/100 | isolated | medianMs | -67.44% / -6.1127 ms | none | 0 | — | 2 | -67.44% / -6.1127 ms | PASS |
| read/http-id/embedded/100 | isolated | p95Ms | -59.47% / -6.1369 ms | none | 0 | — | 2 | -59.47% / -6.1369 ms | PASS |
| read/http-id/embedded/100 | isolated | cpuMsPerRequest | -65.92% / -6.5583 ms | none | 0 | — | 2 | -65.92% / -6.5583 ms | PASS |
| read/http-id/embedded/100 | trusted | medianMs | -1.74% / -0.0520 ms | mixed signs: cpuMsPerRequest | 2 | -4.13% / -0.1159 ms | 4 | -2.67% / -0.0769 ms | PASS |
| read/http-id/embedded/100 | trusted | p95Ms | -6.36% / -0.2744 ms | mixed signs: cpuMsPerRequest | 2 | -4.97% / -0.2332 ms | 4 | -6.36% / -0.2744 ms | PASS |
| read/http-id/embedded/100 | trusted | cpuMsPerRequest | +1.80% / +0.0613 ms | mixed signs: cpuMsPerRequest | 2 | -7.64% / -0.2799 ms | 4 | -1.82% / -0.0613 ms | PASS |
| read/http-id/hydrated/100 | isolated | medianMs | -46.22% / -2.3580 ms | none | 0 | — | 2 | -46.22% / -2.3580 ms | PASS |
| read/http-id/hydrated/100 | isolated | p95Ms | -41.17% / -2.7455 ms | none | 0 | — | 2 | -41.17% / -2.7455 ms | PASS |
| read/http-id/hydrated/100 | isolated | cpuMsPerRequest | -48.02% / -2.8866 ms | none | 0 | — | 2 | -48.02% / -2.8866 ms | PASS |
| read/http-id/hydrated/100 | trusted | medianMs | +4.00% / +0.1018 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -1.46% / -0.0362 ms | 4 | -0.36% / -0.0093 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| read/http-id/hydrated/100 | trusted | p95Ms | -0.11% / -0.0060 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -9.95% / -0.3991 ms | 4 | -5.81% / -0.2233 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| read/http-id/hydrated/100 | trusted | cpuMsPerRequest | +7.44% / +0.2239 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -2.79% / -0.0829 ms | 4 | +0.03% / +0.0005 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| read/http-id/virtuals/100 | isolated | medianMs | -49.39% / -2.6558 ms | none | 0 | — | 2 | -49.39% / -2.6558 ms | PASS |
| read/http-id/virtuals/100 | isolated | p95Ms | -34.93% / -2.3219 ms | none | 0 | — | 2 | -34.93% / -2.3219 ms | PASS |
| read/http-id/virtuals/100 | isolated | cpuMsPerRequest | -49.39% / -3.1078 ms | none | 0 | — | 2 | -49.39% / -3.1078 ms | PASS |
| read/http-id/virtuals/100 | trusted | medianMs | +0.65% / +0.0183 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | +1.29% / +0.0329 ms | 4 | +0.65% / +0.0183 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| read/http-id/virtuals/100 | trusted | p95Ms | -2.88% / -0.1219 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -1.61% / -0.0822 ms | 4 | -2.88% / -0.1219 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| read/http-id/virtuals/100 | trusted | cpuMsPerRequest | -2.17% / -0.0713 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | +2.49% / +0.0799 ms | 4 | -0.86% / -0.0268 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| read/http-filter/plain-wide/100 | isolated | medianMs | -46.08% / -2.2956 ms | none | 0 | — | 2 | -46.08% / -2.2956 ms | PASS |
| read/http-filter/plain-wide/100 | isolated | p95Ms | -38.40% / -2.3904 ms | none | 0 | — | 2 | -38.40% / -2.3904 ms | PASS |
| read/http-filter/plain-wide/100 | isolated | cpuMsPerRequest | -47.83% / -2.7574 ms | none | 0 | — | 2 | -47.83% / -2.7574 ms | PASS |
| read/http-filter/plain-wide/100 | trusted | medianMs | -4.02% / -0.1075 ms | none | 0 | — | 2 | -4.02% / -0.1075 ms | PASS |
| read/http-filter/plain-wide/100 | trusted | p95Ms | +2.44% / +0.0892 ms | none | 0 | — | 2 | +2.44% / +0.0892 ms | PASS |
| read/http-filter/plain-wide/100 | trusted | cpuMsPerRequest | -1.39% / -0.0414 ms | none | 0 | — | 2 | -1.39% / -0.0414 ms | PASS |
| read/http-filter/document-rules/100 | isolated | medianMs | -46.91% / -2.4207 ms | none | 0 | — | 2 | -46.91% / -2.4207 ms | PASS |
| read/http-filter/document-rules/100 | isolated | p95Ms | -47.33% / -3.4504 ms | none | 0 | — | 2 | -47.33% / -3.4504 ms | PASS |
| read/http-filter/document-rules/100 | isolated | cpuMsPerRequest | -50.42% / -3.0395 ms | none | 0 | — | 2 | -50.42% / -3.0395 ms | PASS |
| read/http-filter/document-rules/100 | trusted | medianMs | -2.11% / -0.0598 ms | mixed signs: medianMs | 2 | -2.99% / -0.0823 ms | 4 | -2.99% / -0.0823 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/document-rules/100 | trusted | p95Ms | +5.72% / +0.2202 ms | mixed signs: medianMs | 2 | -9.59% / -0.3738 ms | 4 | -2.15% / -0.0773 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/document-rules/100 | trusted | cpuMsPerRequest | +2.55% / +0.0743 ms | mixed signs: medianMs | 2 | -3.09% / -0.0940 ms | 4 | +1.31% / +0.0372 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/embedded/100 | isolated | medianMs | -68.17% / -6.3220 ms | none | 0 | — | 2 | -68.17% / -6.3220 ms | PASS |
| read/http-filter/embedded/100 | isolated | p95Ms | -61.51% / -6.8425 ms | none | 0 | — | 2 | -61.51% / -6.8425 ms | PASS |
| read/http-filter/embedded/100 | isolated | cpuMsPerRequest | -67.16% / -6.9186 ms | none | 0 | — | 2 | -67.16% / -6.9186 ms | PASS |
| read/http-filter/embedded/100 | trusted | medianMs | -2.20% / -0.0625 ms | mixed signs: p95Ms | 2 | -2.86% / -0.0827 ms | 4 | -2.20% / -0.0625 ms | PASS |
| read/http-filter/embedded/100 | trusted | p95Ms | +0.85% / +0.0341 ms | mixed signs: p95Ms | 2 | -8.29% / -0.3589 ms | 4 | -3.42% / -0.1429 ms | PASS |
| read/http-filter/embedded/100 | trusted | cpuMsPerRequest | -3.72% / -0.1268 ms | mixed signs: p95Ms | 2 | -3.40% / -0.1132 ms | 4 | -3.72% / -0.1268 ms | PASS |
| read/http-filter/hydrated/100 | isolated | medianMs | -44.71% / -2.2480 ms | none | 0 | — | 2 | -44.71% / -2.2480 ms | PASS |
| read/http-filter/hydrated/100 | isolated | p95Ms | -40.12% / -2.5221 ms | none | 0 | — | 2 | -40.12% / -2.5221 ms | PASS |
| read/http-filter/hydrated/100 | isolated | cpuMsPerRequest | -47.95% / -2.8203 ms | none | 0 | — | 2 | -47.95% / -2.8203 ms | PASS |
| read/http-filter/hydrated/100 | trusted | medianMs | -4.50% / -0.1247 ms | none | 0 | — | 2 | -4.50% / -0.1247 ms | PASS |
| read/http-filter/hydrated/100 | trusted | p95Ms | -4.73% / -0.1968 ms | none | 0 | — | 2 | -4.73% / -0.1968 ms | PASS |
| read/http-filter/hydrated/100 | trusted | cpuMsPerRequest | -8.31% / -0.2785 ms | none | 0 | — | 2 | -8.31% / -0.2785 ms | PASS |
| read/http-filter/virtuals/100 | isolated | medianMs | -46.54% / -2.4512 ms | none | 0 | — | 2 | -46.54% / -2.4512 ms | PASS |
| read/http-filter/virtuals/100 | isolated | p95Ms | -37.40% / -2.4166 ms | none | 0 | — | 2 | -37.40% / -2.4166 ms | PASS |
| read/http-filter/virtuals/100 | isolated | cpuMsPerRequest | -48.04% / -2.9506 ms | none | 0 | — | 2 | -48.04% / -2.9506 ms | PASS |
| read/http-filter/virtuals/100 | trusted | medianMs | +1.03% / +0.0312 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -2.72% / -0.0753 ms | 4 | -1.37% / -0.0375 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/virtuals/100 | trusted | p95Ms | +3.39% / +0.1200 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -0.30% / -0.0178 ms | 4 | +0.72% / +0.0175 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/virtuals/100 | trusted | cpuMsPerRequest | +3.08% / +0.1013 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -7.41% / -0.2504 ms | 4 | -3.18% / -0.1019 ms | FAIL: unresolved sign instability: p95Ms |
| helper/H0/100 | isolated | medianMs | -46.90% / -2.3113 ms | none | 0 | — | 2 | -46.90% / -2.3113 ms | PASS |
| helper/H0/100 | isolated | p95Ms | -38.38% / -2.4655 ms | none | 0 | — | 2 | -38.38% / -2.4655 ms | PASS |
| helper/H0/100 | isolated | cpuMsPerRequest | -49.04% / -2.8100 ms | none | 0 | — | 2 | -49.04% / -2.8100 ms | PASS |
| helper/H0/100 | trusted | medianMs | -2.68% / -0.0705 ms | mixed signs: p95Ms | 2 | -5.77% / -0.1519 ms | 4 | -4.59% / -0.1215 ms | PASS |
| helper/H0/100 | trusted | p95Ms | -1.98% / -0.0857 ms | mixed signs: p95Ms | 2 | -7.00% / -0.2736 ms | 4 | -7.00% / -0.2736 ms | PASS |
| helper/H0/100 | trusted | cpuMsPerRequest | -2.25% / -0.0656 ms | mixed signs: p95Ms | 2 | -9.37% / -0.2967 ms | 4 | -4.65% / -0.1376 ms | PASS |
| helper/H1/100 | isolated | medianMs | -53.88% / -1.8866 ms | none | 0 | — | 2 | -53.88% / -1.8866 ms | PASS |
| helper/H1/100 | isolated | p95Ms | -50.75% / -2.6481 ms | none | 0 | — | 2 | -50.75% / -2.6481 ms | PASS |
| helper/H1/100 | isolated | cpuMsPerRequest | -50.56% / -2.1913 ms | none | 0 | — | 2 | -50.56% / -2.1913 ms | PASS |
| helper/H1/100 | trusted | medianMs | -53.09% / -1.8121 ms | none | 0 | — | 2 | -53.09% / -1.8121 ms | PASS |
| helper/H1/100 | trusted | p95Ms | -50.07% / -2.6524 ms | none | 0 | — | 2 | -50.07% / -2.6524 ms | PASS |
| helper/H1/100 | trusted | cpuMsPerRequest | -49.89% / -2.1029 ms | none | 0 | — | 2 | -49.89% / -2.1029 ms | PASS |
| helper/H1-scoped/100 | isolated | medianMs | -23.28% / -0.3284 ms | mixed signs: p95Ms | 2 | -27.40% / -0.4037 ms | 4 | -24.90% / -0.3535 ms | PASS |
| helper/H1-scoped/100 | isolated | p95Ms | -4.51% / -0.0939 ms | mixed signs: p95Ms | 2 | -27.03% / -0.5823 ms | 4 | -16.14% / -0.3252 ms | PASS |
| helper/H1-scoped/100 | isolated | cpuMsPerRequest | -13.95% / -0.2267 ms | mixed signs: p95Ms | 2 | -33.27% / -0.6061 ms | 4 | -26.30% / -0.4328 ms | PASS |
| helper/H1-scoped/100 | trusted | medianMs | -22.43% / -0.3112 ms | none | 0 | — | 2 | -22.43% / -0.3112 ms | PASS |
| helper/H1-scoped/100 | trusted | p95Ms | -20.07% / -0.4323 ms | none | 0 | — | 2 | -20.07% / -0.4323 ms | PASS |
| helper/H1-scoped/100 | trusted | cpuMsPerRequest | -19.61% / -0.3154 ms | none | 0 | — | 2 | -19.61% / -0.3154 ms | PASS |
| helper/H2/100 | isolated | medianMs | -62.46% / -6.8603 ms | none | 0 | — | 2 | -62.46% / -6.8603 ms | PASS |
| helper/H2/100 | isolated | cpuMsPerRequest | -65.61% / -8.4266 ms | none | 0 | — | 2 | -65.61% / -8.4266 ms | PASS |
| helper/H2/100 | trusted | medianMs | -25.23% / -1.4064 ms | none | 0 | — | 2 | -25.23% / -1.4064 ms | PASS |
| helper/H2/100 | trusted | cpuMsPerRequest | -27.57% / -1.7354 ms | none | 0 | — | 2 | -27.57% / -1.7354 ms | PASS |
| helper/H2-query/100 | isolated | medianMs | -48.58% / -2.4095 ms | none | 0 | — | 2 | -48.58% / -2.4095 ms | PASS |
| helper/H2-query/100 | isolated | p95Ms | -38.62% / -2.6065 ms | none | 0 | — | 2 | -38.62% / -2.6065 ms | PASS |
| helper/H2-query/100 | isolated | cpuMsPerRequest | -49.02% / -2.8758 ms | none | 0 | — | 2 | -49.02% / -2.8758 ms | PASS |
| helper/H2-query/100 | trusted | medianMs | -4.50% / -0.1209 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -2.97% / -0.0778 ms | 4 | -4.50% / -0.1209 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| helper/H2-query/100 | trusted | p95Ms | +0.38% / +0.0136 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -5.46% / -0.2191 ms | 4 | -2.08% / -0.0823 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| helper/H2-query/100 | trusted | cpuMsPerRequest | +0.70% / +0.0227 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -2.44% / -0.0731 ms | 4 | -0.69% / -0.0205 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| helper/H2-global/100 | isolated | medianMs | -50.15% / -2.9060 ms | none | 0 | — | 2 | -50.15% / -2.9060 ms | PASS |
| helper/H2-global/100 | isolated | p95Ms | -43.02% / -3.2422 ms | none | 0 | — | 2 | -43.02% / -3.2422 ms | PASS |
| helper/H2-global/100 | isolated | cpuMsPerRequest | -50.73% / -3.4698 ms | none | 0 | — | 2 | -50.73% / -3.4698 ms | PASS |
| helper/H2-global/100 | trusted | medianMs | +0.70% / +0.0187 ms | mixed signs: medianMs | 2 | +4.14% / +0.1055 ms | 4 | +1.07% / +0.0291 ms | FAIL: unresolved sign instability: medianMs |
| helper/H2-global/100 | trusted | p95Ms | -2.55% / -0.1047 ms | mixed signs: medianMs | 2 | +6.16% / +0.2293 ms | 4 | -0.35% / -0.0146 ms | FAIL: unresolved sign instability: medianMs |
| helper/H2-global/100 | trusted | cpuMsPerRequest | +5.67% / +0.1829 ms | mixed signs: medianMs | 2 | +10.18% / +0.3198 ms | 4 | +7.83% / +0.2508 ms | FAIL: unresolved sign instability: medianMs |
| helper/H4/100 | isolated | medianMs | -7.19% / -0.2077 ms | none | 0 | — | 2 | -7.19% / -0.2077 ms | PASS |
| helper/H4/100 | isolated | p95Ms | -9.51% / -0.4080 ms | none | 0 | — | 2 | -9.51% / -0.4080 ms | PASS |
| helper/H4/100 | isolated | cpuMsPerRequest | -8.37% / -0.2822 ms | none | 0 | — | 2 | -8.37% / -0.2822 ms | PASS |
| helper/H4/100 | trusted | medianMs | +4.84% / +0.0839 ms | mixed signs: medianMs, material adverse pair: cpuMsPerRequest | 2 | +20.73% / +0.4576 ms | 4 | +16.96% / +0.3770 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H4/100 | trusted | p95Ms | +7.13% / +0.2406 ms | mixed signs: medianMs, material adverse pair: cpuMsPerRequest | 2 | +20.49% / +0.6266 ms | 4 | +10.94% / +0.3703 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H4/100 | trusted | cpuMsPerRequest | +15.88% / +0.3855 ms | mixed signs: medianMs, material adverse pair: cpuMsPerRequest | 2 | +33.85% / +0.7849 ms | 4 | +27.09% / +0.6161 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3/10 | isolated | medianMs | -87.64% / -45.6713 ms | none | 0 | — | 2 | -87.64% / -45.6713 ms | PASS |
| helper/H3/10 | isolated | cpuMsPerRequest | -86.17% / -47.1955 ms | none | 0 | — | 2 | -86.17% / -47.1955 ms | PASS |
| helper/H3/10 | trusted | medianMs | -39.02% / -3.8216 ms | none | 0 | — | 2 | -39.02% / -3.8216 ms | PASS |
| helper/H3/10 | trusted | cpuMsPerRequest | -45.47% / -5.6041 ms | none | 0 | — | 2 | -45.47% / -5.6041 ms | PASS |
| helper/H3-query/10 | isolated | medianMs | -81.14% / -17.5766 ms | none | 0 | — | 2 | -81.14% / -17.5766 ms | PASS |
| helper/H3-query/10 | isolated | p95Ms | -75.03% / -17.4422 ms | none | 0 | — | 2 | -75.03% / -17.4422 ms | PASS |
| helper/H3-query/10 | isolated | cpuMsPerRequest | -77.89% / -17.7268 ms | none | 0 | — | 2 | -77.89% / -17.7268 ms | PASS |
| helper/H3-query/10 | trusted | medianMs | -11.84% / -0.4972 ms | none | 0 | — | 2 | -11.84% / -0.4972 ms | PASS |
| helper/H3-query/10 | trusted | p95Ms | -10.70% / -0.6414 ms | none | 0 | — | 2 | -10.70% / -0.6414 ms | PASS |
| helper/H3-query/10 | trusted | cpuMsPerRequest | -14.53% / -0.7633 ms | none | 0 | — | 2 | -14.53% / -0.7633 ms | PASS |
| helper/H3-global/10 | isolated | medianMs | -77.97% / -23.0110 ms | none | 0 | — | 2 | -77.97% / -23.0110 ms | PASS |
| helper/H3-global/10 | isolated | p95Ms | -72.78% / -22.8496 ms | none | 0 | — | 2 | -72.78% / -22.8496 ms | PASS |
| helper/H3-global/10 | isolated | cpuMsPerRequest | -72.24% / -22.3889 ms | none | 0 | — | 2 | -72.24% / -22.3889 ms | PASS |
| helper/H3-global/10 | trusted | medianMs | +12.31% / +0.6676 ms | mixed signs: p95Ms, material adverse pair: cpuMsPerRequest | 2 | +7.68% / +0.4229 ms | 4 | +11.49% / +0.6267 ms | FAIL: confirmed adverse: cpuMsPerRequest, unresolved sign instability: p95Ms |
| helper/H3-global/10 | trusted | p95Ms | +1.46% / +0.1213 ms | mixed signs: p95Ms, material adverse pair: cpuMsPerRequest | 2 | +0.42% / +0.0039 ms | 4 | +1.46% / +0.1213 ms | FAIL: confirmed adverse: cpuMsPerRequest, unresolved sign instability: p95Ms |
| helper/H3-global/10 | trusted | cpuMsPerRequest | +21.48% / +1.4746 ms | mixed signs: p95Ms, material adverse pair: cpuMsPerRequest | 2 | +15.07% / +1.0507 ms | 4 | +19.04% / +1.2963 ms | FAIL: confirmed adverse: cpuMsPerRequest, unresolved sign instability: p95Ms |
| helper/H3/100 | isolated | medianMs | -93.89% / -419.3981 ms | none | 0 | — | 2 | -93.89% / -419.3981 ms | PASS |
| helper/H3/100 | isolated | cpuMsPerRequest | -93.75% / -447.9594 ms | none | 0 | — | 2 | -93.75% / -447.9594 ms | PASS |
| helper/H3/100 | trusted | medianMs | -50.46% / -22.4999 ms | none | 0 | — | 2 | -50.46% / -22.4999 ms | PASS |
| helper/H3/100 | trusted | cpuMsPerRequest | -54.61% / -29.2171 ms | none | 0 | — | 2 | -54.61% / -29.2171 ms | PASS |
| helper/H3-query/100 | isolated | medianMs | -91.69% / -164.3849 ms | none | 0 | — | 2 | -91.69% / -164.3849 ms | PASS |
| helper/H3-query/100 | isolated | p95Ms | -91.07% / -174.0387 ms | none | 0 | — | 2 | -91.07% / -174.0387 ms | PASS |
| helper/H3-query/100 | isolated | cpuMsPerRequest | -91.01% / -174.2547 ms | none | 0 | — | 2 | -91.01% / -174.2547 ms | PASS |
| helper/H3-query/100 | trusted | medianMs | -22.08% / -3.4563 ms | none | 0 | — | 2 | -22.08% / -3.4563 ms | PASS |
| helper/H3-query/100 | trusted | p95Ms | -21.84% / -3.7974 ms | none | 0 | — | 2 | -21.84% / -3.7974 ms | PASS |
| helper/H3-query/100 | trusted | cpuMsPerRequest | -25.57% / -4.7373 ms | none | 0 | — | 2 | -25.57% / -4.7373 ms | PASS |
| helper/H3-global/100 | isolated | medianMs | -87.04% / -221.7056 ms | none | 0 | — | 2 | -87.04% / -221.7056 ms | PASS |
| helper/H3-global/100 | isolated | p95Ms | -86.38% / -228.7520 ms | none | 0 | — | 2 | -86.38% / -228.7520 ms | PASS |
| helper/H3-global/100 | isolated | cpuMsPerRequest | -84.79% / -229.5445 ms | none | 0 | — | 2 | -84.79% / -229.5445 ms | PASS |
| helper/H3-global/100 | trusted | medianMs | +13.16% / +3.7564 ms | material adverse pair: medianMs, material adverse pair: cpuMsPerRequest | 2 | +11.19% / +3.2966 ms | 4 | +12.85% / +3.6926 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | p95Ms | +13.90% / +4.3507 ms | material adverse pair: medianMs, material adverse pair: cpuMsPerRequest | 2 | +14.13% / +4.5949 ms | 4 | +13.90% / +4.3507 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | cpuMsPerRequest | +15.04% / +5.2876 ms | material adverse pair: medianMs, material adverse pair: cpuMsPerRequest | 2 | +16.50% / +5.8357 ms | 4 | +15.54% / +5.5210 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| native-adapter/direct-read/100 | isolated | medianMs | -80.63% / -8.3363 ms | none | 0 | — | 2 | -80.63% / -8.3363 ms | PASS |
| native-adapter/direct-read/100 | isolated | p95Ms | -72.24% / -8.3150 ms | none | 0 | — | 2 | -72.24% / -8.3150 ms | PASS |
| native-adapter/direct-read/100 | isolated | cpuMsPerRequest | -74.12% / -8.2386 ms | none | 0 | — | 2 | -74.12% / -8.2386 ms | PASS |
| native-adapter/direct-read/100 | trusted | medianMs | -1.10% / -0.0202 ms | mixed signs: medianMs, mixed signs: cpuMsPerRequest | 2 | +1.44% / +0.0255 ms | 4 | -0.47% / -0.0092 ms | FAIL: unresolved sign instability: medianMs |
| native-adapter/direct-read/100 | trusted | p95Ms | +5.00% / +0.1467 ms | mixed signs: medianMs, mixed signs: cpuMsPerRequest | 2 | +4.45% / +0.1388 ms | 4 | +5.00% / +0.1467 ms | FAIL: unresolved sign instability: medianMs |
| native-adapter/direct-read/100 | trusted | cpuMsPerRequest | +2.56% / +0.0628 ms | mixed signs: medianMs, mixed signs: cpuMsPerRequest | 2 | +1.48% / +0.0428 ms | 4 | +1.48% / +0.0428 ms | FAIL: unresolved sign instability: medianMs |
| native-adapter/direct-list/100 | isolated | medianMs | -96.95% / -742.9544 ms | none | 0 | — | 2 | -96.95% / -742.9544 ms | PASS |
| native-adapter/direct-list/100 | isolated | p95Ms | -96.72% / -754.9718 ms | none | 0 | — | 2 | -96.72% / -754.9718 ms | PASS |
| native-adapter/direct-list/100 | isolated | cpuMsPerRequest | -96.59% / -768.1966 ms | none | 0 | — | 2 | -96.59% / -768.1966 ms | PASS |
| native-adapter/direct-list/100 | trusted | medianMs | -20.94% / -3.9101 ms | none | 0 | — | 2 | -20.94% / -3.9101 ms | PASS |
| native-adapter/direct-list/100 | trusted | p95Ms | -19.10% / -3.8717 ms | none | 0 | — | 2 | -19.10% / -3.8717 ms | PASS |
| native-adapter/direct-list/100 | trusted | cpuMsPerRequest | -23.72% / -5.5952 ms | none | 0 | — | 2 | -23.72% / -5.5952 ms | PASS |
| facts/owner-only/100 | isolated | medianMs | -92.54% / -165.1460 ms | none | 0 | — | 2 | -92.54% / -165.1460 ms | PASS |
| facts/owner-only/100 | isolated | p95Ms | -91.83% / -170.6674 ms | none | 0 | — | 2 | -91.83% / -170.6674 ms | PASS |
| facts/owner-only/100 | isolated | cpuMsPerRequest | -91.70% / -170.8118 ms | none | 0 | — | 2 | -91.70% / -170.8118 ms | PASS |
| facts/owner-only/100 | trusted | medianMs | -23.66% / -3.3599 ms | none | 0 | — | 2 | -23.66% / -3.3599 ms | PASS |
| facts/owner-only/100 | trusted | p95Ms | -20.60% / -3.3946 ms | none | 0 | — | 2 | -20.60% / -3.3946 ms | PASS |
| facts/owner-only/100 | trusted | cpuMsPerRequest | -27.64% / -4.6549 ms | none | 0 | — | 2 | -27.64% / -4.6549 ms | PASS |
| facts/unused-checksum/100 | isolated | medianMs | -87.23% / -165.3635 ms | none | 0 | — | 2 | -87.23% / -165.3635 ms | PASS |
| facts/unused-checksum/100 | isolated | p95Ms | -86.61% / -169.7796 ms | none | 0 | — | 2 | -86.61% / -169.7796 ms | PASS |
| facts/unused-checksum/100 | isolated | cpuMsPerRequest | -86.54% / -169.6322 ms | none | 0 | — | 2 | -86.54% / -169.6322 ms | PASS |
| facts/unused-checksum/100 | trusted | medianMs | -14.07% / -3.5400 ms | none | 0 | — | 2 | -14.07% / -3.5400 ms | PASS |
| facts/unused-checksum/100 | trusted | p95Ms | -15.90% / -4.4249 ms | none | 0 | — | 2 | -15.90% / -4.4249 ms | PASS |
| facts/unused-checksum/100 | trusted | cpuMsPerRequest | -16.77% / -4.6430 ms | none | 0 | — | 2 | -16.77% / -4.6430 ms | PASS |
| retention/held-released/100/4 | isolated | medianMs | -78.37% / -24.8899 ms | none | 0 | — | 2 | -78.37% / -24.8899 ms | PASS |
| retention/held-released/100/4 | isolated | p95Ms | -74.79% / -25.2765 ms | none | 0 | — | 2 | -74.79% / -25.2765 ms | PASS |
| retention/held-released/100/4 | isolated | cpuMsPerRequest | -74.67% / -25.4430 ms | none | 0 | — | 2 | -74.67% / -25.4430 ms | PASS |
| retention/held-released/100/4 | trusted | medianMs | -14.32% / -0.8896 ms | none | 0 | — | 2 | -14.32% / -0.8896 ms | PASS |
| retention/held-released/100/4 | trusted | p95Ms | -14.73% / -1.1914 ms | none | 0 | — | 2 | -14.73% / -1.1914 ms | PASS |
| retention/held-released/100/4 | trusted | cpuMsPerRequest | -13.86% / -1.0656 ms | none | 0 | — | 2 | -13.86% / -1.0656 ms | PASS |
| retention/held-released/100/24 | isolated | medianMs | -92.49% / -164.6782 ms | none | 0 | — | 2 | -92.49% / -164.6782 ms | PASS |
| retention/held-released/100/24 | isolated | p95Ms | -91.83% / -172.5628 ms | none | 0 | — | 2 | -91.83% / -172.5628 ms | PASS |
| retention/held-released/100/24 | isolated | cpuMsPerRequest | -91.89% / -172.8845 ms | none | 0 | — | 2 | -91.89% / -172.8845 ms | PASS |
| retention/held-released/100/24 | trusted | medianMs | -24.79% / -3.4639 ms | none | 0 | — | 2 | -24.79% / -3.4639 ms | PASS |
| retention/held-released/100/24 | trusted | p95Ms | -26.37% / -4.3388 ms | none | 0 | — | 2 | -26.37% / -4.3388 ms | PASS |
| retention/held-released/100/24 | trusted | cpuMsPerRequest | -28.66% / -4.7950 ms | none | 0 | — | 2 | -28.66% / -4.7950 ms | PASS |
| retention/held-released/100/48 | isolated | medianMs | -96.21% / -541.9993 ms | none | 0 | — | 2 | -96.21% / -541.9993 ms | PASS |
| retention/held-released/100/48 | isolated | p95Ms | -95.89% / -554.6679 ms | none | 0 | — | 2 | -95.89% / -554.6679 ms | PASS |
| retention/held-released/100/48 | isolated | cpuMsPerRequest | -95.95% / -565.6489 ms | none | 0 | — | 2 | -95.95% / -565.6489 ms | PASS |
| retention/held-released/100/48 | trusted | medianMs | -27.74% / -6.5335 ms | none | 0 | — | 2 | -27.74% / -6.5335 ms | PASS |
| retention/held-released/100/48 | trusted | p95Ms | -26.50% / -6.8240 ms | none | 0 | — | 2 | -26.50% / -6.8240 ms | PASS |
| retention/held-released/100/48 | trusted | cpuMsPerRequest | -28.61% / -7.5556 ms | none | 0 | — | 2 | -28.61% / -7.5556 ms | PASS |
