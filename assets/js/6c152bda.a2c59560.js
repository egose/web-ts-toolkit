"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[977],{

/***/ 2899
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_mdx_6c1_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-mdx-6c1.json
const site_docs_packages_access_router_mdx_6c1_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router","title":"@web-ts-toolkit/access-router","description":"Access-policy Express routers and in-memory data services for Mongoose-backed APIs.","source":"@site/docs/packages/access-router.mdx","sourceDirName":"packages","slug":"/packages/access-router","permalink":"/docs/packages/access-router","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":1,"frontMatter":{"sidebar_label":"Access Router","sidebar_position":1},"sidebar":"packagesSidebar","previous":{"title":"Overview","permalink":"/docs/packages/"},"next":{"title":"Express JSON Router","permalink":"/docs/packages/express-json-router"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(5250);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(6574);
;// ./docs/packages/access-router.mdx


const frontMatter = {
	sidebar_label: 'Access Router',
	sidebar_position: 1
};
const contentTitle = '@web-ts-toolkit/access-router';

const assets = {

};





const toc = [{
  "value": "Installation",
  "id": "installation",
  "level": 2
}, {
  "value": "Quick Start",
  "id": "quick-start",
  "level": 2
}, {
  "value": "TypeScript Support",
  "id": "typescript-support",
  "level": 2
}, {
  "value": "Typed model routers",
  "id": "typed-model-routers",
  "level": 3
}, {
  "value": "Typed data routers",
  "id": "typed-data-routers",
  "level": 3
}, {
  "value": "Typed filters",
  "id": "typed-filters",
  "level": 3
}, {
  "value": "Typed select and populate",
  "id": "typed-select-and-populate",
  "level": 3
}, {
  "value": "Typed defaults",
  "id": "typed-defaults",
  "level": 3
}, {
  "value": "Request and permission augmentation",
  "id": "request-and-permission-augmentation",
  "level": 3
}, {
  "value": "List Responses",
  "id": "list-responses",
  "level": 2
}, {
  "value": "Request Validation",
  "id": "request-validation",
  "level": 2
}, {
  "value": "User-Defined Request Schemas",
  "id": "user-defined-request-schemas",
  "level": 2
}, {
  "value": "Custom Route Validation",
  "id": "custom-route-validation",
  "level": 2
}, {
  "value": "Lifecycle Phases",
  "id": "lifecycle-phases",
  "level": 2
}, {
  "value": "Hook Signatures",
  "id": "hook-signatures",
  "level": 2
}, {
  "value": "<code>baseFilter</code>",
  "id": "basefilter",
  "level": 3
}, {
  "value": "<code>decorate</code>",
  "id": "decorate",
  "level": 3
}, {
  "value": "<code>overrideFilter</code>",
  "id": "overridefilter",
  "level": 3
}, {
  "value": "<code>validate</code>",
  "id": "validate",
  "level": 3
}, {
  "value": "<code>prepare</code>",
  "id": "prepare",
  "level": 3
}, {
  "value": "<code>transform</code>",
  "id": "transform",
  "level": 3
}, {
  "value": "<code>afterPersist</code>",
  "id": "afterpersist",
  "level": 3
}, {
  "value": "<code>beforeDelete</code>",
  "id": "beforedelete",
  "level": 3
}, {
  "value": "<code>afterDelete</code>",
  "id": "afterdelete",
  "level": 3
}, {
  "value": "<code>docPermissions</code>",
  "id": "docpermissions",
  "level": 3
}, {
  "value": "Example",
  "id": "example",
  "level": 3
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
        id: "web-ts-toolkitaccess-router",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/access-router"
        })
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Access-policy Express routers and in-memory data services for Mongoose-backed APIs."
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
            children: "npm install @web-ts-toolkit/access-router express mongoose\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add @web-ts-toolkit/access-router express mongoose\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add @web-ts-toolkit/access-router express mongoose\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add @web-ts-toolkit/access-router express mongoose\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import acl from '@web-ts-toolkit/access-router';\n\nacl.set('globalPermissions', (req) => {\n  return req.headers.user === 'admin' ? ['isAdmin'] : [];\n});\n\nconst router = acl.createDataRouter('fruit', {\n  basePath: '/fruit',\n  data: [{ id: 'apple', name: 'Apple', public: true }],\n  idField: 'id',\n  operationAccess: {\n    list: true,\n    read: true,\n  },\n  permissionSchema: {\n    id: true,\n    name: 'isAdmin',\n    public: true,\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "typescript-support",
      children: "TypeScript Support"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Typed routers carry the model or data shape through filters, selects, defaults, and service accessors."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "typed-model-routers",
      children: "Typed model routers"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import mongoose from 'mongoose';\nimport acl from '@web-ts-toolkit/access-router';\n\ntype User = {\n  name: string;\n  role: string;\n  profile: {\n    city: string;\n  };\n  public: boolean;\n};\n\nconst UserModel = mongoose.model<User>(\n  'User',\n  new mongoose.Schema({\n    name: String,\n    role: String,\n    profile: {\n      city: String,\n    },\n    public: Boolean,\n  }),\n);\n\nconst userRouter = acl.createRouter(UserModel, {\n  basePath: '/users',\n  baseFilter: {\n    list(permissions) {\n      return permissions.isAdmin ? {} : { public: true };\n    },\n  },\n  defaults: {\n    findOptions: {\n      sort: { name: 1 },\n      select: ['name', 'profile.city'],\n    },\n  },\n});\n\nconst service = userRouter.getService(req);\n\nawait service.find({\n  filter: { 'profile.city': 'Berlin' },\n  select: ['name', 'profile.city'],\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "typed-data-routers",
      children: "Typed data routers"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import acl from '@web-ts-toolkit/access-router';\n\ntype Fruit = {\n  id: string;\n  name: string;\n  stock: number;\n  public: boolean;\n};\n\nconst fruitRouter = acl.createDataRouter<Fruit>('fruit', {\n  basePath: '/fruit',\n  idField: 'id',\n  data: [{ id: 'apple', name: 'Apple', stock: 12, public: true }],\n});\n\nconst service = fruitRouter.getService(req);\n\nconst result = await service.findById({\n  id: 'apple',\n  select: ['id', 'name'],\n});\n\nresult.name;\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "typed-filters",
      children: "Typed filters"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "Filter<T>"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DataFilter<T>"
      }), " support dotted paths for nested fields."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const service = userRouter.getService(req);\n\nawait service.find({\n  filter: {\n    role: { $in: ['admin', 'editor'] },\n    'profile.city': 'Berlin',\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["When no model or data type is known, filters still fall back to a loose ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Record<string, unknown>"
      }), " shape."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "typed-select-and-populate",
      children: "Typed select and populate"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Public read and list methods narrow their return types when ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), " is positive and simple enough to model."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const service = userRouter.getPublicService(req);\n\nconst users = await service.find({\n  select: ['name', 'profile.city'],\n  populate: [{ path: 'manager', select: ['name'] }],\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Typing is intentionally conservative:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["positive ", (0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        }), " narrows returned fields"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "exclusion-only or complex select shapes fall back to the broader public output type"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "populate merges selected nested paths, but does not infer foreign model types from runtime refs"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "typed-defaults",
      children: "Typed defaults"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const router = acl.createRouter(UserModel, {\n  defaults: {\n    findOptions: {\n      sort: { name: 1 },\n      filter: { public: true },\n    },\n    findByIdOptions: {\n      select: ['name', 'role'],\n    },\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "request-and-permission-augmentation",
      children: "Request and permission augmentation"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The package exposes augmentable interfaces so hooks can use custom request fields and permission names without manual annotations."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import '@web-ts-toolkit/access-router';\n\ndeclare module '@web-ts-toolkit/access-router' {\n  interface AccessRouterPermissionMap {\n    isAdmin?: boolean;\n  }\n\n  interface AccessRouterRequestExtensions {\n    requestId?: string;\n  }\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "After augmentation, hooks and global permission handlers see those fields automatically:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "acl.setGlobalOptions({\n  globalPermissions(req) {\n    req.requestId = String(req.headers['x-request-id'] ?? 'request');\n    return req.headers.user === 'admin' ? ['isAdmin'] : [];\n  },\n});\n\nacl.createDataRouter('fruit', {\n  decorate(item, permissions) {\n    if (permissions.isAdmin && this.requestId) {\n      return { ...item, requestId: this.requestId };\n    }\n\n    return item;\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "list-responses",
      children: "List Responses"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "List endpoints return a stable envelope:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-json",
        children: "{\n  \"data\": [],\n  \"meta\": {\n    \"returnedCount\": 0,\n    \"skip\": 0,\n    \"limit\": 25,\n    \"page\": 1,\n    \"pageSize\": 25,\n    \"hasPreviousPage\": false\n  }\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["When ", (0,jsx_runtime.jsx)(_components.code, {
        children: "include_count=true"
      }), " is enabled, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "meta"
      }), " also includes total pagination information:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-json",
        children: "{\n  \"data\": [],\n  \"meta\": {\n    \"returnedCount\": 0,\n    \"totalCount\": 100,\n    \"skip\": 25,\n    \"limit\": 25,\n    \"page\": 2,\n    \"pageSize\": 25,\n    \"totalPages\": 4,\n    \"hasNextPage\": true,\n    \"hasPreviousPage\": true\n  }\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Notes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "returnedCount"
        }), " is the number of rows in this response."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "totalCount"
        }), " is only included when ", (0,jsx_runtime.jsx)(_components.code, {
          children: "include_count=true"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "include_extra_headers=true"
        }), " can still add the total count header, but it does not change the response body shape."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["When ", (0,jsx_runtime.jsx)(_components.code, {
        children: "include_extra_headers=true"
      }), " is enabled, the response can also include these headers:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-returned-count"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-page"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-page-size"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-has-previous-page"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["When ", (0,jsx_runtime.jsx)(_components.code, {
        children: "include_count=true"
      }), " is also enabled:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-total-count"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-total-pages"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "wtt-has-next-page"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "request-validation",
      children: "Request Validation"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Public router endpoints validate request path params, known query params, and top-level request body shapes before calling the service layer."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Examples:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "GET /users/:id?try_list=false"
        }), " validates ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "try_list"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "GET /pets?include_count=true&limit=10"
        }), " validates boolean and pagination query params"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "POST /users/__mutation"
        }), " requires a top-level ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), " field"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "POST /users/__query/:id"
        }), " validates advanced ", (0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "populate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "include"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "tasks"
        }), " shapes"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Invalid requests return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "400 application/problem+json"
      }), " with structured ", (0,jsx_runtime.jsx)(_components.code, {
        children: "errors"
      }), " entries using ", (0,jsx_runtime.jsx)(_components.code, {
        children: "parameter"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pointer"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-json",
        children: "{\n  \"title\": \"Bad Request\",\n  \"detail\": \"Bad Request\",\n  \"status\": 400,\n  \"errors\": [\n    {\n      \"parameter\": \"include_count\",\n      \"detail\": \"Invalid option: expected one of \\\"true\\\"|\\\"false\\\"\"\n    }\n  ]\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "user-defined-request-schemas",
      children: "User-Defined Request Schemas"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Model and data routers can add route-specific Zod validation through the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requestSchemas"
      }), " option."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use this when you want stricter application-level request validation on top of the built-in router boundary validation."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Recommended shape:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["whole-body schemas: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.<route>"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.<route>.default"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["nested advanced mutation payloads: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.<route>.data"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Model router examples:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.create"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.update"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.upsert"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.count"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.distinct"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.advancedList"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.advancedReadFilter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.advancedRead"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.advancedCreate.default"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.advancedCreate.data"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.advancedUpdate.default"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.advancedUpdate.data"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.advancedUpsert.default"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.advancedUpsert.data"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.subList"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.subRead"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.subCreate"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.subUpdate"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.subBulkUpdate"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Data router examples:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.advancedList"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.advancedReadFilter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas.advancedRead"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { z } from 'zod';\nimport acl from '@web-ts-toolkit/access-router';\n\nconst router = acl.createRouter('User', {\n  basePath: '/users',\n  idField: 'name',\n  requestSchemas: {\n    create: z.object({\n      name: z.string().min(3),\n      role: z.string(),\n    }),\n    advancedCreate: {\n      data: z.object({\n        name: z.string().min(3),\n        role: z.literal('user'),\n      }),\n    },\n    advancedUpdate: {\n      data: z.object({\n        role: z.enum(['manager', 'staff']),\n      }),\n    },\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Validation order:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "built-in route/query/body-shape validation runs first"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["user-defined ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas"
        }), " validation runs second"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["write-operation model ", (0,jsx_runtime.jsx)(_components.code, {
          children: "validate"
        }), " hooks still run afterward in the service layer"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "custom-route-validation",
      children: "Custom Route Validation"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The package also exports the same validation helpers used by the built-in public routers:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "parsePathParam"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "parseQuery"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "parseBody"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["advanced body schemas such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "listBodySchema"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "readByIdBodySchema"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedCreateBodySchema"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedUpdateBodySchema"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import acl, {\n  parseBody,\n  parsePathParam,\n  parseQuery,\n  requestSchemas,\n  readByIdBodySchema,\n} from '@web-ts-toolkit/access-router';\n\nconst router = acl.createRouter('User', {\n  basePath: '/users',\n});\n\nrouter.router.post('/custom/:id', async (req) => {\n  const id = parsePathParam(req.params.id, 'id');\n  const { include_permissions } = parseQuery(requestSchemas.readQuery, req.query);\n  const body = parseBody(readByIdBodySchema, req.body);\n\n  return {\n    id,\n    includePermissions: include_permissions === 'true',\n    body,\n  };\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["These helpers throw the same ", (0,jsx_runtime.jsx)(_components.code, {
        children: "BadRequestError"
      }), " shape as the built-in router endpoints, so custom routes can stay consistent with the package defaults."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "lifecycle-phases",
      children: "Lifecycle Phases"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Model router hooks are grouped by lifecycle phase:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["access and query shaping: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "operationAccess"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "overrideFilter"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "baseFilter"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["pre-write: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "validate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "prepare"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "transform"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["post-persist: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "afterPersist"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["update diff side effects: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onChange"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["delete lifecycle: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "beforeDelete"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "afterDelete"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["response shaping: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "docPermissions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "decorate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "decorateAll"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Effective model-router flows:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["create: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "operationAccess -> validate -> prepare -> create -> afterPersist -> docPermissions -> decorate"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["update: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "operationAccess -> overrideFilter/baseFilter -> validate -> prepare -> transform -> save -> afterPersist -> onChange -> docPermissions -> decorate"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["delete: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "operationAccess -> overrideFilter/baseFilter -> beforeDelete -> delete -> afterDelete"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["read/list: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "operationAccess -> overrideFilter/baseFilter -> docPermissions -> decorate -> decorateAll"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "hook-signatures",
      children: "Hook Signatures"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The most common model hooks are called with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "this"
      }), " bound to the current Express request."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "basefilter",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "baseFilter"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "(this: express.Request, permissions: Permissions) =>\n  | Filter\n  | true\n  | null\n  | undefined\n  | Promise<Filter | true | null | undefined>\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Return a ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Filter"
        }), " to restrict access."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Return ", (0,jsx_runtime.jsx)(_components.code, {
          children: "true"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "undefined"
        }), " for no extra base filter."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Return ", (0,jsx_runtime.jsx)(_components.code, {
          children: "false"
        }), " to deny access."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "decorate",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "decorate"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "(this: express.Request, value: unknown, permissions: Permissions, context: MiddlewareContext) =>\n  unknown | Promise<unknown>;\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Runs after a document has been loaded and trimmed."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Can also be an array of hook functions."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "overridefilter",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "overrideFilter"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "(this: express.Request, filter: Filter, permissions: Permissions) => Filter | Promise<Filter>;\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Runs before the base filter is applied."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Use it to rewrite or augment the caller-provided filter."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "validate",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "validate"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "(this: express.Request, allowedData: unknown, permissions: Permissions, context: MiddlewareContext) => boolean | unknown[] | Promise<boolean | unknown[]>\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Return ", (0,jsx_runtime.jsx)(_components.code, {
          children: "true"
        }), " to allow the write."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Return ", (0,jsx_runtime.jsx)(_components.code, {
          children: "false"
        }), " to reject it."]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Return an array to provide validation errors."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "prepare",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "prepare"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "(this: express.Request, value: unknown, permissions: Permissions, context: MiddlewareContext) =>\n  unknown | Promise<unknown>;\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Runs before create or update data is assigned to the document."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Can also be an array of hook functions."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "transform",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "transform"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "(this: express.Request, value: unknown, permissions: Permissions, context: MiddlewareContext) =>\n  unknown | Promise<unknown>;\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Runs during update flows before the document is saved."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Can also be an array of hook functions."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "afterpersist",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "afterPersist"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "(this: express.Request, value: unknown, permissions: Permissions, context: MiddlewareContext) =>\n  unknown | Promise<unknown>;\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Runs after create or update persistence work and before response decoration."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Can also be an array of hook functions."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "beforedelete",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "beforeDelete"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "(this: express.Request, value: unknown, permissions: Permissions, context: MiddlewareContext) =>\n  void | Promise<void>;\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Runs after the target document has been loaded and authorized, before deletion."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Use it for last-minute checks or side effects that need the live document."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "afterdelete",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "afterDelete"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "(this: express.Request, value: unknown, permissions: Permissions, context: MiddlewareContext) =>\n  void | Promise<void>;\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Runs after deletion succeeds."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Use it for audit logs, cache invalidation, and external notifications."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "docpermissions",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "docPermissions"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "(this: express.Request, doc: unknown, permissions: Permissions, context: MiddlewareContext) =>\n  Record<string, unknown> | Promise<Record<string, unknown>>;\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Returns the document-level permission object written to the configured permission field."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "example",
      children: "Example"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "acl.createModelRouter('Post', {\n  baseFilter: {\n    read(this, permissions) {\n      if (permissions.has('isAdmin')) return true;\n      return { published: true };\n    },\n  },\n  validate: {\n    create(this, data) {\n      if (!data || typeof data !== 'object' || !('title' in data)) {\n        return ['title is required'];\n      }\n\n      return true;\n    },\n  },\n  prepare: {\n    create(this, data) {\n      if (typeof data === 'object' && data) {\n        return { ...data, createdAt: new Date() };\n      }\n\n      return data;\n    },\n  },\n  transform: {\n    update(this, doc) {\n      return doc;\n    },\n  },\n  afterPersist: {\n    update(this, doc) {\n      return doc;\n    },\n  },\n  afterDelete(this, doc) {\n    console.log('deleted', doc);\n  },\n  decorate: {\n    read(this, doc) {\n      const record = typeof doc === 'object' && doc ? doc : {};\n      return { ...record, summary: '...' };\n    },\n  },\n  overrideFilter: {\n    read(this, filter) {\n      return filter ?? {};\n    },\n  },\n  docPermissions: {\n    read(this, doc, permissions) {\n      return {\n        canArchive: permissions.has('isAdmin'),\n      };\n    },\n  },\n});\n"
      })
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