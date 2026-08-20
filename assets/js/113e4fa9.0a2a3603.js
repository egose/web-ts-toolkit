"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[761],{

/***/ 5628
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
const site_docs_packages_mongoose_rxdb_md_113_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/mongoose-rxdb","title":"@web-ts-toolkit/mongoose-rxdb","description":"A Mongoose-shaped API (Schema, Document, Query, Model, Connection, pre/post middleware)","source":"@site/docs/packages/mongoose-rxdb.md","sourceDirName":"packages","slug":"/packages/mongoose-rxdb","permalink":"/docs/packages/mongoose-rxdb","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":10,"frontMatter":{"sidebar_label":"Mongoose-RxDB","sidebar_position":10},"sidebar":"packagesSidebar","previous":{"title":"Create Access Router Starter","permalink":"/docs/packages/create-access-router-mongo-starter"},"next":{"title":"PDF Reader","permalink":"/docs/packages/pdf-reader"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(5250);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(6574);
;// ./docs/packages/mongoose-rxdb.md


const frontMatter = {
	sidebar_label: 'Mongoose-RxDB',
	sidebar_position: 10
};
const contentTitle = '@web-ts-toolkit/mongoose-rxdb';

const assets = {

};





const toc = [{
  "value": "Installation",
  "id": "installation",
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
  "value": "Schema",
  "id": "schema",
  "level": 2
}, {
  "value": "Document",
  "id": "document",
  "level": 2
}, {
  "value": "Query",
  "id": "query",
  "level": 2
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
      children: ["No ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sqlite3"
      }), " install is required on Node 22+: the built-in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "node:sqlite"
      }), " module is\nauto-detected and used by the free ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "trial"
      }), " SQLite storage (it writes a real file but\nis capped at ~500 docs/collection, has no indexes, and prints a warning each load).\nFor older Node / non-Node runtimes, install npm ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sqlite3"
      }), " and it will be picked up\ninstead. For real production SQLite, install ", (0,jsx_runtime.jsx)(_components.code, {
        children: "rxdb-premium"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Peer dependencies:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "rxdb >= 16"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "rxjs >= 7"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "rxdb-premium"
        }), " (optional — only for the production-grade SQLite storage)"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "sqlite3"
        }), " (optional — only for the trial SQLite path on runtimes without ", (0,jsx_runtime.jsx)(_components.code, {
          children: "node:sqlite"
        }), ")"]
      }), "\n"]
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
          }), " — local SQLite. Resolution order is automatic:"]
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
            }), " — writes a real file at ", (0,jsx_runtime.jsx)(_components.code, {
              children: "opts.filePath"
            }), ", prints a warning each load, capped at ~500 docs/collection, no indexes."]
          }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
            children: ["Same trial with npm ", (0,jsx_runtime.jsx)(_components.code, {
              children: "sqlite3"
            }), " (older Node / non-Node runtimes), if installed."]
          }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
            children: ["In-memory ", (0,jsx_runtime.jsx)(_components.code, {
              children: "getRxStorageMemory"
            }), " as a last resort (logged to stderr) so consumer code never crashes when no SQLite backend is available."]
          }), "\n"]
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
        children: "import { Schema, Connection } from '@web-ts-toolkit/mongoose-rxdb';\nimport { createSqliteDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';\n\nconst conn = new Connection();\nawait conn.connect(() => createSqliteDatabase({ filePath: './app.db' }));\n\nconst userSchema = new Schema(\n  {\n    name: { type: String, required: true },\n    age: { type: Number, default: 0, min: 0, max: 150 },\n    role: { type: String, enum: ['admin', 'user'], default: 'user' },\n    tags: [String],\n  },\n  { timestamps: true },\n);\n\nuserSchema.pre('save', function (next) {\n  console.log('about to save', this.name);\n  next();\n});\n\nuserSchema.virtual('isAdmin').get(function () {\n  return this.role === 'admin';\n});\n\nconst User = conn.model('User', userSchema);\n\nconst ada = await User.create({ name: 'Ada', age: 36, role: 'admin' });\nconsole.log(ada.isAdmin); // true\n\nconst admins = await User.find().where('role').equals('admin').sort({ age: 1 }).exec();\nawait User.updateOne({ name: 'Ada' }, { $inc: { age: 1 } });\nawait User.deleteOne({ name: 'Ada' });\n\nawait conn.disconnect();\n"
      })
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
        }), ", or a function"]
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
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "get"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "set"
        }), " — field-level getters/setters"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "immutable"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "index"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "unique"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "alias"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ref"
        })]
      }), "\n"]
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
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$regex"
      }), "\n(+", (0,jsx_runtime.jsx)(_components.code, {
        children: "$options"
      }), "), and top-level ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$and"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$or"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$nor"
      }), "."]
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
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "QueryOptions"
      }), ": ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sort"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "limit"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "skip"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "projection"
      }), " (object or space-separated string), ", (0,jsx_runtime.jsx)(_components.code, {
        children: "lean"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "upsert"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "new"
      }), " (a.k.a. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "returnDocument: 'after'"
      }), "), ", (0,jsx_runtime.jsx)(_components.code, {
        children: "runValidators"
      }), "."]
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
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "connection--storage",
      children: "Connection & Storage"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "Connection"
      }), " wraps an RxDB database. Pass any async factory that returns a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Promise<RxDatabase>"
      }), ":"]
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
          children: "createSqliteDatabase({ name?, filePath? })"
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
            }), " (writes a real file at ", (0,jsx_runtime.jsx)(_components.code, {
              children: "filePath"
            }), ", but capped at ~500 docs/collection, no indexes, prints a warning each load)"]
          }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
            children: ["Same trial with npm ", (0,jsx_runtime.jsx)(_components.code, {
              children: "sqlite3"
            }), " (older Node / non-Node runtimes), if installed"]
          }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
            children: ["In-memory ", (0,jsx_runtime.jsx)(_components.code, {
              children: "getRxStorageMemory"
            }), " as a last resort (logged to stderr) so the call never throws in environments without any SQLite backend"]
          }), "\n"]
        }), "\n"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "A shared default connection is also available for simple apps:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { connect, model, Schema, disconnect } from '@web-ts-toolkit/mongoose-rxdb';\nimport { createSqliteDatabase } from '@web-ts-toolkit/mongoose-rxdb/storage';\n\nawait connect(() => createSqliteDatabase({ filePath: './app.db' }));\nconst User = model('User', new Schema({ name: String }));\nawait disconnect();\n"
      })
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
      }), ", ...). Use\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "sanitizeFilter"
      }), " to wrap nested operator objects in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ $eq: <value> }"
      }), " before passing them to a\nquery:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { sanitizeFilter } from '@web-ts-toolkit/mongoose-rxdb';\n\nconst safe = sanitizeFilter(req.body.filter);\nawait User.find(safe);\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Only the logical operators ", (0,jsx_runtime.jsx)(_components.code, {
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
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$regex"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$options"
      }), ") pass\nthrough unchanged. Any other ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$"
      }), "-prefixed key is treated as an injection attempt and the whole\nnested object is wrapped as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ $eq: <value> }"
      }), ", so it is matched literally rather than evaluated."]
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
      }), " — note that the underlying RxDB\ncollection's schema is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "not"
      }), " migrated by an overwrite, so prefer distinct collection names when\nthe shape changes."]
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
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "Document.isModified"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "modifiedPaths"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "$set"
            }), "-only diffs on ", (0,jsx_runtime.jsx)(_components.code, {
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

/***/ 6574
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  A: () => (/* binding */ TabItem)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/index.js
var react = __webpack_require__(489);
// EXTERNAL MODULE: ./node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
var clsx = __webpack_require__(3526);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.1_@docusaurus+plugin-content-docs@3.10.1_@mdx-js+react@3._5c760eb0e2d5ff300251aa280f7f631a/node_modules/@docusaurus/theme-common/lib/utils/tabsUtils.js
var tabsUtils = __webpack_require__(2329);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/styles.module.css
// extracted by mini-css-extract-plugin
/* harmony default export */ const styles_module = ({"tabItem":"tabItem_WPJy"});
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js
/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */function TabItemPanel({children,className,hidden}){return/*#__PURE__*/(0,jsx_runtime.jsx)("div",{role:"tabpanel",className:(0,clsx/* default */.A)(styles_module.tabItem,className),hidden,children:children});}function TabItem({children,className,value}){const{selectedValue,lazy}=(0,tabsUtils/* useTabs */.uc)();const isSelected=value===selectedValue;// TODO Docusaurus v4: use <Activity> ?
if(!isSelected&&lazy){return null;}return/*#__PURE__*/(0,jsx_runtime.jsx)(TabItemPanel,{className:className,hidden:!isSelected,children:children});}

/***/ },

/***/ 5250
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  A: () => (/* binding */ Tabs)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/index.js
var react = __webpack_require__(489);
// EXTERNAL MODULE: ./node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
var clsx = __webpack_require__(3526);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.1_@docusaurus+plugin-content-docs@3.10.1_@mdx-js+react@3._5c760eb0e2d5ff300251aa280f7f631a/node_modules/@docusaurus/theme-common/lib/utils/ThemeClassNames.js
var ThemeClassNames = __webpack_require__(1905);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.1_@docusaurus+plugin-content-docs@3.10.1_@mdx-js+react@3._5c760eb0e2d5ff300251aa280f7f631a/node_modules/@docusaurus/theme-common/lib/utils/tabsUtils.js
var tabsUtils = __webpack_require__(2329);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.1_@docusaurus+plugin-content-docs@3.10.1_@mdx-js+react@3._5c760eb0e2d5ff300251aa280f7f631a/node_modules/@docusaurus/theme-common/lib/utils/scrollUtils.js
var scrollUtils = __webpack_require__(4714);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+core@3.10.1_@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6__postcss@_8e4f15980c67c89e41a59896d33471aa/node_modules/@docusaurus/core/lib/client/exports/useIsBrowser.js
var useIsBrowser = __webpack_require__(2288);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/styles.module.css
// extracted by mini-css-extract-plugin
/* harmony default export */ const styles_module = ({"tabList":"tabList_Ardb","tabItem":"tabItem_astB"});
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js
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

/***/ 2329
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   OC: () => (/* binding */ useTabsContextValue),
/* harmony export */   O_: () => (/* binding */ TabsProvider),
/* harmony export */   uc: () => (/* binding */ useTabs),
/* harmony export */   vT: () => (/* binding */ sanitizeTabsChildren)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(489);
/* harmony import */ var _docusaurus_router__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(4510);
/* harmony import */ var _docusaurus_useIsomorphicLayoutEffect__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(8804);
/* harmony import */ var _docusaurus_theme_common_internal__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(9231);
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(5037);
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(7252);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(1325);
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

/***/ 1982
(__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   R: () => (/* binding */ useMDXComponents),
/* harmony export */   x: () => (/* binding */ MDXProvider)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(489);
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