> Historical document preserved from ignored task scratch storage.
> Scope and limitations: `docs/task-artifacts/access-router/README.md`. References to omitted
> artifacts are historical, not available execution prerequisites.

# B1: every directly measured pair

Report-only; no gate status. Each CPU is actual worker user+system/request.

| Comparison | Round | Comparator job | Many job | Comparator median / p95 / CPU ms | Many median / p95 / CPU ms | Paired median delta | Paired p95 delta | Paired CPU delta |
|---|---:|---:|---:|---|---|---|---|---|
| helper/B1-global-many/10/raw-only/isolated/current-independent | 1 | 1 | 2 | 4.1553 / 6.1313 / 5.8229 | 4.7459 / 6.6643 / 6.4609 | +14.21% / +0.5906 ms | +8.69% / +0.5330 ms | +10.96% / +0.6380 ms |
| helper/B1-global-many/10/raw-only/isolated/current-independent | 2 | 64 | 63 | 4.0797 / 6.3794 / 5.9645 | 4.0477 / 6.0256 / 5.8458 | -0.78% / -0.0319 ms | -5.55% / -0.3538 ms | -1.99% / -0.1187 ms |
| helper/B1-global-many/10/raw-only/isolated/current-independent | 3 | 65 | 66 | 4.0244 / 6.2534 / 5.9459 | 4.1802 / 5.5794 / 5.8067 | +3.87% / +0.1559 ms | -10.78% / -0.6740 ms | -2.34% / -0.1392 ms |
| helper/B1-global-many/10/raw-only/isolated/current-independent | 4 | 68 | 67 | 3.8977 / 6.8035 / 5.7188 | 4.0714 / 5.2636 / 5.6756 | +4.46% / +0.1737 ms | -22.63% / -1.5399 ms | -0.76% / -0.0432 ms |
| helper/B1-global-many/10/raw-only/isolated/historical | 1 | 3 | 4 | 18.5180 / 20.5416 / 20.7981 | 4.6521 / 8.0049 / 7.0473 | -74.88% / -13.8659 ms | -61.03% / -12.5367 ms | -66.12% / -13.7508 ms |
| helper/B1-global-many/10/raw-only/isolated/historical | 2 | 62 | 61 | 17.2281 / 19.0621 / 19.2871 | 4.1573 / 5.3073 / 5.8336 | -75.87% / -13.0708 ms | -72.16% / -13.7549 ms | -69.75% / -13.4535 ms |
| helper/B1-global-many/10/raw-only/isolated/historical | 3 | 69 | 70 | 18.0422 / 19.6289 / 20.1346 | 4.1210 / 5.7038 / 5.9156 | -77.16% / -13.9212 ms | -70.94% / -13.9252 ms | -70.62% / -14.2190 ms |
| helper/B1-global-many/10/raw-only/isolated/historical | 4 | 72 | 71 | 17.8970 / 19.7020 / 20.0534 | 4.3308 / 5.9095 / 6.2849 | -75.80% / -13.5663 ms | -70.01% / -13.7925 ms | -68.66% / -13.7686 ms |
| helper/B1-global-many/10/raw-only/trusted/current-independent | 1 | 5 | 6 | 4.3380 / 6.5069 / 6.1718 | 4.8535 / 7.5951 / 6.8515 | +11.88% / +0.5156 ms | +16.72% / +1.0882 ms | +11.01% / +0.6797 ms |
| helper/B1-global-many/10/raw-only/trusted/current-independent | 2 | 60 | 59 | 3.7438 / 6.4436 / 5.7292 | 4.1859 / 5.4050 / 5.9643 | +11.81% / +0.4421 ms | -16.12% / -1.0386 ms | +4.10% / +0.2351 ms |
| helper/B1-global-many/10/raw-only/trusted/current-independent | 3 | 73 | 74 | 4.0190 / 6.9912 / 5.9917 | 4.3393 / 5.8381 / 6.1235 | +7.97% / +0.3203 ms | -16.49% / -1.1531 ms | +2.20% / +0.1318 ms |
| helper/B1-global-many/10/raw-only/trusted/current-independent | 4 | 76 | 75 | 4.0791 / 5.9443 / 5.7580 | 4.4285 / 5.8595 / 6.1133 | +8.57% / +0.3495 ms | -1.43% / -0.0847 ms | +6.17% / +0.3553 ms |
| helper/B1-global-many/10/raw-only/trusted/historical | 1 | 7 | 8 | 18.4021 / 20.4427 / 20.5835 | 4.1571 / 5.5022 / 5.9372 | -77.41% / -14.2450 ms | -73.08% / -14.9406 ms | -71.16% / -14.6462 ms |
| helper/B1-global-many/10/raw-only/trusted/historical | 2 | 58 | 57 | 17.5894 / 19.0655 / 19.6854 | 4.2723 / 5.6952 / 5.7846 | -75.71% / -13.3171 ms | -70.13% / -13.3703 ms | -70.61% / -13.9008 ms |
| helper/B1-global-many/10/raw-only/trusted/historical | 3 | 77 | 78 | 17.7828 / 19.2047 / 19.8449 | 4.4033 / 5.7507 / 5.9934 | -75.24% / -13.3796 ms | -70.06% / -13.4540 ms | -69.80% / -13.8515 ms |
| helper/B1-global-many/10/raw-only/trusted/historical | 4 | 80 | 79 | 17.3426 / 19.1541 / 19.4941 | 4.1796 / 5.2585 / 5.6214 | -75.90% / -13.1629 ms | -72.55% / -13.8956 ms | -71.16% / -13.8726 ms |
| helper/B1-global-many/10/query-plus-helper/isolated/current-independent | 1 | 9 | 10 | 8.0126 / 10.2560 / 10.5683 | 7.6506 / 10.3069 / 9.9090 | -4.52% / -0.3620 ms | +0.50% / +0.0509 ms | -6.24% / -0.6593 ms |
| helper/B1-global-many/10/query-plus-helper/isolated/current-independent | 2 | 56 | 55 | 8.0078 / 10.9274 / 10.6664 | 7.9168 / 9.7141 / 9.8638 | -1.14% / -0.0910 ms | -11.10% / -1.2133 ms | -7.52% / -0.8026 ms |
| helper/B1-global-many/10/query-plus-helper/isolated/current-independent | 3 | 81 | 82 | 7.5794 / 10.6613 / 10.1330 | 7.6366 / 9.6609 / 9.5942 | +0.75% / +0.0572 ms | -9.38% / -1.0005 ms | -5.32% / -0.5388 ms |
| helper/B1-global-many/10/query-plus-helper/isolated/current-independent | 4 | 84 | 83 | 7.5358 / 9.9550 / 9.8415 | 7.5547 / 10.0374 / 9.7246 | +0.25% / +0.0189 ms | +0.83% / +0.0824 ms | -1.19% / -0.1170 ms |
| helper/B1-global-many/10/query-plus-helper/isolated/historical | 1 | 11 | 12 | 26.7387 / 28.9681 / 28.7872 | 7.7635 / 9.6494 / 9.6899 | -70.97% / -18.9752 ms | -66.69% / -19.3187 ms | -66.34% / -19.0973 ms |
| helper/B1-global-many/10/query-plus-helper/isolated/historical | 2 | 54 | 53 | 26.7123 / 28.8495 / 28.5396 | 8.0163 / 10.4335 / 10.0869 | -69.99% / -18.6960 ms | -63.83% / -18.4160 ms | -64.66% / -18.4527 ms |
| helper/B1-global-many/10/query-plus-helper/isolated/historical | 3 | 85 | 86 | 26.6768 / 28.9656 / 28.6152 | 8.1254 / 9.5257 / 10.0410 | -69.54% / -18.5514 ms | -67.11% / -19.4399 ms | -64.91% / -18.5742 ms |
| helper/B1-global-many/10/query-plus-helper/isolated/historical | 4 | 88 | 87 | 26.8725 / 30.0217 / 28.7498 | 7.8344 / 9.7595 / 9.8043 | -70.85% / -19.0381 ms | -67.49% / -20.2622 ms | -65.90% / -18.9455 ms |
| helper/B1-global-many/10/query-plus-helper/trusted/current-independent | 1 | 13 | 14 | 7.1123 / 10.8318 / 9.6197 | 7.5926 / 10.1006 / 9.8669 | +6.75% / +0.4802 ms | -6.75% / -0.7312 ms | +2.57% / +0.2472 ms |
| helper/B1-global-many/10/query-plus-helper/trusted/current-independent | 2 | 52 | 51 | 7.4592 / 10.5375 / 10.1163 | 7.9638 / 10.5613 / 9.8743 | +6.76% / +0.5046 ms | +0.23% / +0.0238 ms | -2.39% / -0.2420 ms |
| helper/B1-global-many/10/query-plus-helper/trusted/current-independent | 3 | 89 | 90 | 7.5825 / 10.6078 / 9.9929 | 7.3581 / 9.6398 / 9.4520 | -2.96% / -0.2244 ms | -9.13% / -0.9680 ms | -5.41% / -0.5408 ms |
| helper/B1-global-many/10/query-plus-helper/trusted/current-independent | 4 | 92 | 91 | 7.5919 / 9.9296 / 10.1256 | 8.1534 / 10.2818 / 10.0785 | +7.40% / +0.5615 ms | +3.55% / +0.3522 ms | -0.47% / -0.0471 ms |
| helper/B1-global-many/10/query-plus-helper/trusted/historical | 1 | 15 | 16 | 6.1989 / 8.7835 / 7.6581 | 7.6521 / 9.6244 / 9.6272 | +23.44% / +1.4532 ms | +9.57% / +0.8409 ms | +25.71% / +1.9691 ms |
| helper/B1-global-many/10/query-plus-helper/trusted/historical | 2 | 50 | 49 | 6.2366 / 8.5718 / 7.7110 | 7.3022 / 8.8196 / 9.2086 | +17.09% / +1.0656 ms | +2.89% / +0.2478 ms | +19.42% / +1.4976 ms |
| helper/B1-global-many/10/query-plus-helper/trusted/historical | 3 | 93 | 94 | 6.2368 / 9.1041 / 7.7377 | 7.3106 / 9.7689 / 9.2554 | +17.22% / +1.0738 ms | +7.30% / +0.6647 ms | +19.61% / +1.5177 ms |
| helper/B1-global-many/10/query-plus-helper/trusted/historical | 4 | 96 | 95 | 6.3897 / 8.3016 / 7.8078 | 7.7570 / 10.5937 / 9.7612 | +21.40% / +1.3673 ms | +27.61% / +2.2921 ms | +25.02% / +1.9534 ms |
| helper/B1-global-many/100/raw-only/isolated/current-independent | 1 | 17 | 18 | 25.6048 / 30.3524 / 32.9428 | 26.9030 / 30.1353 / 31.0235 | +5.07% / +1.2982 ms | -0.72% / -0.2171 ms | -5.83% / -1.9193 ms |
| helper/B1-global-many/100/raw-only/isolated/current-independent | 2 | 48 | 47 | 24.8243 / 29.5477 / 32.2571 | 26.6447 / 29.3165 / 30.7638 | +7.33% / +1.8204 ms | -0.78% / -0.2312 ms | -4.63% / -1.4933 ms |
| helper/B1-global-many/100/raw-only/isolated/historical | 1 | 19 | 20 | 167.4945 / 194.5929 / 184.9088 | 27.6288 / 29.7911 / 31.6451 | -83.50% / -139.8657 ms | -84.69% / -164.8018 ms | -82.89% / -153.2637 ms |
| helper/B1-global-many/100/raw-only/isolated/historical | 2 | 46 | 45 | 163.1193 / 186.9125 / 180.6664 | 27.5374 / 29.9801 / 32.8345 | -83.12% / -135.5819 ms | -83.96% / -156.9324 ms | -81.83% / -147.8320 ms |
| helper/B1-global-many/100/raw-only/isolated/historical | 3 | 97 | 98 | 167.0473 / 195.9928 / 184.8059 | 26.8978 / 28.6177 / 30.6259 | -83.90% / -140.1495 ms | -85.40% / -167.3751 ms | -83.43% / -154.1800 ms |
| helper/B1-global-many/100/raw-only/isolated/historical | 4 | 100 | 99 | 165.9744 / 191.5095 / 183.2015 | 27.3686 / 29.8035 / 31.4369 | -83.51% / -138.6058 ms | -84.44% / -161.7060 ms | -82.84% / -151.7646 ms |
| helper/B1-global-many/100/raw-only/trusted/current-independent | 1 | 21 | 22 | 25.7884 / 28.9808 / 33.2413 | 27.4004 / 29.1280 / 30.9939 | +6.25% / +1.6120 ms | +0.51% / +0.1471 ms | -6.76% / -2.2475 ms |
| helper/B1-global-many/100/raw-only/trusted/current-independent | 2 | 44 | 43 | 27.9934 / 34.0711 / 35.7719 | 26.7883 / 29.6498 / 30.9581 | -4.30% / -1.2051 ms | -12.98% / -4.4213 ms | -13.46% / -4.8137 ms |
| helper/B1-global-many/100/raw-only/trusted/current-independent | 3 | 101 | 102 | 25.2568 / 29.2232 / 32.4313 | 26.3033 / 28.9480 / 30.4319 | +4.14% / +1.0464 ms | -0.94% / -0.2752 ms | -6.17% / -1.9994 ms |
| helper/B1-global-many/100/raw-only/trusted/current-independent | 4 | 104 | 103 | 25.1440 / 28.6119 / 32.3860 | 28.6954 / 31.0244 / 33.7615 | +14.12% / +3.5514 ms | +8.43% / +2.4125 ms | +4.25% / +1.3755 ms |
| helper/B1-global-many/100/raw-only/trusted/historical | 1 | 23 | 24 | 168.3915 / 197.3837 / 186.0751 | 26.9265 / 29.8334 / 30.7673 | -84.01% / -141.4650 ms | -84.89% / -167.5503 ms | -83.47% / -155.3078 ms |
| helper/B1-global-many/100/raw-only/trusted/historical | 2 | 42 | 41 | 168.1386 / 197.0765 / 188.7119 | 26.1242 / 28.0371 / 30.0565 | -84.46% / -142.0144 ms | -85.77% / -169.0393 ms | -84.07% / -158.6554 ms |
| helper/B1-global-many/100/raw-only/trusted/historical | 3 | 105 | 106 | 165.2650 / 189.3462 / 182.6529 | 27.7302 / 30.9606 / 32.9311 | -83.22% / -137.5348 ms | -83.65% / -158.3856 ms | -81.97% / -149.7218 ms |
| helper/B1-global-many/100/raw-only/trusted/historical | 4 | 108 | 107 | 166.1773 / 191.2925 / 183.9939 | 27.0166 / 30.2920 / 31.2115 | -83.74% / -139.1607 ms | -84.16% / -161.0005 ms | -83.04% / -152.7824 ms |
| helper/B1-global-many/100/query-plus-helper/isolated/current-independent | 1 | 25 | 26 | 39.7699 / 47.9945 / 49.5133 | 41.6811 / 47.0348 / 48.0978 | +4.81% / +1.9112 ms | -2.00% / -0.9598 ms | -2.86% / -1.4154 ms |
| helper/B1-global-many/100/query-plus-helper/isolated/current-independent | 2 | 40 | 39 | 38.2192 / 43.8449 / 47.7780 | 40.6019 / 44.6175 / 47.0405 | +6.23% / +2.3827 ms | +1.76% / +0.7726 ms | -1.54% / -0.7375 ms |
| helper/B1-global-many/100/query-plus-helper/isolated/current-independent | 3 | 109 | 110 | 38.8858 / 44.3583 / 48.5491 | 40.1211 / 47.9427 / 47.0746 | +3.18% / +1.2353 ms | +8.08% / +3.5844 ms | -3.04% / -1.4746 ms |
| helper/B1-global-many/100/query-plus-helper/isolated/current-independent | 4 | 112 | 111 | 37.9489 / 44.8032 / 47.4462 | 41.5781 / 44.7159 / 47.9244 | +9.56% / +3.6292 ms | -0.19% / -0.0874 ms | +1.01% / +0.4782 ms |
| helper/B1-global-many/100/query-plus-helper/isolated/historical | 1 | 27 | 28 | 233.2140 / 261.5883 / 257.4767 | 41.9066 / 47.0045 / 48.7370 | -82.03% / -191.3073 ms | -82.03% / -214.5838 ms | -81.07% / -208.7397 ms |
| helper/B1-global-many/100/query-plus-helper/isolated/historical | 2 | 38 | 37 | 228.4288 / 250.5689 / 251.3321 | 40.7753 / 45.0748 / 47.3603 | -82.15% / -187.6535 ms | -82.01% / -205.4941 ms | -81.16% / -203.9718 ms |
| helper/B1-global-many/100/query-plus-helper/isolated/historical | 3 | 113 | 114 | 230.8276 / 251.9907 / 249.5879 | 40.9944 / 44.2760 / 47.3990 | -82.24% / -189.8332 ms | -82.43% / -207.7148 ms | -81.01% / -202.1889 ms |
| helper/B1-global-many/100/query-plus-helper/isolated/historical | 4 | 116 | 115 | 228.2280 / 249.7075 / 247.0402 | 40.7705 / 44.0917 / 47.8884 | -82.14% / -187.4575 ms | -82.34% / -205.6158 ms | -80.62% / -199.1517 ms |
| helper/B1-global-many/100/query-plus-helper/trusted/current-independent | 1 | 29 | 30 | 37.3830 / 44.1765 / 46.9167 | 38.9496 / 41.8272 / 45.0290 | +4.19% / +1.5667 ms | -5.32% / -2.3493 ms | -4.02% / -1.8876 ms |
| helper/B1-global-many/100/query-plus-helper/trusted/current-independent | 2 | 36 | 35 | 37.4623 / 43.6981 / 47.2322 | 38.8379 / 44.8077 / 45.9251 | +3.67% / +1.3755 ms | +2.54% / +1.1096 ms | -2.77% / -1.3071 ms |
| helper/B1-global-many/100/query-plus-helper/trusted/current-independent | 3 | 117 | 118 | 36.8381 / 44.7109 / 46.6646 | 39.3723 / 42.8198 / 45.3206 | +6.88% / +2.5343 ms | -4.23% / -1.8911 ms | -2.88% / -1.3440 ms |
| helper/B1-global-many/100/query-plus-helper/trusted/current-independent | 4 | 120 | 119 | 37.3641 / 43.2046 / 46.6687 | 39.8279 / 44.1047 / 46.7777 | +6.59% / +2.4638 ms | +2.08% / +0.9001 ms | +0.23% / +0.1090 ms |
| helper/B1-global-many/100/query-plus-helper/trusted/historical | 1 | 31 | 32 | 27.5586 / 30.0090 / 32.8508 | 38.7974 / 42.7777 / 45.1173 | +40.78% / +11.2388 ms | +42.55% / +12.7687 ms | +37.34% / +12.2664 ms |
| helper/B1-global-many/100/query-plus-helper/trusted/historical | 2 | 34 | 33 | 27.4730 / 30.6401 / 32.8539 | 39.1201 / 43.0141 / 45.2119 | +42.39% / +11.6471 ms | +40.39% / +12.3740 ms | +37.61% / +12.3579 ms |
| helper/B1-global-many/100/query-plus-helper/trusted/historical | 3 | 121 | 122 | 26.7078 / 29.8451 / 32.1272 | 39.1553 / 42.6620 / 45.2640 | +46.61% / +12.4475 ms | +42.94% / +12.8169 ms | +40.89% / +13.1368 ms |
| helper/B1-global-many/100/query-plus-helper/trusted/historical | 4 | 124 | 123 | 28.1292 / 31.4759 / 33.5001 | 38.3817 / 42.8829 / 44.6172 | +36.45% / +10.2525 ms | +36.24% / +11.4070 ms | +33.19% / +11.1171 ms |
