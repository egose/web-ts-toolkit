"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[264],{

/***/ 6657
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_client_adapter_mdx_613_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-client-adapter-mdx-613.json
const site_docs_packages_access_router_client_adapter_mdx_613_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router-client/adapter","title":"Adapter And Setup","description":"createAdapter(...) is the entrypoint for this package.","source":"@site/docs/packages/access-router-client/adapter.mdx","sourceDirName":"packages/access-router-client","slug":"/packages/access-router-client/adapter","permalink":"/docs/packages/access-router-client/adapter","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":2,"frontMatter":{"sidebar_label":"Adapter And Setup","sidebar_position":2},"sidebar":"packagesSidebar","previous":{"title":"Overview","permalink":"/docs/packages/access-router-client/"},"next":{"title":"Services","permalink":"/docs/packages/access-router-client/services"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
;// ./docs/packages/access-router-client/adapter.mdx


const frontMatter = {
	sidebar_label: 'Adapter And Setup',
	sidebar_position: 2
};
const contentTitle = 'Adapter And Setup';

const assets = {

};



const toc = [{
  "value": "Basic Setup",
  "id": "basic-setup",
  "level": 2
}, {
  "value": "Adapter Options",
  "id": "adapter-options",
  "level": 2
}, {
  "value": "Matching Server Paths",
  "id": "matching-server-paths",
  "level": 2
}, {
  "value": "Creating Services",
  "id": "creating-services",
  "level": 2
}, {
  "value": "Model services",
  "id": "model-services",
  "level": 3
}, {
  "value": "Data services",
  "id": "data-services",
  "level": 3
}, {
  "value": "Service Defaults",
  "id": "service-defaults",
  "level": 2
}, {
  "value": "Root Batching With <code>group(...)</code>",
  "id": "root-batching-with-group",
  "level": 2
}, {
  "value": "Wrapped Endpoints",
  "id": "wrapped-endpoints",
  "level": 2
}, {
  "value": "Cache Behavior",
  "id": "cache-behavior",
  "level": 2
}, {
  "value": "Adapter-Level vs Service-Level Wrap Helpers",
  "id": "adapter-level-vs-service-level-wrap-helpers",
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
    p: "p",
    pre: "pre",
    ul: "ul",
    ...(0,lib/* useMDXComponents */.R)(),
    ...props.components
  };
  return (0,jsx_runtime.jsxs)(jsx_runtime.Fragment, {
    children: [(0,jsx_runtime.jsx)(_components.header, {
      children: (0,jsx_runtime.jsx)(_components.h1, {
        id: "adapter-and-setup",
        children: "Adapter And Setup"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "createAdapter(...)"
      }), " is the entrypoint for this package."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "It creates:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "a configured Axios instance"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "factory methods for model and data services"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["generic ", (0,jsx_runtime.jsx)(_components.code, {
          children: "wrapGet"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "wrapPost"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "wrapPut"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "wrapPatch"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "wrapDelete"
        }), " helpers"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "group(...)"
        }), " for root-router batching"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "basic-setup",
      children: "Basic Setup"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createAdapter } from '@web-ts-toolkit/access-router-client';\n\nconst adapter = createAdapter(\n  {\n    baseURL: 'http://localhost:3000/api',\n    withCredentials: true,\n    headers: {\n      Authorization: 'Bearer token',\n    },\n  },\n  {\n    rootRouterPath: 'root',\n    throwOnError: false,\n    cacheTTL: 30_000,\n  },\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Default Axios config applied by the adapter:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "baseURL: '/api'"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "timeout: 0"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "withCredentials: true"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "Cache-Control: no-cache"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "Pragma: no-cache"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "Expires: 0"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Your ", (0,jsx_runtime.jsx)(_components.code, {
        children: "axiosConfig"
      }), " is merged on top of those defaults."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "adapter-options",
      children: "Adapter Options"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "createAdapter(axiosConfig?, adapterOptions?)"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Supported adapter options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "rootRouterPath?: string"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "onSuccess?: (res) => void"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "onFailure?: (res) => void"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "throwOnError?: boolean"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "cacheTTL?: number"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Behavior notes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "rootRouterPath"
        }), " must match the path used by your server-side root router"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "throwOnError"
        }), " becomes the default for services created by this adapter"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "onSuccess"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onFailure"
        }), " run after the client normalizes the response"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "cacheTTL > 0"
        }), " installs in-memory Axios interceptors for cacheable requests"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "matching-server-paths",
      children: "Matching Server Paths"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The adapter itself only knows the API root. Individual services provide the router-relative paths."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "// server routes\n// /api/users\n// /api/users/__query\n// /api/users/__mutation\n// /api/root\n\nconst adapter = createAdapter(\n  { baseURL: 'http://localhost:3000/api' },\n  { rootRouterPath: 'root' },\n);\n\nconst userService = adapter.createModelService({\n  modelName: 'User',\n  basePath: 'users',\n  queryPath: '__query',\n  mutationPath: '__mutation',\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "If those paths are out of sync with the server, the client will fail in ways that look like missing-route or invalid-body errors."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "creating-services",
      children: "Creating Services"
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "model-services",
      children: "Model services"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "interface User {\n  _id?: string;\n  name: string;\n  role: string;\n  public: boolean;\n}\n\nconst userService = adapter.createModelService<User>({\n  modelName: 'User',\n  basePath: 'users',\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Model service options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "modelName: string"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "basePath: string"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "queryPath?: string"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "__query"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "mutationPath?: string"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "__mutation"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "onSuccess?: ResponseCallback"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "onFailure?: ResponseCallback"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "throwOnError?: boolean"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use custom ", (0,jsx_runtime.jsx)(_components.code, {
        children: "queryPath"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mutationPath"
      }), " only when your server uses non-default route segments."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "data-services",
      children: "Data services"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "interface Fruit {\n  id: string;\n  name: string;\n  public: boolean;\n}\n\nconst fruitService = adapter.createDataService<Fruit>({\n  dataName: 'fruit',\n  basePath: 'fruit',\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Data service options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "dataName: string"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "basePath: string"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "queryPath?: string"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "__query"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "onSuccess?: ResponseCallback"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "onFailure?: ResponseCallback"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "throwOnError?: boolean"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "service-defaults",
      children: "Service Defaults"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Both service factories accept a second ", (0,jsx_runtime.jsx)(_components.code, {
        children: "defaults"
      }), " argument."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That lets you centralize common args and options instead of repeating them on every call."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const userService = adapter.createModelService<User>(\n  {\n    modelName: 'User',\n    basePath: 'users',\n  },\n  {\n    listAdvancedArgs: {\n      select: ['name', 'role'],\n      limit: 25,\n    },\n    listAdvancedOptions: {\n      includeCount: true,\n      skim: true,\n    },\n    readOptions: {\n      includePermissions: true,\n    },\n  },\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The service method call still wins if you pass explicit values later."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Defaults are most useful when:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "every list should include counts"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "every read should include permissions"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "most advanced reads share the same default projection"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "you want one service instance tuned for admin flows and another for public flows"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h2, {
      id: "root-batching-with-group",
      children: ["Root Batching With ", (0,jsx_runtime.jsx)(_components.code, {
        children: "group(...)"
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "adapter.group(...)"
      }), " batches multiple lazy requests into one root-router request."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const grouped = await adapter.group(\n  userService.readAdvanced('user-1', { select: ['name'] }),\n  userService.countAdvanced({ public: true }),\n  fruitService.list({ limit: 5 }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Important rules:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "only pass lazy requests returned from this client package"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "every grouped request must share the same Axios request config"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["the requests are serialized into root-router query metadata and sent to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "rootRouterPath"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Practical consequences:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["if one grouped request uses ", (0,jsx_runtime.jsx)(_components.code, {
          children: "headers: { user: 'admin' }"
        }), ", every grouped request should use that same config"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "mixing different auth headers or different request-scoped permission headers in one batch will throw before the request is sent"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["grouped requests preserve order, so ", (0,jsx_runtime.jsx)(_components.code, {
          children: "group(a, b, c)"
        }), " returns results for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "a"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "b"
        }), ", then ", (0,jsx_runtime.jsx)(_components.code, {
          children: "c"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The grouped result is an array of normalized response objects in the same order as the input requests."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "wrapped-endpoints",
      children: "Wrapped Endpoints"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The adapter can also wrap arbitrary endpoints that are not part of a model or data service."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const getApple = adapter.wrapGet<{ name: string }>('/apple/{{name}}');\n\nconst result = await getApple({\n  pathParams: { name: 'green' },\n  queryParams: { includeSeeds: true },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Supported methods:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wrapGet(url, defaultAxiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wrapPost(url, defaultAxiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wrapPut(url, defaultAxiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wrapPatch(url, defaultAxiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wrapDelete(url, defaultAxiosRequestConfig?)"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Path and query behavior:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "{{token}}"
        }), " placeholders in the URL are replaced from ", (0,jsx_runtime.jsx)(_components.code, {
          children: "pathParams"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "queryParams"
        }), " become Axios ", (0,jsx_runtime.jsx)(_components.code, {
          children: "params"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "per-call Axios config is merged with the wrapper default config"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This is useful when:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["your API mostly uses ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access-router"
        }), ", but still exposes a few custom endpoints"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "you want to keep one shared Axios instance and auth setup"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "you want cache handling and base URL behavior to stay consistent across all requests"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "cache-behavior",
      children: "Cache Behavior"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["When ", (0,jsx_runtime.jsx)(_components.code, {
        children: "cacheTTL > 0"
      }), ", the adapter installs a simple in-memory cache for requests whose internal cache header is not disabled."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Practical behavior:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "read-style wrappers default to cacheable requests"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "mutation-style wrappers default to cache-disabled requests"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["service methods can opt out of cache by passing ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ignoreCache: true"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "cache keys include URL, method, params, body, and non-ignored headers"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The cache is scoped to the Axios instance created by that adapter. Two adapters do not share a cache."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Headers matter intentionally here. If your app varies results by headers such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Authorization"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "user"
      }), ", those headers participate in the cache key unless they are part of the small ignored-header set."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This keeps cached admin and non-admin reads from being treated as the same response."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "adapter-level-vs-service-level-wrap-helpers",
      children: "Adapter-Level vs Service-Level Wrap Helpers"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "You can wrap endpoints from the adapter or from a service."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use adapter-level wrap helpers when the path is already rooted from the adapter base URL:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "adapter.wrapGet('reports/{{id}}');\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use service-level wrap helpers when the endpoint should be relative to a service base path:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "userService.wrapPost('chairman');\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "For service-level wrappers, the service base path is prepended automatically."
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