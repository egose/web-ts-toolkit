"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[876],{

/***/ 3785
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_deco_md_452_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-deco-md-452.json
const site_docs_packages_access_router_deco_md_452_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router-deco","title":"@web-ts-toolkit/access-router-deco","description":"Decorator-based configuration for @web-ts-toolkit/access-router.","source":"@site/docs/packages/access-router-deco.md","sourceDirName":"packages","slug":"/packages/access-router-deco","permalink":"/docs/packages/access-router-deco","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":13,"frontMatter":{"sidebar_label":"Access Router Deco","sidebar_position":13},"sidebar":"packagesSidebar","previous":{"title":"Access Router React","permalink":"/docs/packages/access-router-react"},"next":{"title":"Access Router Runtime","permalink":"/docs/packages/access-router-runtime"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.3.0_react@19.3.0/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(3191);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(5430);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(2608);
;// ./docs/packages/access-router-deco.md


const frontMatter = {
	sidebar_label: 'Access Router Deco',
	sidebar_position: 13
};
const contentTitle = '@web-ts-toolkit/access-router-deco';

const assets = {

};





const toc = [{
  "value": "Property and OpenAPI migration",
  "id": "property-and-openapi-migration",
  "level": 2
}, {
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
  "value": "Runtime Ownership",
  "id": "runtime-ownership",
  "level": 2
}, {
  "value": "Transactional Bootstrap",
  "id": "transactional-bootstrap",
  "level": 2
}, {
  "value": "TypeScript Decorator Configuration",
  "id": "typescript-decorator-configuration",
  "level": 2
}, {
  "value": "Error handling",
  "id": "error-handling",
  "level": 3
}, {
  "value": "Runtime-owned Mongoose models",
  "id": "runtime-owned-mongoose-models",
  "level": 3
}, {
  "value": "Mental Model",
  "id": "mental-model",
  "level": 2
}, {
  "value": "Common Patterns",
  "id": "common-patterns",
  "level": 2
}, {
  "value": "Root router module",
  "id": "root-router-module",
  "level": 3
}, {
  "value": "Default model options and per-model overrides",
  "id": "default-model-options-and-per-model-overrides",
  "level": 3
}, {
  "value": "Property-based options with <code>@Option(...)</code>",
  "id": "property-based-options-with-option",
  "level": 3
}, {
  "value": "Class Decorators",
  "id": "class-decorators",
  "level": 2
}, {
  "value": "<code>Module({ routers, routerOptions, options })</code>",
  "id": "module-routers-routeroptions-options-",
  "level": 3
}, {
  "value": "<code>Router(modelName, options?)</code>",
  "id": "routermodelname-options",
  "level": 3
}, {
  "value": "<code>Router(rootOptions)</code>",
  "id": "routerrootoptions",
  "level": 3
}, {
  "value": "<code>RouterOptions(options)</code> and <code>RouterOptions(modelName, options)</code>",
  "id": "routeroptionsoptions-and-routeroptionsmodelname-options",
  "level": 3
}, {
  "value": "Hook Decorators",
  "id": "hook-decorators",
  "level": 2
}, {
  "value": "Parameter Decorators",
  "id": "parameter-decorators",
  "level": 2
}, {
  "value": "Property Decorators",
  "id": "property-decorators",
  "level": 2
}, {
  "value": "Bootstrapping",
  "id": "bootstrapping",
  "level": 2
}, {
  "value": "Notes",
  "id": "notes",
  "level": 2
}, {
  "value": "Related Packages",
  "id": "related-packages",
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
        id: "web-ts-toolkitaccess-router-deco",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/access-router-deco"
        })
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Decorator-based configuration for ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/access-router"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This package lets you describe ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " modules, model routers, router options, and hook methods with TypeScript decorators instead of wiring everything by hand."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "property-and-openapi-migration",
      children: "Property and OpenAPI migration"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Scoped property decorators enforce their class role at bootstrap: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "GlobalOption"
      }), "\non modules, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DefaultModelOption"
      }), " on default providers, and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelOption"
      }), " on model\nrouters/providers. Misplaced declarations throw ", (0,jsx_runtime.jsx)(_components.code, {
        children: "TypeError"
      }), ", including inherited\nand inferred-key declarations. Root routers reject all instance option properties;\nuse ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Router(options)"
      }), ". A child remapping replaces inherited entries for either\nthe same property (including symbols) or the same option key."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["All property decorators, including legacy ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Option"
      }), ", validate known scalar values:\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "requestPermissionField"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "documentPermissionField"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "idParam"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "idField"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "parentPath"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "queryRouteSegment"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mutationRouteSegment"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "modelPermissionPrefix"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "modelName"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basePath"
      }), " require strings; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "listHardLimit"
      }), " requires a finite\nnumber; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requireRegisteredPopulateModels"
      }), " requires a boolean. Optional ", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), "\nremains allowed. Invalid values throw and package-controlled writes roll back.\nUnknown extension/typo keys remain allowed; this is not exhaustive validation of\nstructured policies or hooks, and decorators cannot type-check property values."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Module ", (0,jsx_runtime.jsx)(_components.code, {
        children: "options.basePath"
      }), " now prefixes generated OpenAPI paths before collision\nchecks as well as mounting Express. Module ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/api"
      }), " plus model ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/users"
      }), " produces\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "/api/users"
      }), "; root ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/batch"
      }), " produces ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/api/batch"
      }), ". Shared-runtime prior entries\nare preserved. Model OpenAPI composition is module base + ", (0,jsx_runtime.jsx)(_components.code, {
        children: "parentPath"
      }), " + model\nbase; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "parentPath"
      }), " does not affect Express matching. Remove old ", (0,jsx_runtime.jsx)(_components.code, {
        children: "parentPath"
      }), "\nworkarounds that equal or descend from the module mount: bootstrap rejects them\nto avoid doubled paths (segment-aware: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/apiary"
      }), " is not beneath ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/api"
      }), ")."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For a reverse-proxy prefix ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/ext"
      }), ", leave ", (0,jsx_runtime.jsx)(_components.code, {
        children: "parentPath"
      }), " at its default and pass\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "servers: [{ url: '/ext' }]"
      }), " when generating the OpenAPI router/spec. This describes\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "/ext/api/users"
      }), "; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "parentPath: '/ext'"
      }), " would describe ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/api/ext/users"
      }), " instead.\nExpress URLs are unchanged by this migration."]
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
            children: "npm install @web-ts-toolkit/access-router-deco @web-ts-toolkit/access-router reflect-metadata express mongoose\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add @web-ts-toolkit/access-router-deco @web-ts-toolkit/access-router reflect-metadata express mongoose\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add @web-ts-toolkit/access-router-deco @web-ts-toolkit/access-router reflect-metadata express mongoose\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add @web-ts-toolkit/access-router-deco @web-ts-toolkit/access-router reflect-metadata express mongoose\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Peer dependencies:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/access-router"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "express >=5"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "mongoose >=8"
        }), " (direct peer)"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "reflect-metadata ^0.1.13 || ^0.2.0"
        }), " (both ", (0,jsx_runtime.jsx)(_components.code, {
          children: "0.1"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "0.2"
        }), " lines satisfy the documented init policy)"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Declaration types: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@types/express"
      }), " is a runtime dependency of this package. A clean consumer installing only the package and the peers above resolves all emitted ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".d.ts"
      }), " imports with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "skipLibCheck: false"
      }), " — no extra ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@types/express"
      }), " install needed. Removing unrelated workspace packages or their transitive ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@types/express"
      }), " does not break compilation."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["TypeScript: ", (0,jsx_runtime.jsx)(_components.code, {
        children: ">=5.5 <7.0"
      }), " (maintained ", (0,jsx_runtime.jsx)(_components.code, {
        children: "5.x"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "6.x"
      }), " lines, verified ", (0,jsx_runtime.jsx)(_components.code, {
        children: "5.5"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "5.9"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "6.0"
      }), "). Requires ", (0,jsx_runtime.jsx)(_components.code, {
        children: "experimentalDecorators: true"
      }), " (legacy decorators); ", (0,jsx_runtime.jsx)(_components.code, {
        children: "emitDecoratorMetadata: true"
      }), " is supported but not required. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "skipLibCheck: false"
      }), " with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "moduleResolution: NodeNext"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Bundler"
      }), " is verified via the packed-consumer suite (see Compatibility Matrix in the package README — sentinel in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pnpm test"
      }), ", full matrix via ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pnpm --filter @web-ts-toolkit/access-router-deco test:compat"
      }), ")."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The package root transitively pulls ", (0,jsx_runtime.jsx)(_components.code, {
        children: "reflect-metadata"
      }), " via decorators, but an explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "import 'reflect-metadata'"
      }), " in the app entry remains the safe canonical pattern."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-exposes",
      children: "What It Exposes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "Module(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "Router(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "RouterOptions(...)"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["hook decorators ", (0,jsx_runtime.jsx)(_components.code, {
          children: "GlobalPermissions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DocPermissions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "BaseFilter"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OverrideFilter"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Validate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Prepare"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Transform"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "AfterPersist"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Decorate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DecorateAll"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "RouteGuard"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Identifier"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "BeforeDelete"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "AfterDelete"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["parameter decorators ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Request"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Document"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Permissions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Context"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Filter"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Id"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["scoped property decorators ", (0,jsx_runtime.jsx)(_components.code, {
          children: "GlobalOption(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ModelOption(...)"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DefaultModelOption(...)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["legacy unscoped property decorator ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Option(...)"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "EgoseFactory.bootstrap(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "EgoseFactoryStatic.create(...)"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["exported types such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "BootstrapResult"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ModuleMetadata"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "RouterModel"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Type"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This public article endpoint lets anyone read a published article by slug. It grants no list or write access and exposes only the allowed read fields (plus Access Router's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_permissions"
      }), " metadata). Authentication is unnecessary for this public policy; request headers do not grant privileges."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import 'reflect-metadata';\nimport express from 'express';\nimport mongoose from 'mongoose';\nimport { Module, Router, BaseFilter, Identifier, Id, EgoseFactoryStatic } from '@web-ts-toolkit/access-router-deco';\n\n// Call once per host-owned connection; pass the model instance, not a global name.\nexport function createArticleApp(connection: mongoose.Connection) {\n  const Article = connection.model(\n    'Article',\n    new mongoose.Schema({\n      slug: { type: String, required: true, unique: true },\n      title: { type: String, required: true },\n      body: String,\n      published: { type: Boolean, default: false },\n      internalNotes: String,\n    }),\n  );\n\n  @Router(Article, {\n    basePath: '/articles',\n    // No list fallback or computed field-permission metadata (only its empty placeholder).\n    defaults: { publicReadOptions: { includePermissions: false, tryList: false } },\n    operationAccess: {\n      read: true,\n      list: false,\n      new: false,\n      create: false,\n      update: false,\n      upsert: false,\n      delete: false,\n      distinct: false,\n      count: false,\n      subs: false,\n    },\n    permissionSchema: {\n      slug: { read: true },\n      title: { read: true },\n      body: { read: true },\n      published: false,\n      internalNotes: false,\n    },\n  })\n  class ArticleRouter {\n    @BaseFilter('read')\n    publishedOnly() {\n      return { published: true };\n    }\n\n    @Identifier()\n    bySlug(@Id() slug: string) {\n      return { slug };\n    }\n  }\n\n  @Module({\n    routers: [ArticleRouter],\n    options: { basePath: '/api', handleErrors: true },\n  })\n  class ArticleModule {}\n\n  const app = express();\n  app.use(express.json());\n  const factory = EgoseFactoryStatic.create(); // New isolated Access Router runtime.\n  const { runtime } = factory.bootstrap(ArticleModule, app);\n  return { app, runtime, Article };\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Save this as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "articles.ts"
      }), ". Prerequisites: Node >=22, the dependencies and legacy TypeScript settings above, and a reachable MongoDB database. In an async host startup, open a dedicated connection before listening (compile TypeScript before running Node):"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import mongoose from 'mongoose';\nimport { createArticleApp } from './articles.js';\n\nasync function main() {\n  const uri = process.env.MONGODB_URI;\n  if (!uri) throw new Error('Set MONGODB_URI');\n  const connection = await mongoose.createConnection(uri).asPromise();\n  const { app, Article } = createArticleApp(connection);\n  await Article.init(); // Ensure the unique slug index exists before serving.\n  // Provision articles through a trusted seed/admin process, e.g.:\n  // await Article.create({ slug: 'welcome', title: 'Welcome', body: 'Hello', published: true });\n  const server = app.listen(3000);\n  // The host owns shutdown: close server, then await connection.close().\n  return { server, connection };\n}\nvoid main().catch((error: unknown) => {\n  console.error(error);\n  process.exitCode = 1;\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["After provisioning ", (0,jsx_runtime.jsx)(_components.code, {
        children: "welcome"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "GET /api/articles/welcome"
      }), " returns its public fields. A draft slug returns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "404"
      }), "; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "GET /api/articles"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "POST /api/articles"
      }), " return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "401"
      }), " under Access Router's denial contract. Sending ", (0,jsx_runtime.jsx)(_components.code, {
        children: "x-role: admin"
      }), " changes none of these decisions. JSON parsing is installed before routes, but parsed bodies do not authorize writes."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "operationAccess"
      }), " authorizes operations; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "permissionSchema"
      }), " authorizes fields. A document-permission map alone does not configure either policy. Migration note (PDEC-05): the former quickstart trusted ", (0,jsx_runtime.jsx)(_components.code, {
        children: "x-role"
      }), " as an administrator grant; replace that pattern with this public policy or a host-verified principal boundary. For private/tenant workflows, authenticate in host middleware before bootstrap's mounted router, deny missing principals with a route guard, and derive tenant filters from that verified principal via ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Request()"
      }), ". Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Context()"
      }), " for model-hook context where supported by the hook table below. Filters restrict data; they are not authentication. Request/principal state belongs in the injected request/context, never shared class fields. Each tenant-owned connection/model should use its own factory runtime; isolation alone does not authenticate tenant selection."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This package is a good fit when you like ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), "'s hooks and configuration model but want to express them through decorators and classes instead of building option objects manually."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "runtime-ownership",
      children: "Runtime Ownership"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "EgoseFactory"
      }), " is a compatibility singleton bound to the default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " runtime. Use it only when your application intentionally shares that default runtime."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For isolated applications, tests, or multiple bootstraps with the same model names, use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "EgoseFactoryStatic.create()"
      }), ". It creates a factory bound to a fresh ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " runtime by default:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const factory = EgoseFactoryStatic.create();\nconst { runtime, router } = factory.bootstrap(AppModule, app);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "If your host already owns a runtime, pass it explicitly:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createAccessRuntime } from '@web-ts-toolkit/access-router';\n\nconst runtime = createAccessRuntime();\nconst factory = EgoseFactoryStatic.create(runtime);\nfactory.bootstrap(AppModule, app);\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The bootstrap result exposes the bound ", (0,jsx_runtime.jsx)(_components.code, {
        children: "runtime"
      }), " and mounted Express ", (0,jsx_runtime.jsx)(_components.code, {
        children: "router"
      }), " for lifecycle inspection. Calling ", (0,jsx_runtime.jsx)(_components.code, {
        children: "bootstrap(...)"
      }), " twice with the same factory, module class, and Express app throws to avoid duplicate middleware and routes."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "transactional-bootstrap",
      children: "Transactional Bootstrap"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "EgoseFactoryStatic.bootstrap(...)"
      }), " snapshots package-controlled runtime state before mutation and delays publication until setup succeeds. Class roles are validated before construction; effective hook declarations are checked during configuration planning. After planning, the factory requires callable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createBootstrapSnapshot()"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "restoreBootstrapSnapshot()"
      }), " methods, resolving each directly on the runtime API or on its underlying ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".runtime"
      }), " (direct methods take precedence). Missing capability, thrown acquisition errors, or an absent snapshot stop bootstrap before package preflight, setters, model registration, or mounting. The real runtime snapshot covers global/default/model options, model registrations, model refs/subs/atts, and OpenAPI registrations."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Request runtime initialization (", (0,jsx_runtime.jsx)(_components.code, {
        children: "factory.runtime()"
      }), "), decorated option registration, routes, and opt-in error handlers are composed on an unmounted ", (0,jsx_runtime.jsx)(_components.code, {
        children: "express.Router()"
      }), " first (init before routes and error handlers). Only after setup succeeds is that single module router mounted with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "app.use(basePath, router)"
      }), ". On setup failure, including a final ", (0,jsx_runtime.jsx)(_components.code, {
        children: "app.use"
      }), " that throws after mounting, the factory independently attempts runtime restoration and truncation of the app's mount stack to its pre-bootstrap length."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Request runtime initialization is scoped to the module router mounted at ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basePath"
      }), " and does not run on unrelated host routes. Two isolated modules on one app each use only their owning runtime on their own paths. Applications needing request runtime initialization outside module routes must explicitly own that middleware (for example, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "app.use(factory.runtime())"
      }), ")."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Malformed hook chains (", (0,jsx_runtime.jsx)(_components.code, {
        children: "Invalid hook chain for <aclKey>"
      }), ") and duplicate validator/static-array conflicts are checked in preflight before setters, inside the snapshot boundary because runtime lookups can mutate state. When rollback succeeds, bootstrap rethrows the exact original value, including non-", (0,jsx_runtime.jsx)(_components.code, {
        children: "Error"
      }), " throws. A corrected retry then behaves like a clean first attempt, with one mount and one copy of initialization, routes, hooks, and OpenAPI registrations."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Recovery failure:"
      }), " if runtime restoration or app-stack cleanup throws, bootstrap reports an ", (0,jsx_runtime.jsx)(_components.code, {
        children: "AggregateError"
      }), ". Its ", (0,jsx_runtime.jsx)(_components.code, {
        children: "cause"
      }), " and first ", (0,jsx_runtime.jsx)(_components.code, {
        children: "errors"
      }), " entry are the original thrown value; subsequent entries are the runtime-restore failure and/or app-cleanup failure in that order. Both recovery steps are attempted even if one fails. Failed runtime restoration leaves runtime state uncertain; failed app cleanup can leave routes mounted. The host must repair or replace the affected runtime/app before retrying. Every attempt releases the in-progress reservation, and a failed attempt is not marked bootstrapped; this permits recovery but does not prove rollback succeeded."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Migration note:"
      }), " bootstrap previously ignored snapshot acquisition/restoration failures. Runtime adapters and test doubles must now provide working synchronous snapshot/restore capability; missing methods no longer permit unprotected setup. Ordinary successful rollback preserves error identity, while failed recovery now surfaces the original and recovery failures together."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Non-rollback boundary:"
      }), " arbitrary user constructors and field initializers (", (0,jsx_runtime.jsx)(_components.code, {
        children: "new Type()"
      }), ") executed while building the module plan are outside the transaction and are not undone. Express internals outside the mount stack (e.g., ", (0,jsx_runtime.jsx)(_components.code, {
        children: "app.set(...)"
      }), ", already-sent responses) are also not rolled back. The guarantee covers only the factory's runtime state and the Express mount stack (", (0,jsx_runtime.jsx)(_components.code, {
        children: "app._router.stack"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "app.router.stack"
      }), " truncation)."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "typescript-decorator-configuration",
      children: "TypeScript Decorator Configuration"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This package uses TypeScript legacy decorators, including parameter decorators. Compile consumers with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "experimentalDecorators: true"
      }), " and use a compiler/transpiler that preserves legacy class, method, property, and parameter decorators. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "emitDecoratorMetadata: true"
      }), " is supported but not required — the package root transitively pulls ", (0,jsx_runtime.jsx)(_components.code, {
        children: "reflect-metadata"
      }), " via decorators, but an explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "import 'reflect-metadata'"
      }), " in the app entry remains the safe canonical pattern. Consumers own installing the peer (", (0,jsx_runtime.jsx)(_components.code, {
        children: "^0.1.13 || ^0.2.0"
      }), "). Supported range is ", (0,jsx_runtime.jsx)(_components.code, {
        children: "typescript >=5.5 <7.0"
      }), " (each maintained ", (0,jsx_runtime.jsx)(_components.code, {
        children: "5.x"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "6.x"
      }), " line; minimum verified ", (0,jsx_runtime.jsx)(_components.code, {
        children: "5.5"
      }), ")."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Parameter injection is explicit: undecorated hook parameters receive no values. Use decorators such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Request()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Document()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Permissions()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Context()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Filter()"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Id()"
      }), " for every runtime value a hook needs."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Decorated methods run with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "this"
      }), " bound to the decorated class instance, not the Express request. Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Request()"
      }), " when a hook needs request data."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "error-handling",
      children: "Error handling"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["By default, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "EgoseFactory.bootstrap(...)"
      }), " does not install Express error handlers. Your host app remains responsible for its own 404 and error policy."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Set ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Module({ options: { handleErrors: true } })"
      }), " only when you want the package router to add a local compatibility error boundary. With that flag enabled, unmatched package routes return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "404"
      }), " with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ message: 'Not Found' }"
      }), ", and package route errors return sanitized ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ message }"
      }), " JSON. The boundary does not intercept unrelated application routes mounted before or after the package router, never serializes raw error objects, validates error status codes before using them, and delegates with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "next(err)"
      }), " if response headers were already sent."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Migration note: older versions installed application-wide catch-all middleware after bootstrap. If your app relied on ", (0,jsx_runtime.jsx)(_components.code, {
        children: "handleErrors"
      }), " for routes outside the decorated package router, add explicit Express 404 and error middleware after all host routes instead."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "runtime-owned-mongoose-models",
      children: "Runtime-owned Mongoose models"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Router('ModelName')"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@RouterOptions('ModelName', ...)"
      }), " when the model is registered on Mongoose's default connection."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "When your app owns the Mongoose model instance, pass that exact model to the decorators:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const User = tenantConnection.model('User', userSchema);\n\n@Router(User, { basePath: '/users' })\nclass UserRouter {}\n\n@RouterOptions(User, { idParam: 'userId' })\nclass UserOptions {}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "EgoseFactory.bootstrap(...)"
      }), " registers the supplied model instance with the factory's bound runtime before route creation. This keeps same-name models from separate Mongoose connections isolated when each module uses its own ", (0,jsx_runtime.jsx)(_components.code, {
        children: "EgoseFactoryStatic.create()"
      }), " runtime."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Typed models compose through the exported ", (0,jsx_runtime.jsx)(_components.code, {
        children: "RouterModel<TModel>"
      }), " alias without casts, and decorator overloads keep model-specific option inference (", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelRouterOptions<TModel>"
      }), "):"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import type { Model } from 'mongoose';\nimport type { RouterModel } from '@web-ts-toolkit/access-router-deco';\n\ntype User = { name: string };\ndeclare const UserModel: Model<User>;\n\nconst modelRef: RouterModel = UserModel;\nconst typedRef: RouterModel<User> = UserModel;\n\nfunction registerModel(value: RouterModel<User>) {\n  Router(value, { basePath: '/users' })(UserRouter);\n  RouterOptions(value, { idParam: 'userId' })(UserOptions);\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["A ", (0,jsx_runtime.jsx)(_components.code, {
        children: "string | Model<TModel>"
      }), " union held in a variable or function parameter is accepted wherever a model name or instance is. Option objects still infer from the model type (e.g. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "permissionSchema"
      }), " keys), and model-like objects or non-model values are still rejected."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "mental-model",
      children: "Mental Model"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "Module(...)"
        }), " declares the top-level composition unit"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "Router('User', ...)"
        }), " declares one model router"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "Router(UserModel, ...)"
        }), " declares one model router using that exact Mongoose model instance"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "Router({...})"
        }), " declares a root batch router"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "RouterOptions({...})"
        }), " sets default model options or per-model option overrides"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["method decorators map class methods to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access-router"
        }), " hooks"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "EgoseFactory.bootstrap(...)"
        }), " reads the metadata and registers the actual Express routers"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "common-patterns",
      children: "Common Patterns"
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "root-router-module",
      children: "Root router module"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use the object form of ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Router(...)"
      }), " when you want a root batch router instead of a model router."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "@Router({\n  basePath: '/root',\n  operationAccess: true,\n})\nclass RootRouterModule {}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "default-model-options-and-per-model-overrides",
      children: "Default model options and per-model overrides"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "@RouterOptions({\n  operationAccess: {\n    list: true,\n    read: true,\n  },\n})\nclass DefaultRouterOptions {}\n\n@RouterOptions('User', {\n  basePath: '/members',\n})\nclass UserRouterOptions {}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use the one-argument form for shared defaults and the two-argument form when one model needs a specific override."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["During bootstrap, model route-construction options are applied before routes are created. Precedence is deterministic: default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@RouterOptions(...)"
      }), ", then model-specific ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@RouterOptions('Model', ...)"
      }), ", then ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Router('Model', ...)"
      }), " options, then ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Option(...)"
      }), " properties and decorated hooks on the same class. Later layers override earlier layers for the same option key."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Avoid setting build-time route options after bootstrap. Options such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basePath"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "parentPath"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "idParam"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "queryRouteSegment"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mutationRouteSegment"
      }), " must be present before Express routes are created."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h3, {
      id: "property-based-options-with-option",
      children: ["Property-based options with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Option(...)"
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "@RouterOptions('User')\nclass UserRouterOptions {\n  @Option('basePath')\n  usersPath = '/members';\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That pattern is useful when option values come from instance properties instead of hard-coded decorator arguments."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Property values on ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@RouterOptions(...)"
      }), " classes participate in the same pre-construction option phase, so build-time options such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basePath"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "parentPath"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "idParam"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "queryRouteSegment"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mutationRouteSegment"
      }), " affect the mounted Express routes."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "class-decorators",
      children: "Class Decorators"
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "module-routers-routeroptions-options-",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "Module({ routers, routerOptions, options })"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Defines the application module that ", (0,jsx_runtime.jsx)(_components.code, {
        children: "EgoseFactory"
      }), " will bootstrap."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "routers"
        }), ": router classes decorated with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@Router(...)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "routerOptions"
        }), ": classes decorated with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@RouterOptions(...)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "options"
        }), ": global ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access-router"
        }), " options plus ", (0,jsx_runtime.jsx)(_components.code, {
          children: "basePath"
        }), " and optional package-router ", (0,jsx_runtime.jsx)(_components.code, {
          children: "handleErrors"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "@Module({\n  routers: [UserRouter, RootRouterModule],\n  routerOptions: [DefaultRouterOptions, UserRouterOptions],\n  options: {\n    basePath: '/api',\n  },\n})\nclass AppModule {}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "routermodelname-options",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "Router(modelName, options?)"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Declares a model router for one ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " model."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "@Router('User', { basePath: '/users' })\nclass UserRouter {}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "routerrootoptions",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "Router(rootOptions)"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Declares a root batch router instead of a model router."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "@Router({ basePath: '/root' })\nclass RootRouterModule {}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.h3, {
      id: "routeroptionsoptions-and-routeroptionsmodelname-options",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "RouterOptions(options)"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "RouterOptions(modelName, options)"
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use the one-argument form for default model options and the two-argument form for per-model overrides."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "RouterOptions(...)"
      }), " is the decorator form of the same model-option layering you would normally express in plain ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " configuration objects."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "hook-decorators",
      children: "Hook Decorators"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["These decorators map directly to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " option keys. Every hook method runs with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "this"
      }), " bound to the decorated class instance (not the request — use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Request()"
      }), " for request data) and uses ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "explicit parameter injection"
      }), " — undecorated parameters receive no value."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Migration note (BDECO-05 — fail-fast decorator targets): hook, parameter, and property decorators are instance-only and reject unsupported targets at decoration time before writing metadata. Static methods/properties/parameters, constructor parameters, and missing/invalid operations (including zero-argument JavaScript calls like ", (0,jsx_runtime.jsx)(_components.code, {
        children: "BaseFilter()"
      }), ") now throw instead of being silently skipped. Previously such declarations compiled but never registered, so a deny guard or filter could silently disappear. If you relied on static decorators, move the hook to an instance method."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Migration note (PDEC-02 — accessor hooks): method-hook decorators also reject getters, setters, missing descriptors, and non-callable or malformed method descriptors before writing hook metadata, without invoking getters. Legacy TypeScript descriptor typing can accept a callable getter such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@RouteGuard('read') get guard() { return () => false; }"
      }), ", but this now throws at decoration time instead of silently losing the policy. Use an instance method: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@RouteGuard('read') guard() { return false; }"
      }), ". Ordinary, inherited, symbol-keyed, and wrapped instance methods remain supported."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Decorator"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Maps to"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Scope / Valid Class Role"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Operations"
          }), (0,jsx_runtime.jsxs)(_components.th, {
            children: ["Result Shape (", (0,jsx_runtime.jsx)(_components.code, {
              children: "MaybePromise<…>"
            }), ")"]
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@GlobalPermissions()"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "globalPermissions"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Module"
            }), " only"]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "—"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "GlobalPermissionValue"
            }), " (", (0,jsx_runtime.jsx)(_components.code, {
              children: "string | string[] | Record<string,boolean> | null | undefined"
            }), ")"]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@DocPermissions(op)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "docPermissions.*"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "default"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "create"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "update"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "list"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "read"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "Record<string,unknown>"
            }), " — per-document map, OR-combined with global grants; empty map grants nothing and never revokes a global grant"]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@BaseFilter(op)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "baseFilter.*"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "default"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "update"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "list"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "read"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "delete"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "Filter | true | null | undefined"
            }), " — filter restricts; only ", (0,jsx_runtime.jsx)(_components.code, {
              children: "false"
            }), " denies; ", (0,jsx_runtime.jsx)(_components.code, {
              children: "null"
            }), "/", (0,jsx_runtime.jsx)(_components.code, {
              children: "undefined"
            }), "/", (0,jsx_runtime.jsx)(_components.code, {
              children: "true"
            }), "/", (0,jsx_runtime.jsx)(_components.code, {
              children: "{}"
            }), " add no base restriction"]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@OverrideFilter(op)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "overrideFilter.*"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "default"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "update"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "list"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "read"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "delete"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "Filter"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@Validate(op)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "validate.*"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "default"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "create"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "update"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "boolean | unknown[]"
            }), " — ", (0,jsx_runtime.jsx)(_components.code, {
              children: "true"
            }), " passes, ", (0,jsx_runtime.jsx)(_components.code, {
              children: "false"
            }), " / non-empty array → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "400"
            }), " controlled failure; returning the document is a type error"]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@Prepare(op)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "prepare.*"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "default"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "create"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "update"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "TValue"
            }), " (prepared document)"]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@Transform(op)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "transform.*"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "default"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "update"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "ModelDocument<TValue>"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@AfterPersist(op)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "afterPersist.*"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "default"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "create"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "update"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "ModelDocument<TValue>"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@Decorate(op)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "decorate.*"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "default"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "create"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "update"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "list"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "read"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "TValue"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@DecorateAll(op)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "decorateAll.*"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "default"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "list"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "TValue[]"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouteGuard(op)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "operationAccess.*"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            }), " / default model options"]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "default"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "new"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "list"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "create"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "read"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "update"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "upsert"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "delete"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "distinct"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "count"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "boolean"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@Identifier()"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "resolveIdFilter"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            }), " / default"]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "—"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "Filter"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@BeforeDelete()"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "beforeDelete"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "—"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "void"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@AfterDelete()"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "afterDelete"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "—"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "void"
            })
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Most decorators take the same operation names you would use in plain ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " options, such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "create"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "read"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "update"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "list"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "delete"
      }), ". Scalar hooks (", (0,jsx_runtime.jsx)(_components.code, {
        children: "globalPermissions"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "docPermissions"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "baseFilter"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "overrideFilter"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "validate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "routeGuard"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "identifier"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "beforeDelete"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "afterDelete"
      }), ") reject duplicate keys on the same class; array hooks (", (0,jsx_runtime.jsx)(_components.code, {
        children: "prepare"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "transform"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "afterPersist"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "decorate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "decorateAll"
      }), ") compose base→derived."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Hook class roles are enforced at bootstrap."
      }), " Every known effective hook declaration is checked before runtime setters or Express publication, including inherited, symbol-keyed, wrapped, and mixed allowed/disallowed declarations. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@GlobalPermissions()"
      }), " belongs only on ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Module"
      }), "; model hooks belong on ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Router(Model)"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@RouterOptions(Model)"
      }), ". Default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@RouterOptions(options)"
      }), " accepts only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@RouteGuard"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Identifier"
      }), ". Root ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Router(options)"
      }), " accepts no hook methods; its prototype is validated without constructing the root class."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Migration note:"
      }), " wrong-role hooks that were previously silently ignored now stop bootstrap with the class, member, hook, and valid placements in the diagnostic. Move the declaration to a provider with the intended supported scope; bootstrap does not reassign it automatically. Only effective declarations are checked: an override suppresses ancestor hook metadata, and a decorated override is checked in its own class role. Constructors of other providers still run during configuration planning and remain outside rollback."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: (0,jsx_runtime.jsx)(_components.strong, {
        children: "Method-wrapper composition"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Legacy TypeScript decorators that mutate ", (0,jsx_runtime.jsx)(_components.code, {
        children: "descriptor.value"
      }), " or return a replacement method descriptor retain hook declarations in either decorator order. Bootstrap invokes the effective wrapped method with the class instance as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "this"
      }), " and explicit parameter injection, including sparse positions. Inherited and symbol-keyed methods are supported. An override replaces the ancestor's hook and parameter declarations; redecorate the override to register it."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Wrappers remain responsible for the behavior they return: forward ", (0,jsx_runtime.jsx)(_components.code, {
        children: "this"
      }), ", arguments, return values/promises, and errors when preserving the original hook. Composition support does not restore behavior discarded by a wrapper or transfer declarations to a different member. ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "Migration note:"
      }), " instrumentation that previously replaced a decorated function could silently drop its guard or validator; that declared policy now remains active regardless of decorator order."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "@Validate"
      }), ": return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "true"
      }), " on success, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "false"
      }), " or an issue array such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "['email is required']"
      }), " on invalid input — do not ", (0,jsx_runtime.jsx)(_components.code, {
        children: "throw"
      }), " for expected invalid input nor return the document, and the typed hook now fails to compile if you return a document."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Security / migration note (BDECO-07 — previously misleading guidance, runtime semantics unchanged): earlier docs said a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@BaseFilter"
      }), " returning ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " denies and a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@DocPermissions"
      }), " returning ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), " denies. The runtime never behaved that way — only a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "false"
      }), " filter denies (", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "true"
      }), "/empty ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), " normalize to no restriction and pass the incoming filter through), and document permissions combine with global grants via OR (", (0,jsx_runtime.jsx)(_components.code, {
        children: "permissions.has(key) || docPermissions[key]"
      }), "), so an empty document map cannot revoke a global grant. If you relied on ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " filters or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), " document maps to deny, return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "false"
      }), " from the filter hook or gate the route with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@RouteGuard(op)"
      }), " returning ", (0,jsx_runtime.jsx)(_components.code, {
        children: "false"
      }), " instead. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Identifier()"
      }), " hooks run with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "this"
      }), " bound to the decorated class instance like every other hook (never the request object); use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Request()"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "@Id()"
      }), " for request values."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "parameter-decorators",
      children: "Parameter Decorators"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Hook methods can declare only the inputs they need. Injection is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "explicit"
      }), ": undecorated parameters receive no value — every runtime value must be requested with a decorator, and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "this"
      }), " is always the class instance."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@Request()"
        }), " injects the active request (", (0,jsx_runtime.jsx)(_components.code, {
          children: "AccessRouterRequest"
        }), ") — valid on any hook"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@Document()"
        }), " injects the document / allowed data — valid on model hooks (", (0,jsx_runtime.jsx)(_components.code, {
          children: "docPermissions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "validate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "prepare"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "transform"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "decorate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "before/afterDelete"
        }), ", etc.)"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@Permissions()"
        }), " injects resolved permissions — valid on ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@RouteGuard"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@BaseFilter"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@DocPermissions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@Validate"
        }), ", etc."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@Context()"
        }), " injects the ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ModelHookContext"
        }), " from ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access-router"
        }), " — valid on model hooks"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@Filter()"
        }), " injects the current filter — valid only on ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@OverrideFilter(...)"
        }), " hooks"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@Id()"
        }), " injects the route identifier string — valid only on ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@Identifier()"
        }), " hooks"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "@Prepare('create')\nprepareCreate(@Document() doc: any, @Permissions() permissions: { has(permission: string): boolean }) {\n  if (permissions.has('isAdmin')) {\n    doc.internal = true;\n  }\n\n  return doc;\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Parameter decorators let hook methods stay focused on the values they actually use instead of accepting long positional argument lists."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Override filters receive the runtime filter and permissions explicitly:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "@OverrideFilter('read')\nconstrainRead(@Filter() filter: any, @Permissions() permissions: { has(permission: string): boolean }) {\n  return permissions.has('isAdmin') ? filter : { ...filter, public: true };\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Identifier hooks can derive a filter from the route ID:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "@Identifier()\nbySlug(@Id() id: string) {\n  return { slug: id };\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "property-decorators",
      children: "Property Decorators"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "@Option(...)"
      }), " and its scoped variants copy a class property value onto runtime options during bootstrap (explicit — undecorated properties are not copied; build-time keys like ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basePath"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "idParam"
      }), " must be set before route construction)."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Decorator"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Scope / Valid Class Role"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Typed Key"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Effect"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@GlobalOption(key?)"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Module"
            }), " (global)"]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "keyof GlobalOptions"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "setGlobalOption(key, value)"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@ModelOption(key?)"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@Router(Model)"
            }), " / ", (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions(Model)"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "keyof ExtendedModelRouterOptions"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "setModelOption(model, key, value)"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@DefaultModelOption(key?)"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "@RouterOptions"
            }), " default"]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "keyof ExtendedDefaultModelRouterOptions"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "setDefaultModelOption(key, value)"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@Option(key?)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "legacy unscoped — any hook-hosting class (role determines target)"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "string"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "same via role-appropriate setter"
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "@RouterOptions('User')\nclass UserRouterOptions {\n  @Option('basePath')\n  usersPath = '/members';\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "bootstrapping",
      children: "Bootstrapping"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "EgoseFactoryStatic.create().bootstrap(...)"
      }), " reads the decorator metadata and mounts the resulting routers onto an isolated runtime and Express app. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "EgoseFactory"
      }), " remains as a compatibility singleton bound to the default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " runtime."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { EgoseFactoryStatic } from '@web-ts-toolkit/access-router-deco';\n\nconst app = express();\nconst factory = EgoseFactoryStatic.create();\nconst { runtime, router } = factory.bootstrap(AppModule, app);\n// or with an explicit runtime: EgoseFactoryStatic.create(createAccessRuntime())\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Legacy singleton form (shared default runtime) is still supported:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { EgoseFactory } from '@web-ts-toolkit/access-router-deco';\nEgoseFactory.bootstrap(AppModule, app);\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you already prefer explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " option objects and direct router creation, that lower-level approach is still valid. This package is mainly about expressing the same configuration model through classes and decorators."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "notes",
      children: "Notes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["This package is a configuration layer over ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access-router"
        }), ", not a separate runtime."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Decorators only describe metadata; ", (0,jsx_runtime.jsx)(_components.code, {
          children: "EgoseFactory.bootstrap(...)"
        }), " performs the actual registration."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["If you already prefer explicit ", (0,jsx_runtime.jsx)(_components.code, {
          children: "acl.createRouter(...)"
        }), " code, you do not need this package."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "related-packages",
      children: "Related Packages"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./access-router",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/access-router"
          })
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./access-router-runtime",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/access-router-runtime"
          })
        })
      }), "\n"]
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