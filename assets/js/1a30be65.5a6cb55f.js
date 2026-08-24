"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[844],{

/***/ 5226
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_runtime_md_1a3_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-runtime-md-1a3.json
const site_docs_packages_access_router_runtime_md_1a3_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router-runtime","title":"@web-ts-toolkit/access-router-runtime","description":"Config-driven wrapper around @web-ts-toolkit/access-router and @web-ts-toolkit/express-runtime.","source":"@site/docs/packages/access-router-runtime.md","sourceDirName":"packages","slug":"/packages/access-router-runtime","permalink":"/docs/packages/access-router-runtime","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":14,"frontMatter":{"sidebar_label":"Access Router Runtime","sidebar_position":14},"sidebar":"packagesSidebar","previous":{"title":"Access Router Deco","permalink":"/docs/packages/access-router-deco"},"next":{"title":"Message Service","permalink":"/docs/packages/message-service"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(7008);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(362);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(4340);
;// ./docs/packages/access-router-runtime.md


const frontMatter = {
	sidebar_label: 'Access Router Runtime',
	sidebar_position: 14
};
const contentTitle = '@web-ts-toolkit/access-router-runtime';

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
  "value": "CLI",
  "id": "cli",
  "level": 2
}, {
  "value": "Local dev",
  "id": "local-dev",
  "level": 3
}, {
  "value": "Build a local runtime bundle",
  "id": "build-a-local-runtime-bundle",
  "level": 3
}, {
  "value": "Build a serverless bundle",
  "id": "build-a-serverless-bundle",
  "level": 3
}, {
  "value": "Start built artifacts",
  "id": "start-built-artifacts",
  "level": 3
}, {
  "value": "Relationship To The Lower-Level Packages",
  "id": "relationship-to-the-lower-level-packages",
  "level": 2
}, {
  "value": "Loading A Runtime Instance",
  "id": "loading-a-runtime-instance",
  "level": 2
}, {
  "value": "Programmatic Runtime Creation",
  "id": "programmatic-runtime-creation",
  "level": 2
}, {
  "value": "TypeScript Config Helper",
  "id": "typescript-config-helper",
  "level": 2
}, {
  "value": "Config Shape",
  "id": "config-shape",
  "level": 2
}, {
  "value": "Express Composition Order",
  "id": "express-composition-order",
  "level": 2
}, {
  "value": "In-Repo Example",
  "id": "in-repo-example",
  "level": 2
}, {
  "value": "When To Use It",
  "id": "when-to-use-it",
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
    ol: "ol",
    p: "p",
    pre: "pre",
    ul: "ul",
    ...(0,lib/* useMDXComponents */.R)(),
    ...props.components
  };
  return (0,jsx_runtime.jsxs)(jsx_runtime.Fragment, {
    children: [(0,jsx_runtime.jsx)(_components.header, {
      children: (0,jsx_runtime.jsx)(_components.h1, {
        id: "web-ts-toolkitaccess-router-runtime",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/access-router-runtime"
        })
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Config-driven wrapper around ", (0,jsx_runtime.jsx)(_components.a, {
        href: "./access-router/",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/access-router"
        })
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/express-runtime"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This package is for the case where you want the generated resource REST API from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), ", but you do not want to hand-wire:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Mongoose model registration"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["global ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access-router"
        }), " options"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "root and OpenAPI routers"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Express app setup"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "local dev vs. serverless runtime entry modules"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Instead, you describe the API in one TypeScript config file and let the package assemble the app and CLI entrypoints."
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
            children: "npm install @web-ts-toolkit/access-router-runtime @web-ts-toolkit/access-router @web-ts-toolkit/express-runtime express mongoose\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add @web-ts-toolkit/access-router-runtime @web-ts-toolkit/access-router @web-ts-toolkit/express-runtime express mongoose\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add @web-ts-toolkit/access-router-runtime @web-ts-toolkit/access-router @web-ts-toolkit/express-runtime express mongoose\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add @web-ts-toolkit/access-router-runtime @web-ts-toolkit/access-router @web-ts-toolkit/express-runtime express mongoose\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-exposes",
      children: "What It Exposes"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Main entrypoint:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "defineRuntimeConfig(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "createAccessRouterRuntime(config)"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "createAccessRouterRuntimeApp(config)"
        }), " for lifecycle-free configs only"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "createAccessRouterRuntimeServerlessHandler(config, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "loadAccessRouterRuntime(path, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "loadAccessRouterRuntimeConfigSync(path)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "normalizeAccessRouterRuntimeConfigExport(value, path)"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Published extras:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/access-router-runtime/tsconfig.json"
        }), " for a reusable strict TypeScript config base when authoring runtime config modules"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "CLI binary:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-access-router-runtime dev"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-access-router-runtime build"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-access-router-runtime start"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-access-router-runtime build-serverless"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-access-router-runtime start-serverless"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import mongoose from 'mongoose';\nimport { defineRuntimeConfig } from '@web-ts-toolkit/access-router-runtime';\n\nconst OPEN_ACCESS = { list: true, read: true, create: true, update: true, delete: true } as const;\n\nconst UserSchema = new mongoose.Schema({\n  name: { type: String, required: true },\n  role: { type: String, default: 'user' },\n});\n\nexport default defineRuntimeConfig({\n  db: {\n    url: process.env.MONGODB_URI,\n  },\n  globalOptions: {\n    globalPermissions() {\n      return [];\n    },\n  },\n  models: [\n    {\n      name: 'User',\n      schema: UserSchema,\n      router: {\n        basePath: '/api/users',\n        operationAccess: OPEN_ACCESS,\n        permissionSchema: {\n          name: OPEN_ACCESS,\n          role: OPEN_ACCESS,\n        },\n      },\n      customRoutes: [\n        {\n          method: 'get',\n          path: '/:id/profile',\n          handler: async (req) => ({ id: req.params.id, profile: true }),\n        },\n      ],\n    },\n  ],\n  rootRouter: {\n    basePath: '/api/root',\n    operationAccess: true,\n  },\n  openApi: {\n    title: 'Example API',\n    version: '1.0.0',\n    jsonPath: '/api/openapi.json',\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For a fuller starter, see the stable repository example: ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/main/packages/access-router-runtime/examples/basic/access-router.config.ts",
        children: "https://github.com/egose/web-ts-toolkit/blob/main/packages/access-router-runtime/examples/basic/access-router.config.ts"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "cli",
      children: "CLI"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The runtime CLI mirrors the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "express-runtime"
      }), " commands, but starts from a config file instead of a hand-wired app module."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "local-dev",
      children: "Local dev"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "wtt-access-router-runtime dev ./src/access-router.config.ts --env .env --port 3000\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "build-a-local-runtime-bundle",
      children: "Build a local runtime bundle"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "wtt-access-router-runtime build ./src/access-router.config.ts --out-dir dist\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The build statically imports the selected config module and bundles the config import graph into the output. Rebuild after changing the config or anything imported by it."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "build-a-serverless-bundle",
      children: "Build a serverless bundle"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "wtt-access-router-runtime build-serverless ./src/access-router.config.ts --out-dir netlify/functions\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Serverless builds use the same build-time config capture. A deployed cold start does not load or transpile the original config file, so config files and tsconfig path aliases only need to exist during the build."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "start-built-artifacts",
      children: "Start built artifacts"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["These are pass-through wrappers to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "wtt-express-runtime"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "wtt-access-router-runtime start ./dist/app.js --port 3000\nwtt-access-router-runtime start-serverless ./netlify/functions/handler.js --port 9000\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Built local app modules export the Express ", (0,jsx_runtime.jsx)(_components.code, {
        children: "app"
      }), " plus explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "init()"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "shutdown()"
      }), " hooks. Importing one or more built modules does not register process signal handlers. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "start"
      }), " owns the local server lifecycle and is the only component that installs ", (0,jsx_runtime.jsx)(_components.code, {
        children: "SIGINT"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "SIGTERM"
      }), " handlers unless you pass ", (0,jsx_runtime.jsx)(_components.code, {
        children: "--no-signals"
      }), ". On ", (0,jsx_runtime.jsx)(_components.code, {
        children: "SIGINT"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "SIGTERM"
      }), ", the server stops accepting new requests, drains in-flight requests, awaits runtime cleanup, and then exits. If cleanup rejects, the CLI logs the failure to stderr and exits nonzero."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "relationship-to-the-lower-level-packages",
      children: "Relationship To The Lower-Level Packages"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "access-router-runtime"
      }), " does not replace the two core packages. It composes them."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/access-router"
        }), " still owns router generation, permissions, hooks, validation, and OpenAPI metadata."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/express-runtime"
        }), " still owns the Express app factory, local server lifecycle, serverless wrapper, and bundling CLI behavior."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/access-router-runtime"
        }), " adds a config layer so those two packages can be used with less application boilerplate."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The generated local and serverless artifacts capture the config module at build time. They are portable with respect to the original config and tsconfig files, but they do not automatically pick up source-config edits; rebuild after config, config-import, or tsconfig alias changes."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Local artifacts are import-side-effect free for process signal handling. Programmatic consumers should call the exported lifecycle hooks themselves, while the CLI ", (0,jsx_runtime.jsx)(_components.code, {
        children: "start"
      }), " command coordinates HTTP draining and runtime cleanup through the shared ", (0,jsx_runtime.jsx)(_components.code, {
        children: "express-runtime"
      }), " local server."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "If you want full low-level control over app wiring, use the two core packages directly. If your API is mostly generated model/data/root routes, this package is the shorter path."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "loading-a-runtime-instance",
      children: "Loading A Runtime Instance"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you want a fully constructed runtime from a config file path, use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "loadAccessRouterRuntime(...)"
      }), " instead of loading the config and wiring the runtime separately."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { loadAccessRouterRuntime } from '@web-ts-toolkit/access-router-runtime';\n\nconst runtime = loadAccessRouterRuntime('./src/access-router.config.ts');\n\nexport const app = runtime.app;\nexport const handler = runtime.createServerlessHandler();\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Pass ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ tsconfigPath: './tsconfig.json' }"
      }), " as the second argument when your config relies on TypeScript path aliases or compiler options that are not covered by the loader defaults."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "programmatic-runtime-creation",
      children: "Programmatic Runtime Creation"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "If your app already owns the config object in code, create the runtime directly:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import config from './access-router.config';\nimport { createAccessRouterRuntime } from '@web-ts-toolkit/access-router-runtime';\n\nconst runtime = createAccessRouterRuntime(config);\n\nexport const app = runtime.app;\nexport const handler = runtime.createServerlessHandler();\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "runtime.models"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "runtime.modelRouters"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "runtime.dataRouters"
      }), " are readonly snapshots of the registries used during app assembly. Inspect them when you need access to generated models or routers, but do not treat them as extension points after construction. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "runtime.config"
      }), " is also a readonly inspection snapshot; DB URL/options and lifecycle hooks are captured at construction time, so later mutation of the caller-owned config object does not change ", (0,jsx_runtime.jsx)(_components.code, {
        children: "runtime.init()"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "runtime.shutdown()"
      }), " behavior."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "createAccessRouterRuntimeApp(config)"
      }), " exists for simple lifecycle-free configs only. It rejects configs that define ", (0,jsx_runtime.jsx)(_components.code, {
        children: "db"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "init"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "shutdown"
      }), " because it returns only the Express app and has no way to execute database connection or cleanup hooks. If the config has any of those fields, use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createAccessRouterRuntime(config).app"
      }), " and call the runtime lifecycle methods through your server or serverless integration."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Serverless creation is generic over provider event/context types:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "type ProviderEvent = { rawPath: string };\ntype ProviderContext = { requestId: string };\n\nconst handler = runtime.createServerlessHandler<ProviderEvent, ProviderContext>({\n  request(_req, event, context) {\n    event.rawPath;\n    context.requestId;\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "typescript-config-helper",
      children: "TypeScript Config Helper"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The package also publishes ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/access-router-runtime/tsconfig.json"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use it when you want a small shared baseline for runtime-config files:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-json",
        children: "{\n  \"extends\": \"@web-ts-toolkit/access-router-runtime/tsconfig.json\"\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The exported config is intentionally a consumer config baseline: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "target: \"ES2022\""
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "module: \"ESNext\""
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "moduleResolution: \"Bundler\""
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "strict: true"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "verbatimModuleSyntax: true"
      }), ", and Node types. The package source type-checks against the workspace base config, while the published local/serverless artifacts are emitted for Node 22. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dev"
      }), " resolves the config through the trusted loader at startup; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "build"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "build-serverless"
      }), " use the selected tsconfig only during bundling and then capture the config import graph into the output."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "config-shape",
      children: "Config Shape"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Config modules should normally export a default config object:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "export default defineRuntimeConfig({\n  /* ... */\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The loader also accepts a synchronous default factory returning a valid object and a named ", (0,jsx_runtime.jsx)(_components.code, {
        children: "config"
      }), " object export:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "export default function configFactory() {\n  return defineRuntimeConfig({\n    /* ... */\n  });\n}\n\nexport const config = defineRuntimeConfig({\n  /* ... */\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Async factories, promises, thenables, arrays, dates, unrelated-only exports, and modules that mix multiple config export forms are rejected before model registration, router creation, or database connection."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The config object can describe:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "db"
        }), ": a MongoDB connection URL for a runtime-owned connection, or an explicit externally owned ", (0,jsx_runtime.jsx)(_components.code, {
          children: "mongoose.Connection"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "globalOptions"
        }), ": global ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access-router"
        }), " options"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "defaultModelOptions"
        }), ": shared model-router defaults"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "models"
        }), ": model-backed resource routers from ", (0,jsx_runtime.jsx)(_components.code, {
          children: "schema"
        }), " or existing ", (0,jsx_runtime.jsx)(_components.code, {
          children: "model"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "models[].customRoutes"
        }), ": extra model-scoped routes mounted through the model router's ", (0,jsx_runtime.jsx)(_components.code, {
          children: "JsonRouter"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), ": in-memory data routers"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "rootRouter"
        }), ": grouped root batch route"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "openApi"
        }), ": generated JSON and Swagger UI routes"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "extraRoutes"
        }), ": extra Express/access-router routes to mount alongside generated routers"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "express"
        }), ": Express middleware, parser, and error-handler options"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "init"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "shutdown"
        }), ": runtime lifecycle hooks"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "express-composition-order",
      children: "Express Composition Order"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "access-router-runtime"
      }), " uses the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "router"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "routers"
      }), " phase of ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createExpressApp()"
      }), " for routes generated from the config. The public ", (0,jsx_runtime.jsx)(_components.code, {
        children: "express"
      }), " config therefore excludes ", (0,jsx_runtime.jsx)(_components.code, {
        children: "router"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "routers"
      }), "; use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "extraRoutes"
      }), " for additional routes that should sit with generated routes, or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "express.finalize"
      }), " for routes that intentionally run after ", (0,jsx_runtime.jsx)(_components.code, {
        children: "postMiddleware"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The final Express app is assembled in this order:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ol, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "express.preMiddleware"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Built-in JSON and URL-encoded parsers unless disabled"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "express.middleware"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Generated runtime routes in this order: model routers, data routers, root router, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "extraRoutes"
        }), ", OpenAPI router"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "express.postMiddleware"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "express.finalize(app)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "express.errorHandler"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["OpenAPI is mounted in the generated-router phase after model, data, root, and extra routes. This keeps ", (0,jsx_runtime.jsx)(_components.code, {
        children: "postMiddleware"
      }), " useful for 404 catch-alls without shadowing generated endpoints, while allowing ", (0,jsx_runtime.jsx)(_components.code, {
        children: "extraRoutes"
      }), " to claim paths before OpenAPI when needed."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Model definitions can use either:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "model"
        }), ": an already-created Mongoose model"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "schema"
        }), ": a schema plus ", (0,jsx_runtime.jsx)(_components.code, {
          children: "name"
        }), ", so the runtime registers the model for you"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Each model definition must use exactly one form. Existing-model definitions resolve their name from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "model.modelName"
      }), "; if ", (0,jsx_runtime.jsx)(_components.code, {
        children: "name"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "router.modelName"
      }), " is also provided it must match that resolved name. Schema-backed definitions require ", (0,jsx_runtime.jsx)(_components.code, {
        children: "name"
      }), ", may set ", (0,jsx_runtime.jsx)(_components.code, {
        children: "collection"
      }), ", and must not duplicate another model's resolved name or explicit/resolved collection name."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "db.url"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "db.connection"
      }), " are mutually exclusive. When ", (0,jsx_runtime.jsx)(_components.code, {
        children: "db.url"
      }), " is configured, the runtime creates an independent Mongoose connection, opens it during ", (0,jsx_runtime.jsx)(_components.code, {
        children: "runtime.init()"
      }), ", and closes only that owned connection during ", (0,jsx_runtime.jsx)(_components.code, {
        children: "runtime.shutdown()"
      }), " unless ", (0,jsx_runtime.jsx)(_components.code, {
        children: "disconnectOnShutdown: false"
      }), " is set. When ", (0,jsx_runtime.jsx)(_components.code, {
        children: "db.connection"
      }), " is supplied, schema-backed models are registered on that connection, but the runtime does not open or close the externally owned connection."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If neither ", (0,jsx_runtime.jsx)(_components.code, {
        children: "db.url"
      }), " nor ", (0,jsx_runtime.jsx)(_components.code, {
        children: "db.connection"
      }), " is configured, schema-backed models are registered on a runtime-local disconnected connection. Existing supplied ", (0,jsx_runtime.jsx)(_components.code, {
        children: "model"
      }), " values keep using the connection they were created on. Existing supplied models cannot be combined with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "db.url"
      }), "; with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "db.connection"
      }), ", they must belong to that same connection. Runtime-generated model registrations are removed during ", (0,jsx_runtime.jsx)(_components.code, {
        children: "runtime.shutdown()"
      }), ", while existing supplied models are never deleted by the runtime."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The runtime never uses ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mongoose.connect()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mongoose.model()"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mongoose.models"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mongoose.disconnect()"
      }), " for generated models or lifecycle, so unrelated global Mongoose state is not silently reused or disconnected."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The published peer range is ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mongoose >=8 <10"
      }), ". Packed consumer coverage runs the same database ownership and lifecycle contract against Mongoose 8 and 9; future Mongoose majors are intentionally outside the declared range until the matrix covers them."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Runtime lifecycle uses deterministic private states. Concurrent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "runtime.init()"
      }), " calls share one startup, concurrent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "runtime.shutdown()"
      }), " calls share one cleanup, and shutdown requested during pending startup waits for late-created resources to be disconnected before shutdown resolves. After shutdown completes, later ", (0,jsx_runtime.jsx)(_components.code, {
        children: "init()"
      }), " calls reject; after a failed startup or failed shutdown, later lifecycle calls retry from the failed state deterministically."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Startup failure rolls back resources acquired by that attempt. If startup and rollback both fail, the rejection is an ", (0,jsx_runtime.jsx)(_components.code, {
        children: "AggregateError"
      }), " with the primary startup failure first in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "errors"
      }), ", followed by rollback failures. Shutdown runs caller shutdown, config shutdown, and mandatory database cleanup independently where applicable; one cleanup failure is thrown directly, and multiple cleanup failures are surfaced as an ", (0,jsx_runtime.jsx)(_components.code, {
        children: "AggregateError"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Programmatic context collections are readonly snapshots, and lifecycle-sensitive config is captured during runtime construction. Mutate config before calling ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createAccessRouterRuntime(...)"
      }), "; do not rely on post-construction config mutation to change database or lifecycle behavior."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "createAccessRouterRuntimeApp(...)"
      }), " rejects configs with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "db"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "init"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "shutdown"
      }), ". Use the full runtime when lifecycle work is required."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Data definitions must not duplicate ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data[].name"
      }), " or the resolved ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data[].router.dataName"
      }), ". Dev defaults are validated at load time: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dev.watch"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dev.ext"
      }), " must be arrays of strings, and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dev.delay"
      }), " must be a finite integer in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "0..Number.MAX_SAFE_INTEGER"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Migration note: configs that previously relied on promises/async factories, array/date exports, unrelated-only named exports, ambiguous model definitions, duplicate names, existing-model ", (0,jsx_runtime.jsx)(_components.code, {
        children: "collection"
      }), ", non-integer/out-of-range ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dev.delay"
      }), " values, or global Mongoose connection/model reuse must be changed to the validated forms above."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Model definitions can also include ", (0,jsx_runtime.jsx)(_components.code, {
        children: "customRoutes"
      }), " when you need model-specific endpoints alongside the generated CRUD routes."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "customRoutes[].path"
        }), " is relative to the model router ", (0,jsx_runtime.jsx)(_components.code, {
          children: "basePath"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "customRoutes[].method"
        }), " supports ", (0,jsx_runtime.jsx)(_components.code, {
          children: "all"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "get"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "post"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "put"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "patch"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "delete"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "head"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "options"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "customRoutes[].handler"
        }), " uses ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/express-json-router"
        }), " semantics, so returning plain data works"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "customRoutes: [\n  {\n    method: 'get',\n    path: '/:id/profile',\n    handler: async (req) => ({ id: req.params.id, profile: true }),\n  },\n];\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["With ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basePath: '/api/users'"
      }), ", that route mounts at ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/api/users/:id/profile"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "in-repo-example",
      children: "In-Repo Example"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "A copyable starter config lives in the repository:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "https://github.com/egose/web-ts-toolkit/blob/main/packages/access-router-runtime/examples/basic/access-router.config.ts",
          children: "https://github.com/egose/web-ts-toolkit/blob/main/packages/access-router-runtime/examples/basic/access-router.config.ts"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That example shows one model router, one data router, a root router, OpenAPI setup, a model-level custom route, global permissions, and Express finalize/error handling."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "when-to-use-it",
      children: "When To Use It"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router-runtime"
      }), " when you want:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "generated resource REST endpoints with minimal application wiring"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "one config file as the source of truth for DB, routers, and runtime behavior"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "both local and serverless execution without maintaining separate app entry files"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["to keep using ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access-router"
        }), " options for global, root, model, and data routes"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If your app has highly custom Express composition or only uses a small part of ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), ", the lower-level packages may still be a better fit."]
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