"""Deterministic pandas fixture generator for `@web-ts-toolkit/json-frame`.

This script is maintainer tooling. It is not part of the npm runtime or the
workspace `pnpm install`/`pnpm test` flows. A maintainer runs it only when the
pandas compatibility reference is changed, then commits the resulting
`generated/**` files. See `README.md` in this directory for the documented
regeneration command and the only supported Python environment.

Design constraints:

* Every JSON fixture body is the exact string returned by
  `pandas.DataFrame.to_json(**args)`. The writer appends one final `\n` so the
  committed text files follow repository newline policy; the self-check ignores
  only that documented terminator.
* `to_json()` call arguments are recorded verbatim into the manifest
  (`manifest.json`) so a later agent can compare the committed JSON to the
  documented `to_json()` calls without re-running Python.
* Only supported JSON-compatible values are produced. There is no NaN guard
  here because pandas itself writes missing and non-finite values as JSON
  `null`; this is part of the lock-step reference.

Run:

    python3 generate.py

The script writes nothing outside its own directory.

Mapping the locked contracts (`docs/tasks/20260814-170611-json-frame-package.md`,
"Correct Pandas Wire Shapes" and "Task JFRAME-00" implementation requirements)
to the fixtures produced below:

    allSixStringIndex-*  all six orients from the same string-indexed frame
    allSixRangeIndex-*   default RangeIndex (synthetic, numeric index) for six
                         orients
    indexFalse-*   `index=False` for the orients pandas allows (split/records/
                   values/table). `columns` and `index` raise ValueError for
                   `index=False`; the ValueError message is captured into a sidecar
                   `.err.txt`.
    nullsColumns-* null numerics + null boolean (records + table) for nullability
                   and logical-type-independent-of-null tests
    boolIndex-*    a boolean column for inference + round-trip (records + table)
    strings-*      a string column (records + table)
    ints-*         a pure integer column (records + table)
    floats-*       a pure float column (records + table)
    datetimeEpoch-records   default (epoch) non-table datetime
    datetimeIso-records      `date_format="iso"` non-table datetime
    datetimeTable-*/datetimeIsoTable-*   table datetime (ISO by default + iso opt)
    categoricalTable-*      categorical table schema w/ constraints.enum/ordered
    empty-*        empty-frame for all six orients
    prototypeLabels-*       index labels `__proto__`, `constructor`, `prototype`
                            for split/columns/index/records orients
    nonAscendingIntegerIndex-* index labels `[10, 2]` for index/columns object-key
                               ordering plus split/table controls
    serializationSensitive-* non-ASCII text, escaping, exponent/precision floats,
                             and pandas-preserved negative-zero object keys
    unsupported/multiIndexTable-*.json     multiPrimaryKey table (must be rejected)
    unsupported/nonStringColumnsSplit-.json non-string columns (must be rejected)

"""

from __future__ import annotations

import json
import os
import platform
import sys
import traceback
from typing import Any, Mapping

import pandas as pd


FINAL_NEWLINE = "\n"
_EXPECTED_JSON_BYTES: dict[str, bytes] = {}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def here() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def generated_dir() -> str:
    path = os.path.join(here(), "generated")
    os.makedirs(path, exist_ok=True)
    os.makedirs(os.path.join(path, "unsupported"), exist_ok=True)
    return path


def clear_generated() -> None:
    """Remove every previously generated file so a re-run is diff-stable even if
    a factory was renamed or removed. The `generated/` directory itself (and the
    `unsupported/` subdirectory) are recreated."""
    base = os.path.join(here(), "generated")
    if os.path.isdir(base):
        for root, dirs, files in os.walk(base, topdown=False):
            for name in files:
                os.remove(os.path.join(root, name))
            for name in dirs:
                # remove empty dirs but keep the root regenerated tree
                full = os.path.join(root, name)
                try:
                    os.rmdir(full)
                except OSError:
                    pass
    os.makedirs(base, exist_ok=True)
    os.makedirs(os.path.join(base, "unsupported"), exist_ok=True)


def remember_expected_json_bytes(path: str, text: str) -> None:
    relpath = os.path.relpath(path, here())
    _EXPECTED_JSON_BYTES[relpath] = (text + FINAL_NEWLINE).encode("utf-8")


def write_fixture_text(name: str, text: str) -> str:
    """Write pandas' raw JSON text plus the documented final newline."""
    path = os.path.join(generated_dir(), name)
    with open(path, "w", encoding="utf-8") as fp:
        fp.write(text)
        fp.write(FINAL_NEWLINE)
    remember_expected_json_bytes(path, text)
    return path


