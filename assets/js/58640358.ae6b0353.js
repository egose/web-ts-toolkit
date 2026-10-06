"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[646],{

/***/ 3265
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_json_frame_md_586_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-json-frame-md-586.json
const site_docs_packages_json_frame_md_586_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/json-frame","title":"@web-ts-toolkit/json-frame","description":"Normalize pandas DataFrame.to_json() payloads into one immutable, column-major DataFrame API for TypeScript.","source":"@site/docs/packages/json-frame.md","sourceDirName":"packages","slug":"/packages/json-frame","permalink":"/docs/packages/json-frame","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":20,"frontMatter":{"sidebar_label":"JSON Frame","sidebar_position":20},"sidebar":"packagesSidebar","previous":{"title":"Create Access Router Starter","permalink":"/docs/packages/create-access-router-mongo-starter"},"next":{"title":"Asset Inliner","permalink":"/docs/packages/asset-inliner"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.3.0_react@19.3.0/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(3191);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(5430);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(2608);
;// ./docs/packages/json-frame.md


const frontMatter = {
	sidebar_label: 'JSON Frame',
	sidebar_position: 20
};
const contentTitle = '@web-ts-toolkit/json-frame';

const assets = {

};





const toc = [{
  "value": "Installation",
  "id": "installation",
  "level": 2
}, {
  "value": "Import",
  "id": "import",
  "level": 2
}, {
  "value": "Quick Start",
  "id": "quick-start",
  "level": 2
}, {
  "value": "Inferred Row Types",
  "id": "inferred-row-types",
  "level": 2
}, {
  "value": "Supported Orients",
  "id": "supported-orients",
  "level": 2
}, {
  "value": "Table Schema",
  "id": "table-schema",
  "level": 2
}, {
  "value": "Logical Types",
  "id": "logical-types",
  "level": 2
}, {
  "value": "Empty-Dimension Round Trips",
  "id": "empty-dimension-round-trips",
  "level": 2
}, {
  "value": "Immutability",
  "id": "immutability",
  "level": 2
}, {
  "value": "Limits And Errors",
  "id": "limits-and-errors",
  "level": 2
}, {
  "value": "Serialization After Mutation",
  "id": "serialization-after-mutation",
  "level": 3
}, {
  "value": "Opt-In Traversal Budgets",
  "id": "opt-in-traversal-budgets",
  "level": 3
}, {
  "value": "Structured Diagnostics",
  "id": "structured-diagnostics",
  "level": 3
}, {
  "value": "Types",
  "id": "types",
  "level": 2
}];
function _createMdxContent(props) {
  const _components = {
    a: "a",
    code: "code",
    h1: "h1",
    h2: "h2",
    h3: "h3",
    header: "header",
    li: "li",
    p: "p",
    pre: "pre",
    strong: "strong",
    table: "table",
    tbody: "tbody",
    td: "td",
    th: "th",
    thead: "thead",
    tr: "tr",
    ul: "ul",
    ...(0,lib/* useMDXComponents */.R)(),
    ...props.components
  };
  return (0,jsx_runtime.jsxs)(jsx_runtime.Fragment, {
    children: [(0,jsx_runtime.jsx)(_components.header, {
      children: (0,jsx_runtime.jsx)(_components.h1, {
        id: "web-ts-toolkitjson-frame",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/json-frame"
        })
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Normalize pandas ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DataFrame.to_json()"
      }), " payloads into one immutable, column-major ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DataFrame"
      }), " API for TypeScript."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The package accepts JSON strings or parsed JSON values for all six pandas DataFrame JSON orients and exports back to each supported orient without runtime dependencies."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "installation",
      children: "Installation"
    }), "\n", (0,jsx_runtime.jsxs)(Tabs/* default */.A, {
      groupId: "npm2yarn",
      children: [(0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "npm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "npm install @web-ts-toolkit/json-frame\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add @web-ts-toolkit/json-frame\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add @web-ts-toolkit/json-frame\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add @web-ts-toolkit/json-frame\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "import",
      children: "Import"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { fromOrient } from '@web-ts-toolkit/json-frame';\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The package root is named-export only. There is no default export and no supported deep import path."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { fromOrient } from '@web-ts-toolkit/json-frame';\n\ninterface WeatherRow {\n  city: string;\n  temp: number;\n}\n\nconst frame = fromOrient<WeatherRow>('[{\"city\":\"Paris\",\"temp\":21},{\"city\":\"Rome\",\"temp\":30}]');\nconst hottest = frame.sort((left, right) => right.temp - left.temp).row(0);\nconst split = frame.toSplit();\n\nvoid [hottest, split];\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "inferred-row-types",
      children: "Inferred Row Types"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Parsed ", (0,jsx_runtime.jsx)(_components.code, {
        children: "records"
      }), " with omitted, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "auto"
      }), ", or explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "records"
      }), " orient infer known required fields precisely. Sparse, heterogeneous, and optional fields include ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " for missing-cell normalization and remain optional: a column absent from every row is never created, so reading it returns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), ". Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "!= null"
      }), " to guard both. Heterogeneous variants are flattened into one column shape; discriminants do not prove another cell is present. Nested cells retain their types and are not null-filled internally."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Requiredness follows declared keys in every variant, including ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toString"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "constructor"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "valueOf"
      }), "; inherited Object members do not supply cells. Numeric literal keys and equivalent string spellings such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "1"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "'1'"
      }), " infer one string-named column, merging cell types and requiredness before aggregation. Both ", (0,jsx_runtime.jsx)(_components.code, {
        children: "[1]"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "['1']"
      }), " access it. Non-equivalent strings such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "'01'"
      }), " remain distinct. Dense literals retain precise unions; sparse or optional aliases need null-safe guards."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { fromOrient } from '@web-ts-toolkit/json-frame';\n\nconst dense = fromOrient([{ n: 1 }, { n: 2 }]);\nconst formatted: string = dense.row(0).n.toFixed();\nconst sparse = fromOrient([{ n: 1 }, {}]);\nconst present = sparse.filter((row) => row.n != null && row.n.toFixed() === '1');\n// sparse.row(1).n is null; an undefined-only guard is insufficient.\nconst members = fromOrient([{ toString: 'ok' }, {}] as const);\nconst text = members.row(1).toString?.toUpperCase(); // undefined: the cell is null\nconst numeric = fromOrient([{ 1: 1 }, { '1': 'x' }] as const);\nconst cell: 1 | 'x' = numeric.row(0)[1]; // also accessible as numeric.row(0)['1']\nconst values = fromOrient([[1]], { columns: ['n'] });\nconst n = values.row(0).n; // Read n from the object-shaped row.\nconst valueText = typeof n === 'number' ? n.toFixed() : '';\n\nvoid [formatted, present, text, cell, valueText];\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Values arrays (including readonly tuples), JSON strings, other layouts, broad dictionary records, and broadly typed orient options use conservative ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonRow"
      }), " inference. Explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "fromOrient<MyRow>(...)"
      }), " preserves your asserted domain model, including optional interfaces, without runtime application-schema validation. Ensure it describes the normalized rows. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select()"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "rename()"
      }), " return conservatively typed ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DataFrame<JsonRow>"
      }), "; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "filter()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sort()"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "resetIndex()"
      }), " retain the row model."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Open index domains keep that fallback, including ", (0,jsx_runtime.jsx)(_components.code, {
        children: "string"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "number"
      }), ", and template patterns such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "`metric_${string}`"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "`${number}`"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "`${string}_metric`"
      }), ". Unions or intersections with known properties also fall back to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonRow"
      }), " when an open index domain is present. A dictionary describes allowed names, not an infinite set of present columns: missing cells in existing columns become ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), ", while columns absent from every row are not created. Use a scalar guard such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "typeof cell === 'number'"
      }), " before numeric operations; an undefined-only guard is insufficient. The fallback conservatively widens even known fields to JSON values. Finite template-key unions such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "`metric_${'a' | 'b'}`"
      }), " retain precise fields and declared optionality."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { fromOrient } from '@web-ts-toolkit/json-frame';\n\nconst rows: Record<`metric_${string}`, number>[] = [{ metric_n: 1 }, {}];\nconst frame = fromOrient(rows); // DataFrame<JsonRow>\nframe.filter((row) => typeof row.metric_n === 'number' && row.metric_n.toFixed() === '1');\n// frame.row(1).metric_n is null; frame.row(0).metric_absent is undefined.\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "supported-orients",
      children: "Supported Orients"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "records"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "index"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "columns"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "values"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "split"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "table"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "split"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "table"
      }), " preserve source row order exactly. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "index"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "columns"
      }), " derive row order from JavaScript object property enumeration; integer-like keys such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "\"10\""
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "\"2\""
      }), " enumerate in numeric order after ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JSON.parse()"
      }), " or when supplied as parsed objects. Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "split"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "table"
      }), " when exact row order matters for integer-like labels."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Non-empty ", (0,jsx_runtime.jsx)(_components.code, {
        children: "values"
      }), " arrays are auto-detected, but every ", (0,jsx_runtime.jsx)(_components.code, {
        children: "values"
      }), " payload requires ", (0,jsx_runtime.jsx)(_components.code, {
        children: "options.columns"
      }), " because the orient carries no column labels. Empty ", (0,jsx_runtime.jsx)(_components.code, {
        children: "values"
      }), " input requires both ", (0,jsx_runtime.jsx)(_components.code, {
        children: "orient: 'values'"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "columns"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Auto-detection recognizes ", (0,jsx_runtime.jsx)(_components.code, {
        children: "table"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "split"
      }), ", non-empty ", (0,jsx_runtime.jsx)(_components.code, {
        children: "records"
      }), ", and non-empty ", (0,jsx_runtime.jsx)(_components.code, {
        children: "values"
      }), ". Always supply an explicit orient for ", (0,jsx_runtime.jsx)(_components.code, {
        children: "index"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "columns"
      }), ", empty arrays, and empty objects; nested-object structure cannot reliably distinguish the two object-key layouts. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "records"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "values"
      }), " receive synthetic numeric indexes. An omitted split index also synthesizes one; a present malformed index is rejected. Column labels must be unique strings and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "options.columns"
      }), " must be dense."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Other ingestion options are ", (0,jsx_runtime.jsx)(_components.code, {
        children: "columnTypes"
      }), " (explicit non-table logical types), ", (0,jsx_runtime.jsx)(_components.code, {
        children: "packThreshold"
      }), " (numeric packing threshold, default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "256"
      }), "; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "0"
      }), " disables packing), and opt-in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "maxNodes"
      }), " (see below)."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "table-schema",
      children: "Table Schema"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "toTable()"
      }), " emits Table Schema JSON, retaining supported field/schema metadata. It omits synthetic indexes and emits source indexes as a field plus ", (0,jsx_runtime.jsx)(_components.code, {
        children: "primaryKey"
      }), ". Source labels must be unique at table ingestion/export; equality uses JavaScript ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Map"
      }), "/SameValueZero semantics, so numeric ", (0,jsx_runtime.jsx)(_components.code, {
        children: "1"
      }), " and string ", (0,jsx_runtime.jsx)(_components.code, {
        children: "'1'"
      }), " are distinct. Object-key exporters stringify labels and reject collisions such as these with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ExportKeyCollisionError"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Source index and data-field metadata retain their separate roles through transforms even if the primary-key field was not first. A data-column rename may collide with the retained index name; table export then requires a unique ", (0,jsx_runtime.jsx)(_components.code, {
        children: "indexField"
      }), " override (or a subsequent rename/resetIndex). The default emitted source index name is its retained table name, otherwise ", (0,jsx_runtime.jsx)(_components.code, {
        children: "index"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { fromOrient } from '@web-ts-toolkit/json-frame';\n\nconst frame = fromOrient(\n  {\n    schema: {\n      fields: [\n        { name: 'value', type: 'integer' },\n        { name: 'pk', type: 'string' },\n      ],\n      primaryKey: ['pk'],\n    },\n    data: [{ pk: 'r0', value: 42 }],\n  },\n  { orient: 'table' },\n);\nconst table = frame.rename({ value: 'pk' }).toTable({ indexField: 'row_id' });\n// row_id retains string index metadata; pk retains integer data metadata.\nvoid table;\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["In Table Schema payloads, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "schema.pandas_version"
      }), " is the Table Schema format version emitted by pandas, commonly ", (0,jsx_runtime.jsx)(_components.code, {
        children: "\"1.4.0\""
      }), "; it is not the installed pandas package version."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "logical-types",
      children: "Logical Types"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "columnInfo"
      }), " exposes logical type metadata: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "integer"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "float"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "string"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "boolean"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "datetime"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "categorical"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mixed"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "unknown"
      }), ". Non-table inputs infer the narrowest logical type by scanning the full column; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " sets nullability without turning an otherwise numeric column into ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mixed"
      }), ". ", (0,jsx_runtime.jsx)(_components.code, {
        children: "options.columnTypes"
      }), " validates explicit types against every non-null cell before packing. Incompatibility produces ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonFrameValidationError"
      }), " with orient/path/row/column/value diagnostics. Values are never coerced. Source Table Schema metadata is preserved; pandas-authored field semantics remain caller/pandas responsibility rather than general schema enforcement."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Only own enumerable string keys in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "columnTypes"
      }), " are overrides; inherited properties are ignored. Ordinary and null-prototype dictionaries are copied without mutating the caller. Prototype-member names such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "constructor"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toString"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "hasOwnProperty"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "__proto__"
      }), " are valid columns even with empty or partial overrides. For an explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "__proto__"
      }), " override, use a computed key such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ ['__proto__']: 'float' }"
      }), ". Source Table Schema field types take precedence over overrides."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Explicit ", (0,jsx_runtime.jsx)(_components.code, {
          children: "integer"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "float"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "string"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "boolean"
        }), " require matching JSON scalars; ", (0,jsx_runtime.jsx)(_components.code, {
          children: "float"
        }), " also accepts integer JSON numbers."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Explicit ", (0,jsx_runtime.jsx)(_components.code, {
          children: "datetime"
        }), " accepts calendar-valid, timezone-naive ISO strings for four-digit years ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "0000–9999"
        }), " under proleptic Gregorian rules. Leap years are divisible by 4 except centuries not divisible by 400: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "0000-02-29"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "2000-02-29"
        }), " are valid, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "0100-02-29"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "1900-02-29"
        }), " are not. Grammar: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "YYYY-MM-DD"
        }), ", optionally followed by ", (0,jsx_runtime.jsx)(_components.code, {
          children: "T"
        }), " or one space and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "HH:mm:ss"
        }), ", optionally with a decimal point and 1–9 fractional-second digits. Hours are 00–23 and minutes/seconds 00–59. Timezone suffixes, leap seconds, signed/expanded years, and numeric epochs are rejected. Exact strings/fractional precision survive unchanged; ordinary inferred ISO-looking strings stay ", (0,jsx_runtime.jsx)(_components.code, {
          children: "string"
        }), " unless schema or explicit types say otherwise."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "categorical"
        }), " accepts non-null scalar JSON cells and exports as Table Schema ", (0,jsx_runtime.jsx)(_components.code, {
          children: "type: 'any'"
        }), " with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "extDtype: 'category'"
        }), " when no source field metadata is being preserved. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "mixed"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "unknown"
        }), " accept any JSON-compatible cell."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Calendar validity does ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "not"
      }), " guarantee pandas read-back across the full range: dtype and resolution impose separate limits. The historical ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/HEAD/docs/tasks/20260908-180959-json-frame-boundary-health-follow-up.md#task-jfb-07-resolve-datetime-year-range-semantics",
        children: "JFB-07 investigation"
      }), ", using pandas ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "3.0.3"
      }), " / CPython ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "3.14.6"
      }), ", recorded early-year ISO emission at microsecond resolution but table read-back failures outside nanosecond bounds. This is prior evidence, not a fresh pandas experiment. Numeric epochs have no unit metadata in generated Table Schema and pandas interprets numeric datetime cells as nanoseconds; check your target dtype/resolution."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Typed-array packing is internal and only eligible non-null numeric columns at or above ", (0,jsx_runtime.jsx)(_components.code, {
        children: "packThreshold"
      }), " are packed. Packed/unpacked access and payload exports preserve the same values, including negative zero, and logical metadata. Native ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JSON.stringify(-0)"
      }), " produces ", (0,jsx_runtime.jsx)(_components.code, {
        children: "0"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "empty-dimension-round-trips",
      children: "Empty-Dimension Round Trips"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsxs)(_components.strong, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "split"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "table"
        })]
      }), " when an empty report must carry its dimensions in the payload. Round trips are semantic, not byte-for-byte. This matrix shows ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "export then re-ingestion with the matching explicit orient"
      }), ", for parsed and string exports. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "R"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "C"
      }), " are positive row/data-column counts; index fields are not data columns. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "values"
      }), " assumes separately supplied original columns."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Orient"
          }), (0,jsx_runtime.jsxs)(_components.th, {
            children: ["Zero rows, declared columns (", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × C"
            }), ")"]
          }), (0,jsx_runtime.jsxs)(_components.th, {
            children: ["Rows, zero columns (", (0,jsx_runtime.jsx)(_components.code, {
              children: "R × 0"
            }), ")"]
          }), (0,jsx_runtime.jsxs)(_components.th, {
            children: ["Fully empty (", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × 0"
            }), ")"]
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "records"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "[]"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × 0"
            }), "; column labels lost"]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "R"
            }), " empty objects → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "R × 0"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "[]"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × 0"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "index"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "{}"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × 0"
            }), "; column labels lost"]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "R"
            }), " index keys with empty objects → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "R × 0"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "{}"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × 0"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "columns"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "C"
            }), " column keys with empty objects → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × C"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "{}"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × 0"
            }), "; rows and index labels lost"]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "{}"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × 0"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "values"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "[]"
            }), " + supplied columns → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × C"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "R"
            }), " empty arrays + ", (0,jsx_runtime.jsx)(_components.code, {
              children: "columns: []"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "R × 0"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "[]"
            }), " + ", (0,jsx_runtime.jsx)(_components.code, {
              children: "columns: []"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × 0"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "split"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "columns"
            }), " retained, empty ", (0,jsx_runtime.jsx)(_components.code, {
              children: "index"
            }), "/", (0,jsx_runtime.jsx)(_components.code, {
              children: "data"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × C"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Empty ", (0,jsx_runtime.jsx)(_components.code, {
              children: "columns"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "R"
            }), " index labels and empty row arrays → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "R × 0"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Empty ", (0,jsx_runtime.jsx)(_components.code, {
              children: "columns"
            }), "/", (0,jsx_runtime.jsx)(_components.code, {
              children: "index"
            }), "/", (0,jsx_runtime.jsx)(_components.code, {
              children: "data"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × 0"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "table"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Data fields retained in schema, empty ", (0,jsx_runtime.jsx)(_components.code, {
              children: "data"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × C"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["No data fields, ", (0,jsx_runtime.jsx)(_components.code, {
              children: "R"
            }), " row objects → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "R × 0"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["No data fields, empty ", (0,jsx_runtime.jsx)(_components.code, {
              children: "data"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "0 × 0"
            })]
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "values"
      }), " requires ", (0,jsx_runtime.jsx)(_components.code, {
        children: "options.columns"
      }), " even for ", (0,jsx_runtime.jsx)(_components.code, {
        children: "[]"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "[[], []]"
      }), "; empty arrays also require explicit orient. That option applies only to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "values"
      }), " and cannot restore columns lost through empty ", (0,jsx_runtime.jsx)(_components.code, {
        children: "records"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "index"
      }), ". Column labels/order are retained where the layout carries them, subject to JavaScript enumeration of object keys."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "records"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "values"
      }), " regenerate synthetic numeric indexes. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "index"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "columns"
      }), " re-ingest string keys as source labels in enumeration order; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "columns"
      }), " cannot carry rows without columns. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "split"
      }), " emits the current index array, including any gaps after filtering, and re-ingests it as ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "source"
      }), " even when originally synthetic. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "table"
      }), " preserves a source index field and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "primaryKey"
      }), " even on fully empty frames; zero-column rows contain only that field. For synthetic indexes it emits no index field, uses ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), " for zero-column rows, and regenerates ", (0,jsx_runtime.jsx)(_components.code, {
        children: "0..R-1"
      }), " on re-ingestion, losing filtered gaps. Normal uniqueness and index-field collision checks still apply."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "table"
      }), " carries logical types and retained field/schema metadata. A zero-row numeric column in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "split"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "columns"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "values"
      }), " has no cells from which to infer its original type; supply non-table ", (0,jsx_runtime.jsx)(_components.code, {
        children: "columnTypes"
      }), " if needed."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { fromOrient } from '@web-ts-toolkit/json-frame';\n\nconst report = fromOrient([{ a: 1 }, { a: 2 }], { orient: 'records' });\nconst noRows = report.filter(() => false);\nconst noColumns = report.select();\nconst shaped = fromOrient(noRows.toSplit(), { orient: 'split' }); // 0 × 1\nconst rowCount = fromOrient(noColumns.toTable(), { orient: 'table' }); // 2 × 0\nconst lostRows = fromOrient(noColumns.toColumns(), { orient: 'columns' }); // 0 × 0\nconst restoredColumns = fromOrient(noRows.toValues(), { orient: 'values', columns: noRows.columns });\n\nvoid [shaped, rowCount, lostRows, restoredColumns];\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "immutability",
      children: "Immutability"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DataFrame"
      }), " contract is structural and shallow. Frame-owned arrays, row records, exporter containers, table schema records, and internal maps are protected from direct mutation or are freshly allocated. Nested JSON object or array cell values are not deep-frozen or deep-cloned on every read/export; if caller code mutates one of those nested values after obtaining it from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "row()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "rows()"
      }), ", or an exporter, another read of the same cell may observe that mutation."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Clone nested object/array cells at your application boundary if you need deep immutability."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "filter"
      }), ", stable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sort"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "rename"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "resetIndex"
      }), " return new frames. Filtering and sorting keep labels; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "resetIndex()"
      }), " replaces them with a synthetic ", (0,jsx_runtime.jsx)(_components.code, {
        children: "0..n-1"
      }), ". Row access uses ", (0,jsx_runtime.jsx)(_components.code, {
        children: "row(position)"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "rows()"
      }), ". Exporters are ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toRecords()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toIndex()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toColumns()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toValues()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toSplit()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toTable(options?)"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toJSONString(orient, options?)"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "limits-and-errors",
      children: "Limits And Errors"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "JSON_FRAME_MAX_DEPTH"
      }), " is ", (0,jsx_runtime.jsx)(_components.code, {
        children: "1000"
      }), ". Arrays/objects count from the validated root at depth ", (0,jsx_runtime.jsx)(_components.code, {
        children: "0"
      }), "; containers at depth ", (0,jsx_runtime.jsx)(_components.code, {
        children: "1000"
      }), " are accepted and at ", (0,jsx_runtime.jsx)(_components.code, {
        children: "1001"
      }), " fail with path-bearing ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonFrameValidationError"
      }), ". For ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toJSONString()"
      }), " the root is the ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "complete exported payload"
      }), ", including orient wrappers. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "split"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "table"
      }), " nest cells one level deeper than ", (0,jsx_runtime.jsx)(_components.code, {
        children: "records"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "values"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "index"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "columns"
      }), ", so a cell accepted at ingestion may fail in a deeper output layout. Table metadata cloning uses the same depth policy; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toTable()"
      }), " and table string export can reject over-depth metadata."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "serialization-after-mutation",
      children: "Serialization After Mutation"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "toJSONString()"
      }), " validates the complete output before native serialization. Cycles, over-depth containers, sparse arrays, and newly introduced non-JSON values (", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "bigint"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "symbol"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "function"
      }), ", non-finite numbers, non-plain objects) fail with path-bearing ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonFrameValidationError"
      }), " carrying the selected orient. Valid nested JSON preserves its shallow cell identity on later reads."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Validation is one traversal without cloning, followed by native ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JSON.stringify()"
      }), ". Repeated acyclic references are revisited per occurrence and expand during stringification. Own enumerable property/array reads invoke caller getters and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Proxy"
      }), " traps; native serialization can additionally invoke ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toJSON"
      }), ", including non-enumerable hooks invisible to validation. Hooks may change values between passes and remain caller responsibility; arbitrary JavaScript is not sandboxed."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "opt-in-traversal-budgets",
      children: "Opt-In Traversal Budgets"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "fromOrient(input, { maxNodes })"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "frame.toJSONString(orient, { maxNodes })"
      }), " accept a ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "positive safe integer"
      }), ". Zero, negative, fractional, non-finite/unsafe integers, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), ", and other nonnumbers throw ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonFrameOptionError"
      }), ". Omitted/undefined means no quota. All six string orients validate options; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "indexField"
      }), " must be a string when supplied, affects only table, and combines with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "maxNodes"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The root counts as one, followed by every property/array-element ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "value occurrence"
      }), ", including scalars, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), ", and empty containers; property names are not nodes. Repeated aliases count on every path and ingestion still clones each occurrence separately. Exact-budget traversal succeeds; attempting the next node fails with path-bearing ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonFrameValidationError"
      }), " and the orient when known. Auto ingestion detects orient only after cloning. String export counts wrappers, labels, and table metadata, so orient budgets differ. Counters reset per call; ingestion budgets are ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "not retained by frames"
      }), " or inherited by exports/transforms."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { fromOrient } from '@web-ts-toolkit/json-frame';\n\nconst frame = fromOrient('[{\"n\":1}]', { orient: 'records', maxNodes: 3 });\nconst records = frame.toJSONString('records', { maxNodes: 3 });\nconst split = frame.toJSONString('split', { maxNodes: 8 });\nconst indexed = fromOrient({ r0: { n: 1 } }, { orient: 'index', maxNodes: 3 });\nconst table = indexed.toJSONString('table', { indexField: 'row_id', maxNodes: 15 });\n\nvoid [records, split, table];\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This limits traversal expansion, ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "not total resources"
      }), ". It does not bound input bytes or preceding native ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JSON.parse()"
      }), ", key enumeration/allocation (including diagnostic key counting), rectangular frame densification, export payload/schema construction before validation, native stringification/output bytes, hooks, or total memory. Scalars can be arbitrarily large. Validation allocates traversal bookkeeping, not a redundant full clone. Depth/cycle/JSON checks apply independently. Object exporters such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toTable()"
      }), " have no ", (0,jsx_runtime.jsx)(_components.code, {
        children: "maxNodes"
      }), " option. Applications need their own size and trust boundaries."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "structured-diagnostics",
      children: "Structured Diagnostics"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Root-exported errors are ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonFrameParseError"
      }), " (invalid JSON; original ", (0,jsx_runtime.jsx)(_components.code, {
        children: "SyntaxError"
      }), " in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "cause"
      }), "), ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonFrameOptionError"
      }), " (invalid options), ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonFrameValidationError"
      }), " (shape, transform, or JSON-value validation), ", (0,jsx_runtime.jsx)(_components.code, {
        children: "AmbiguousOrientError"
      }), " (unresolved auto detection), ", (0,jsx_runtime.jsx)(_components.code, {
        children: "UnsupportedFeatureError"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ExportKeyCollisionError"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "JsonFrameError"
      }), " exposes ", (0,jsx_runtime.jsx)(_components.code, {
        children: "orient"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "path"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "row"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "column"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "value"
      }), " when relevant. Scalar strings/numbers (including non-finite numbers)/booleans/null are retained directly. Other values become frozen summaries: arrays use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ kind: 'array', length }"
      }), "; objects use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ kind: 'object', keyCount, keys, truncated }"
      }), "; undefined/symbol/bigint/function use their ", (0,jsx_runtime.jsx)(_components.code, {
        children: "kind"
      }), ". Cyclic containers are summarized rather than retained. Constructing or serializing these diagnostics does not invoke caller ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toJSON"
      }), " hooks."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Object previews retain at most ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "5 keys / 200 characters of key text total"
      }), ". ", (0,jsx_runtime.jsx)(_components.code, {
        children: "truncated"
      }), " is true when either key count or text is shortened; false means the key preview is complete. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "keyCount"
      }), " reports the full own enumerable key count. This bounds retained/serialized previews, ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "not the whole error"
      }), ": scalar strings, paths, column/option/key names, and collision labels can be input-sized. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Object.keys()"
      }), " visits/allocates all keys for counting, so error construction is not constant-space."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "types",
      children: "Types"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The root exports ", (0,jsx_runtime.jsx)(_components.code, {
        children: "fromOrient"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JSON_FRAME_MAX_DEPTH"
      }), ", and error classes as values. Named types include ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DataFrame"
      }), " (an interface, not a public constructor), ", (0,jsx_runtime.jsx)(_components.code, {
        children: "FromOrientOptions"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ToTableOptions"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ToJSONStringOptions"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonRow"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonValue"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JsonFrameDiagnosticValue"
      }), ", all six payload types, Table Schema metadata, and column/index types. Normal JSON-compatible domain interfaces need no catch-all index signature."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The isomorphic package has no runtime or peer dependencies and publishes CJS, ESM, ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".d.ts"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".d.mts"
      }), " entrypoints (Node package engine: ", (0,jsx_runtime.jsx)(_components.code, {
        children: ">=22"
      }), "). MultiIndex, duplicate/non-string columns, pandas Series shapes, JSON Lines, compression, file I/O/streaming, general extension-dtype reconstruction, and deep freezing are outside the supported contract."]
    })]
  });
}
function MDXContent(props = {}) {
  const {wrapper: MDXLayout} = {
    ...(0,lib/* useMDXComponents */.R)(),
    ...props.components
  };
  return MDXLayout ? (0,jsx_runtime.jsx)(MDXLayout, {
    ...props,
    children: (0,jsx_runtime.jsx)(_createMdxContent, {
      ...props
    })
  }) : _createMdxContent(props);
}



