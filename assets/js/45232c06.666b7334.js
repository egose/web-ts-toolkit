"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[876],{

/***/ 2029
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
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(5250);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(6574);
;// ./docs/packages/access-router-deco.md


const frontMatter = {
	sidebar_label: 'Access Router Deco',
	sidebar_position: 13
};
const contentTitle = '@web-ts-toolkit/access-router-deco';

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
  "value": "Runtime Ownership",
  "id": "runtime-ownership",
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
  "value": "Property Decorator",
  "id": "property-decorator",
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
        }), " through ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/access-router"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "reflect-metadata"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Importing ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/access-router-deco"
      }), " initializes ", (0,jsx_runtime.jsx)(_components.code, {
        children: "reflect-metadata"
      }), " once before the package decorators run."]
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
        children: ["hook decorators such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "GlobalPermissions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DocPermissions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Validate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Prepare"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Transform"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "RouteGuard"
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
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\nimport mongoose from 'mongoose';\nimport {\n  Module,\n  Router,\n  RouterOptions,\n  GlobalPermissions,\n  DocPermissions,\n  Validate,\n  Request,\n  Document,\n  Permissions,\n  EgoseFactory,\n} from '@web-ts-toolkit/access-router-deco';\n\nmongoose.model('User', new mongoose.Schema({ email: String, name: String, public: Boolean }));\n\n@Router('User', {\n  basePath: '/users',\n})\nclass UserRouter {\n  @DocPermissions('read')\n  canRead(@Document() doc: any, @Permissions() permissions: { has(permission: string): boolean }) {\n    return { read: doc.public || permissions.has('isAdmin') };\n  }\n\n  @Validate('create')\n  validateCreate(@Document() doc: any) {\n    if (!doc.email) {\n      throw new Error('email is required');\n    }\n\n    return doc;\n  }\n}\n\n@RouterOptions({\n  operationAccess: {\n    list: true,\n    read: true,\n  },\n})\nclass DefaultOptions {}\n\n@Module({\n  routers: [UserRouter],\n  routerOptions: [DefaultOptions],\n  options: {\n    basePath: '/api',\n  },\n})\nclass AppModule {\n  @GlobalPermissions()\n  permissions(@Request() req: express.Request) {\n    return req.headers['x-role'] === 'admin' ? ['isAdmin'] : [];\n  }\n}\n\nconst app = express();\nEgoseFactory.bootstrap(AppModule, app);\n"
      })
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
      id: "typescript-decorator-configuration",
      children: "TypeScript Decorator Configuration"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This package uses TypeScript legacy decorators, including parameter decorators. Compile consumers with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "experimentalDecorators: true"
      }), " and use a compiler/transpiler that preserves legacy class, method, property, and parameter decorators. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "emitDecoratorMetadata"
      }), " is supported but not required for injection. Consumers must install the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "reflect-metadata"
      }), " peer dependency; importing this package initializes it once before package decorators run."]
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
      }), " option keys."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Decorator"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Maps to"
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
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@DocPermissions(...)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "docPermissions.*"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@BaseFilter(...)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "baseFilter.*"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@OverrideFilter(...)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "overrideFilter.*"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@Validate(...)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "validate.*"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@Prepare(...)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "prepare.*"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@Transform(...)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "transform.*"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@AfterPersist(...)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "afterPersist.*"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@Decorate(...)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "decorate.*"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@DecorateAll(...)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "decorateAll.*"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "@RouteGuard(...)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "operationAccess.*"
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
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "parameter-decorators",
      children: "Parameter Decorators"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Hook methods can declare only the inputs they need."
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@Request()"
        }), " injects the active request for global permission hooks"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@Document()"
        }), " injects the document payload or current document"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@Permissions()"
        }), " injects resolved permissions"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@Context()"
        }), " injects the hook context from ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access-router"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@Filter()"
        }), " injects the current filter for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@OverrideFilter(...)"
        }), " hooks"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@Id()"
        }), " injects the route identifier for ", (0,jsx_runtime.jsx)(_components.code, {
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
      id: "property-decorator",
      children: "Property Decorator"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "@Option(...)"
      }), " copies a class property value onto global, default-model, or model-specific options during bootstrap."]
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
        children: "EgoseFactory.bootstrap(...)"
      }), " reads the decorator metadata and mounts the resulting routers onto an Express app."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const app = express();\n\nEgoseFactory.bootstrap(AppModule, app);\n"
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