def write_err(name: str, message: str) -> str:
    path = os.path.join(generated_dir(), name)
    with open(path, "w", encoding="utf-8") as fp:
        fp.write(message.rstrip() + "\n")
    return path


def pandas_key_version() -> dict[str, str]:
    return {
        "python": ".".join(str(v) for v in sys.version_info[:3]),
        "pythonImplementation": platform.python_implementation(),
        "pandas": pd.__version__,
    }


def manifest_entry(
    fixture: str,
    factory: str,
    args: Mapping[str, Any],
    *,
    extra: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "fixture": fixture,
        "factory": factory,
        "to_json_args": dict(args),
    }
    if extra:
        entry.update(extra)
    return entry


def pandas_to_json_text(df: pd.DataFrame, **kwargs: Any) -> str:
    """Run `df.to_json(**kwargs)` and return pandas' serializer output."""
    text = df.to_json(**kwargs)
    return text


def parse_pandas_json_for_checks(text: str) -> Any:
    """Parse pandas JSON only for generator assertions; never for fixture writes."""
    return json.loads(text)


def write_pandas_fixture(
    name: str,
    df: pd.DataFrame,
    args: Mapping[str, Any],
    *,
    factory: str = "DataFrame.to_json",
    extra: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    text = pandas_to_json_text(df, **dict(args))
    parse_pandas_json_for_checks(text)
    path = write_fixture_text(name, text)
    return manifest_entry(os.path.relpath(path, here()), factory, args, extra=extra)


def assert_generated_json_bytes(entries: list[dict[str, Any]]) -> None:
    """Verify committed JSON bytes match direct pandas returns plus final newline."""
    fixture_entries = {
        entry["fixture"]
        for entry in entries
        if entry["fixture"].endswith(".json")
    }
    missing = fixture_entries.difference(_EXPECTED_JSON_BYTES)
    if missing:
        raise RuntimeError(f"missing byte expectations for {sorted(missing)}")

    for relpath, expected in sorted(_EXPECTED_JSON_BYTES.items()):
        with open(os.path.join(here(), relpath), "rb") as fp:
            actual = fp.read()
        if actual != expected:
            raise RuntimeError(
                f"fixture bytes for {relpath} differ from direct pandas to_json() output "
                "plus the documented final newline"
            )


# ---------------------------------------------------------------------------
# fixture factories (definitions only; calls happen in `main`)
# ---------------------------------------------------------------------------


_PREFIX_CACHE: dict[str, bool] = {}


def assert_unique_prefix(prefix: str) -> None:
    """Guard against two factories writing to overlapping filenames."""
    if prefix in _PREFIX_CACHE:
        raise RuntimeError(f"fixture prefix '{prefix}' already written")
    _PREFIX_CACHE[prefix] = True


def all_six(
    df: pd.DataFrame,
    *,
    prefix: str,
    args: Mapping[str, Any] | None = None,
):
    """Emit all six pandas orients from the same frame with a unique filename
    prefix. Returns manifest entries."""
    assert_unique_prefix(prefix)
    entries = []
    args = dict(args or {})
    for orient in ("records", "index", "columns", "values", "split", "table"):
        a = dict(args)
        a["orient"] = orient
        entries.append(write_pandas_fixture(f"{prefix}-{orient}.json", df, a, factory="DataFrame(...).to_json"))
    return entries


def range_index_six(args: Mapping[str, Any] | None = None):
    df = pd.DataFrame({"a": [1, 2, 3], "b": [10.0, 20.0, 30.0]})
    return all_six(df, prefix="allSixRangeIndex", args=args)


def index_false_records_or_split_or_values_or_table(
    orient: str, args: Mapping[str, Any] | None = None
):
    df = pd.DataFrame(
        {"a": [1, 2, 3], "b": [10.0, 20.0, 30.0]},
        index=pd.Index(["r0", "r1", "r2"], name="ri"),
    )
    a = dict(args or {})
    a["orient"] = orient
    a["index"] = False
    try:
        return write_pandas_fixture(f"indexFalse-{orient}.json", df, a)
    except ValueError as exc:
        # `index=False` only valid for split/records/values/table. Record the
        # error so the parser tests can assert on real pandas behavior.
        path = write_err(f"indexFalse-{orient}.err.txt", f"{type(exc).__name__}: {exc}")
        return manifest_entry(
            os.path.relpath(path, here()),
            "DataFrame.to_json",
            a,
            extra={"raises": f"{type(exc).__name__}: {exc}"},
        )


def nulls():
    df = pd.DataFrame(
        {
            "i": [1, None, 3],
            "f": [1.5, None, 3.5],
            "b": [True, None, False],
        },
        index=pd.Index(["r0", "r1", "r2"], name="ri"),
    )
    return [
        write_pandas_fixture("nullsColumns-records.json", df, {"orient": "records"}),
        write_pandas_fixture("nullsColumns-table.json", df, {"orient": "table"}),
    ]


def bool_col():
    df = pd.DataFrame(
        {"flag": [True, False, True]},
        index=pd.Index(["r0", "r1", "r2"], name="ri"),
    )
    return [
        write_pandas_fixture("boolIndex-records.json", df, {"orient": "records"}),
        write_pandas_fixture("boolIndex-table.json", df, {"orient": "table"}),
    ]


def strings_col():
    df = pd.DataFrame(
        {"city": ["NYC", "LA", "SF"]},
        index=pd.Index(["r0", "r1", "r2"], name="ri"),
    )
    return [
        write_pandas_fixture("strings-records.json", df, {"orient": "records"}),
        write_pandas_fixture("strings-table.json", df, {"orient": "table"}),
    ]


def ints_col():
    df = pd.DataFrame(
        {"count": [1, 2, 3]},
        index=pd.Index(["r0", "r1", "r2"], name="ri"),
    )
    return [
        write_pandas_fixture("ints-records.json", df, {"orient": "records"}),
        write_pandas_fixture("ints-table.json", df, {"orient": "table"}),
    ]


def floats_col():
    df = pd.DataFrame(
        {"temperature": [1.5, 2.5, 3.5]},
        index=pd.Index(["r0", "r1", "r2"], name="ri"),
    )
    return [
        write_pandas_fixture("floats-records.json", df, {"orient": "records"}),
        write_pandas_fixture("floats-table.json", df, {"orient": "table"}),
    ]


def datetime_epoch():
    df = pd.DataFrame(
        {"ts": pd.to_datetime(["2024-01-02T03:04:05", "2024-01-02T03:04:06"])},
        index=pd.Index(["r0", "r1"], name="ri"),
    )
    return [write_pandas_fixture("datetimeEpoch-records.json", df, {"orient": "records", "date_format": "epoch"})]


def datetime_iso():
    df = pd.DataFrame(
        {"ts": pd.to_datetime(["2024-01-02T03:04:05", "2024-01-02T03:04:06"])},
        index=pd.Index(["r0", "r1"], name="ri"),
    )
    return [write_pandas_fixture("datetimeIso-records.json", df, {"orient": "records", "date_format": "iso"})]


def datetime_table_default():
    df = pd.DataFrame(
        {"ts": pd.to_datetime(["2024-01-02T03:04:05", "2024-01-02T03:04:06"])},
        index=pd.Index(["r0", "r1"], name="ri"),
    )
    return [write_pandas_fixture("datetimeTable-table.json", df, {"orient": "table"})]


def datetime_table_iso():
    df = pd.DataFrame(
        {"ts": pd.to_datetime(["2024-01-02T03:04:05", "2024-01-02T03:04:06"])},
        index=pd.Index(["r0", "r1"], name="ri"),
    )
    return [write_pandas_fixture("datetimeIsoTable-table.json", df, {"orient": "table", "date_format": "iso"})]


def categorical_table():
    df = pd.DataFrame(
        {"grade": pd.Categorical(["a", "b", "a"], categories=["a", "b", "c"], ordered=True)},
        index=pd.Index(["x0", "x1", "x2"], name="i"),
    )
    return [write_pandas_fixture("categoricalTable-table.json", df, {"orient": "table"})]


def empty_all_six():
    df = pd.DataFrame(columns=["a", "b"])
    entries = []
    for orient in ("records", "index", "columns", "values", "split", "table"):
        a = {"orient": orient}
        try:
            entries.append(write_pandas_fixture(f"empty-{orient}.json", df, a))
        except Exception as exc:
            path = write_err(f"empty-{orient}.err.txt", f"{type(exc).__name__}: {exc}")
            entries.append(
                manifest_entry(
                    os.path.relpath(path, here()),
                    "DataFrame.to_json",
                    a,
                    extra={"raises": f"{type(exc).__name__}: {exc}"},
                )
            )
    return entries


def prototype_labels():
    df = pd.DataFrame(
        {"x": [1, 2, 3]},
        index=pd.Index(["__proto__", "constructor", "prototype"], name="i"),
    )
    entries = []
    for orient in ("split", "columns", "index", "records"):
        a = {"orient": orient}
        entries.append(write_pandas_fixture(f"prototypeLabels-{orient}.json", df, a))
    return entries


def non_ascending_integer_index():
    df = pd.DataFrame(
        {"v": ["first", "second"], "n": [100, 200]},
        index=pd.Index([10, 2], name="i"),
    )
    entries = []
    for orient in ("index", "columns", "split", "table"):
        a = {"orient": orient}
        entries.append(write_pandas_fixture(f"nonAscendingIntegerIndex-{orient}.json", df, a))
    return entries


def serialization_sensitive():
    df = pd.DataFrame(
        {
            "text": ["café", "quote \" slash \\ newline\n tab\t nul\x00"],
            "small": [1.23e-12, -0.0],
            "large": [1.23e20, 9007199254740991.0],
            "precision": [1.123456789012345, 1.1234567890123456],
        }
    )
    indexed = pd.DataFrame(
        {"value": ["negative zero index", "positive index"]},
        index=pd.Index([-0.0, 1.0], name="i"),
    )
    return [
        write_pandas_fixture(
            "serializationSensitive-records.json",
            df,
            {"orient": "records", "double_precision": 15, "force_ascii": False},
        ),
        write_pandas_fixture(
            "serializationSensitive-index.json",
            indexed,
            {"orient": "index", "double_precision": 15},
            extra={"note": "Negative zero is preserved by pandas as the object key string `-0.0`."},
        ),
    ]


# ---------------------------------------------------------------------------
# unsupported fixtures (must be rejected by parser, not by pandas)
# ---------------------------------------------------------------------------


def unsupported_multi_index_table():
    mi = pd.DataFrame(
        {"v": [10, 20]},
        index=pd.MultiIndex.from_tuples([("a", 1), ("b", 2)], names=["g", "n"]),
    )
    a = {"orient": "table"}
    return write_pandas_fixture("unsupported/multiIndexTable-table.json", mi, a)


def unsupported_non_string_columns_split():
    df = pd.DataFrame({"a": [1, 2], "b": [3, 4]})
    df.columns = [10, "b"]  # type: ignore[index]
    a = {"orient": "split"}
    return write_pandas_fixture("unsupported/nonStringColumnsSplit-split.json", df, a)


# ---------------------------------------------------------------------------
# canonical all-six
# ---------------------------------------------------------------------------


def all_six_main():
    df = pd.DataFrame(
        {"city": ["NYC", "LA"], "temp": [70.0, 80.0]},
        index=pd.Index(["r0", "r1"], name="row_name"),
    )
    return all_six(df, prefix="allSixStringIndex")


# ---------------------------------------------------------------------------
# entrypoint
# ---------------------------------------------------------------------------


def main() -> int:
    entries: list[dict[str, Any]] = []

    clear_generated()

    entries.extend(all_six_main())
    entries.extend(range_index_six())
    for orient in ("split", "records", "values", "table", "columns", "index"):
        entries.append(index_false_records_or_split_or_values_or_table(orient))
    entries.extend(nulls())
    entries.extend(bool_col())
    entries.extend(strings_col())
    entries.extend(ints_col())
    entries.extend(floats_col())
    entries.extend(datetime_epoch())
    entries.extend(datetime_iso())
    entries.extend(datetime_table_default())
    entries.extend(datetime_table_iso())
    entries.extend(categorical_table())
    entries.extend(empty_all_six())
    entries.extend(prototype_labels())
    entries.extend(non_ascending_integer_index())
    entries.extend(serialization_sensitive())
    entries.append(unsupported_multi_index_table())
    entries.append(unsupported_non_string_columns_split())
    assert_generated_json_bytes(entries)

    manifest = {
        "generator": {
            "script": "generate.py",
            **pandas_key_version(),
        },
        "note": (
            "Every JSON fixture body is the exact UTF-8 encoding of a single "
            "`DataFrame.to_json(**args)` return value whose complete argument "
            "map is recorded verbatim in `to_json_args`; the writer appends "
            "one documented final newline. The generator self-check compares "
            "the committed bytes to direct pandas returns plus that newline. "
            "The fixtures are the executable compatibility reference for the "
            "parser implementation."
        ),
        "fixtures": entries,
    }

    path = os.path.join(here(), "manifest.json")
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(manifest, fp, indent=2, ensure_ascii=False)
        fp.write("\n")
    print(f"wrote {os.path.relpath(path, here())} and {len(entries)} fixtures")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