/***/ },

/***/ 2608
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  A: () => (/* binding */ TabItem)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/index.js
var react = __webpack_require__(2990);
// EXTERNAL MODULE: ./node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
var clsx = __webpack_require__(3526);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._d351382fa164602fcc676fe5d3a173bd/node_modules/@docusaurus/theme-common/lib/utils/tabsUtils.js
var tabsUtils = __webpack_require__(6825);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/styles.module.css
// extracted by mini-css-extract-plugin
/* harmony default export */ const styles_module = ({"tabItem":"tabItem_AjYd"});
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js
/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */function TabItemPanel({children,className,hidden}){return/*#__PURE__*/(0,jsx_runtime.jsx)("div",{role:"tabpanel",className:(0,clsx/* default */.A)(styles_module.tabItem,className),hidden,children:children});}function TabItem({children,className,value}){const{selectedValue,lazy}=(0,tabsUtils/* useTabs */.uc)();const isSelected=value===selectedValue;// TODO Docusaurus v4: use <Activity> ?
if(!isSelected&&lazy){return null;}return/*#__PURE__*/(0,jsx_runtime.jsx)(TabItemPanel,{className:className,hidden:!isSelected,children:children});}

/***/ },

/***/ 5430
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  A: () => (/* binding */ Tabs)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/index.js
var react = __webpack_require__(2990);
// EXTERNAL MODULE: ./node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
var clsx = __webpack_require__(3526);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._d351382fa164602fcc676fe5d3a173bd/node_modules/@docusaurus/theme-common/lib/utils/ThemeClassNames.js
var ThemeClassNames = __webpack_require__(9137);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._d351382fa164602fcc676fe5d3a173bd/node_modules/@docusaurus/theme-common/lib/utils/tabsUtils.js
var tabsUtils = __webpack_require__(6825);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._d351382fa164602fcc676fe5d3a173bd/node_modules/@docusaurus/theme-common/lib/utils/scrollUtils.js
var scrollUtils = __webpack_require__(234);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+core@3.10.2_@mdx-js+react@3.1.1_@types+react@19.3.0_react@19.3.0__clean-css_2cb997e804faf8cfe5cbdf831cf9efd3/node_modules/@docusaurus/core/lib/client/exports/useIsBrowser.js
var useIsBrowser = __webpack_require__(1419);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/styles.module.css
// extracted by mini-css-extract-plugin
/* harmony default export */ const styles_module = ({"tabList":"tabList_cAVk","tabItem":"tabItem_BqLW"});
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js
/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */function TabList({className}){const{selectedValue,selectValue,tabValues,block}=(0,tabsUtils/* useTabs */.uc)();const tabRefs=[];const{blockElementScrollPositionUntilNextRender}=(0,scrollUtils/* useScrollPositionBlocker */.a_)();const handleTabChange=event=>{const newTab=event.currentTarget;const newTabIndex=tabRefs.indexOf(newTab);const newTabValue=tabValues[newTabIndex].value;if(newTabValue!==selectedValue){blockElementScrollPositionUntilNextRender(newTab);selectValue(newTabValue);}};const handleKeydown=event=>{let focusElement=null;switch(event.key){case'Enter':{handleTabChange(event);break;}case'ArrowRight':{const nextTab=tabRefs.indexOf(event.currentTarget)+1;focusElement=tabRefs[nextTab]??tabRefs[0];break;}case'ArrowLeft':{const prevTab=tabRefs.indexOf(event.currentTarget)-1;focusElement=tabRefs[prevTab]??tabRefs[tabRefs.length-1];break;}default:break;}focusElement?.focus();};return/*#__PURE__*/(0,jsx_runtime.jsx)("ul",{role:"tablist","aria-orientation":"horizontal",className:(0,clsx/* default */.A)('tabs',{'tabs--block':block},className),children:tabValues.map(({value,label,attributes})=>/*#__PURE__*/(0,jsx_runtime.jsx)("li",{// TODO extract TabListItem
role:"tab",tabIndex:selectedValue===value?0:-1,"aria-selected":selectedValue===value,ref:ref=>{tabRefs.push(ref);},onKeyDown:handleKeydown,onClick:handleTabChange,...attributes,className:(0,clsx/* default */.A)('tabs__item',styles_module.tabItem,attributes?.className,{'tabs__item--active':selectedValue===value}),children:label??value},value))});}function TabContent({children}){return/*#__PURE__*/(0,jsx_runtime.jsx)("div",{className:"margin-top--md",children:children});}function TabsContainer({className,children}){return/*#__PURE__*/(0,jsx_runtime.jsxs)("div",{className:(0,clsx/* default */.A)(ThemeClassNames/* ThemeClassNames */.G.tabs.container,// former name kept for backward compatibility
// see https://github.com/facebook/docusaurus/pull/4086
'tabs-container',styles_module.tabList),children:[/*#__PURE__*/(0,jsx_runtime.jsx)(TabList// Surprising but historical
// className is applied on TabList, not on TabsContainer
,{className:className}),/*#__PURE__*/(0,jsx_runtime.jsx)(TabContent,{children:children})]});}function Tabs(props){const isBrowser=(0,useIsBrowser/* default */.A)();const value=(0,tabsUtils/* useTabsContextValue */.OC)(props);return/*#__PURE__*/(0,jsx_runtime.jsx)(tabsUtils/* TabsProvider */.O_,{value:value// Remount tabs after hydration
// Temporary fix for https://github.com/facebook/docusaurus/issues/5653
,children:/*#__PURE__*/(0,jsx_runtime.jsx)(TabsContainer,{className:props.className,children:(0,tabsUtils/* sanitizeTabsChildren */.vT)(props.children)})},String(isBrowser));}

