"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[195],{

/***/ 6948
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_express_runtime_md_6be_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-express-runtime-md-6be.json
const site_docs_packages_express_runtime_md_6be_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/express-runtime","title":"@web-ts-toolkit/express-runtime","description":"Express app factory plus serverless handler and local dev server helpers.","source":"@site/docs/packages/express-runtime.md","sourceDirName":"packages","slug":"/packages/express-runtime","permalink":"/docs/packages/express-runtime","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":2,"frontMatter":{"sidebar_label":"Express Runtime","sidebar_position":2},"sidebar":"packagesSidebar","previous":{"title":"Express JSON Router","permalink":"/docs/packages/express-json-router"},"next":{"title":"Access Router React","permalink":"/docs/packages/access-router-react"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(5250);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(6574);
;// ./docs/packages/express-runtime.md


const frontMatter = {
	sidebar_label: 'Express Runtime',
	sidebar_position: 2
};
const contentTitle = '@web-ts-toolkit/express-runtime';

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
  "value": "Module API: local server",
  "id": "module-api-local-server",
  "level": 3
}, {
  "value": "Module API: serverless handler",
  "id": "module-api-serverless-handler",
  "level": 3
}, {
  "value": "Error handling and finalize hook",
  "id": "error-handling-and-finalize-hook",
  "level": 3
}, {
  "value": "CLI",
  "id": "cli",
  "level": 2
}, {
  "value": "Local dev",
  "id": "local-dev",
  "level": 3
}, {
  "value": "Dev with env, preload, and watch",
  "id": "dev-with-env-preload-and-watch",
  "level": 3
}, {
  "value": "Build a local runtime bundle",
  "id": "build-a-local-runtime-bundle",
  "level": 3
}, {
  "value": "Start a built local bundle",
  "id": "start-a-built-local-bundle",
  "level": 3
}, {
  "value": "Build a serverless bundle",
  "id": "build-a-serverless-bundle",
  "level": 3
}, {
  "value": "Start a built serverless bundle locally",
  "id": "start-a-built-serverless-bundle-locally",
  "level": 3
}, {
  "value": "Command summary",
  "id": "command-summary",
  "level": 3
}, {
  "value": "<code>createExpressApp(options?)</code>",
  "id": "createexpressappoptions",
  "level": 2
}, {
  "value": "<code>createServerlessHandler(app, options?)</code>",
  "id": "createserverlesshandlerapp-options",
  "level": 2
}, {
  "value": "<code>startLocalServer(app, options?)</code>",
  "id": "startlocalserverapp-options",
  "level": 2
}, {
  "value": "<code>@web-ts-toolkit/express-runtime/cli</code>",
  "id": "web-ts-toolkitexpress-runtimecli",
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
        id: "web-ts-toolkitexpress-runtime",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/express-runtime"
        })
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Express app factory plus serverless handler and local dev server helpers."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use this package when you want one Express app definition that can:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["run locally with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "http.createServer(...)"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "be wrapped as a platform-agnostic serverless handler"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "be built and started through a shared CLI instead of hand-written runtime glue"
      }), "\n"]
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
            children: "npm install @web-ts-toolkit/express-runtime express\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add @web-ts-toolkit/express-runtime express\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add @web-ts-toolkit/express-runtime express\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add @web-ts-toolkit/express-runtime express\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Peer dependency: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "express >= 5"
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-exposes",
      children: "What It Exposes"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Root entrypoint:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "createExpressApp(options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "createServerlessHandler(app, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "startLocalServer(app, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "defaultRequestHook(...)"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["types such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ExpressAppOptions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "RouterMount"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ServerlessHandlerOptions"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Logger"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "CLI binary:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-express-runtime dev"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-express-runtime build"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-express-runtime start"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-express-runtime build-serverless"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-express-runtime start-serverless"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Published subpath:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/express-runtime/cli"
        }), " for reusable CLI parsing, env loading, build, watch, and runtime helpers"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Choose one runtime mode per app instance. If you want both a local server and a serverless export, create them from separate app instances instead of mutating one shared app in two directions."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "module-api-local-server",
      children: "Module API: local server"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\nimport { createExpressApp, startLocalServer } from '@web-ts-toolkit/express-runtime';\n\nconst myRouter = express.Router();\n\nconst app = createExpressApp({\n  routers: [\n    {\n      path: () => '/api',\n      handler: myRouter,\n    },\n  ],\n});\n\nstartLocalServer(app, {\n  port: 8080,\n  host: '0.0.0.0',\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "module-api-serverless-handler",
      children: "Module API: serverless handler"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\nimport { createExpressApp, createServerlessHandler } from '@web-ts-toolkit/express-runtime';\n\nconst myRouter = express.Router();\n\nasync function connectDatabase(): Promise<void> {}\n\nconst app = createExpressApp({\n  routers: [\n    {\n      path: () => (process.env.NODE_ENV === 'production' ? '/.netlify/functions/main' : '/api'),\n      handler: myRouter,\n    },\n  ],\n});\n\nexport const handler = createServerlessHandler(app, {\n  init: async () => {\n    await connectDatabase();\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "error-handling-and-finalize-hook",
      children: "Error handling and finalize hook"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\nimport { createExpressApp } from '@web-ts-toolkit/express-runtime';\n\nconst requestLogger: express.RequestHandler = (_req, _res, next) => next();\nconst authMiddleware: express.RequestHandler = (_req, _res, next) => next();\nconst notFoundMiddleware: express.RequestHandler = (_req, _res, next) => next();\nconst apiRouter = express.Router();\n\nconst app = createExpressApp({\n  middleware: [requestLogger, authMiddleware],\n  routers: [{ path: '/api', handler: apiRouter }],\n  postMiddleware: [notFoundMiddleware],\n  finalize(app) {\n    app.get('/health', (_req, res) => {\n      res.json({ ok: true });\n    });\n  },\n  errorHandler(err, _req, res, _next) {\n    res.status(500).json({\n      message: err instanceof Error ? err.message : 'unexpected server error',\n    });\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "cli",
      children: "CLI"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The CLI runs any module that exports an Express app or a built serverless handler."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "local-dev",
      children: "Local dev"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "npx wtt-express-runtime dev ./dist/app.js --port 3000 --host localhost\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For TypeScript app modules, run the CLI through ", (0,jsx_runtime.jsx)(_components.code, {
        children: "tsx"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "npx tsx ./node_modules/@web-ts-toolkit/express-runtime/dist/cli.js dev ./src/app.ts --env .env\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "dev-with-env-preload-and-watch",
      children: "Dev with env, preload, and watch"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "npx tsx ./node_modules/@web-ts-toolkit/express-runtime/dist/cli.js dev ./src/app.ts \\\n  --env .env \\\n  --require tsconfig-paths/register \\\n  --watch ./src,./shared \\\n  --ext ts,json\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use this when your app module is TypeScript, depends on path aliases, or should restart on source changes."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "build-a-local-runtime-bundle",
      children: "Build a local runtime bundle"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "npx wtt-express-runtime build ./src/app.ts --out-dir dist\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "With an optional init hook:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "npx wtt-express-runtime build ./src/app.ts --init ./src/init.ts --out-dir dist\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "start-a-built-local-bundle",
      children: "Start a built local bundle"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "npx wtt-express-runtime start ./dist/app.js --port 9000 --env .env\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "build-a-serverless-bundle",
      children: "Build a serverless bundle"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "npx wtt-express-runtime build-serverless ./src/app.ts --out-dir netlify/functions\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "start-a-built-serverless-bundle-locally",
      children: "Start a built serverless bundle locally"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "npx wtt-express-runtime start-serverless ./netlify/functions/handler.js --port 9000 --env .env\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "command-summary",
      children: "Command summary"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Command"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Purpose"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "dev"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Run an app module directly as a local dev server"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "build"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Bundle an app module into a local runtime file"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "start"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Start the built local runtime bundle"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "build-serverless"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Bundle an app module into a serverless handler"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "start-serverless"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Run a built serverless handler locally through an adapter"
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Common options worth knowing:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "--env <path>"
        }), " loads one or more env files without overwriting already-set variables"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "--require <module>"
        }), " preloads modules before loading the app"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "--watch <paths>"
        }), " restarts the ", (0,jsx_runtime.jsx)(_components.code, {
          children: "dev"
        }), " command on file changes"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "--out-dir <path>"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "--out-name <name>"
        }), " control build output paths"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "--external <pkg>"
        }), " keeps dependencies external during bundling"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "createexpressappoptions",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "createExpressApp(options?)"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This is the package's central app-construction primitive."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Middleware order:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ol, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "preMiddleware"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "built-in body parsers"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "middleware"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "router"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "routers"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "postMiddleware"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "finalize(app)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "errorHandler"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Built-in defaults:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "x-powered-by"
        }), " is disabled unless ", (0,jsx_runtime.jsx)(_components.code, {
          children: "disablePoweredBy: false"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "etag"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "false"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "trust proxy"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "false"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "express.json()"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ limit: '1mb' }"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "express.urlencoded()"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ extended: false, limit: '1mb' }"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Important options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "preMiddleware"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "middleware"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "postMiddleware"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "json"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "urlencoded"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "router"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "routers"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "trustProxy"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "finalize"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "errorHandler"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "logger"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "RouterMount"
      }), " accepts:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "path: string | () => string"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "handler: RequestHandler"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["That function form is useful when the same app should mount under ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/api"
      }), " locally and a serverless path in production."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Example ", (0,jsx_runtime.jsx)(_components.code, {
        children: "RouterMount"
      }), " usage:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\n\nconst apiRouter = express.Router();\n\nconst app = createExpressApp({\n  routers: [\n    {\n      path: () => (process.env.NODE_ENV === 'production' ? '/.netlify/functions/main' : '/api'),\n      handler: apiRouter,\n    },\n  ],\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "createserverlesshandlerapp-options",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "createServerlessHandler(app, options?)"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Wraps an Express app into a platform-agnostic serverless handler."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Notable behavior:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "init()"
        }), " runs once per cold start and is memoized"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["rejected ", (0,jsx_runtime.jsx)(_components.code, {
          children: "init()"
        }), " results are also memoized until you call ", (0,jsx_runtime.jsx)(_components.code, {
          children: "handler.reset()"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "the default request hook decodes buffered JSON and text bodies before Express sees them"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Important options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "init"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "request"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "response"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "serverlessOptions"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "maxBodyBytes"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "logger"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Netlify-style example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import type { Handler } from '@netlify/functions';\nimport express from 'express';\nimport { createExpressApp, createServerlessHandler } from '@web-ts-toolkit/express-runtime';\n\nconst myRouter = express.Router();\n\nasync function connectDatabase(): Promise<void> {}\n\nconst app = createExpressApp({\n  routers: [{ path: () => '/.netlify/functions/main', handler: myRouter }],\n});\n\nexport const handler: Handler = createServerlessHandler(app, {\n  init: async () => {\n    await connectDatabase();\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "startlocalserverapp-options",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "startLocalServer(app, options?)"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Starts the app with friendly local-server behavior:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "TCP port or named-pipe binding"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["graceful ", (0,jsx_runtime.jsx)(_components.code, {
          children: "SIGINT"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "SIGTERM"
        }), " shutdown by default"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "configurable shutdown timeout for draining in-flight requests"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["optional ", (0,jsx_runtime.jsx)(_components.code, {
          children: "init"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onShutdown"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onListening"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onError"
        }), " hooks"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example with shutdown hooks:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "async function connectDatabase(): Promise<void> {}\nasync function disconnectDatabase(): Promise<void> {}\n\nconst server = startLocalServer(app, {\n  port: 8080,\n  init: async () => {\n    await connectDatabase();\n  },\n  onShutdown: async () => {\n    await disconnectDatabase();\n  },\n  onListening: () => {\n    console.log('server is ready');\n  },\n});\n\nawait server.shutdown();\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "web-ts-toolkitexpress-runtimecli",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/express-runtime/cli"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use the public ", (0,jsx_runtime.jsx)(_components.code, {
        children: "./cli"
      }), " subpath when another package wants the same runtime CLI behavior without shelling out to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "wtt-express-runtime"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "It re-exports the parser and helpers used by the binary, including:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["argument types such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DevArgs"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "BuildArgs"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "StartArgs"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "parseArgs(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "runDevCommand(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "runCliCommand(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "env-loading, module preloading, and build helpers"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This is the same public subpath ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/access-router-runtime"
      }), " builds on for its own config-driven CLI."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "when-to-use-it",
      children: "When To Use It"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/express-runtime"
      }), " when you want:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "a small runtime layer over normal Express apps"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "one app definition that can run locally and in serverless environments"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "shared CLI build/start/dev behavior across packages"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "If you already have a custom runtime with your own entrypoints, bundling, and local server bootstrap, this package may be more abstraction than you need."
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