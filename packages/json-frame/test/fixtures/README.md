# `packages/json-frame/test/fixtures/`

The files in `generated/` are the **executable compatibility reference** for
`@web-ts-toolkit/json-frame`'s parser implementation. Each file is produced
verbatim by `pandas.DataFrame.to_json(**args)`; no fixture is hand-edited after
pandas writes it.

These fixtures belong to task JFRAME-00 of
`docs/tasks/20260814-170611-json-frame-package.md`.

## What lives here

```
generate.py      Deterministic Python generator. Re-running it in the
                 documented environment must produce byte-identical JSON.
generated/**     Committed fixture payloads (one JSON fixture per orient/case).
manifest.json    Record of the exact Python/pandas versions and every
                 `to_json(**args)` call that produced each fixture.
README.md        This file.
```

## Fixture categories

| Prefix                        | Coverage                                                        |
| ----------------------------- | --------------------------------------------------------------- |
| `allSixStringIndex-*`         | All six orients from one frame with a named **string**          |
|                               | index (`row_name`) and string columns.                          |
| `allSixRangeIndex-*`          | All six orients from one frame with pandas default              |
|                               | RangeIndex (numeric, synthetic index).                          |
| `indexFalse-{split,records,   | `index=False` for orients that allow it. `indexFalse-           |
| values,table}-\*`             | {columns,index}.err.txt`record the pandas`ValueError`           |
|                               | for the two orients that refuse it.                             |
| `nullsColumns-*`              | Mixed null numeric and null boolean cells (records +            |
|                               | table). Captures that integer-with-null becomes float with      |
|                               | `null`.                                                         |
| `boolIndex-*`                 | Pure boolean column (records + table).                          |
| `strings-*`                   | Pure string column (records + table).                           |
| `ints-*`                      | Pure integer column (records + table).                          |
| `floats-*`                    | Pure float column (records + table).                            |
| `datetimeEpoch-records`       | Default **epoch** datetime encoding for a non-table orient.     |
| `datetimeIso-records`         | `date_format="iso"` for a non-table orient.                     |
| `datetimeTable-table`         | Default **ISO** datetime encoding for the `table` orient.       |
| `datetimeIsoTable-table`      | `date_format="iso"` for the `table` orient (no-op for default). |
| `categoricalTable-table`      | Categorical column exported as Table Schema with                |
|                               | `constraints.enum` and `ordered`. Cells are plain scalars       |
|                               | (no fabricated wrappers).                                       |
| `empty-{orient}`              | Empty `pd.DataFrame(columns=[...])` across all six orients.     |
| `prototypeLabels-{orient}`    | Index labels `__proto__`, `constructor`, `prototype` to         |
|                               | validate own-property-safe storage. Captured across split,      |
|                               | columns, index, and records.                                    |
| `unsupported/multiIndexTable- | A `MultiIndex` frame serialised by pandas with                  |
| table`                        | `primaryKey: ["g", "n"]`. The parser MUST reject this.          |
| `unsupported/nonStringColumns | A `DataFrame` with a non-string column label (`10`). pandas     |
| Split-split`                  | accepts it; the parser MUST reject it.                          |

## Regenerating

The generator is maintainer tooling. It is **not** an npm runtime dependency,
a CI dependency, or part of any workspace install script. Adding Python or
pandas as a workspace prerequisite is out of scope for the initial release.

The supported regeneration environment is recorded in
`manifest.json::generator`. With `python3` and `pandas` matching those
versions, run from this directory:

```
python3 generate.py
```

Behaviour notes for the recorded `pandas 3.0.3`:

- Default `date_format` is **epoch** for non-table orients and **ISO** for
  `table`. (`epoch` emits a `Pandas4Warning`; the warning is acceptable and
  does not affect the committed JSON.)
- `index=False` is only valid for `split`, `table`, `records`, and `values`;
  `columns` and `index` raise `ValueError`. The error text is committed as
  the corresponding `*.err.txt` sidecar.
- `MultiIndex` and non-string column labels do not raise from `to_json`;
  the parser, not pandas, is responsible for rejecting them.

## Updating the reference

Per the JFRAME-00 working rules: when pandas documentation and a fixture
disagree, first verify the fixture generator and pinned pandas version; do
not silently adjust a parser to hand-authored test data. Bump the recorded
generator environment in `manifest.json` only via re-running `generate.py`
in the new environment, and commit the regenerated files together.

The committed JSON in `generated/` is the reference. Do not hand-edit it.