/***/ },

/***/ 6825
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   OC: () => (/* binding */ useTabsContextValue),
/* harmony export */   O_: () => (/* binding */ TabsProvider),
/* harmony export */   uc: () => (/* binding */ useTabs),
/* harmony export */   vT: () => (/* binding */ sanitizeTabsChildren)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(2990);
/* harmony import */ var _docusaurus_router__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(8029);
/* harmony import */ var _docusaurus_useIsomorphicLayoutEffect__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(6009);
/* harmony import */ var _docusaurus_theme_common_internal__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(2911);
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(8291);
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(3268);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(4686);
/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */function sanitizeTabsChildren(children){return react__WEBPACK_IMPORTED_MODULE_0__.Children.toArray(children).filter(child=>child!=='\n');}function extractChildrenTabValues(children){// ✅ <TabItem value="red"/> => true
// ✅ <CustomTabItem value="red"/> => true
// ❌ <RedTabItem value="tab-value"/> => requires <Tabs values> prop
function isTabItemWithValueProp(comp){const{props}=comp;return!!props&&typeof props==='object'&&'value'in props;}const elements=react__WEBPACK_IMPORTED_MODULE_0__.Children.toArray(children).flatMap(child=>{// Historical case, not sure when it happens, do we really need this?
if(!child){return[];}if(/*#__PURE__*/(0,react__WEBPACK_IMPORTED_MODULE_0__.isValidElement)(child)&&isTabItemWithValueProp(child)){return[child];}// child.type.name will give non-sensical values in prod because of
// minification, but we assume it won't throw in prod.
const badChildTypeName=// @ts-expect-error: guarding against unexpected cases
typeof child.type==='string'?child.type:child.type.name;throw new Error(`Docusaurus error: Bad <Tabs> child <${badChildTypeName}>: all children of the <Tabs> component should be <TabItem>, and every <TabItem> should have a unique "value" prop.
If you do not want to pass on a "value" prop to the direct children of <Tabs>, you can also pass an explicit <Tabs values={...}> prop.`);});return elements.map(({props:{value,label,attributes,default:isDefault}})=>({value,label,attributes,default:isDefault}));}function ensureNoDuplicateValue(values){const dup=(0,_index__WEBPACK_IMPORTED_MODULE_5__/* .duplicates */ .XI)(values,(a,b)=>a.value===b.value);if(dup.length>0){throw new Error(`Docusaurus error: Duplicate values "${dup.map(a=>`'${a.value}'`).join(', ')}" found in <Tabs>. Every value needs to be unique.`);}}function useTabValues(props){const{values:valuesProp,children}=props;return (0,react__WEBPACK_IMPORTED_MODULE_0__.useMemo)(()=>{const values=valuesProp??extractChildrenTabValues(children);ensureNoDuplicateValue(values);return values;},[valuesProp,children]);}function isValidValue({value,tabValues}){return tabValues.some(a=>a.value===value);}function getInitialStateValue({defaultValue,tabValues}){if(tabValues.length===0){throw new Error('Docusaurus error: the <Tabs> component requires at least one <TabItem> children component');}if(defaultValue){// Warn user about passing incorrect defaultValue as prop.
if(!isValidValue({value:defaultValue,tabValues})){throw new Error(`Docusaurus error: The <Tabs> has a defaultValue "${defaultValue}" but none of its children has the corresponding value. Available values are: ${tabValues.map(a=>a.value).join(', ')}. If you intend to show no default tab, use defaultValue={null} instead.`);}return defaultValue;}const defaultTabValue=tabValues.find(tabValue=>tabValue.default)??tabValues[0];if(!defaultTabValue){throw new Error('Unexpected error: 0 tabValues');}return defaultTabValue.value;}function getStorageKey(groupId){if(!groupId){return null;}return`docusaurus.tab.${groupId}`;}function getQueryStringKey({queryString=false,groupId}){if(typeof queryString==='string'){return queryString;}if(queryString===false){return null;}if(queryString===true&&!groupId){throw new Error(`Docusaurus error: The <Tabs> component groupId prop is required if queryString=true, because this value is used as the search param name. You can also provide an explicit value such as queryString="my-search-param".`);}return groupId??null;}function useTabQueryString({queryString=false,groupId}){const history=(0,_docusaurus_router__WEBPACK_IMPORTED_MODULE_1__/* .useHistory */ .W6)();const key=getQueryStringKey({queryString,groupId});const value=(0,_docusaurus_theme_common_internal__WEBPACK_IMPORTED_MODULE_3__/* .useQueryStringValue */ .aZ)(key);const setValue=(0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)(newValue=>{if(!key){return;// no-op
}const searchParams=new URLSearchParams(history.location.search);searchParams.set(key,newValue);history.replace({...history.location,search:searchParams.toString()});},[key,history]);return[value,setValue];}function useTabStorage({groupId}){const key=getStorageKey(groupId);const[value,storageSlot]=(0,_index__WEBPACK_IMPORTED_MODULE_4__/* .useStorageSlot */ .Dv)(key);const setValue=(0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)(newValue=>{if(!key){return;// no-op
}storageSlot.set(newValue);},[key,storageSlot]);return[value,setValue];}function useTabsContextValue(props){const{defaultValue,queryString=false,groupId}=props;const tabValues=useTabValues(props);const[selectedValue,setSelectedValue]=(0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(()=>getInitialStateValue({defaultValue,tabValues}));const[queryStringValue,setQueryString]=useTabQueryString({queryString,groupId});const[storageValue,setStorageValue]=useTabStorage({groupId});// We sync valid querystring/storage value to state on change + hydration
const valueToSync=(()=>{const value=queryStringValue??storageValue;if(!isValidValue({value,tabValues})){return null;}return value;})();// Sync in a layout/sync effect is important, for useScrollPositionBlocker
// See https://github.com/facebook/docusaurus/issues/8625
(0,_docusaurus_useIsomorphicLayoutEffect__WEBPACK_IMPORTED_MODULE_2__/* ["default"] */ .A)(()=>{if(valueToSync){setSelectedValue(valueToSync);}},[valueToSync]);const selectValue=(0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)(newValue=>{if(!isValidValue({value:newValue,tabValues})){throw new Error(`Can't select invalid tab value=${newValue}`);}setSelectedValue(newValue);setQueryString(newValue);setStorageValue(newValue);},[setQueryString,setStorageValue,tabValues]);return{selectedValue,selectValue,tabValues,lazy:props.lazy??false,block:props.block??false};}const TabsContext=/*#__PURE__*/(0,react__WEBPACK_IMPORTED_MODULE_0__.createContext)(null);function useTabs(){const contextValue=react__WEBPACK_IMPORTED_MODULE_0__.useContext(TabsContext);if(!contextValue){throw new Error('useTabsContext() must be used within a Tabs component');}return contextValue;}function TabsProvider(props){return/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(TabsContext.Provider,{value:props.value,children:props.children});}

/***/ },

