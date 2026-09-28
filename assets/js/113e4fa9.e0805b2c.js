"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[761],{

/***/ 4740
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_mongoose_rxdb_md_113_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-mongoose-rxdb-md-113.json
const site_docs_packages_mongoose_rxdb_md_113_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/mongoose-rxdb","title":"@web-ts-toolkit/mongoose-rxdb","description":"A Mongoose-shaped API (Schema, Document, Query, Model, Connection, pre/post middleware)","source":"@site/docs/packages/mongoose-rxdb.md","sourceDirName":"packages","slug":"/packages/mongoose-rxdb","permalink":"/docs/packages/mongoose-rxdb","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":17,"frontMatter":{"sidebar_label":"Mongoose-RxDB","sidebar_position":17},"sidebar":"packagesSidebar","previous":{"title":"Moo","permalink":"/docs/packages/moo"},"next":{"title":"PDF Reader","permalink":"/docs/packages/pdf-reader"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(7008);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(362);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(4340);
;// ./docs/packages/mongoose-rxdb.md


const frontMatter = {
	sidebar_label: 'Mongoose-RxDB',
	sidebar_position: 17
};
const contentTitle = '@web-ts-toolkit/mongoose-rxdb';

const assets = {

};





const toc = [{
  "value": "Installation",
  "id": "installation",
  "level": 2
}, {
  "value": "Imports And Module Identity",
  "id": "imports-and-module-identity",
  "level": 2
}, {
  "value": "Compatibility Matrix",
  "id": "compatibility-matrix",
  "level": 2
}, {
  "value": "What It Exposes",
  "id": "what-it-exposes",
  "level": 2
}, {
  "value": "Quick Start",
  "id": "quick-start",
  "level": 2
}, {
  "value": "TypeScript",
  "id": "typescript",
  "level": 2
}, {
  "value": "Schema",
  "id": "schema",
  "level": 2
}, {
  "value": "Document",
  "id": "document",
  "level": 2
}, {
  "value": "In-Flight Saves And Migration",
  "id": "in-flight-saves-and-migration",
  "level": 3
}, {
  "value": "Document Value Safety And Migration",
  "id": "document-value-safety-and-migration",
  "level": 3
}, {
  "value": "Selected Documents: Save Safety And Migration",
  "id": "selected-documents-save-safety-and-migration",
  "level": 3
}, {
  "value": "Query",
  "id": "query",
  "level": 2
}, {
  "value": "Conditional Mutation Selectors (Compatibility / Migration)",
  "id": "conditional-mutation-selectors-compatibility--migration",
  "level": 3
}, {
  "value": "Write Normalization",
  "id": "write-normalization",
  "level": 3
}, {
  "value": "Upsert Concurrency And Business Identity",
  "id": "upsert-concurrency-and-business-identity",
  "level": 3
}, {
  "value": "Read Query Semantics",
  "id": "read-query-semantics",
  "level": 3
}, {
  "value": "Middleware",
  "id": "middleware",
  "level": 2
}, {
  "value": "Connection &amp; Storage",
  "id": "connection--storage",
  "level": 2
}, {
  "value": "Security: <code>sanitizeFilter</code>",
  "id": "security-sanitizefilter",
  "level": 2
}, {
  "value": "<code>_id</code>",
  "id": "_id",
  "level": 2
}, {
  "value": "Connection model registration",
  "id": "connection-model-registration",
  "level": 2
}, {
  "value": "How It Maps to RxDB",
  "id": "how-it-maps-to-rxdb",
  "level": 2
}, {
  "value": "Current Scope",
  "id": "current-scope",
  "level": 2
}, {
  "value": "When To Use It",
  "id": "when-to-use-it",
  "level": 2
}];
function _createMdxContent(props) {
  const _components = {
    code: "code",
    h1: "h1",
    h2: "h2",
    h3: "h3",
    header: "header",
    li: "li",
    ol: "ol",
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
        id: "web-ts-toolkitmongoose-rxdb",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/mongoose-rxdb"
        })
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["A Mongoose-shaped API (", (0,jsx_runtime.jsx)(_components.code, {
        children: "Schema"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Document"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Query"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Model"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Connection"
      }), ", pre/post middleware)\nbacked by ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "RxDB"
      }), " so your data lives in local SQLite (or any RxDB storage).\nIt is a read-like-Mongoose, persists-offline proxy: schema definitions, casting, validation, dirty\ntracking, virtuals, methods, statics, chainable thenable queries, and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pre"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "post"
      }), " hooks all run\nagainst an RxDB collection."]
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
            children: "npm install @web-ts-toolkit/mongoose-rxdb rxdb rxjs\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add @web-ts-toolkit/mongoose-rxdb rxdb rxjs\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add @web-ts-toolkit/mongoose-rxdb rxdb rxjs\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add @web-ts-toolkit/mongoose-rxdb rxdb rxjs\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "For production-grade local SQLite storage, also install RxDB Premium (licensed; needs an\naccess token at install time):"
    }), "\n", (0,jsx_runtime.jsxs)(Tabs/* default */.A, {
      groupId: "npm2yarn",
      children: [(0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "npm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "npm install rxdb-premium\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add rxdb-premium\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add rxdb-premium\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add rxdb-premium\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If ", (0,jsx_runtime.jsx)(_components.code, {
        children: "node:sqlite"
      }), " is unavailable in your Node runtime and you want the RxDB trial SQLite backend,\ninstall npm ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sqlite3"
      }), " as an optional fallback:"]
    }), "\n", (0,jsx_runtime.jsxs)(Tabs/* default */.A, {
      groupId: "npm2yarn",
      children: [(0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "npm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "npm install sqlite3\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add sqlite3\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add sqlite3\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add sqlite3\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["No ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sqlite3"
      }), " install is required on Node 22+: the built-in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "node:sqlite"
      }), " module is\nauto-detected and used by the free ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "trial"
      }), " SQLite storage (it writes a real file but\nis capped at ~500 docs/collection, has no indexes, and prints a warning each load).\nThis package supports Node 22+. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sqlite3"
      }), " is only a Node fallback for runtimes where\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "node:sqlite"
      }), " cannot be opened; non-Node runtimes must provide their own RxDB factory.\nFor real production SQLite, install ", (0,jsx_runtime.jsx)(_components.code, {
        children: "rxdb-premium"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Peer dependencies:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "rxdb >=17.4.0 <18"
        }), " (required)"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "rxjs >=7.8.0 <8"
        }), " (required)"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "rxdb-premium >=17.4.0 <18"
        }), " (optional — only for the production-grade SQLite storage)"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "sqlite3 >=5 <6"
        }), " (optional — only for the trial SQLite path in Node runtimes without ", (0,jsx_runtime.jsx)(_components.code, {
          children: "node:sqlite"
        }), ")"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "imports-and-module-identity",
      children: "Imports And Module Identity"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use named imports as the canonical style:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { Connection, Schema } from '@web-ts-toolkit/mongoose-rxdb';\nimport { createMemoryDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Default exports are retained only as redundant compatibility conveniences. Prefer named imports in new\ncode because they make the public API clearer to TypeScript, editors, and bundlers."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The package publishes separate ESM and CommonJS builds. If one process loads both formats, each format\nhas its own ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Schema"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "Connection"
      }), " class identity and its own ", (0,jsx_runtime.jsx)(_components.code, {
        children: "defaultConnection"
      }), "; there is no supported\ncross-format singleton. Pick one module format per application graph, and pass explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Connection"
      }), "\ninstances across boundaries when integration code might mix ESM and CommonJS."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "compatibility-matrix",
      children: "Compatibility Matrix"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Runtime"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "RxDB"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "RxJS"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Evidence"
          })]
        })
      }), (0,jsx_runtime.jsx)(_components.tbody, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Node 22+"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: ">=17.4.0 <18"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: ">=7.8.0 <8"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Package tests, strict NodeNext/Bundler declaration consumers, packed pnpm/npm runtime imports, and packed README quickstart run against the workspace dev dependencies (", (0,jsx_runtime.jsx)(_components.code, {
              children: "rxdb ^17.4.0"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "rxjs ^7.8.2"
            }), ")."]
          })]
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Future RxDB or RxJS majors are intentionally outside the peer range until they have the same package,\ndeclaration, and packed-consumer coverage."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-exposes",
      children: "What It Exposes"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "From the root entrypoint:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "Schema"
        }), " — type paths, defaults, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "required"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "enum"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "min"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "max"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "match"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "validate"
        }), ", methods, statics, virtuals, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "pre"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "post"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "plugin"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "clone"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "Document"
        }), " — change-tracked instances with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isModified"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "modifiedPaths"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "markModified"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "validate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "save"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "remove"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "toObject"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "toJSON"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "get"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "set"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "ValidationError"
        }), " — thrown by ", (0,jsx_runtime.jsx)(_components.code, {
          children: "validate()"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "save()"
        }), " for schema violations"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "Query"
        }), " — thenable chainable builder (", (0,jsx_runtime.jsx)(_components.code, {
          children: "where"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "equals"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "gt"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "gte"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "lt"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "lte"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "ne"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "in"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "nin"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "exists"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "regex"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "or"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "and"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "nor"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "limit"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "skip"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sort"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "lean"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "exec"
        }), ")"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "Model"
        }), " — ", (0,jsx_runtime.jsx)(_components.code, {
          children: "find"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "findOne"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "findById"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "create"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "insertMany"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "updateOne"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "updateMany"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "deleteOne"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "deleteMany"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "findOneAndUpdate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "findOneAndDelete"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "countDocuments"
        }), ", plus schema ", (0,jsx_runtime.jsx)(_components.code, {
          children: "statics"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "Connection"
        }), " — RxDB-backed connection with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "connect"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "model"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "modelNames"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "deleteModel"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "disconnect"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "defaultConnection"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "connect(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "disconnect(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "model(...)"
        }), " — convenience accessors over a shared default connection"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "MiddlewareEngine"
        }), " — kareem-like async pre/post engine"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Converters: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "convertToRxJsonSchema"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "castDocumentToSchema"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "castValue"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Query compiler helpers: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "translateFilter"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "applyUpdate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "compileQuery"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "RxCollectionAdapter"
        }), " — thin ", (0,jsx_runtime.jsx)(_components.code, {
          children: "RxLikeCollection"
        }), " over a real ", (0,jsx_runtime.jsx)(_components.code, {
          children: "RxCollection"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["From the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/mongoose-rxdb/storage"
      }), " subpath:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["\n", (0,jsx_runtime.jsxs)(_components.p, {
          children: [(0,jsx_runtime.jsx)(_components.code, {
            children: "createMemoryDatabase(opts?)"
          }), " — in-process memory storage (tests and quick prototyping)"]
        }), "\n"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["\n", (0,jsx_runtime.jsxs)(_components.p, {
          children: [(0,jsx_runtime.jsx)(_components.code, {
            children: "createSqliteDatabase(opts?)"
          }), " — local SQLite. Resolution order is automatic, but a\nrequested SQLite database fails closed when no backend can be opened:"]
        }), "\n", (0,jsx_runtime.jsxs)(_components.ol, {
          children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "rxdb-premium"
            }), "'s ", (0,jsx_runtime.jsx)(_components.code, {
              children: "getRxStorageSqlite"
            }), " (production-grade; needs a license token at install)."]
          }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
            children: ["RxDB's free ", (0,jsx_runtime.jsx)(_components.strong, {
              children: "trial"
            }), " ", (0,jsx_runtime.jsx)(_components.code, {
              children: "getRxStorageSQLiteTrial"
            }), " driven by Node 22+'s built-in ", (0,jsx_runtime.jsx)(_components.code, {
              children: "node:sqlite"
            }), " — persists to files derived from ", (0,jsx_runtime.jsx)(_components.code, {
              children: "opts.filePath"
            }), ", prints a warning each load, capped at ~500 docs/collection, no indexes."]
          }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
            children: ["Same trial with npm ", (0,jsx_runtime.jsx)(_components.code, {
              children: "sqlite3"
            }), " in Node, if installed."]
          }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
            children: ["In-memory ", (0,jsx_runtime.jsx)(_components.code, {
              children: "getRxStorageMemory"
            }), " only when you pass ", (0,jsx_runtime.jsx)(_components.code, {
              children: "allowMemoryFallback: true"
            }), "."]
          }), "\n"]
        }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
          children: ["This is a breaking safety change from older releases: ", (0,jsx_runtime.jsx)(_components.code, {
            children: "createSqliteDatabase({ filePath })"
          }), "\nno longer silently creates volatile memory storage when SQLite is unavailable. It rejects with\n", (0,jsx_runtime.jsx)(_components.code, {
            children: "SqliteStorageError"
          }), ", whose ", (0,jsx_runtime.jsx)(_components.code, {
            children: "causes"
          }), " array preserves backend-specific load/open failures.\n", (0,jsx_runtime.jsx)(_components.code, {
            children: "filePath"
          }), " is exact for Premium (", (0,jsx_runtime.jsx)(_components.code, {
            children: "sqliteDatabasePath"
          }), ") and a ", (0,jsx_runtime.jsx)(_components.code, {
            children: "databaseNamePrefix"
          }), " for trial\nbackends (which append a ", (0,jsx_runtime.jsx)(_components.code, {
            children: "_trial_<databaseName>"
          }), " suffix, so on-disk names differ from the\nrequested path). ", (0,jsx_runtime.jsx)(_components.code, {
            children: "filePath"
          }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
            children: "':memory:'"
          }), ", which is volatile-only: it selects\ngenuine in-memory storage when ", (0,jsx_runtime.jsx)(_components.code, {
            children: "allowMemoryFallback: true"
          }), " is passed and is rejected otherwise,\nbecause trial SQLite backends would open an ordinary relative file such as\n", (0,jsx_runtime.jsx)(_components.code, {
            children: ":memory:_trial_<databaseName>"
          }), " instead of SQLite's special in-memory name. Only the memory\nbackend reports ", (0,jsx_runtime.jsx)(_components.code, {
            children: "persistent: false"
          }), "; every SQLite backend reports ", (0,jsx_runtime.jsx)(_components.code, {
            children: "persistent: true"
          }), ".\nThe returned database exposes ", (0,jsx_runtime.jsx)(_components.code, {
            children: "sqliteBackend"
          }), " and ", (0,jsx_runtime.jsx)(_components.code, {
            children: "sqliteStorageInfo"
          }), "."]
        }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
          children: ["On success a one-line ", (0,jsx_runtime.jsx)(_components.code, {
            children: "[mongoose-rxdb] createSqliteDatabase: using <backend> SQLite at <path>"
          }), " warning is printed (with the trial caveat for tiers 2 and 3). For real production SQLite, install ", (0,jsx_runtime.jsx)(_components.code, {
            children: "rxdb-premium"
          }), "."]
        }), "\n"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { Connection, Schema, type HookNext, type HydratedDocument } from '@web-ts-toolkit/mongoose-rxdb';\nimport { createMemoryDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';\n\ninterface User {\n  name: string;\n  age: number;\n  role: 'admin' | 'user';\n  tags: string[];\n}\n\ninterface UserMethods {\n  addTag(tag: string): string[];\n}\n\ninterface UserVirtuals {\n  isAdmin: boolean;\n}\n\ntype UserDocument = HydratedDocument<User, UserMethods, UserVirtuals>;\n\nconst conn = new Connection();\n\nconst userSchema = new Schema<User, UserMethods, {}, UserVirtuals>({\n  name: { type: String, required: true },\n  age: { type: Number, default: 0, min: 0, max: 150 },\n  role: { type: String, enum: ['admin', 'user'], default: 'user' },\n  tags: [String],\n});\n\nuserSchema.pre('save', function (this: UserDocument, next: HookNext) {\n  console.log('about to save', this.name);\n  next();\n});\n\nuserSchema.virtual('isAdmin').get(function (this: UserDocument) {\n  return this.role === 'admin';\n});\n\nuserSchema.method('addTag', function (this: UserDocument, tag: string) {\n  this.tags.push(tag);\n  return this.tags;\n});\n\ntry {\n  await conn.connect(() => createMemoryDatabase({ name: 'quickstart' }));\n  const User = conn.model('User', userSchema);\n  const ada = await User.create({ name: 'Ada', age: 36, role: 'admin', tags: [] });\n  console.log(ada.isAdmin); // true\n  ada.addTag('math');\n  await ada.save();\n\n  const admins = await User.find({ role: 'admin' }).sort({ age: 1 });\n  await User.updateOne({ name: 'Ada' }, { $inc: { age: 1 } });\n  await User.deleteOne({ name: 'Ada' });\n  console.log(admins.map((user) => user.name));\n} finally {\n  await conn.disconnect();\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For durable local storage, replace the memory factory with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createSqliteDatabase({ filePath: './app.db' })"
      }), ".\nThat request fails closed unless Premium, Node 22 ", (0,jsx_runtime.jsx)(_components.code, {
        children: "node:sqlite"
      }), ", or npm ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sqlite3"
      }), " can be opened; pass\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "allowMemoryFallback: true"
      }), " only when volatile storage is acceptable. Custom RxDB factories must register\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "RxDBQueryBuilderPlugin"
      }), " before creating the database because query sorting and limiting rely on it."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "typescript",
      children: "TypeScript"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Schema<RawDoc, Methods, Statics, Virtuals>"
      }), " as the source of truth. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Connection#model()"
      }), " infers the model from that schema, including raw fields, instance methods, statics, and virtuals, so strict consumers do not need broad casts."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "RawDocument<T>"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "LeanResult<T>"
        }), " expose only domain fields plus ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        }), "; RxDB metadata fields (", (0,jsx_runtime.jsx)(_components.code, {
          children: "_rev"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_meta"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_attachments"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_deleted"
        }), ") are not public result types."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Hydrated operations return ", (0,jsx_runtime.jsx)(_components.code, {
          children: "HydratedDocument<T, Methods, Virtuals>"
        }), ", which combines ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Document<T>"
        }), ", raw fields, methods, and virtual properties."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "Query<Result>"
        }), " implements ", (0,jsx_runtime.jsx)(_components.code, {
          children: "PromiseLike<Result>"
        }), ", so ", (0,jsx_runtime.jsx)(_components.code, {
          children: "await User.find()"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "await User.findOne()"
        }), " preserve exact result types. ", (0,jsx_runtime.jsx)(_components.code, {
          children: ".catch()"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: ".finally()"
        }), " return typed promises."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: ".lean(true)"
        }), " changes document-producing results to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "LeanResult<T>"
        }), " records without document methods; ", (0,jsx_runtime.jsx)(_components.code, {
          children: ".lean(false)"
        }), " restores the hydrated type. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "UpdateResult"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DeleteResult"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "countDocuments()"
        }), " numbers are preserved unchanged, and nullable document results preserve ", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), ". ", (0,jsx_runtime.jsx)(_components.code, {
          children: "findOneAndUpdate(..., { lean: true })"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "findOneAndDelete(..., { lean: true })"
        }), " return ", (0,jsx_runtime.jsx)(_components.code, {
          children: "LeanResult<T> | null"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Projected lean records remain typed as the full ", (0,jsx_runtime.jsx)(_components.code, {
          children: "LeanResult<T>"
        }), "; projection does not narrow the type to a partial."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Intentionally public thrown errors (", (0,jsx_runtime.jsx)(_components.code, {
          children: "WriteNormalizationError"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ParallelSaveError"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "MutationPartialFailureError"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "BulkWritePartialFailureError"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "QueryFilterError"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "QueryOptionError"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "MutationOptionError"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ValidationError"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "SchemaConfigurationError"
        }), ") are importable from the package root for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "instanceof"
        }), " narrowing; deep imports are not required."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "FilterQuery<T>"
        }), " rejects misspelled fields and incompatible operators. Use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "LooseFilterQuery<T>"
        }), " only as an explicit untrusted-input boundary before ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sanitizeFilter()"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "UpdateQuery<T>"
        }), " is field-kind aware: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$inc"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "$mul"
        }), " require numeric fields, array operators require array fields and element values, and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        }), "/RxDB metadata are excluded from updates."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "validateSync()"
        }), " is synchronous and returns ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ValidationError | undefined"
        }), "; use async ", (0,jsx_runtime.jsx)(_components.code, {
          children: "validate()"
        }), " when middleware or async validators must run."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "schema",
      children: "Schema"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "Schema"
      }), " follows the Mongoose shape: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ field: Type }"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ field: { type, ...opts } }"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const schema = new Schema({\n  name: { type: String, required: true, match: /^[A-Z]/ },\n  age: { type: Number, default: 18, min: 0, max: 150 },\n  role: { type: String, enum: ['admin', 'user'], default: 'user' },\n  tags: [String],\n  meta: { type: Object },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Supported ", (0,jsx_runtime.jsx)(_components.code, {
        children: "SchemaTypeOptions"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "type"
        }), " — ", (0,jsx_runtime.jsx)(_components.code, {
          children: "String"
        }), " | ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Number"
        }), " | ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Boolean"
        }), " | ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Date"
        }), " | ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Object"
        }), " | nested ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Schema"
        }), " | ", (0,jsx_runtime.jsx)(_components.code, {
          children: "[ItemType]"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "required"
        }), " — ", (0,jsx_runtime.jsx)(_components.code, {
          children: "boolean"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "[boolean, string]"
        }), ", or a function (including ", (0,jsx_runtime.jsx)(_components.code, {
          children: "[fn, message]"
        }), ").\nFunction-valued ", (0,jsx_runtime.jsx)(_components.code, {
          children: "required"
        }), " is evaluated dynamically by validation and is never emitted as an\nunconditional entry in public JSON Schema or RxDB ", (0,jsx_runtime.jsx)(_components.code, {
          children: "required"
        }), " lists."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "default"
        }), " — a value or a zero-arg function returning a value"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "enum"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "min"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "max"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "match"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "validate"
        }), " — a function or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ validator, message }"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "immutable"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "index"
        }), " — a storage-dependent lookup hint, not a uniqueness guarantee"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Supported schema-level options are ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "collection"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "validateBeforeSave"
      }), ". Unsupported\nMongoose options fail early with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "SchemaConfigurationError"
      }), " instead of being ignored, including\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "timestamps"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "versionKey"
      }), ", path ", (0,jsx_runtime.jsx)(_components.code, {
        children: "get"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "set"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "alias"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ref"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "auto"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sparse"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "expires"
      }), ",\nand ", (0,jsx_runtime.jsx)(_components.code, {
        children: "unique"
      }), ". ", (0,jsx_runtime.jsx)(_components.code, {
        children: "unique"
      }), " is not a backend-safe constraint in this package; use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "index: true"
      }), " only as a\nlookup hint and enforce uniqueness in a layer that can provide an atomic guarantee."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Schema structure is compiled into a model snapshot. After ", (0,jsx_runtime.jsx)(_components.code, {
        children: "connection.model(name, schema)"
      }), " returns,\nstructural ", (0,jsx_runtime.jsx)(_components.code, {
        children: "schema.add()"
      }), " calls are rejected, and direct mutations to the original schema's path maps\ncannot change that model's casting, validation, public JSON Schema, or RxDB schema. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "schema.clone()"
      }), "\ncreates an independent editable copy, including independent paths, child schemas, hooks, virtuals,\noptions, and query helpers.\nRequired tuples, enum arrays, and validator configuration objects are owned and sealed, recursively\nthrough nested and array-item paths. Caller rule containers are not frozen; clones retain independent\neditable rules. Methods/hooks and application callback closure state remain mutable behavior."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Literal defaults have a separate data-copy boundary. Schema construction, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "add()"
      }), ", cloning and model\ncompilation own arrays, plain/null-prototype objects and Dates after bounded structural preflight;\ncyclic, over-depth/over-work, sparse or accessor-bearing literals throw ", (0,jsx_runtime.jsx)(_components.code, {
        children: "WriteNormalizationError"
      }), "\nbefore recursive copying. Default factories are not executed by schema copying. Nonplain defaults\nretain their kind until a needed default reaches schema-aware casting: mixed Map/Set/class values\nreject before writes, while supported string/number coercions still work. Those opaque coercion\nobjects and factory callbacks remain application-owned shared behavior; resulting document data is\nindependently owned. Whole-document input/default/output budgets still apply when defaults are used."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Migration:"
      }), " literal defaults no longer lose their kind during schema cloning/model compilation;\nunsupported mixed defaults reject rather than storing ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), " or prototype-erased objects. Invalid\nliteral structure can now reject during schema construction or copying, even if a later document\nwould override that default."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Nested structure requires an explicit child ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Schema"
      }), " (", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ profile: childSchema }"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ profile: { type: childSchema } }"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "[childSchema]"
      }), " for subdocument arrays). Inline nested\nplain-object definitions (", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ profile: { name: String } }"
      }), "), dotted path names, and prefixed\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "schema.add(obj, prefix)"
      }), " are rejected with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "SchemaConfigurationError"
      }), " before collection creation;\nfull Mongoose nested syntax is intentionally not supported."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Helpers:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "schema.method('fullName', function () {\n  return this.name;\n});\nschema.method({\n  greet() {\n    return 'hi';\n  },\n});\nschema.static('byName', function (name: string) {\n  return this.findOne({ name });\n});\nschema.virtual('isAdmin').get(function () {\n  return this.role === 'admin';\n});\nschema.pre('save', function (next) {\n  /* ... */ next();\n});\nschema.post('save', function () {\n  /* ... */\n});\nschema.plugin((s) => {\n  /* mutate s */\n});\nschema.clone();\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "document",
      children: "Document"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Instances track modifications:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const doc = new User({ name: 'Grace' });\ndoc.isModified('name'); // true\ndoc.name = 'Grace Hopper';\ndoc.isModified('name'); // true\ndoc.modifiedPaths(); // ['name']\n\nawait doc.save();\ndoc.isModified('name'); // false\n\ndoc.toObject({ virtuals: true });\ndoc.toJSON();\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "Document"
      }), " exposes:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "isModified(path?)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "modifiedPaths()"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "markModified(path)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "clearModified()"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "validate()"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "save()"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "remove()"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "deleteOne()"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "toObject(opts?)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "toJSON()"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "get(path)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "set(path, value)"
        }), " (or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "set({ ...values })"
        }), ")"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["schema ", (0,jsx_runtime.jsx)(_components.code, {
          children: "methods"
        }), " bound as instance methods"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["schema ", (0,jsx_runtime.jsx)(_components.code, {
          children: "virtuals"
        }), " as getter/setter properties"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Loaded documents keep a deep snapshot of the last persisted state. Top-level assignment marks paths\nexplicitly, and supported mutable values are also detected by structural diffing when ", (0,jsx_runtime.jsx)(_components.code, {
        children: "save()"
      }), " runs:\narrays, plain objects, nested subdocuments, JSON-like mixed values, and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Date"
      }), " instances. Mutating\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "doc.tags"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "doc.profile.score"
      }), ", or a date instance on the document can therefore persist without an\nexplicit setter call."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Constructor input and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toObject()"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toJSON()"
      }), " results are cloned at the boundary. Mutating an input\nobject or a plain object returned by ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toObject()"
      }), " cannot mutate the live document or mark it dirty."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "markModified(path)"
      }), " is reconciled with the snapshot. It remains useful for supported mixed values, but\nunchanged and reverted paths are treated as clean. Saving an unchanged loaded document skips adapter\nmutation. The snapshot is refreshed only after successful persistence; failed writes keep their modified\npaths for retry."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "in-flight-saves-and-migration",
      children: "In-Flight Saves And Migration"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Each save captures owned data and per-path replacement intent ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "after validation and pre-save hooks"
      }), ",\nbefore persistence. Edits before capture join that write. Edits after capture stay on the live document\nfor the next save: scalar/live nested edits, assignments, both forms of ", (0,jsx_runtime.jsx)(_components.code, {
        children: "set()"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "markModified()"
      }), ".\nSuccess advances the snapshot to captured data and clears only the captured intent. Repeated markings\nof the same path create fresh intent even for equal values. Equal/reverted values still skip writes;\nthe newer marker controls replacement if that path changes before the next save. A no-op save consumes\nits captured clean markers. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "clearModified()"
      }), " discards current markers, not structural differences."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Live plain-object edits merge changed leaves; explicit parent assignment, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "set('parent', value)"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "set('parent.nested', value)"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "markModified('parent')"
      }), " replaces the changed subtree. Complete arrays\nare whole-array, last-writer-wins writes. Projection safety checks still apply on every save."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Await a save's settlement before starting another save on that instance. Overlaps reject with\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "ParallelSaveError"
      }), " (import from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/mongoose-rxdb"
      }), ") before collection resolution,\nvalidation, hooks, or writes. The guard lasts through success/error post hooks, so recursive saves\nfrom hooks also reject. Rejected overlaps run no hooks and leave the active save alone. The guard\nreleases on success or failure; distinct instances retain leaf-merge/last-writer-wins semantics.\nReplace same-instance ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Promise.all([doc.save(), doc.save()])"
      }), " with awaited saves."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Validation/save hooks still run once per admitted operation (automatic validation is skipped with\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "validateBeforeSave: false"
      }), "); raw final-candidate validation remains inside the adapter retry boundary.\nWrite failure retains captured and later intent for retry. Post-save hook failure after a successful\nwrite does not undo that write: the snapshot has advanced and an inserted record has ", (0,jsx_runtime.jsx)(_components.code, {
        children: "isNew === false"
      }), ".\nPost-hook edits remain pending; retry after settlement saves remaining edits without another insert.\nThe returned document is live and may already contain later unsaved edits."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "document-value-safety-and-migration",
      children: "Document Value Safety And Migration"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Construction, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "create"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "insertMany"
      }), ", direct schema-property assignment, and string/dotted/object-form\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "set()"
      }), " check structure before cloning or casting and reject invalid values with the root-exported\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "WriteNormalizationError"
      }), ". Mixed data accepts finite JSON primitives, dense arrays, plain/null-prototype\nobjects, and valid Dates. Map/Set/class instances, functions, symbols, bigint, non-finite numbers,\nnested undefined, sparse arrays, enumerable accessors/symbol keys, and dangerous keys reject rather\nthan silently losing data or prototypes."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Schema casts still follow the converter: numeric strings, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "\"false\""
      }), ", bigint-to-string/number, and\ncompatible boxed/custom scalar values work. Invalid casts reject immediately; scalar array elements\nreject objects/arrays unless their element schema supports them. Dotted setters cast the addressed\npath. Declared schema fields (also within subdocuments) can be undefined/absent; mixed JSON and array\nelements cannot. Dates stay owned Date instances in documents and normalize to ISO strings in storage.\nSnapshots/serialization also normalize live nested scalar edits against their declared schema path."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The structural limits are ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "50 levels / 2,000 visited values"
      }), ": root depth zero, aliases charged per\noccurrence, whole raw document/setter input and whole resulting document (including ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), ") bounded\nindependently. Needed default-factory results share the casting operation's budgets; overridden defaults\nare not evaluated. Insert conversion shares these whole-input-plus-default and whole-output budgets,\nincluding defaults first needed after ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toObject()"
      }), " omits explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), ", pre-save hooks, or\ndefault-enabled upserts. These limits apply per batch document, not to string bytes or arbitrary application\ncallback execution. Public ", (0,jsx_runtime.jsx)(_components.code, {
        children: "castDocumentToSchema"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "castValue"
      }), " use the same bounded checks."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Setters stage data/dirty changes and roll back on rejection, including dotted traversal and virtual\nsetter data changes; external callback side effects are outside that rollback. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "create([...])"
      }), "\nprepares every entry including late insert defaults and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "insertMany"
      }), " prepares every entry in either\nordered mode before writing, so bad ingress in any\nentry causes no writes. Later middleware/validation/storage failures remain non-transactional.\nLive nested edits remain supported, but invalid live values fail serialization, recursive dirty\ncomparison, and save before adapter mutation (also with save validation disabled). Correct/remove the\ninvalid value before retrying. Migration: previously erased object prototypes or stringified invalid\narray elements now reject early. Oversized insert-time defaults reject before writes instead of\nproducing unreadable records or a batch error after insertion. See the shipped README's\n", (0,jsx_runtime.jsx)(_components.strong, {
        children: "Document Value Safety"
      }), " contract."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "selected-documents-save-safety-and-migration",
      children: "Selected Documents: Save Safety And Migration"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Hydrated ", (0,jsx_runtime.jsx)(_components.code, {
        children: "find()"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOne()"
      }), " results retain private, immutable projection metadata. Keep ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), "\nselected (the default): a loaded document without it rejects ", (0,jsx_runtime.jsx)(_components.code, {
        children: "save()"
      }), " with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "WriteNormalizationError"
      }), "\nbefore mutation, even if unchanged. No new identity is inferred."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Selected scalar edits and in-place plain-object leaf changes merge into current storage, preserving\nhidden optional/required/immutable/defaulted fields. Saving never copies hidden stored values back\ninto the public document, serialization, or document hooks."
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Arrays are whole-array writes. Any changed partially selected array rejects with\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "WriteNormalizationError"
        }), ", including visible-element edits, pushes/removals, and numeric setters.\nThere is no inferred element identity or index merge."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Explicit top-level assignment, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "set('parent', value)"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "markModified('parent')"
        }), " opt a changed\nsubtree into replacement. Replacement, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), ", or unset of an incomplete subtree rejects; so does\nwriting an unselected field or creating an incomplete parent. Select the whole subtree before\nreplacing it. For example, select ", (0,jsx_runtime.jsx)(_components.code, {
          children: "'profile'"
        }), " for replacement; select ", (0,jsx_runtime.jsx)(_components.code, {
          children: "'profile.name'"
        }), " and use\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "doc.set('profile.name', 'Grace')"
        }), " for a leaf edit in an existing partial object.\nUse ", (0,jsx_runtime.jsx)(_components.code, {
          children: "set()"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "markModified()"
        }), " to express nested replacement intent; direct mutations inside plain\nobjects follow the leaf-diff contract."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Completeness follows the projection, conservatively: even an excluded descendant that is absent\nmakes its parent incomplete, and selecting individual children does not prove parent completeness.\nEmpty projections retain full-record behavior. Unchanged projected documents with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        }), " skip\nmutation. Safety restrictions remain active with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "validateBeforeSave: false"
        }), "."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Array representation:"
      }), " lean and hydrated projections use explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " for redacted array\npositions, preserving the source length and indexes. For example, selecting ", (0,jsx_runtime.jsx)(_components.code, {
        children: "'title members.1.name'"
      }), "\nfrom three members returns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "members: [null, { name: 'Ada' }, null]"
      }), ". Selecting ", (0,jsx_runtime.jsx)(_components.code, {
        children: "'members.name'"
      }), "\nalso uses ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " at positions without that field if any element contributes; if none contributes,\nthe array field is omitted. Multiple selected paths are combined. Excluding a whole numeric index\nuses ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " instead of removing/shifting that element. Nested arrays follow the same rule.\nThese placeholders expose no hidden values and are not defaults or evidence of stored ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), ";\nan actual selected ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " is indistinguishable without a fuller read. Check for ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " before\naccessing a projected element: result types do not narrow to reflect these slots. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toObject()"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "toJSON()"
      }), ", and JSON serialization preserve the same representation. Unchanged and selected scalar\nsaves preserve the stored arrays; placeholders are never written back as incomplete replacements.\nCaller-supplied sparse arrays and holes introduced by live mutations still reject."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["With validation enabled, partial saves run ", (0,jsx_runtime.jsx)(_components.code, {
        children: "validate"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "save"
      }), " hooks once on the redacted document,\nthen run schema validators against the full merged storage candidate inside the adapter retry boundary.\nThis supports hidden required fields and cross-field rules without synthesizing defaults or exposing\nthe candidate on the document. Unchanged partial saves do not validate a candidate. Standalone\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "validate()"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "validateSync()"
      }), " on a nonempty projection reject / return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ValidationError"
      }), " with\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "kind: 'projection'"
      }), ": reload without ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select()"
      }), " for standalone validation, or use the validated save\npath. Hooks that call standalone validation must account for that restriction."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Migration:"
      }), " older versions could silently discard hidden data through partial array/object\nreplacement. Reload the whole affected subtree for replacement; retain dotted leaf edits for partial\nobjects. Loaded-record validation and dirty diffing no longer apply absent defaults. Projected-out\nfields and defaults omitted by ", (0,jsx_runtime.jsx)(_components.code, {
        children: "setDefaultsOnInsert: false"
      }), " stay absent after subsequent saves;\nexplicit unsets do not restore defaults. Projected setters suppress recursive defaults too.\nNew-document default application is unchanged. See the shipped README's ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "Saving Selected Documents"
      }), "\nsection for the consumer contract.\nProjected arrays now use explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " slots instead of holes (and whole-index exclusions no longer\ncompact indexes), so multi-element numeric/missing-field projections can hydrate and safely save."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "query",
      children: "Query"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "Model.find()"
      }), " returns a thenable chainable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Query"
      }), ". Execution is deferred until ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".exec()"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: ".then()"
      }), " (i.e. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "await"
      }), "), ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".catch()"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".finally()"
      }), " is called."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "// chainable\nawait User.find().where('age').gt(18).limit(10).sort({ age: -1 }).exec();\n\n// mango-style filter\nawait User.find({ role: { $in: ['admin', 'user'] }, age: { $gte: 18 } });\n\n// awaitable\nconst users = await User.findOne({ name: 'Ada' });\n\n// update / delete\nawait User.updateOne({ name: 'Ada' }, { $inc: { age: 1 } });\nawait User.deleteMany({ role: 'user' });\nawait User.findOneAndUpdate({ name: 'Ada' }, { $set: { age: 37 } }, { new: true });\n\n// count\nawait User.countDocuments({ age: { $gte: 18 } });\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Supported query operators: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$eq"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$gt"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$gte"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$lt"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$lte"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$ne"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$in"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$nin"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$exists"
      }), ",\nand top-level ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$and"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$or"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$nor"
      }), ". Request ", (0,jsx_runtime.jsx)(_components.code, {
        children: "RegExp"
      }), " values and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$regex"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$options"
      }), " reject with\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "QueryFilterError"
      }), " before persistence."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Supported update operators: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$set"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$unset"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$inc"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$mul"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$min"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$max"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$push"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$pull"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "$addToSet"
      }), ", plus a plain ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ field: value }"
      }), " alias for ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$set"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "conditional-mutation-selectors-compatibility--migration",
      children: "Conditional Mutation Selectors (Compatibility / Migration)"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Mutation rechecks use RxDB's own query matcher on the current record inside every native update retry.\nFor the supported compiled selectors, reads and rechecks share these semantics:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Scalar ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$eq"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$in"
        }), " match array elements; ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$nin"
        }), " rejects an array containing a forbidden member.\nArray-valued ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$eq"
        }), " uses native array equality."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Equality / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$in"
        }), " with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), " include missing fields. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$ne: null"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$nin: [null]"
        }), " exclude null and\nmissing fields; ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$exists"
        }), " distinguishes them."]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Dotted selectors traverse objects and arrays; numeric segments address array indexes."
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Date-looking strings retain native string comparison, without implicit date parsing. Actual ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Date"
        }), "\noperands normalize to stored ISO strings before selection and rechecking."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For updates without ", (0,jsx_runtime.jsx)(_components.code, {
        children: "upsert"
      }), ", a record that loses its predicate reports zero matched/modified counts,\nor ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOneAndUpdate"
      }), ". The adapter does not select another record. Successful counts and\npreimages reflect the successful retry's current state. Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " plus expected state for claims and\ntreat no-match as a lost claim; multi-record operations are per-record and non-transactional."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Deletes use the same matching semantics but remain ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "best-effort conditional"
      }), ": a concurrent writer\ncan change a record after the final check and before native removal. Unsupported filters still reject\nat compilation. Direct adapter callers must pass compiled queries, using ", (0,jsx_runtime.jsx)(_components.code, {
        children: "compileQuery"
      }), ".\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOneAndDelete"
      }), " returns an observed preimage, not an atomic delete-time snapshot. For state-sensitive\nworkflows, prefer a conditional update to a terminal/soft-deleted state with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "upsert: false"
      }), ", then physical\ncleanup under application coordination. A prior read or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " alone cannot lock a delete."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Migration:"
      }), " the former handwritten recheck could disagree with native reads for arrays,\nnull/missing, dotted paths, and date-looking strings. Updates now follow native matching, so a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$nin"
      }), "\nclaim loses when a concurrent writer adds a forbidden member. See the shipped README's\n", (0,jsx_runtime.jsx)(_components.strong, {
        children: "Conditional Mutation Selectors"
      }), " section for the consumer contract."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "write-normalization",
      children: "Write Normalization"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["All current write routes (", (0,jsx_runtime.jsx)(_components.code, {
        children: "create"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "insertMany"
      }), ", document ", (0,jsx_runtime.jsx)(_components.code, {
        children: "save"
      }), ", update operators,\nreplacement-style updates, and supported ", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateOne(..., { upsert: true })"
      }), " /\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOneAndUpdate(..., { upsert: true })"
      }), ") use the same schema-aware normalization pipeline before\npersistence. Values are cast by their declared schema path, and validation sees the normalized value\nthat will be written."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The persistence adapter boundary exposes only domain fields plus the logical ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " primary key. RxDB\nrevision metadata (", (0,jsx_runtime.jsx)(_components.code, {
        children: "_rev"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_meta"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_attachments"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_deleted"
      }), ") is stripped before records reach public\ndocuments, lean results, update callbacks, or the fake test adapter."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "Model.create()"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Model.insertMany()"
      }), " share one insertion pipeline. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "create()"
      }), " keeps per-document\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "save"
      }), " middleware and inserts one document at a time. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "insertMany()"
      }), " runs ", (0,jsx_runtime.jsx)(_components.code, {
        children: "insertMany"
      }), " middleware and\nuses the adapter bulk-insert path. It is ordered by default: records before the first storage failure\nremain inserted and a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "BulkWritePartialFailureError"
      }), " reports ", (0,jsx_runtime.jsx)(_components.code, {
        children: "insertedCount"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "insertedIds"
      }), ", inserted\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "records"
      }), ", and record-level ", (0,jsx_runtime.jsx)(_components.code, {
        children: "errors"
      }), ". Pass ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ ordered: false }"
      }), " to attempt every input record and receive\nthe same partial-failure shape for all failed indexes."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Unordered duplicate IDs preserve first-occurrence priority and original input-index errors. Every\noccurrence is attempted; later duplicates normally receive native primary-key conflicts. Native bulk\npasses each contain unique IDs, so pass count is the maximum ID frequency. Partitioning now uses\nlinear dictionary work; duplicate-heavy batches still need those passes, with no throughput guarantee."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Dates are stored as ISO-8601 strings (", (0,jsx_runtime.jsx)(_components.code, {
        children: "Date#toISOString()"
      }), ") in memory and SQLite-backed storage, then\nhydrated back to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Date"
      }), " instances when documents are read. Dotted update paths such as\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "profile.score"
      }), " update nested objects structurally; literal top-level dotted keys are not written.\nDangerous path segments (", (0,jsx_runtime.jsx)(_components.code, {
        children: "__proto__"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "prototype"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "constructor"
      }), "), unknown update operators,\nincompatible arithmetic or array operators, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), ", immutable paths, and RxDB metadata (", (0,jsx_runtime.jsx)(_components.code, {
        children: "_rev"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_meta"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "_attachments"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_deleted"
      }), ") are rejected before mutation."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Mutation options are intentionally narrower than full Mongoose and unsupported options throw\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "MutationOptionError"
      }), " instead of being ignored:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "updateOne"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sort"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "upsert"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "runValidators"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "setDefaultsOnInsert"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "updateMany"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sort"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "runValidators"
        }), "; multi-upsert is not supported."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "deleteOne"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sort"
        }), " only. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "deleteMany"
        }), " accepts no options."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "findOneAndUpdate"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sort"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "upsert"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "new"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "returnDocument"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "runValidators"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "setDefaultsOnInsert"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "lean"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "findOneAndDelete"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sort"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "lean"
        }), "."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "runValidators: true"
      }), " validates the final normalized storage value before persistence for existing\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateOne"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateMany"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOneAndUpdate"
      }), " matches. With validation disabled, compatible casted\nupdates can persist values that violate schema validators. Upsert inserts are always validated because\nthey create a new record."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOneAndUpdate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "returnDocument"
      }), " takes precedence over ", (0,jsx_runtime.jsx)(_components.code, {
        children: "new"
      }), " when both are present:\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "returnDocument: 'before'"
      }), " returns the previous document, while ", (0,jsx_runtime.jsx)(_components.code, {
        children: "returnDocument: 'after'"
      }), " and\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "new: true"
      }), " return the updated or inserted document. The default is the before document; an upsert that\nreturns before yields ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Upsert inserts are built from eligible top-level equality filter fields (", (0,jsx_runtime.jsx)(_components.code, {
        children: "field: value"
      }), " and\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "field: { $eq: value }"
      }), ") plus the normalized update. Operator predicates such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$gt"
      }), " are not copied\ninto the inserted record. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " is generated when the equality filter does not provide one.\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "setDefaultsOnInsert"
      }), " applies schema defaults only when it is exactly ", (0,jsx_runtime.jsx)(_components.code, {
        children: "true"
      }), ", and it is rejected unless\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "upsert: true"
      }), " is also set."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "upsert-concurrency-and-business-identity",
      children: "Upsert Concurrency And Business Identity"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "updateOne"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOneAndUpdate"
      }), " with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "upsert: true"
      }), " perform ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "update, then separately insert on no\nwrite-time match"
      }), ". This includes a selected candidate losing its predicate during a native conflict\nretry. There is no transaction, atomic secondary uniqueness, alternate-record selection,\nread-before-insert uniqueness check, or automatic retry-as-update after insert conflict."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Deterministic native-memory and persistent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "trial-native"
      }), " SQLite tests show:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Interleaving"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Outcome"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Both calls observe no match; generated IDs"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Both can insert distinct IDs with the same business key."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsxs)(_components.td, {
            children: ["Both calls observe no match; same explicit ", (0,jsx_runtime.jsx)(_components.code, {
              children: "_id"
            }), " equality"]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "One inserts; the other rejects with a native conflict, without applying its update."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Selected record loses predicate during retry; generated ID"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Competing change survives; a new record is inserted even if another record remains eligible."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsxs)(_components.td, {
            children: ["Selected record loses predicate during retry; same explicit ", (0,jsx_runtime.jsx)(_components.code, {
              children: "_id"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Insertion at the occupied ID rejects; competing change survives and no alternative is updated."
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The winning caller is unspecified. Observed RxDB 17 insert conflicts have ", (0,jsx_runtime.jsx)(_components.code, {
        children: "code: 'CONFLICT'"
      }), " and\npropagate as native errors, not a package-owned duplicate-key error. Validation/backend errors can\nalso reject. This evidence does not establish Premium or replication behavior."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["On insertion, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateOne"
      }), " returns zero matched/modified counts plus ", (0,jsx_runtime.jsx)(_components.code, {
        children: "upsertedCount: 1"
      }), " and\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "upsertedId"
      }), ". ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOneAndUpdate"
      }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "'before'"
      }), ", returning ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "null even after insertion"
      }), ";\nuse ", (0,jsx_runtime.jsx)(_components.code, {
        children: "returnDocument: 'after'"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "new: true"
      }), " for the inserted record (lean if requested).\nInsertion starts from equality fields plus the update, not the lost candidate. The inserted data\nneed not satisfy the original filter: range/membership predicates do not supply initial values,\nand the update can change an equality field. Insert validation/default rules still apply."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Use one stable canonical ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        }), " per business entity, including tenant/key scope, across all writers.\nSupply it as a direct equality filter (", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ _id: entityId }"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ _id: { $eq: entityId } }"
        }), ");\nequalities inside ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$and"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "$or"
        }), " are not extracted for inserts. This relies on native primary-key\nconflicts, not an atomic uniqueness constraint on another field."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Stable IDs do not make conditional upserts transactional. An existing ID with a mismatching state\ncan cause conflict even in sequential calls. Reload after conflict and evaluate the business state;\nblindly retrying non-idempotent updates such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$inc"
        }), " can apply an operation again."]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Serialize creation/read-decision-write workflows by business key across every participating writer\nwhen one local creator is needed. In-process queues do not cover other processes/tabs/devices or\nreplication. Cross-boundary coordination needs an authoritative backend providing the required\natomic constraints/transactions. A separate existence read is insufficient. Use an identity-only\ncreation filter; changing a state predicate can cause repeated inserts even with serialization."
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["For claims, use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        }), " plus expected state with ", (0,jsx_runtime.jsx)(_components.strong, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "upsert: false"
          })
        }), " (the default); treat zero matches\nor null as a lost claim. Keep creation separate from conditional state transitions:"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const claim = await Jobs.updateOne({ _id: jobId, state: 'ready' }, { $set: { state: 'claimed' } }, { upsert: false });\nif (claim.matchedCount === 0) {\n  // Missing or no longer eligible; do not create a replacement job here.\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Compatibility / migration:"
      }), " these are existing upsert semantics, not new atomic guarantees.\nReplace atomic find-or-create or claim-with-upsert assumptions with explicit identity/coordination.\nSee the shipped README's ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "Upsert Concurrency And Business Identity"
      }), " for installed-consumer guidance."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "read-query-semantics",
      children: "Read Query Semantics"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Read query semantics are intentionally defined for the supported subset:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "limit()"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "skip()"
        }), " must be non-negative safe integers."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Results are sorted first, then ", (0,jsx_runtime.jsx)(_components.code, {
          children: "skip()"
        }), " is applied before ", (0,jsx_runtime.jsx)(_components.code, {
          children: "limit()"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "findOne()"
        }), " follows the same ordering and skip policy, then returns at most one document after the skipped window."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "select()"
        }), " supports inclusion, exclusion, string projections, and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        }), " overrides. Mixed inclusion/exclusion projections are rejected except for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        }), "."]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Projection is applied before hydration; defaults do not recreate projected-out fields."
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "lean()"
        }), " returns normalized plain records directly and does not construct ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Document"
        }), " instances or run ", (0,jsx_runtime.jsx)(_components.code, {
          children: "init"
        }), " hooks. Lean applies only to document-producing reads; ", (0,jsx_runtime.jsx)(_components.code, {
          children: "update"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "delete"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "count"
        }), " results keep their count shapes, and passing ", (0,jsx_runtime.jsx)(_components.code, {
          children: "lean"
        }), " to those operations rejects with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "MutationOptionError"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "countDocuments()"
        }), " uses the adapter count path, ignores ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sort()"
        }), ", and honors ", (0,jsx_runtime.jsx)(_components.code, {
          children: "skip()"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "limit()"
        }), " by counting the paginated match window."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Query instances are single-use like Mongoose queries. The first execution through ", (0,jsx_runtime.jsx)(_components.code, {
        children: "exec()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "await"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: ".then()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".catch()"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".finally()"
      }), " owns the query; a second execution attempt rejects with the\npackage-owned ", (0,jsx_runtime.jsx)(_components.code, {
        children: "MongooseError"
      }), " (", (0,jsx_runtime.jsx)(_components.code, {
        children: "QueryExecutionError"
      }), "). Clone before executing when you need another\nvariant. Filters, options, and updates are deep-copied at construction and clone time, and execution uses\na snapshot taken before query middleware runs."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "middleware",
      children: "Middleware"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["A kareem-like engine runs async ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pre"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "post"
      }), " hooks. Hooks may be callback-style\n(", (0,jsx_runtime.jsx)(_components.code, {
        children: "function (next) { ...; next(); }"
      }), ") or promise-style (", (0,jsx_runtime.jsx)(_components.code, {
        children: "async function () { ... }"
      }), ")."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "schema.pre('save', function (next) {\n  if (this.name === 'banned') return next(new Error('not allowed'));\n  next();\n});\n\nschema.post('save', function () {\n  metrics.increment('user.save');\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Hooked operations: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "save"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "remove"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "validate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateOne"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateMany"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "deleteOne"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "deleteMany"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOne"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "find"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOneAndUpdate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOneAndDelete"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "insertMany"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "init"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Retained middleware behavior is intentionally narrower than full Mongoose:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Document hooks (", (0,jsx_runtime.jsx)(_components.code, {
          children: "validate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "save"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "remove"
        }), ", document ", (0,jsx_runtime.jsx)(_components.code, {
          children: "deleteOne"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "init"
        }), ") run with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "this"
        }), " set to the document."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Query hooks run with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "this"
        }), " set to the ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Query"
        }), " instance; inspect state with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "getFilter()"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "getOptions()"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "getUpdate()"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "insertMany"
        }), " hooks run with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "this"
        }), " set to the model. Promise-style ", (0,jsx_runtime.jsx)(_components.code, {
          children: "pre('insertMany', function (docs) {})"
        }), " receives the input docs; callback-style receives ", (0,jsx_runtime.jsx)(_components.code, {
          children: "(next, docs)"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Post success hooks receive ", (0,jsx_runtime.jsx)(_components.code, {
          children: "(result)"
        }), " or callback-style ", (0,jsx_runtime.jsx)(_components.code, {
          children: "(result, next)"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Error post hooks must be registered with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ errorHandler: true }"
        }), " and receive ", (0,jsx_runtime.jsx)(_components.code, {
          children: "(err)"
        }), " or callback-style ", (0,jsx_runtime.jsx)(_components.code, {
          children: "(err, next)"
        }), "."]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Callback-style middleware that also returns a promise settles once; whichever callback or promise settles first wins."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "The TypeScript hook-name surface is limited to the listed operations; unsupported Mongoose hook names are not claimed."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Validation recurses through nested ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Schema"
      }), " paths and arrays of subdocuments. Failures are aggregated\ninto one ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ValidationError"
      }), " whose ", (0,jsx_runtime.jsx)(_components.code, {
        children: "errors"
      }), " map is keyed by full logical paths such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "profile.name"
      }), " or\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "members.0.role"
      }), ". Conditional ", (0,jsx_runtime.jsx)(_components.code, {
        children: "required"
      }), " functions and custom validators run with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "this"
      }), " bound to the\nowning document for root paths, or to the plain subdocument object for nested schema paths and\nsubdocument-array items. Full-document ", (0,jsx_runtime.jsx)(_components.code, {
        children: "save()"
      }), " runs ", (0,jsx_runtime.jsx)(_components.code, {
        children: "validate()"
      }), " by default; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ validateBeforeSave: false }"
      }), " skips\nautomatic save validation while leaving explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "doc.validate()"
      }), " available. Partial documents follow\nthe candidate-validation and standalone-validation restrictions in ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "Selected Documents"
      }), " above."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "validateSync()"
      }), " performs schema validation synchronously without middleware. Async custom validators\nproduce a sync ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ValidationError"
      }), " for that path; call ", (0,jsx_runtime.jsx)(_components.code, {
        children: "validate()"
      }), " to run async validators and validation\nmiddleware."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "connection--storage",
      children: "Connection & Storage"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "Connection"
      }), " wraps an RxDB database. Pass any async factory that returns a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Promise<RxDatabase>"
      }), ".\nConnection strings are not supported and are rejected before storage creation; a URL is never treated\nas an in-memory request."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createMemoryDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';\n\nconst conn = new Connection();\nawait conn.connect(() => createMemoryDatabase({ name: 'myapp' }));\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Storage subpath helpers:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "createMemoryDatabase({ name? })"
        }), " — fast in-process storage, default for tests"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "createSqliteDatabase({ name?, filePath?, allowMemoryFallback? })"
        }), " — local SQLite resolved automatically", "\n", (0,jsx_runtime.jsxs)(_components.ol, {
          children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "rxdb-premium"
            }), " (production-grade; needs a license token at install)"]
          }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
            children: ["RxDB free trial ", (0,jsx_runtime.jsx)(_components.code, {
              children: "getRxStorageSQLiteTrial"
            }), " driven by Node 22+'s built-in ", (0,jsx_runtime.jsx)(_components.code, {
              children: "node:sqlite"
            }), " (persists to files derived from ", (0,jsx_runtime.jsx)(_components.code, {
              children: "filePath"
            }), ", but capped at ~500 docs/collection, no indexes, prints a warning each load)"]
          }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
            children: ["Same trial with npm ", (0,jsx_runtime.jsx)(_components.code, {
              children: "sqlite3"
            }), " in Node, if installed"]
          }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
            children: ["In-memory ", (0,jsx_runtime.jsx)(_components.code, {
              children: "getRxStorageMemory"
            }), " only when ", (0,jsx_runtime.jsx)(_components.code, {
              children: "allowMemoryFallback: true"
            }), " is passed"]
          }), "\n"]
        }), "\n"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Persistent requests fail closed by default. If no SQLite backend can be opened,\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "createSqliteDatabase({ filePath })"
      }), " rejects with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "SqliteStorageError"
      }), " and does not create a memory\ndatabase. Inspect ", (0,jsx_runtime.jsx)(_components.code, {
        children: "error.causes"
      }), " for backend-specific load/open failures, or inspect\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "db.sqliteStorageInfo"
      }), " after a successful connection for the selected backend and path semantics.\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "filePath"
      }), " is exact for Premium and a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "databaseNamePrefix"
      }), " for RxDB trial backends\n(which append a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_trial_<databaseName>"
      }), " suffix). It defaults to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "':memory:'"
      }), ", which is\nvolatile-only: genuine in-memory storage with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "allowMemoryFallback: true"
      }), ", rejected otherwise."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "A shared default connection is also available for simple apps:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { connect, model, Schema, disconnect } from '@web-ts-toolkit/mongoose-rxdb';\nimport { createSqliteDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';\n\nawait connect(() => createSqliteDatabase({ filePath: './app.db' }));\nconst User = model('User', new Schema({ name: String }));\nawait disconnect();\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Connection state is explicit: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "disconnected"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "connecting"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "connected"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "closing"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "failed"
      }), ".\nConcurrent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "connect()"
      }), " calls share one in-flight connection attempt, concurrent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "disconnect()"
      }), " calls\nshare one close operation, and calling ", (0,jsx_runtime.jsx)(_components.code, {
        children: "connect()"
      }), " while already connected rejects. To switch storage,\ncall ", (0,jsx_runtime.jsx)(_components.code, {
        children: "disconnect()"
      }), ", then compile fresh models on the reconnected ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Connection"
      }), "; model objects from the\nprevious connection are invalidated and must not be reused."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Collections are registered by normalized lower-case collection name. Equivalent schemas targeting the\nsame normalized collection share one collection initialization and adapter. Incompatible schemas for\nthe same normalized name, including case-only collection-name collisions, throw before storage is\ntouched. If collection initialization fails, the failed model is removed from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "connection.modelNames()"
      }), "\nand can be retried with the same model name after fixing the cause."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h2, {
      id: "security-sanitizefilter",
      children: ["Security: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sanitizeFilter"
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Filters built from user input can leak Mango operators (", (0,jsx_runtime.jsx)(_components.code, {
        children: "$where"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$func"
      }), ", ...). Call\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "sanitizeFilter"
      }), " at the request boundary before passing untrusted filters to model methods. It is\ncaller-invoked, not automatic request parsing. Query execution also validates filters and rejects\nunsupported operators if a caller bypasses sanitization."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { QueryFilterError, sanitizeFilter } from '@web-ts-toolkit/mongoose-rxdb';\n\ntry {\n  const safe = sanitizeFilter(req.body.filter);\n  await User.deleteMany(safe);\n} catch (error) {\n  if (error instanceof QueryFilterError) {\n    // The rejected filter was not executed, so unrelated documents were not touched.\n  }\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Only object filters using the logical operators ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$and"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$or"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$nor"
      }), " (recursed into) and the Mango per-field operators\n(", (0,jsx_runtime.jsx)(_components.code, {
        children: "$eq"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$gt"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$gte"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$lt"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$lte"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$ne"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$in"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$nin"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$exists"
      }), ") pass\nthrough. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " and other non-object filters, invalid top-level operators, unsupported field operators, malformed logical arrays,\ndangerous keys (", (0,jsx_runtime.jsx)(_components.code, {
        children: "__proto__"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "prototype"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "constructor"
      }), "), excessive nesting, and excessive logical\narray width throw ", (0,jsx_runtime.jsx)(_components.code, {
        children: "QueryFilterError"
      }), "; rejected filters are never broadened to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Request-derived regex is rejected: every ", (0,jsx_runtime.jsx)(_components.code, {
        children: "RegExp"
      }), " value and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$regex"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$options"
      }), " operator throws\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "QueryFilterError"
      }), " before native execution, regardless of pattern size or simplicity. The builder's\n", (0,jsx_runtime.jsx)(_components.code, {
        children: ".regex()"
      }), " records intent but fails at execution. This replaces the former bounded heuristic;\ntrusted schema ", (0,jsx_runtime.jsx)(_components.code, {
        children: "match"
      }), " and custom validators keep working."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "_id",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Each document auto-generates a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " — a UUIDv4 when ", (0,jsx_runtime.jsx)(_components.code, {
        children: "globalThis.crypto.randomUUID"
      }), " is available,\notherwise a short random+timestamp string. You may pass an explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " in the constructor data\nor ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Model.create(data)"
      }), ". After construction ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " is read-only (no setter): RxDB primary keys\ncannot be changed after insert, so the field is immutable."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "connection-model-registration",
      children: "Connection model registration"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "Connection#model(name, schema, collection?, options?)"
      }), " compiles a schema into a Model. Calling it\ntwice with the same ", (0,jsx_runtime.jsx)(_components.code, {
        children: "name"
      }), " and a new schema throws (matching Mongoose's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OverwriteModelError"
      }), ")\nunless you pass ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ overwrite: true }"
      }), ". To register a different shape, call\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "connection.deleteModel(name)"
      }), " first, or use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ overwrite: true }"
      }), ". This only replaces the model\nregistration. The underlying RxDB collection schema is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "not"
      }), " migrated by delete/overwrite, so use a\ndistinct collection name or perform an explicit migration outside this package before changing\npersisted collection shape."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "how-it-maps-to-rxdb",
      children: "How It Maps to RxDB"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Mongoose concept"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Implementation in this package"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Schema definition"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "Schema"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "convertToRxJsonSchema"
            }), " (Draft-07 ", (0,jsx_runtime.jsx)(_components.code, {
              children: "RxJsonSchema"
            }), ")"]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Casting & validation"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "castDocumentToSchema"
            }), " + ", (0,jsx_runtime.jsx)(_components.code, {
              children: "Document.validate()"
            }), " (schema-level rules)"]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsxs)(_components.td, {
            children: ["Middleware (", (0,jsx_runtime.jsx)(_components.code, {
              children: "pre"
            }), "/", (0,jsx_runtime.jsx)(_components.code, {
              children: "post"
            }), ")"]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "MiddlewareEngine"
            }), ", mapped onto Model/Query/Document ops"]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Document methods"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "Schema.methods"
            }), ", attached to hydrated ", (0,jsx_runtime.jsx)(_components.code, {
              children: "Document"
            }), " instances"]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Statics"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "Schema.statics"
            }), ", attached to the compiled ", (0,jsx_runtime.jsx)(_components.code, {
              children: "Model"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Virtuals"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "Schema.virtual(...)"
            }), " getters/setters on ", (0,jsx_runtime.jsx)(_components.code, {
              children: "Document"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Query builder"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "Query"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "compileQuery"
            }), " → RxDB Mango query via ", (0,jsx_runtime.jsx)(_components.code, {
              children: "RxCollectionAdapter"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Dirty tracking"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Leaf set/unset diffs, explicit subtree/whole-array replacements, projection safety on ", (0,jsx_runtime.jsx)(_components.code, {
              children: "save"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Storage"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "Connection"
            }), " + ", (0,jsx_runtime.jsx)(_components.code, {
              children: "createSqliteDatabase"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "createMemoryDatabase"
            })]
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "current-scope",
      children: "Current Scope"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This package is a core MVP proxy. Out of scope for now:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "populate"
        }), " (virtual and path population)"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "aggregate"
        }), " / pipeline cursors"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["index declaration sync (", (0,jsx_runtime.jsx)(_components.code, {
          children: "syncIndexes"
        }), ")"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "sessions / transactions"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "discriminators"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "bulkWrite"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "bulkSave"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["streaming ", (0,jsx_runtime.jsx)(_components.code, {
          children: "QueryCursor"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "These can be layered on as the design doc's four pillars (schema, document, middleware, query) are\nextended. The internal split is intentionally modular so each missing piece slots in without\nreworking the others."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "when-to-use-it",
      children: "When To Use It"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/mongoose-rxdb"
      }), " when you want:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Mongoose-shaped code (schemas, models, queries, hooks) but persisted locally"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "offline-first storage backed by SQLite via RxDB"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "a storage-agnostic API that reads like Mongoose and swaps backends via a factory"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you need full Mongoose parity (", (0,jsx_runtime.jsx)(_components.code, {
        children: "populate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "aggregate"
      }), ", MongoDB driver), use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mongoose"
      }), "\ndirectly against MongoDB; this package targets the local/offline subset."]
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

