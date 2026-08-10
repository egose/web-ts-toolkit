# ERH-12 Root Import And CSV Security Notes

Baseline captured on 2026-08-09 with Node `v26.5.0`, pnpm `11.18.0`, and the current `tsup` configuration.

## Commands

```sh
pnpm --filter @web-ts-toolkit/express-response-handler... build
pnpm pack --pack-destination /tmp/opencode
```

Node import measurements were run in fresh Node subprocesses from `packages/express-response-handler`. The CJS measurement sums code bytes for loaded `@web-ts-toolkit`, `@fast-csv`, `lodash`, and `express-response-handler` modules in `require.cache`.

Representative bundler measurements used esbuild CLI with:

```sh
pnpm exec esbuild --bundle --format=esm --platform=node --target=node22
```

## Packed Size

- Packed tarball: `32,949` bytes (`/tmp/opencode/web-ts-toolkit-express-response-handler-0.0.0-PLACEHOLDER.tgz`).

## Node Import Baseline

| Import target         |  CJS time |   CJS RSS delta | CJS modules | CJS loaded code |  ESM time |    ESM RSS delta |
| --------------------- | --------: | --------------: | ----------: | --------------: | --------: | ---------------: |
| root JSON-only use    | 12.555 ms | 9,961,472 bytes |           9 |    52,949 bytes | 27.439 ms | 17,301,504 bytes |
| `./responses`         |  1.129 ms | 4,194,304 bytes |           1 |     1,746 bytes |  1.411 ms |  3,145,728 bytes |
| `./responses/csv`     |  5.592 ms | 6,815,744 bytes |           9 |    28,756 bytes |  5.648 ms |  6,553,600 bytes |
| `./responses/success` |  1.797 ms | 3,932,160 bytes |           1 |     2,759 bytes |  1.316 ms |  3,407,872 bytes |

The root entrypoint currently imports `isCSVResponse` so the root handler can recognize `CSVResponse` instances from root and subpath imports. That means JSON-only root consumers pay the CSV recognition dependency load in Node.

## Bundler Baseline

| Entry                                     |  Bundle size | Measured package input | Imports CSV formatter | Imports CSV response |
| ----------------------------------------- | -----------: | ---------------------: | --------------------- | -------------------- |
| root JSON-only import of `handleResponse` | 60,114 bytes |           21,744 bytes | yes                   | yes                  |
| `./responses/csv`                         | 28,033 bytes |           21,744 bytes | yes                   | yes                  |
| `./responses/success`                     |    483 bytes |                0 bytes | no                    | no                   |

The success-wrapper subpath remains cheap and does not pull CSV code. The root entrypoint still pulls CSV formatter code after bundling because CSV recognition is part of root response dispatch.

## Decision

No bundle-structure or lazy-loading change is made for ERH-12.

Rationale:

- The measured root CJS loaded-code delta over direct CSV is about 24 KB, and the root import time remains in low double-digit milliseconds in this environment.
- Lazy-loading CSV recognition would complicate the synchronous `handleResponse` dispatch path and create new error/backpressure timing cases.
- Preserving cross-entry wrapper-brand compatibility is more important than optimizing this measured cost without a concrete consumer budget failure.

Optimization budget if this is reopened: root JSON-only bundled output should avoid `@fast-csv/format`, and CJS root loaded package code should stay below 35 KB while preserving ESM/CJS/subpath wrapper-brand compatibility.

## CSV Formula Injection Policy

`CSVResponse` serializes supplied cell values without mutating formula-like strings. It does not automatically neutralize values beginning with `=`, `+`, `-`, or `@`.

Application code owns formula-injection mitigation when user-controlled cells may be opened in spreadsheet software. Use the `processor` option to neutralize string cells at the boundary where spreadsheet export safety is required.

```ts
import { CSVResponse } from '@web-ts-toolkit/express-response-handler/responses/csv';

const neutralizeSpreadsheetFormula = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  return /^[=+\-@]/.test(value) ? `'${value}` : value;
};

const neutralizeRow = (row: unknown): unknown => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return neutralizeSpreadsheetFormula(row);
  }

  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, neutralizeSpreadsheetFormula(value)]));
};

return new CSVResponse(rows, {
  filename: 'users.csv',
  processor: neutralizeRow,
});
```

This remains opt-in because some CSV consumers intentionally use formulas, and unconditional mutation would be a breaking data contract change.