/***/ 3191
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   R: () => (/* binding */ useMDXComponents),
/* harmony export */   x: () => (/* binding */ MDXProvider)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(2990);
/**
 * @import {MDXComponents} from 'mdx/types.js'
 * @import {Component, ReactElement, ReactNode} from 'react'
 */

/**
 * @callback MergeComponents
 *   Custom merge function.
 * @param {Readonly<MDXComponents>} currentComponents
 *   Current components from the context.
 * @returns {MDXComponents}
 *   Additional components.
 *
 * @typedef Props
 *   Configuration for `MDXProvider`.
 * @property {ReactNode | null | undefined} [children]
 *   Children (optional).
 * @property {Readonly<MDXComponents> | MergeComponents | null | undefined} [components]
 *   Additional components to use or a function that creates them (optional).
 * @property {boolean | null | undefined} [disableParentContext=false]
 *   Turn off outer component context (default: `false`).
 */



/** @type {Readonly<MDXComponents>} */
const emptyComponents = {}

const MDXContext = react__WEBPACK_IMPORTED_MODULE_0__.createContext(emptyComponents)

/**
 * Get current components from the MDX Context.
 *
 * @param {Readonly<MDXComponents> | MergeComponents | null | undefined} [components]
 *   Additional components to use or a function that creates them (optional).
 * @returns {MDXComponents}
 *   Current components.
 */
function useMDXComponents(components) {
  const contextComponents = react__WEBPACK_IMPORTED_MODULE_0__.useContext(MDXContext)

  // Memoize to avoid unnecessary top-level context changes
  return react__WEBPACK_IMPORTED_MODULE_0__.useMemo(
    function () {
      // Custom merge via a function prop
      if (typeof components === 'function') {
        return components(contextComponents)
      }

      return {...contextComponents, ...components}
    },
    [contextComponents, components]
  )
}

/**
 * Provider for MDX context.
 *
 * @param {Readonly<Props>} properties
 *   Properties.
 * @returns {ReactElement}
 *   Element.
 * @satisfies {Component}
 */
function MDXProvider(properties) {
  /** @type {Readonly<MDXComponents>} */
  let allComponents

  if (properties.disableParentContext) {
    allComponents =
      typeof properties.components === 'function'
        ? properties.components(emptyComponents)
        : properties.components || emptyComponents
  } else {
    allComponents = useMDXComponents(properties.components)
  }

  return react__WEBPACK_IMPORTED_MODULE_0__.createElement(
    MDXContext.Provider,
    {value: allComponents},
    properties.children
  )
}


/***/ }

}]);