/***/ 4340
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  A: () => (/* binding */ TabItem)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/index.js
var react = __webpack_require__(1763);
// EXTERNAL MODULE: ./node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
var clsx = __webpack_require__(3526);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._fff214706bdcd4b0d830559fcbe68fdf/node_modules/@docusaurus/theme-common/lib/utils/tabsUtils.js
var tabsUtils = __webpack_require__(7002);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/styles.module.css
// extracted by mini-css-extract-plugin
/* harmony default export */ const styles_module = ({"tabItem":"tabItem_V2tX"});
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js
/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */function TabItemPanel({children,className,hidden}){return/*#__PURE__*/(0,jsx_runtime.jsx)("div",{role:"tabpanel",className:(0,clsx/* default */.A)(styles_module.tabItem,className),hidden,children:children});}function TabItem({children,className,value}){const{selectedValue,lazy}=(0,tabsUtils/* useTabs */.uc)();const isSelected=value===selectedValue;// TODO Docusaurus v4: use <Activity> ?
if(!isSelected&&lazy){return null;}return/*#__PURE__*/(0,jsx_runtime.jsx)(TabItemPanel,{className:className,hidden:!isSelected,children:children});}

/***/ },

/***/ 362
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  A: () => (/* binding */ Tabs)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/index.js
var react = __webpack_require__(1763);
// EXTERNAL MODULE: ./node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
var clsx = __webpack_require__(3526);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._fff214706bdcd4b0d830559fcbe68fdf/node_modules/@docusaurus/theme-common/lib/utils/ThemeClassNames.js
var ThemeClassNames = __webpack_require__(6638);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._fff214706bdcd4b0d830559fcbe68fdf/node_modules/@docusaurus/theme-common/lib/utils/tabsUtils.js
var tabsUtils = __webpack_require__(7002);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._fff214706bdcd4b0d830559fcbe68fdf/node_modules/@docusaurus/theme-common/lib/utils/scrollUtils.js
var scrollUtils = __webpack_require__(381);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+core@3.10.2_@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8__clean-cs_84cbf6b1589841776422739c13a66bb6/node_modules/@docusaurus/core/lib/client/exports/useIsBrowser.js
var useIsBrowser = __webpack_require__(3995);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/styles.module.css
// extracted by mini-css-extract-plugin
/* harmony default export */ const styles_module = ({"tabList":"tabList_HP23","tabItem":"tabItem__W4u"});
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js
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

/***/ 7002
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   OC: () => (/* binding */ useTabsContextValue),
/* harmony export */   O_: () => (/* binding */ TabsProvider),
/* harmony export */   uc: () => (/* binding */ useTabs),
/* harmony export */   vT: () => (/* binding */ sanitizeTabsChildren)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1763);
/* harmony import */ var _docusaurus_router__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(6532);
/* harmony import */ var _docusaurus_useIsomorphicLayoutEffect__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(8409);
/* harmony import */ var _docusaurus_theme_common_internal__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(7606);
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(5488);
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(9591);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(1987);
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

/***/ 7008
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   R: () => (/* binding */ useMDXComponents),
/* harmony export */   x: () => (/* binding */ MDXProvider)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1763);
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