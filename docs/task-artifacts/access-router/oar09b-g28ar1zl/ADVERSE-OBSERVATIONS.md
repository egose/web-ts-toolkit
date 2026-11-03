> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# Every observed material adverse pair/metric, including later unconfirmed results

No original or repeat observations are discarded. These are individual paired adverse observations, NOT automatically confirmed regressions. Fixed confirmation requires the same metric in >=3/4 pairs AND its median paired delta crossing both thresholds.

| Case | Profile | Round | Metric | Delta percent / ms | Old / new raw jobs | Metric confirmed? | Final comparison |
|---|---|---:|---|---|---|---|---|
| primary/plain-wide/100 | trusted | 2 | medianMs | +15.04% / +1.7745 ms | 358 / 357 | yes | FAIL |
| primary/plain-wide/100 | trusted | 3 | medianMs | +13.66% / +1.6221 ms | 361 / 362 | yes | FAIL |
| primary/plain-wide/100 | trusted | 4 | medianMs | +16.10% / +1.9092 ms | 364 / 363 | yes | FAIL |
| guard/hydrated/10 | trusted | 1 | medianMs | +31.84% / +1.1311 ms | 19 / 20 | no | PASS after fixed protocol |
| guard/hydrated/10 | trusted | 1 | cpuMsPerRequest | +43.91% / +2.0760 ms | 19 / 20 | no | PASS after fixed protocol |
| guard/hydrated/10 | trusted | 3 | cpuMsPerRequest | +18.05% / +1.0411 ms | 369 / 370 | no | PASS after fixed protocol |
| guard/hydrated/10 | trusted | 4 | p95Ms | +34.70% / +2.4215 ms | 372 / 371 | no | PASS after fixed protocol |
| guard/large-config/10 | trusted | 2 | cpuMsPerRequest | +19.93% / +1.0485 ms | 334 / 333 | no | FAIL |
| guard/populate/10 | trusted | 4 | medianMs | +21.15% / +1.1527 ms | 384 / 383 | no | PASS after fixed protocol |
| guard/populate/10 | trusted | 4 | cpuMsPerRequest | +16.24% / +1.1333 ms | 384 / 383 | no | PASS after fixed protocol |
| guard/virtuals/10 | trusted | 1 | cpuMsPerRequest | +32.66% / +1.6130 ms | 35 / 36 | yes | FAIL |
| guard/virtuals/10 | trusted | 2 | cpuMsPerRequest | +26.88% / +1.4499 ms | 326 / 325 | yes | FAIL |
| guard/virtuals/10 | trusted | 4 | cpuMsPerRequest | +26.38% / +1.4122 ms | 388 / 387 | yes | FAIL |
| guard/hydrated/100 | trusted | 2 | medianMs | +11.86% / +1.6883 ms | 318 / 317 | yes | FAIL |
| guard/hydrated/100 | trusted | 3 | medianMs | +11.53% / +1.6090 ms | 393 / 394 | yes | FAIL |
| guard/hydrated/100 | trusted | 4 | medianMs | +10.57% / +1.4462 ms | 396 / 395 | yes | FAIL |
| guard/populate/100 | trusted | 1 | medianMs | +15.45% / +2.1817 ms | 55 / 56 | yes | FAIL |
| guard/populate/100 | trusted | 1 | p95Ms | +17.29% / +2.8778 ms | 55 / 56 | no | FAIL |
| guard/populate/100 | trusted | 2 | medianMs | +16.85% / +2.4290 ms | 306 / 305 | yes | FAIL |
| guard/populate/100 | trusted | 3 | medianMs | +15.23% / +2.2691 ms | 397 / 398 | yes | FAIL |
| guard/populate/100 | trusted | 4 | medianMs | +17.86% / +2.7328 ms | 400 / 399 | yes | FAIL |
| guard/virtuals/100 | trusted | 1 | medianMs | +31.38% / +4.7766 ms | 59 / 60 | yes | FAIL |
| guard/virtuals/100 | trusted | 1 | p95Ms | +28.20% / +4.8171 ms | 59 / 60 | yes | FAIL |
| guard/virtuals/100 | trusted | 1 | cpuMsPerRequest | +10.43% / +2.2585 ms | 59 / 60 | yes | FAIL |
| guard/virtuals/100 | trusted | 2 | medianMs | +33.41% / +4.8938 ms | 302 / 301 | yes | FAIL |
| guard/virtuals/100 | trusted | 2 | p95Ms | +20.88% / +3.7402 ms | 302 / 301 | yes | FAIL |
| guard/virtuals/100 | trusted | 2 | cpuMsPerRequest | +16.44% / +3.3109 ms | 302 / 301 | yes | FAIL |
| guard/virtuals/100 | trusted | 3 | medianMs | +28.72% / +4.4429 ms | 401 / 402 | yes | FAIL |
| guard/virtuals/100 | trusted | 3 | p95Ms | +26.10% / +4.5755 ms | 401 / 402 | yes | FAIL |
| guard/virtuals/100 | trusted | 3 | cpuMsPerRequest | +14.93% / +3.1132 ms | 401 / 402 | yes | FAIL |
| guard/virtuals/100 | trusted | 4 | medianMs | +34.63% / +5.3846 ms | 404 / 403 | yes | FAIL |
| guard/virtuals/100 | trusted | 4 | p95Ms | +32.09% / +5.8126 ms | 404 / 403 | yes | FAIL |
| guard/virtuals/100 | trusted | 4 | cpuMsPerRequest | +20.93% / +4.3637 ms | 404 / 403 | yes | FAIL |
| read/http-id/plain-wide/100 | trusted | 2 | cpuMsPerRequest | +22.29% / +0.6297 ms | 298 / 297 | no | PASS after fixed protocol |
| read/http-id/hydrated/100 | isolated | 1 | p95Ms | +644.67% / +37.8566 ms | 73 / 74 | no | PASS after fixed protocol |
| read/http-id/hydrated/100 | trusted | 3 | cpuMsPerRequest | +17.20% / +0.5442 ms | 417 / 418 | no | PASS after fixed protocol |
| read/http-filter/document-rules/100 | trusted | 1 | cpuMsPerRequest | +21.41% / +0.6126 ms | 87 / 88 | no | PASS after fixed protocol |
| read/http-filter/document-rules/100 | trusted | 4 | cpuMsPerRequest | +23.31% / +0.6786 ms | 424 / 423 | no | PASS after fixed protocol |
| read/http-filter/hydrated/100 | trusted | 2 | cpuMsPerRequest | +17.68% / +0.5168 ms | 266 / 265 | no | FAIL |
| read/http-filter/virtuals/100 | trusted | 1 | cpuMsPerRequest | +29.57% / +0.8645 ms | 99 / 100 | no | PASS after fixed protocol |
| helper/H2-global/100 | trusted | 2 | cpuMsPerRequest | +16.96% / +0.5281 ms | 238 / 237 | yes | FAIL |
| helper/H2-global/100 | trusted | 3 | cpuMsPerRequest | +25.22% / +0.8293 ms | 445 / 446 | yes | FAIL |
| helper/H2-global/100 | trusted | 4 | cpuMsPerRequest | +21.41% / +0.6973 ms | 448 / 447 | yes | FAIL |
| helper/H4/100 | trusted | 1 | cpuMsPerRequest | +30.29% / +0.6657 ms | 127 / 128 | yes | FAIL |
| helper/H4/100 | trusted | 2 | cpuMsPerRequest | +43.98% / +0.9894 ms | 234 / 233 | yes | FAIL |
| helper/H4/100 | trusted | 3 | cpuMsPerRequest | +29.22% / +0.7103 ms | 449 / 450 | yes | FAIL |
| helper/H4/100 | trusted | 4 | cpuMsPerRequest | +30.84% / +0.7561 ms | 452 / 451 | yes | FAIL |
| helper/H3-global/10 | trusted | 1 | medianMs | +43.29% / +2.2336 ms | 139 / 140 | yes | FAIL |
| helper/H3-global/10 | trusted | 1 | cpuMsPerRequest | +42.25% / +2.8199 ms | 139 / 140 | yes | FAIL |
| helper/H3-global/10 | trusted | 2 | medianMs | +36.03% / +1.9150 ms | 222 / 221 | yes | FAIL |
| helper/H3-global/10 | trusted | 2 | cpuMsPerRequest | +40.33% / +2.7089 ms | 222 / 221 | yes | FAIL |
| helper/H3-global/10 | trusted | 3 | medianMs | +39.65% / +2.0992 ms | 457 / 458 | yes | FAIL |
| helper/H3-global/10 | trusted | 3 | p95Ms | +30.74% / +2.1392 ms | 457 / 458 | no | FAIL |
| helper/H3-global/10 | trusted | 3 | cpuMsPerRequest | +42.07% / +2.8209 ms | 457 / 458 | yes | FAIL |
| helper/H3-global/10 | trusted | 4 | medianMs | +45.28% / +2.3359 ms | 460 / 459 | yes | FAIL |
| helper/H3-global/10 | trusted | 4 | p95Ms | +31.82% / +2.2326 ms | 460 / 459 | no | FAIL |
| helper/H3-global/10 | trusted | 4 | cpuMsPerRequest | +45.17% / +2.9895 ms | 460 / 459 | yes | FAIL |
| helper/H3-global/100 | trusted | 1 | medianMs | +68.56% / +18.5215 ms | 151 / 152 | yes | FAIL |
| helper/H3-global/100 | trusted | 1 | p95Ms | +76.34% / +22.4867 ms | 151 / 152 | yes | FAIL |
| helper/H3-global/100 | trusted | 1 | cpuMsPerRequest | +72.54% / +23.5415 ms | 151 / 152 | yes | FAIL |
| helper/H3-global/100 | trusted | 2 | medianMs | +60.73% / +16.8042 ms | 210 / 209 | yes | FAIL |
| helper/H3-global/100 | trusted | 2 | p95Ms | +54.03% / +16.7788 ms | 210 / 209 | yes | FAIL |
| helper/H3-global/100 | trusted | 2 | cpuMsPerRequest | +63.74% / +21.0046 ms | 210 / 209 | yes | FAIL |
| helper/H3-global/100 | trusted | 3 | medianMs | +62.53% / +17.6184 ms | 461 / 462 | yes | FAIL |
| helper/H3-global/100 | trusted | 3 | p95Ms | +65.97% / +20.8076 ms | 461 / 462 | yes | FAIL |
| helper/H3-global/100 | trusted | 3 | cpuMsPerRequest | +66.49% / +22.7117 ms | 461 / 462 | yes | FAIL |
| helper/H3-global/100 | trusted | 4 | medianMs | +61.70% / +17.3519 ms | 464 / 463 | yes | FAIL |
| helper/H3-global/100 | trusted | 4 | p95Ms | +60.71% / +19.2593 ms | 464 / 463 | yes | FAIL |
| helper/H3-global/100 | trusted | 4 | cpuMsPerRequest | +67.03% / +22.6410 ms | 464 / 463 | yes | FAIL |
