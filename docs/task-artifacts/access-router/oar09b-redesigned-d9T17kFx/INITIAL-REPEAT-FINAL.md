> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# All 90 comparisons: initial, repeat-only and final

Negative = candidate lower. Repeat-only N=2 is descriptive, NEVER a substitute for the all-four gate. No data discarded. Individual pairs are in PAIR-DETAILS.md. No repeat means final N=2.

| Case | Profile | Metric | Initial N=2 | Trigger | Repeat-only N | Repeat-only delta | Final N | Final delta | Final outcome |
|---|---|---|---|---|---|---|---|---|---|
| primary/plain-wide/100 | isolated | medianMs | -63.67% / -21.2938 ms | none | 0 | — | 2 | -63.67% / -21.2938 ms | PASS |
| primary/plain-wide/100 | isolated | p95Ms | -61.16% / -22.5626 ms | none | 0 | — | 2 | -61.16% / -22.5626 ms | PASS |
| primary/plain-wide/100 | isolated | cpuMsPerRequest | -62.15% / -23.9463 ms | none | 0 | — | 2 | -62.15% / -23.9463 ms | PASS |
| primary/plain-wide/100 | trusted | medianMs | -8.81% / -1.0504 ms | none | 0 | — | 2 | -8.81% / -1.0504 ms | PASS |
| primary/plain-wide/100 | trusted | p95Ms | -10.65% / -1.5316 ms | none | 0 | — | 2 | -10.65% / -1.5316 ms | PASS |
| primary/plain-wide/100 | trusted | cpuMsPerRequest | -17.24% / -2.7085 ms | none | 0 | — | 2 | -17.24% / -2.7085 ms | PASS |
| primary/document-rules/100 | isolated | medianMs | -92.35% / -164.6736 ms | none | 0 | — | 2 | -92.35% / -164.6736 ms | PASS |
| primary/document-rules/100 | isolated | p95Ms | -91.43% / -170.3394 ms | none | 0 | — | 2 | -91.43% / -170.3394 ms | PASS |
| primary/document-rules/100 | isolated | cpuMsPerRequest | -91.43% / -170.0425 ms | none | 0 | — | 2 | -91.43% / -170.0425 ms | PASS |
| primary/document-rules/100 | trusted | medianMs | -20.12% / -2.7831 ms | none | 0 | — | 2 | -20.12% / -2.7831 ms | PASS |
| primary/document-rules/100 | trusted | p95Ms | -19.92% / -3.2732 ms | none | 0 | — | 2 | -19.92% / -3.2732 ms | PASS |
| primary/document-rules/100 | trusted | cpuMsPerRequest | -24.93% / -4.2560 ms | none | 0 | — | 2 | -24.93% / -4.2560 ms | PASS |
| primary/embedded/100 | isolated | medianMs | -96.20% / -503.4358 ms | none | 0 | — | 2 | -96.20% / -503.4358 ms | PASS |
| primary/embedded/100 | isolated | p95Ms | -95.86% / -517.5210 ms | none | 0 | — | 2 | -95.86% / -517.5210 ms | PASS |
| primary/embedded/100 | isolated | cpuMsPerRequest | -95.68% / -525.2513 ms | none | 0 | — | 2 | -95.68% / -525.2513 ms | PASS |
| primary/embedded/100 | trusted | medianMs | -23.38% / -5.4850 ms | none | 0 | — | 2 | -23.38% / -5.4850 ms | PASS |
| primary/embedded/100 | trusted | p95Ms | -22.09% / -5.9173 ms | none | 0 | — | 2 | -22.09% / -5.9173 ms | PASS |
| primary/embedded/100 | trusted | cpuMsPerRequest | -26.18% / -7.4844 ms | none | 0 | — | 2 | -26.18% / -7.4844 ms | PASS |
| guard/plain-narrow/10 | isolated | medianMs | -34.23% / -1.5404 ms | none | 0 | — | 2 | -34.23% / -1.5404 ms | PASS |
| guard/plain-narrow/10 | isolated | p95Ms | -30.40% / -1.8616 ms | none | 0 | — | 2 | -30.40% / -1.8616 ms | PASS |
| guard/plain-narrow/10 | isolated | cpuMsPerRequest | -32.29% / -2.1371 ms | none | 0 | — | 2 | -32.29% / -2.1371 ms | PASS |
| guard/plain-narrow/10 | trusted | medianMs | -2.38% / -0.0908 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -7.72% / -0.2332 ms | 4 | -7.72% / -0.2332 ms | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/plain-narrow/10 | trusted | p95Ms | +0.49% / +0.0220 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -0.71% / -0.0569 ms | 4 | +0.49% / +0.0220 ms | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/plain-narrow/10 | trusted | cpuMsPerRequest | +0.29% / -0.0003 ms | mixed signs: medianMs, mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | +2.68% / +0.1033 ms | 4 | +0.80% / +0.0277 ms | FAIL: unresolved sign instability: p95Ms, unresolved sign instability: cpuMsPerRequest |
| guard/hydrated/10 | isolated | medianMs | -40.08% / -2.7577 ms | none | 0 | — | 2 | -40.08% / -2.7577 ms | PASS |
| guard/hydrated/10 | isolated | p95Ms | -38.13% / -3.8005 ms | none | 0 | — | 2 | -38.13% / -3.8005 ms | PASS |
| guard/hydrated/10 | isolated | cpuMsPerRequest | -38.04% / -3.7005 ms | none | 0 | — | 2 | -38.04% / -3.7005 ms | PASS |
| guard/hydrated/10 | trusted | medianMs | -7.46% / -0.3160 ms | mixed signs: cpuMsPerRequest, material adverse pair: cpuMsPerRequest | 2 | -2.43% / -0.0966 ms | 4 | -2.43% / -0.0966 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/hydrated/10 | trusted | p95Ms | -3.93% / -0.2599 ms | mixed signs: cpuMsPerRequest, material adverse pair: cpuMsPerRequest | 2 | -2.60% / -0.1524 ms | 4 | -3.81% / -0.2196 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/hydrated/10 | trusted | cpuMsPerRequest | -1.06% / -0.1075 ms | mixed signs: cpuMsPerRequest, material adverse pair: cpuMsPerRequest | 2 | -0.73% / -0.0866 ms | 4 | -1.06% / -0.1075 ms | FAIL: unresolved sign instability: cpuMsPerRequest |
| guard/global-rules/10 | isolated | medianMs | -82.46% / -17.3450 ms | none | 0 | — | 2 | -82.46% / -17.3450 ms | PASS |
| guard/global-rules/10 | isolated | p95Ms | -77.58% / -18.1940 ms | none | 0 | — | 2 | -77.58% / -18.1940 ms | PASS |
| guard/global-rules/10 | isolated | cpuMsPerRequest | -79.03% / -17.8969 ms | none | 0 | — | 2 | -79.03% / -17.8969 ms | PASS |
| guard/global-rules/10 | trusted | medianMs | -5.65% / -0.2223 ms | none | 0 | — | 2 | -5.65% / -0.2223 ms | PASS |
| guard/global-rules/10 | trusted | p95Ms | -14.67% / -0.9088 ms | none | 0 | — | 2 | -14.67% / -0.9088 ms | PASS |
| guard/global-rules/10 | trusted | cpuMsPerRequest | -12.34% / -0.6881 ms | none | 0 | — | 2 | -12.34% / -0.6881 ms | PASS |
| guard/large-config/10 | isolated | medianMs | -49.09% / -3.6940 ms | none | 0 | — | 2 | -49.09% / -3.6940 ms | PASS |
| guard/large-config/10 | isolated | p95Ms | -47.08% / -5.1857 ms | none | 0 | — | 2 | -47.08% / -5.1857 ms | PASS |
| guard/large-config/10 | isolated | cpuMsPerRequest | -45.66% / -4.5379 ms | none | 0 | — | 2 | -45.66% / -4.5379 ms | PASS |
| guard/large-config/10 | trusted | medianMs | -6.80% / -0.2868 ms | mixed signs: cpuMsPerRequest | 2 | -4.01% / -0.1669 ms | 4 | -6.68% / -0.2697 ms | FAIL: unresolved sign instability: p95Ms |
| guard/large-config/10 | trusted | p95Ms | +3.19% / +0.1652 ms | mixed signs: cpuMsPerRequest | 2 | -6.81% / -0.3805 ms | 4 | -0.89% / -0.0697 ms | FAIL: unresolved sign instability: p95Ms |
| guard/large-config/10 | trusted | cpuMsPerRequest | +4.10% / +0.2066 ms | mixed signs: cpuMsPerRequest | 2 | -4.55% / -0.2492 ms | 4 | -2.09% / -0.1141 ms | FAIL: unresolved sign instability: p95Ms |
| guard/populate/10 | isolated | medianMs | -41.10% / -4.0638 ms | none | 0 | — | 2 | -41.10% / -4.0638 ms | PASS |
| guard/populate/10 | isolated | p95Ms | -37.45% / -4.9412 ms | none | 0 | — | 2 | -37.45% / -4.9412 ms | PASS |
| guard/populate/10 | isolated | cpuMsPerRequest | -38.58% / -4.7104 ms | none | 0 | — | 2 | -38.58% / -4.7104 ms | PASS |
| guard/populate/10 | trusted | medianMs | +2.95% / +0.1469 ms | mixed signs: p95Ms | 2 | -2.55% / -0.1367 ms | 4 | -0.02% / -0.0012 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| guard/populate/10 | trusted | p95Ms | -0.84% / -0.0545 ms | mixed signs: p95Ms | 2 | +0.70% / +0.0490 ms | 4 | +0.25% / +0.0181 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| guard/populate/10 | trusted | cpuMsPerRequest | +5.74% / +0.3481 ms | mixed signs: p95Ms | 2 | +8.72% / +0.5388 ms | 4 | +8.72% / +0.5388 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| guard/virtuals/10 | isolated | medianMs | -47.57% / -3.9855 ms | none | 0 | — | 2 | -47.57% / -3.9855 ms | PASS |
| guard/virtuals/10 | isolated | p95Ms | -43.28% / -4.9778 ms | none | 0 | — | 2 | -43.28% / -4.9778 ms | PASS |
| guard/virtuals/10 | isolated | cpuMsPerRequest | -43.82% / -4.6446 ms | none | 0 | — | 2 | -43.82% / -4.6446 ms | PASS |
| guard/virtuals/10 | trusted | medianMs | -3.16% / -0.1347 ms | none | 0 | — | 2 | -3.16% / -0.1347 ms | PASS |
| guard/virtuals/10 | trusted | p95Ms | -10.01% / -0.6275 ms | none | 0 | — | 2 | -10.01% / -0.6275 ms | PASS |
| guard/virtuals/10 | trusted | cpuMsPerRequest | -9.48% / -0.5715 ms | none | 0 | — | 2 | -9.48% / -0.5715 ms | PASS |
| guard/plain-narrow/100 | isolated | medianMs | -62.69% / -11.1415 ms | none | 0 | — | 2 | -62.69% / -11.1415 ms | PASS |
| guard/plain-narrow/100 | isolated | p95Ms | -55.68% / -11.1434 ms | none | 0 | — | 2 | -55.68% / -11.1434 ms | PASS |
| guard/plain-narrow/100 | isolated | cpuMsPerRequest | -56.17% / -11.5014 ms | none | 0 | — | 2 | -56.17% / -11.5014 ms | PASS |
| guard/plain-narrow/100 | trusted | medianMs | -11.24% / -0.7200 ms | mixed signs: p95Ms | 2 | -10.24% / -0.6616 ms | 4 | -10.25% / -0.6616 ms | FAIL: unresolved sign instability: p95Ms |
| guard/plain-narrow/100 | trusted | p95Ms | +5.76% / +0.4623 ms | mixed signs: p95Ms | 2 | +3.59% / +0.2959 ms | 4 | +3.59% / +0.2959 ms | FAIL: unresolved sign instability: p95Ms |
| guard/plain-narrow/100 | trusted | cpuMsPerRequest | -11.03% / -0.9388 ms | mixed signs: p95Ms | 2 | -10.43% / -0.9010 ms | 4 | -10.96% / -0.9388 ms | FAIL: unresolved sign instability: p95Ms |
| guard/hydrated/100 | isolated | medianMs | -61.09% / -21.4987 ms | none | 0 | — | 2 | -61.09% / -21.4987 ms | PASS |
| guard/hydrated/100 | isolated | p95Ms | -58.38% / -23.1282 ms | none | 0 | — | 2 | -58.38% / -23.1282 ms | PASS |
| guard/hydrated/100 | isolated | cpuMsPerRequest | -58.16% / -24.1674 ms | none | 0 | — | 2 | -58.16% / -24.1674 ms | PASS |
| guard/hydrated/100 | trusted | medianMs | -6.61% / -0.9058 ms | none | 0 | — | 2 | -6.61% / -0.9058 ms | PASS |
| guard/hydrated/100 | trusted | p95Ms | -3.60% / -0.5792 ms | none | 0 | — | 2 | -3.60% / -0.5792 ms | PASS |
| guard/hydrated/100 | trusted | cpuMsPerRequest | -11.16% / -2.0397 ms | none | 0 | — | 2 | -11.16% / -2.0397 ms | PASS |
| guard/global-rules/100 | isolated | medianMs | -92.70% / -161.9757 ms | none | 0 | — | 2 | -92.70% / -161.9757 ms | PASS |
| guard/global-rules/100 | isolated | p95Ms | -91.27% / -168.5588 ms | none | 0 | — | 2 | -91.27% / -168.5588 ms | PASS |
| guard/global-rules/100 | isolated | cpuMsPerRequest | -91.20% / -167.0099 ms | none | 0 | — | 2 | -91.20% / -167.0099 ms | PASS |
| guard/global-rules/100 | trusted | medianMs | -23.03% / -3.3663 ms | none | 0 | — | 2 | -23.03% / -3.3663 ms | PASS |
| guard/global-rules/100 | trusted | p95Ms | -19.10% / -3.2915 ms | none | 0 | — | 2 | -19.10% / -3.2915 ms | PASS |
| guard/global-rules/100 | trusted | cpuMsPerRequest | -23.61% / -4.4443 ms | none | 0 | — | 2 | -23.61% / -4.4443 ms | PASS |
| guard/large-config/100 | isolated | medianMs | -62.83% / -21.7854 ms | none | 0 | — | 2 | -62.83% / -21.7854 ms | PASS |
| guard/large-config/100 | isolated | p95Ms | -58.89% / -22.9485 ms | none | 0 | — | 2 | -58.89% / -22.9485 ms | PASS |
| guard/large-config/100 | isolated | cpuMsPerRequest | -59.47% / -23.8222 ms | none | 0 | — | 2 | -59.47% / -23.8222 ms | PASS |
| guard/large-config/100 | trusted | medianMs | -8.36% / -1.0453 ms | none | 0 | — | 2 | -8.36% / -1.0453 ms | PASS |
| guard/large-config/100 | trusted | p95Ms | -8.59% / -1.3210 ms | none | 0 | — | 2 | -8.59% / -1.3210 ms | PASS |
| guard/large-config/100 | trusted | cpuMsPerRequest | -15.34% / -2.5798 ms | none | 0 | — | 2 | -15.34% / -2.5798 ms | PASS |
| guard/populate/100 | isolated | medianMs | -67.56% / -33.4783 ms | none | 0 | — | 2 | -67.56% / -33.4783 ms | PASS |
| guard/populate/100 | isolated | p95Ms | -66.51% / -38.1370 ms | none | 0 | — | 2 | -66.51% / -38.1370 ms | PASS |
| guard/populate/100 | isolated | cpuMsPerRequest | -64.53% / -36.8342 ms | none | 0 | — | 2 | -64.53% / -36.8342 ms | PASS |
| guard/populate/100 | trusted | medianMs | -5.08% / -0.7587 ms | mixed signs: p95Ms | 2 | -3.69% / -0.5580 ms | 4 | -5.08% / -0.7587 ms | FAIL: unresolved sign instability: p95Ms |
| guard/populate/100 | trusted | p95Ms | -1.88% / -0.3425 ms | mixed signs: p95Ms | 2 | -1.87% / -0.3260 ms | 4 | -1.87% / -0.3260 ms | FAIL: unresolved sign instability: p95Ms |
| guard/populate/100 | trusted | cpuMsPerRequest | -14.68% / -3.0159 ms | mixed signs: p95Ms | 2 | -10.64% / -2.1110 ms | 4 | -13.76% / -2.7805 ms | FAIL: unresolved sign instability: p95Ms |
| guard/virtuals/100 | isolated | medianMs | -65.87% / -33.0264 ms | none | 0 | — | 2 | -65.87% / -33.0264 ms | PASS |
| guard/virtuals/100 | isolated | p95Ms | -62.85% / -33.6466 ms | none | 0 | — | 2 | -62.85% / -33.6466 ms | PASS |
| guard/virtuals/100 | isolated | cpuMsPerRequest | -61.78% / -34.7687 ms | none | 0 | — | 2 | -61.78% / -34.7687 ms | PASS |
| guard/virtuals/100 | trusted | medianMs | +7.13% / +1.0610 ms | mixed signs: p95Ms | 2 | +3.86% / +0.5991 ms | 4 | +4.34% / +0.6611 ms | PASS |
| guard/virtuals/100 | trusted | p95Ms | -0.49% / -0.1341 ms | mixed signs: p95Ms | 2 | +5.47% / +1.0017 ms | 4 | +5.26% / +0.9507 ms | PASS |
| guard/virtuals/100 | trusted | cpuMsPerRequest | -3.58% / -0.7392 ms | mixed signs: p95Ms | 2 | -4.93% / -1.0352 ms | 4 | -4.81% / -1.0002 ms | PASS |
| read/http-id/plain-wide/100 | isolated | medianMs | -46.10% / -2.2323 ms | none | 0 | — | 2 | -46.10% / -2.2323 ms | PASS |
| read/http-id/plain-wide/100 | isolated | p95Ms | -37.10% / -2.2611 ms | none | 0 | — | 2 | -37.10% / -2.2611 ms | PASS |
| read/http-id/plain-wide/100 | isolated | cpuMsPerRequest | -47.65% / -2.7383 ms | none | 0 | — | 2 | -47.65% / -2.7383 ms | PASS |
| read/http-id/plain-wide/100 | trusted | medianMs | -2.88% / -0.0721 ms | none | 0 | — | 2 | -2.88% / -0.0721 ms | PASS |
| read/http-id/plain-wide/100 | trusted | p95Ms | +10.67% / +0.3763 ms | none | 0 | — | 2 | +10.67% / +0.3763 ms | PASS |
| read/http-id/plain-wide/100 | trusted | cpuMsPerRequest | +0.60% / +0.0172 ms | none | 0 | — | 2 | +0.60% / +0.0172 ms | PASS |
| read/http-id/document-rules/100 | isolated | medianMs | -47.19% / -2.3510 ms | none | 0 | — | 2 | -47.19% / -2.3510 ms | PASS |
| read/http-id/document-rules/100 | isolated | p95Ms | -43.25% / -2.9378 ms | none | 0 | — | 2 | -43.25% / -2.9378 ms | PASS |
| read/http-id/document-rules/100 | isolated | cpuMsPerRequest | -47.78% / -2.8867 ms | none | 0 | — | 2 | -47.78% / -2.8867 ms | PASS |
| read/http-id/document-rules/100 | trusted | medianMs | +0.23% / +0.0061 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | +2.54% / +0.0648 ms | 4 | +0.59% / +0.0143 ms | FAIL: unresolved sign instability: medianMs |
| read/http-id/document-rules/100 | trusted | p95Ms | +6.36% / +0.2155 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -5.42% / -0.2128 ms | 4 | -1.30% / -0.0488 ms | FAIL: unresolved sign instability: medianMs |
| read/http-id/document-rules/100 | trusted | cpuMsPerRequest | +2.58% / +0.0724 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | +2.04% / +0.0658 ms | 4 | +2.58% / +0.0724 ms | FAIL: unresolved sign instability: medianMs |
| read/http-id/embedded/100 | isolated | medianMs | -68.13% / -6.0269 ms | none | 0 | — | 2 | -68.13% / -6.0269 ms | PASS |
| read/http-id/embedded/100 | isolated | p95Ms | -58.95% / -5.9466 ms | none | 0 | — | 2 | -58.95% / -5.9466 ms | PASS |
| read/http-id/embedded/100 | isolated | cpuMsPerRequest | -66.16% / -6.5069 ms | none | 0 | — | 2 | -66.16% / -6.5069 ms | PASS |
| read/http-id/embedded/100 | trusted | medianMs | -3.39% / -0.0995 ms | none | 0 | — | 2 | -3.39% / -0.0995 ms | PASS |
| read/http-id/embedded/100 | trusted | p95Ms | -8.55% / -0.3922 ms | none | 0 | — | 2 | -8.55% / -0.3922 ms | PASS |
| read/http-id/embedded/100 | trusted | cpuMsPerRequest | -4.09% / -0.1490 ms | none | 0 | — | 2 | -4.09% / -0.1490 ms | PASS |
| read/http-id/hydrated/100 | isolated | medianMs | -49.80% / -2.5185 ms | none | 0 | — | 2 | -49.80% / -2.5185 ms | PASS |
| read/http-id/hydrated/100 | isolated | p95Ms | -42.07% / -2.8100 ms | none | 0 | — | 2 | -42.07% / -2.8100 ms | PASS |
| read/http-id/hydrated/100 | isolated | cpuMsPerRequest | -48.82% / -2.8944 ms | none | 0 | — | 2 | -48.82% / -2.8944 ms | PASS |
| read/http-id/hydrated/100 | trusted | medianMs | -4.30% / -0.1184 ms | none | 0 | — | 2 | -4.30% / -0.1184 ms | PASS |
| read/http-id/hydrated/100 | trusted | p95Ms | -5.50% / -0.2248 ms | none | 0 | — | 2 | -5.50% / -0.2248 ms | PASS |
| read/http-id/hydrated/100 | trusted | cpuMsPerRequest | -3.29% / -0.1026 ms | none | 0 | — | 2 | -3.29% / -0.1026 ms | PASS |
| read/http-id/virtuals/100 | isolated | medianMs | -48.91% / -2.5466 ms | none | 0 | — | 2 | -48.91% / -2.5466 ms | PASS |
| read/http-id/virtuals/100 | isolated | p95Ms | -36.42% / -2.3261 ms | none | 0 | — | 2 | -36.42% / -2.3261 ms | PASS |
| read/http-id/virtuals/100 | isolated | cpuMsPerRequest | -50.08% / -3.0858 ms | none | 0 | — | 2 | -50.08% / -3.0858 ms | PASS |
| read/http-id/virtuals/100 | trusted | medianMs | +2.17% / +0.0560 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | +3.09% / +0.0836 ms | 4 | +2.18% / +0.0563 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-id/virtuals/100 | trusted | p95Ms | -4.34% / -0.1757 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | +3.91% / +0.1672 ms | 4 | -0.57% / -0.0235 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-id/virtuals/100 | trusted | cpuMsPerRequest | -2.18% / -0.0708 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -4.91% / -0.1780 ms | 4 | -2.18% / -0.0708 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/plain-wide/100 | isolated | medianMs | -46.53% / -2.2444 ms | none | 0 | — | 2 | -46.53% / -2.2444 ms | PASS |
| read/http-filter/plain-wide/100 | isolated | p95Ms | -44.23% / -3.0403 ms | none | 0 | — | 2 | -44.23% / -3.0403 ms | PASS |
| read/http-filter/plain-wide/100 | isolated | cpuMsPerRequest | -50.35% / -2.9756 ms | none | 0 | — | 2 | -50.35% / -2.9756 ms | PASS |
| read/http-filter/plain-wide/100 | trusted | medianMs | -2.36% / -0.0630 ms | mixed signs: p95Ms | 2 | -0.30% / -0.0093 ms | 4 | -2.36% / -0.0630 ms | PASS |
| read/http-filter/plain-wide/100 | trusted | p95Ms | -2.37% / -0.0943 ms | mixed signs: p95Ms | 2 | +5.80% / +0.2157 ms | 4 | +3.60% / +0.1345 ms | PASS |
| read/http-filter/plain-wide/100 | trusted | cpuMsPerRequest | -2.32% / -0.0690 ms | mixed signs: p95Ms | 2 | -2.82% / -0.0979 ms | 4 | -2.32% / -0.0690 ms | PASS |
| read/http-filter/document-rules/100 | isolated | medianMs | -47.88% / -2.3724 ms | none | 0 | — | 2 | -47.88% / -2.3724 ms | PASS |
| read/http-filter/document-rules/100 | isolated | p95Ms | -43.16% / -2.8083 ms | none | 0 | — | 2 | -43.16% / -2.8083 ms | PASS |
| read/http-filter/document-rules/100 | isolated | cpuMsPerRequest | -49.09% / -2.8420 ms | none | 0 | — | 2 | -49.09% / -2.8420 ms | PASS |
| read/http-filter/document-rules/100 | trusted | medianMs | -0.46% / -0.0124 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | +3.38% / +0.0873 ms | 4 | +0.11% / +0.0031 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/document-rules/100 | trusted | p95Ms | +5.01% / +0.1836 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | +1.08% / +0.0440 ms | 4 | +3.34% / +0.1278 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/document-rules/100 | trusted | cpuMsPerRequest | +1.13% / +0.0283 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | +2.69% / +0.0773 ms | 4 | +2.69% / +0.0773 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/embedded/100 | isolated | medianMs | -68.75% / -6.0559 ms | none | 0 | — | 2 | -68.75% / -6.0559 ms | PASS |
| read/http-filter/embedded/100 | isolated | p95Ms | -60.16% / -6.1774 ms | none | 0 | — | 2 | -60.16% / -6.1774 ms | PASS |
| read/http-filter/embedded/100 | isolated | cpuMsPerRequest | -65.62% / -6.4692 ms | none | 0 | — | 2 | -65.62% / -6.4692 ms | PASS |
| read/http-filter/embedded/100 | trusted | medianMs | +5.49% / +0.1526 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -3.10% / -0.0920 ms | 4 | +2.15% / +0.0588 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/embedded/100 | trusted | p95Ms | -0.27% / -0.0117 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -3.69% / -0.1549 ms | 4 | -0.61% / -0.0255 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/embedded/100 | trusted | cpuMsPerRequest | +0.15% / +0.0049 ms | mixed signs: p95Ms, mixed signs: cpuMsPerRequest | 2 | -5.29% / -0.1835 ms | 4 | -3.53% / -0.1192 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/hydrated/100 | isolated | medianMs | -47.34% / -2.3265 ms | none | 0 | — | 2 | -47.34% / -2.3265 ms | PASS |
| read/http-filter/hydrated/100 | isolated | p95Ms | -41.11% / -2.7444 ms | none | 0 | — | 2 | -41.11% / -2.7444 ms | PASS |
| read/http-filter/hydrated/100 | isolated | cpuMsPerRequest | -49.51% / -2.8879 ms | none | 0 | — | 2 | -49.51% / -2.8879 ms | PASS |
| read/http-filter/hydrated/100 | trusted | medianMs | +2.35% / +0.0610 ms | mixed signs: medianMs, mixed signs: cpuMsPerRequest | 2 | -0.27% / -0.0071 ms | 4 | +0.24% / +0.0065 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/hydrated/100 | trusted | p95Ms | +3.93% / +0.1416 ms | mixed signs: medianMs, mixed signs: cpuMsPerRequest | 2 | -4.65% / -0.1906 ms | 4 | +0.25% / +0.0101 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/hydrated/100 | trusted | cpuMsPerRequest | +4.47% / +0.1307 ms | mixed signs: medianMs, mixed signs: cpuMsPerRequest | 2 | +5.58% / +0.1695 ms | 4 | +5.48% / +0.1615 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| read/http-filter/virtuals/100 | isolated | medianMs | -47.97% / -2.5409 ms | none | 0 | — | 2 | -47.97% / -2.5409 ms | PASS |
| read/http-filter/virtuals/100 | isolated | p95Ms | -39.85% / -2.6407 ms | none | 0 | — | 2 | -39.85% / -2.6407 ms | PASS |
| read/http-filter/virtuals/100 | isolated | cpuMsPerRequest | -48.51% / -2.9856 ms | none | 0 | — | 2 | -48.51% / -2.9856 ms | PASS |
| read/http-filter/virtuals/100 | trusted | medianMs | +3.29% / +0.0894 ms | mixed signs: cpuMsPerRequest | 2 | +0.70% / +0.0181 ms | 4 | +2.13% / +0.0575 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/virtuals/100 | trusted | p95Ms | -1.45% / -0.0576 ms | mixed signs: cpuMsPerRequest | 2 | +2.17% / +0.0851 ms | 4 | -0.11% / -0.0043 ms | FAIL: unresolved sign instability: p95Ms |
| read/http-filter/virtuals/100 | trusted | cpuMsPerRequest | +3.81% / +0.1190 ms | mixed signs: cpuMsPerRequest | 2 | -5.54% / -0.1915 ms | 4 | -1.85% / -0.0583 ms | FAIL: unresolved sign instability: p95Ms |
| helper/H0/100 | isolated | medianMs | -47.37% / -2.2548 ms | none | 0 | — | 2 | -47.37% / -2.2548 ms | PASS |
| helper/H0/100 | isolated | p95Ms | -40.24% / -2.4067 ms | none | 0 | — | 2 | -40.24% / -2.4067 ms | PASS |
| helper/H0/100 | isolated | cpuMsPerRequest | -46.57% / -2.6061 ms | none | 0 | — | 2 | -46.57% / -2.6061 ms | PASS |
| helper/H0/100 | trusted | medianMs | +0.42% / +0.0110 ms | mixed signs: medianMs, mixed signs: cpuMsPerRequest | 2 | +0.12% / +0.0014 ms | 4 | +0.41% / +0.0087 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| helper/H0/100 | trusted | p95Ms | +4.01% / +0.1493 ms | mixed signs: medianMs, mixed signs: cpuMsPerRequest | 2 | -4.39% / -0.1647 ms | 4 | -0.19% / -0.0063 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| helper/H0/100 | trusted | cpuMsPerRequest | +4.45% / +0.1271 ms | mixed signs: medianMs, mixed signs: cpuMsPerRequest | 2 | -4.67% / -0.1347 ms | 4 | -3.50% / -0.1008 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| helper/H1/100 | isolated | medianMs | -50.46% / -1.6414 ms | none | 0 | — | 2 | -50.46% / -1.6414 ms | PASS |
| helper/H1/100 | isolated | p95Ms | -45.61% / -2.2467 ms | none | 0 | — | 2 | -45.61% / -2.2467 ms | PASS |
| helper/H1/100 | isolated | cpuMsPerRequest | -48.17% / -1.9673 ms | none | 0 | — | 2 | -48.17% / -1.9673 ms | PASS |
| helper/H1/100 | trusted | medianMs | -52.24% / -1.7663 ms | none | 0 | — | 2 | -52.24% / -1.7663 ms | PASS |
| helper/H1/100 | trusted | p95Ms | -51.57% / -2.6922 ms | none | 0 | — | 2 | -51.57% / -2.6922 ms | PASS |
| helper/H1/100 | trusted | cpuMsPerRequest | -49.77% / -2.0610 ms | none | 0 | — | 2 | -49.77% / -2.0610 ms | PASS |
| helper/H1-scoped/100 | isolated | medianMs | -19.83% / -0.2700 ms | none | 0 | — | 2 | -19.83% / -0.2700 ms | PASS |
| helper/H1-scoped/100 | isolated | p95Ms | -17.87% / -0.3654 ms | none | 0 | — | 2 | -17.87% / -0.3654 ms | PASS |
| helper/H1-scoped/100 | isolated | cpuMsPerRequest | -20.95% / -0.3544 ms | none | 0 | — | 2 | -20.95% / -0.3544 ms | PASS |
| helper/H1-scoped/100 | trusted | medianMs | -22.42% / -0.3182 ms | none | 0 | — | 2 | -22.42% / -0.3182 ms | PASS |
| helper/H1-scoped/100 | trusted | p95Ms | -31.46% / -0.6535 ms | none | 0 | — | 2 | -31.46% / -0.6535 ms | PASS |
| helper/H1-scoped/100 | trusted | cpuMsPerRequest | -27.34% / -0.4455 ms | none | 0 | — | 2 | -27.34% / -0.4455 ms | PASS |
| helper/H2/100 | isolated | medianMs | -62.14% / -6.5649 ms | none | 0 | — | 2 | -62.14% / -6.5649 ms | PASS |
| helper/H2/100 | isolated | cpuMsPerRequest | -64.98% / -8.1603 ms | none | 0 | — | 2 | -64.98% / -8.1603 ms | PASS |
| helper/H2/100 | trusted | medianMs | -26.40% / -1.3870 ms | none | 0 | — | 2 | -26.40% / -1.3870 ms | PASS |
| helper/H2/100 | trusted | cpuMsPerRequest | -30.35% / -1.8867 ms | none | 0 | — | 2 | -30.35% / -1.8867 ms | PASS |
| helper/H2-query/100 | isolated | medianMs | -47.27% / -2.2879 ms | none | 0 | — | 2 | -47.27% / -2.2879 ms | PASS |
| helper/H2-query/100 | isolated | p95Ms | -38.67% / -2.4064 ms | none | 0 | — | 2 | -38.67% / -2.4064 ms | PASS |
| helper/H2-query/100 | isolated | cpuMsPerRequest | -50.15% / -2.9326 ms | none | 0 | — | 2 | -50.15% / -2.9326 ms | PASS |
| helper/H2-query/100 | trusted | medianMs | -3.23% / -0.0849 ms | mixed signs: cpuMsPerRequest | 2 | -5.97% / -0.1579 ms | 4 | -4.31% / -0.1118 ms | FAIL: unresolved sign instability: p95Ms |
| helper/H2-query/100 | trusted | p95Ms | +2.34% / +0.0833 ms | mixed signs: cpuMsPerRequest | 2 | -5.92% / -0.2214 ms | 4 | -1.45% / -0.0542 ms | FAIL: unresolved sign instability: p95Ms |
| helper/H2-query/100 | trusted | cpuMsPerRequest | +2.23% / +0.0597 ms | mixed signs: cpuMsPerRequest | 2 | -4.95% / -0.1460 ms | 4 | -2.82% / -0.0865 ms | FAIL: unresolved sign instability: p95Ms |
| helper/H2-global/100 | isolated | medianMs | -50.99% / -2.9213 ms | none | 0 | — | 2 | -50.99% / -2.9213 ms | PASS |
| helper/H2-global/100 | isolated | p95Ms | -44.99% / -3.3436 ms | none | 0 | — | 2 | -44.99% / -3.3436 ms | PASS |
| helper/H2-global/100 | isolated | cpuMsPerRequest | -51.26% / -3.4721 ms | none | 0 | — | 2 | -51.26% / -3.4721 ms | PASS |
| helper/H2-global/100 | trusted | medianMs | +9.29% / +0.2507 ms | material adverse pair: cpuMsPerRequest | 2 | +1.35% / +0.0348 ms | 4 | +6.35% / +0.1688 ms | PASS |
| helper/H2-global/100 | trusted | p95Ms | +8.86% / +0.3373 ms | material adverse pair: cpuMsPerRequest | 2 | +2.60% / +0.1017 ms | 4 | +5.19% / +0.2007 ms | PASS |
| helper/H2-global/100 | trusted | cpuMsPerRequest | +14.16% / +0.4425 ms | material adverse pair: cpuMsPerRequest | 2 | +2.80% / +0.0876 ms | 4 | +6.76% / +0.2109 ms | PASS |
| helper/H4/100 | isolated | medianMs | -18.56% / -0.5443 ms | none | 0 | — | 2 | -18.56% / -0.5443 ms | PASS |
| helper/H4/100 | isolated | p95Ms | -15.76% / -0.6489 ms | none | 0 | — | 2 | -15.76% / -0.6489 ms | PASS |
| helper/H4/100 | isolated | cpuMsPerRequest | -15.94% / -0.5033 ms | none | 0 | — | 2 | -15.94% / -0.5033 ms | PASS |
| helper/H4/100 | trusted | medianMs | +2.98% / +0.0645 ms | none | 0 | — | 2 | +2.98% / +0.0645 ms | PASS |
| helper/H4/100 | trusted | p95Ms | -2.05% / -0.0668 ms | none | 0 | — | 2 | -2.05% / -0.0668 ms | PASS |
| helper/H4/100 | trusted | cpuMsPerRequest | +6.21% / +0.1409 ms | none | 0 | — | 2 | +6.21% / +0.1409 ms | PASS |
| helper/H3/10 | isolated | medianMs | -87.84% / -45.0012 ms | none | 0 | — | 2 | -87.84% / -45.0012 ms | PASS |
| helper/H3/10 | isolated | cpuMsPerRequest | -86.57% / -46.9393 ms | none | 0 | — | 2 | -86.57% / -46.9393 ms | PASS |
| helper/H3/10 | trusted | medianMs | -39.77% / -3.7133 ms | none | 0 | — | 2 | -39.77% / -3.7133 ms | PASS |
| helper/H3/10 | trusted | cpuMsPerRequest | -45.25% / -5.4315 ms | none | 0 | — | 2 | -45.25% / -5.4315 ms | PASS |
| helper/H3-query/10 | isolated | medianMs | -81.99% / -17.6235 ms | none | 0 | — | 2 | -81.99% / -17.6235 ms | PASS |
| helper/H3-query/10 | isolated | p95Ms | -76.27% / -17.8255 ms | none | 0 | — | 2 | -76.27% / -17.8255 ms | PASS |
| helper/H3-query/10 | isolated | cpuMsPerRequest | -78.39% / -17.8733 ms | none | 0 | — | 2 | -78.39% / -17.8733 ms | PASS |
| helper/H3-query/10 | trusted | medianMs | -12.32% / -0.4828 ms | none | 0 | — | 2 | -12.32% / -0.4828 ms | PASS |
| helper/H3-query/10 | trusted | p95Ms | -11.62% / -0.6737 ms | none | 0 | — | 2 | -11.62% / -0.6737 ms | PASS |
| helper/H3-query/10 | trusted | cpuMsPerRequest | -16.10% / -0.8354 ms | none | 0 | — | 2 | -16.10% / -0.8354 ms | PASS |
| helper/H3-global/10 | isolated | medianMs | -79.08% / -22.8037 ms | none | 0 | — | 2 | -79.08% / -22.8037 ms | PASS |
| helper/H3-global/10 | isolated | p95Ms | -74.22% / -23.0292 ms | none | 0 | — | 2 | -74.22% / -23.0292 ms | PASS |
| helper/H3-global/10 | isolated | cpuMsPerRequest | -73.14% / -22.1960 ms | none | 0 | — | 2 | -73.14% / -22.1960 ms | PASS |
| helper/H3-global/10 | trusted | medianMs | +13.60% / +0.7256 ms | material adverse pair: cpuMsPerRequest | 2 | +12.30% / +0.6637 ms | 4 | +12.57% / +0.6701 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3-global/10 | trusted | p95Ms | +10.97% / +0.7887 ms | material adverse pair: cpuMsPerRequest | 2 | +3.99% / +0.2903 ms | 4 | +7.16% / +0.5174 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3-global/10 | trusted | cpuMsPerRequest | +19.11% / +1.2989 ms | material adverse pair: cpuMsPerRequest | 2 | +16.16% / +1.1350 ms | 4 | +18.01% / +1.2266 ms | FAIL: confirmed adverse: cpuMsPerRequest |
| helper/H3/100 | isolated | medianMs | -93.78% / -416.6689 ms | none | 0 | — | 2 | -93.78% / -416.6689 ms | PASS |
| helper/H3/100 | isolated | cpuMsPerRequest | -93.56% / -444.2177 ms | none | 0 | — | 2 | -93.56% / -444.2177 ms | PASS |
| helper/H3/100 | trusted | medianMs | -48.95% / -21.5064 ms | none | 0 | — | 2 | -48.95% / -21.5064 ms | PASS |
| helper/H3/100 | trusted | cpuMsPerRequest | -54.37% / -29.0903 ms | none | 0 | — | 2 | -54.37% / -29.0903 ms | PASS |
| helper/H3-query/100 | isolated | medianMs | -91.67% / -165.4725 ms | none | 0 | — | 2 | -91.67% / -165.4725 ms | PASS |
| helper/H3-query/100 | isolated | p95Ms | -91.32% / -176.5167 ms | none | 0 | — | 2 | -91.32% / -176.5167 ms | PASS |
| helper/H3-query/100 | isolated | cpuMsPerRequest | -90.99% / -175.3726 ms | none | 0 | — | 2 | -90.99% / -175.3726 ms | PASS |
| helper/H3-query/100 | trusted | medianMs | -20.69% / -3.1980 ms | none | 0 | — | 2 | -20.69% / -3.1980 ms | PASS |
| helper/H3-query/100 | trusted | p95Ms | -18.13% / -3.2337 ms | none | 0 | — | 2 | -18.13% / -3.2337 ms | PASS |
| helper/H3-query/100 | trusted | cpuMsPerRequest | -24.88% / -4.6223 ms | none | 0 | — | 2 | -24.88% / -4.6223 ms | PASS |
| helper/H3-global/100 | isolated | medianMs | -87.09% / -222.8993 ms | none | 0 | — | 2 | -87.09% / -222.8993 ms | PASS |
| helper/H3-global/100 | isolated | p95Ms | -86.39% / -232.6249 ms | none | 0 | — | 2 | -86.39% / -232.6249 ms | PASS |
| helper/H3-global/100 | isolated | cpuMsPerRequest | -84.96% / -231.7025 ms | none | 0 | — | 2 | -84.96% / -231.7025 ms | PASS |
| helper/H3-global/100 | trusted | medianMs | +14.25% / +3.9816 ms | material adverse pair: medianMs, material adverse pair: p95Ms, material adverse pair: cpuMsPerRequest | 2 | +14.68% / +4.1353 ms | 4 | +14.25% / +3.9816 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | p95Ms | +18.07% / +5.5002 ms | material adverse pair: medianMs, material adverse pair: p95Ms, material adverse pair: cpuMsPerRequest | 2 | +12.27% / +3.8772 ms | 4 | +14.28% / +4.4523 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| helper/H3-global/100 | trusted | cpuMsPerRequest | +18.45% / +6.1730 ms | material adverse pair: medianMs, material adverse pair: p95Ms, material adverse pair: cpuMsPerRequest | 2 | +13.97% / +4.8879 ms | 4 | +15.82% / +5.3927 ms | FAIL: confirmed adverse: medianMs, confirmed adverse: cpuMsPerRequest |
| native-adapter/direct-read/100 | isolated | medianMs | -80.44% / -8.2265 ms | none | 0 | — | 2 | -80.44% / -8.2265 ms | PASS |
| native-adapter/direct-read/100 | isolated | p95Ms | -72.68% / -8.6498 ms | none | 0 | — | 2 | -72.68% / -8.6498 ms | PASS |
| native-adapter/direct-read/100 | isolated | cpuMsPerRequest | -73.77% / -8.1432 ms | none | 0 | — | 2 | -73.77% / -8.1432 ms | PASS |
| native-adapter/direct-read/100 | trusted | medianMs | -1.70% / -0.0350 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -4.74% / -0.1081 ms | 4 | -1.96% / -0.0409 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| native-adapter/direct-read/100 | trusted | p95Ms | -6.91% / -0.2529 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -4.28% / -0.1820 ms | 4 | -5.01% / -0.2009 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| native-adapter/direct-read/100 | trusted | cpuMsPerRequest | -7.20% / -0.2112 ms | mixed signs: medianMs, mixed signs: p95Ms | 2 | -8.14% / -0.2607 ms | 4 | -7.20% / -0.2112 ms | FAIL: unresolved sign instability: medianMs, unresolved sign instability: p95Ms |
| native-adapter/direct-list/100 | isolated | medianMs | -96.98% / -742.9511 ms | none | 0 | — | 2 | -96.98% / -742.9511 ms | PASS |
| native-adapter/direct-list/100 | isolated | p95Ms | -96.71% / -762.2448 ms | none | 0 | — | 2 | -96.71% / -762.2448 ms | PASS |
| native-adapter/direct-list/100 | isolated | cpuMsPerRequest | -96.65% / -771.2825 ms | none | 0 | — | 2 | -96.65% / -771.2825 ms | PASS |
| native-adapter/direct-list/100 | trusted | medianMs | -18.90% / -3.4774 ms | none | 0 | — | 2 | -18.90% / -3.4774 ms | PASS |
| native-adapter/direct-list/100 | trusted | p95Ms | -18.89% / -4.0423 ms | none | 0 | — | 2 | -18.89% / -4.0423 ms | PASS |
| native-adapter/direct-list/100 | trusted | cpuMsPerRequest | -19.73% / -4.5019 ms | none | 0 | — | 2 | -19.73% / -4.5019 ms | PASS |
| facts/owner-only/100 | isolated | medianMs | -92.48% / -163.0286 ms | none | 0 | — | 2 | -92.48% / -163.0286 ms | PASS |
| facts/owner-only/100 | isolated | p95Ms | -92.09% / -177.7618 ms | none | 0 | — | 2 | -92.09% / -177.7618 ms | PASS |
| facts/owner-only/100 | isolated | cpuMsPerRequest | -91.76% / -173.2804 ms | none | 0 | — | 2 | -91.76% / -173.2804 ms | PASS |
| facts/owner-only/100 | trusted | medianMs | -24.94% / -3.5095 ms | none | 0 | — | 2 | -24.94% / -3.5095 ms | PASS |
| facts/owner-only/100 | trusted | p95Ms | -23.49% / -3.8688 ms | none | 0 | — | 2 | -23.49% / -3.8688 ms | PASS |
| facts/owner-only/100 | trusted | cpuMsPerRequest | -27.13% / -4.4807 ms | none | 0 | — | 2 | -27.13% / -4.4807 ms | PASS |
| facts/unused-checksum/100 | isolated | medianMs | -87.19% / -163.9235 ms | none | 0 | — | 2 | -87.19% / -163.9235 ms | PASS |
| facts/unused-checksum/100 | isolated | p95Ms | -86.72% / -173.3179 ms | none | 0 | — | 2 | -86.72% / -173.3179 ms | PASS |
| facts/unused-checksum/100 | isolated | cpuMsPerRequest | -86.66% / -170.6808 ms | none | 0 | — | 2 | -86.66% / -170.6808 ms | PASS |
| facts/unused-checksum/100 | trusted | medianMs | -12.14% / -3.0096 ms | none | 0 | — | 2 | -12.14% / -3.0096 ms | PASS |
| facts/unused-checksum/100 | trusted | p95Ms | -10.96% / -2.9908 ms | none | 0 | — | 2 | -10.96% / -2.9908 ms | PASS |
| facts/unused-checksum/100 | trusted | cpuMsPerRequest | -13.75% / -3.7368 ms | none | 0 | — | 2 | -13.75% / -3.7368 ms | PASS |
| retention/held-released/100/4 | isolated | medianMs | -79.32% / -25.3338 ms | none | 0 | — | 2 | -79.32% / -25.3338 ms | PASS |
| retention/held-released/100/4 | isolated | p95Ms | -75.75% / -25.9048 ms | none | 0 | — | 2 | -75.75% / -25.9048 ms | PASS |
| retention/held-released/100/4 | isolated | cpuMsPerRequest | -74.92% / -25.5931 ms | none | 0 | — | 2 | -74.92% / -25.5931 ms | PASS |
| retention/held-released/100/4 | trusted | medianMs | -12.81% / -0.7753 ms | none | 0 | — | 2 | -12.81% / -0.7753 ms | PASS |
| retention/held-released/100/4 | trusted | p95Ms | -9.94% / -0.7845 ms | none | 0 | — | 2 | -9.94% / -0.7845 ms | PASS |
| retention/held-released/100/4 | trusted | cpuMsPerRequest | -13.54% / -1.0404 ms | none | 0 | — | 2 | -13.54% / -1.0404 ms | PASS |
| retention/held-released/100/24 | isolated | medianMs | -92.57% / -163.5664 ms | none | 0 | — | 2 | -92.57% / -163.5664 ms | PASS |
| retention/held-released/100/24 | isolated | p95Ms | -91.85% / -170.0762 ms | none | 0 | — | 2 | -91.85% / -170.0762 ms | PASS |
| retention/held-released/100/24 | isolated | cpuMsPerRequest | -91.80% / -170.2685 ms | none | 0 | — | 2 | -91.80% / -170.2685 ms | PASS |
| retention/held-released/100/24 | trusted | medianMs | -23.76% / -3.3148 ms | none | 0 | — | 2 | -23.76% / -3.3148 ms | PASS |
| retention/held-released/100/24 | trusted | p95Ms | -23.30% / -3.7742 ms | none | 0 | — | 2 | -23.30% / -3.7742 ms | PASS |
| retention/held-released/100/24 | trusted | cpuMsPerRequest | -27.20% / -4.4910 ms | none | 0 | — | 2 | -27.20% / -4.4910 ms | PASS |
| retention/held-released/100/48 | isolated | medianMs | -96.14% / -533.8664 ms | none | 0 | — | 2 | -96.14% / -533.8664 ms | PASS |
| retention/held-released/100/48 | isolated | p95Ms | -95.87% / -549.3990 ms | none | 0 | — | 2 | -95.87% / -549.3990 ms | PASS |
| retention/held-released/100/48 | isolated | cpuMsPerRequest | -95.82% / -557.2706 ms | none | 0 | — | 2 | -95.82% / -557.2706 ms | PASS |
| retention/held-released/100/48 | trusted | medianMs | -25.68% / -5.8593 ms | none | 0 | — | 2 | -25.68% / -5.8593 ms | PASS |
| retention/held-released/100/48 | trusted | p95Ms | -22.57% / -5.8283 ms | none | 0 | — | 2 | -22.57% / -5.8283 ms | PASS |
| retention/held-released/100/48 | trusted | cpuMsPerRequest | -24.82% / -6.3576 ms | none | 0 | — | 2 | -24.82% / -6.3576 ms | PASS |
