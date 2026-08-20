"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[600],{

/***/ 8328
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_react_md_f13_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-react-md-f13.json
const site_docs_packages_access_router_react_md_f13_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router-react","title":"@web-ts-toolkit/access-router-react","description":"React hooks for @web-ts-toolkit/access-router-client model services.","source":"@site/docs/packages/access-router-react.md","sourceDirName":"packages","slug":"/packages/access-router-react","permalink":"/docs/packages/access-router-react","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":12,"frontMatter":{"sidebar_label":"Access Router React","sidebar_position":12},"sidebar":"packagesSidebar","previous":{"title":"TypeScript And Errors","permalink":"/docs/packages/access-router-client/typescript-and-errors"},"next":{"title":"Access Router Deco","permalink":"/docs/packages/access-router-deco"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(5250);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(6574);
;// ./docs/packages/access-router-react.md


const frontMatter = {
	sidebar_label: 'Access Router React',
	sidebar_position: 12
};
const contentTitle = '@web-ts-toolkit/access-router-react';

const assets = {

};





const toc = [{
  "value": "Installation",
  "id": "installation",
  "level": 2
}, {
  "value": "Factory",
  "id": "factory",
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
  "value": "Query Hooks",
  "id": "query-hooks",
  "level": 2
}, {
  "value": "<code>useRead</code>",
  "id": "useread",
  "level": 3
}, {
  "value": "<code>useList</code>",
  "id": "uselist",
  "level": 3
}, {
  "value": "<code>useCount</code>",
  "id": "usecount",
  "level": 3
}, {
  "value": "<code>useDistinct</code>",
  "id": "usedistinct",
  "level": 3
}, {
  "value": "Mutation Hooks",
  "id": "mutation-hooks",
  "level": 2
}, {
  "value": "<code>useCreate</code>",
  "id": "usecreate",
  "level": 3
}, {
  "value": "<code>useUpdate</code>",
  "id": "useupdate",
  "level": 3
}, {
  "value": "<code>useUpsert</code>",
  "id": "useupsert",
  "level": 3
}, {
  "value": "<code>useDelete</code>",
  "id": "usedelete",
  "level": 3
}, {
  "value": "Lifecycle",
  "id": "lifecycle",
  "level": 2
}, {
  "value": "Loading flags",
  "id": "loading-flags",
  "level": 3
}, {
  "value": "Failure handling",
  "id": "failure-handling",
  "level": 3
}, {
  "value": "Cancellation",
  "id": "cancellation",
  "level": 3
}, {
  "value": "<code>previousData</code> lifecycle (<code>useList</code> only)",
  "id": "previousdata-lifecycle-uselist-only",
  "level": 3
}, {
  "value": "<code>reset()</code>",
  "id": "reset",
  "level": 3
}, {
  "value": "<code>refetch()</code> and <code>query()</code>",
  "id": "refetch-and-query",
  "level": 3
}, {
  "value": "Concurrent Mutations",
  "id": "concurrent-mutations",
  "level": 2
}, {
  "value": "Projection Typing",
  "id": "projection-typing",
  "level": 2
}, {
  "value": "Dependency-Key Policy",
  "id": "dependency-key-policy",
  "level": 2
}, {
  "value": "What participates in the key",
  "id": "what-participates-in-the-key",
  "level": 3
}, {
  "value": "What is NOT a key input",
  "id": "what-is-not-a-key-input",
  "level": 3
}, {
  "value": "Unsupported values",
  "id": "unsupported-values",
  "level": 3
}, {
  "value": "Importing the helper",
  "id": "importing-the-helper",
  "level": 3
}, {
  "value": "Active Record Integration",
  "id": "active-record-integration",
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
    em: "em",
    h1: "h1",
    h2: "h2",
    h3: "h3",
    header: "header",
    li: "li",
    p: "p",
    pre: "pre",
    strong: "strong",
    ul: "ul",
    ...(0,lib/* useMDXComponents */.R)(),
    ...props.components
  };
  return (0,jsx_runtime.jsxs)(jsx_runtime.Fragment, {
    children: [(0,jsx_runtime.jsx)(_components.header, {
      children: (0,jsx_runtime.jsx)(_components.h1, {
        id: "web-ts-toolkitaccess-router-react",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/access-router-react"
        })
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["React hooks for ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/access-router-client"
      }), " model services."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "createModelHooks(modelService)"
      }), " binds one ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelService"
      }), " to eight hooks covering read, list, count, distinct, create, update, upsert, and delete. Each hook instance owns its own local state — there is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "no shared cache, no deduplication, no invalidation, and no retry"
      }), ". Two components calling ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useRead({ id: '1' })"
      }), " against the same ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelService"
      }), " issue two independent requests and store two independent copies of the result. If you need cache orchestration, layer these services underneath a query library."]
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
            children: "npm install react @web-ts-toolkit/access-router-react @web-ts-toolkit/access-router-client\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add react @web-ts-toolkit/access-router-react @web-ts-toolkit/access-router-client\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add react @web-ts-toolkit/access-router-react @web-ts-toolkit/access-router-client\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add react @web-ts-toolkit/access-router-react @web-ts-toolkit/access-router-client\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Peer dependencies: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "react ^18 || ^19"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/access-router-client"
      }), ". The package's own test suite runs a React 18 verification lane alongside the React 19 primary lane."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "factory",
      children: "Factory"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "import { createAdapter } from '@web-ts-toolkit/access-router-client';\nimport { createModelHooks } from '@web-ts-toolkit/access-router-react';\n\nconst adapter = createAdapter({ baseURL: 'https://api.example.com' });\n\nconst organizationService = adapter.createModelService<Organization>({\n  modelName: 'Organization',\n  basePath: 'organizations',\n});\n\nconst { useRead, useList, useCount, useDistinct, useCreate, useUpdate, useUpsert, useDelete } = createModelHooks({\n  modelService: organizationService,\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Call ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createModelHooks"
      }), " once, outside any component, with a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelService<T>"
      }), " from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "adapter.createModelService<T>({ modelName, basePath })"
      }), ". The returned hooks are bound to that one service for their lifetime; do not call the factory inside a component. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Organization"
      }), " is your own model interface extending the client's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Document"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-exposes",
      children: "What It Exposes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "createModelHooks(...)"
        }), " — the factory."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["query hooks: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useRead"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useList"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useCount"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useDistinct"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["mutation hooks: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useCreate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useUpdate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useUpsert"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useDelete"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["hook option and result types for the query and mutation APIs (e.g. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "UseReadQueryOptions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "UseCreateMutateResult"
        }), ")"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "requestKeyFor(value)"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "RequestKeyError"
        }), " — the public dependency-key helper"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["projection-aware result helpers: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ProjectedShape"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ProjectedShapeArray"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ProjectedModelResponse"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ProjectedListModelResponse"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "import { createAdapter } from '@web-ts-toolkit/access-router-client';\nimport { createModelHooks } from '@web-ts-toolkit/access-router-react';\n\nconst adapter = createAdapter({ baseURL: 'https://api.example.com' });\n\nconst organizationService = adapter.createModelService<Organization>({\n  modelName: 'Organization',\n  basePath: 'organizations',\n});\n\nconst { useList, useRead, useCreate, useUpdate, useDelete } = createModelHooks({\n  modelService: organizationService,\n});\n\nfunction OrganizationList() {\n  const { data, isLoading, error } = useList({\n    listParams: { pageSize: 20 },\n  });\n\n  if (isLoading) return <p>Loading...</p>;\n  if (error) return <p>Error: {error.message}</p>;\n\n  return (\n    <ul>\n      {data.map((org) => (\n        <li key={org._id}>{org.name}</li>\n      ))}\n    </ul>\n  );\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "query-hooks",
      children: "Query Hooks"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "useRead"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useList"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useCount"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useDistinct"
      }), " auto-fetch when their ", (0,jsx_runtime.jsx)(_components.code, {
        children: "enabled"
      }), " flag is true (the default) and the key inputs are present. They each expose ", (0,jsx_runtime.jsx)(_components.code, {
        children: "query(...)"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "refetch()"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "reset()"
      }), " alongside the result state."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "useread",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "useRead"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const { data, isLoading, isFetching, error, query, refetch, reset } = useRead({\n  id: 'org_123',\n  advanced: true,\n  select: ['name', 'status'],\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Important options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "id"
        }), " controls auto-fetching. Set ", (0,jsx_runtime.jsx)(_components.code, {
          children: "enabled: false"
        }), " (or remove ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id"
        }), ") to disable."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "advanced: true"
        }), " switches to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "readAdvanced(...)"
        }), ", which forwards ", (0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "populate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sort"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "include"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "tasks"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "basicOptions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedOptions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "enabled"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "initialData"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requestConfig"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onSuccess"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onError"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onSettled"
        }), " control request behavior."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "query(id, { signal })"
        }), " re-runs the read imperatively; ", (0,jsx_runtime.jsx)(_components.code, {
          children: "refetch()"
        }), " re-runs with the current options. Both return a promise that rejects with a ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ServiceError"
        }), " on failure."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "uselist",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "useList"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const { data, previousData, totalCount, isLoading, isFetching, error, query, refetch, reset } = useList({\n  listParams: { pageSize: 20 },\n  filter: { status: 'active' },\n  advanced: true,\n  sort: { name: 1 },\n  keepPreviousData: true,\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Important options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "listParams"
        }), " drives basic list requests"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "filter"
        }), " is used for advanced lists"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "keepPreviousData"
        }), " preserves the last resolved list during a replacement request (see the Lifecycle section for the full capture/clear rules)"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "sort"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "populate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "include"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "tasks"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "basicOptions"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedOptions"
        }), " map directly to client service arguments"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "usecount",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "useCount"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const { data, isLoading, error, query, refetch, reset } = useCount({\n  advanced: true,\n  filter: { status: 'active' },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "advanced: true"
      }), " when you need a filtered count."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "usedistinct",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "useDistinct"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const { data, isLoading, error, query, refetch, reset } = useDistinct({\n  field: 'status',\n  conditions: { organizationId: 'org_123' },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If ", (0,jsx_runtime.jsx)(_components.code, {
        children: "conditions"
      }), " is empty, the hook falls back to the basic ", (0,jsx_runtime.jsx)(_components.code, {
        children: "distinct(...)"
      }), " route."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "mutation-hooks",
      children: "Mutation Hooks"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "useCreate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useUpdate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useUpsert"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useDelete"
      }), " expose ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mutate(...)"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "isPending"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "error"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "reset()"
      }), ". The first three also expose ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data"
      }), " (the last returned projected model). Each ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mutate(...)"
      }), " call returns a promise that resolves the response, or rejects with a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ServiceError"
      }), " on failure."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "usecreate",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "useCreate"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const { data, isPending, error, mutate, reset } = useCreate({\n  advanced: true,\n  select: ['_id', 'name'],\n});\n\nawait mutate({ name: 'Northwind Labs' });\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "useupdate",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "useUpdate"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const { data, isPending, error, mutate } = useUpdate();\n\nawait mutate('org_123', { status: 'active' });\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "useupsert",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "useUpsert"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const { data, isPending, error, mutate } = useUpsert();\n\nawait mutate({ _id: 'org_123', name: 'Northwind Labs' });\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "usedelete",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "useDelete"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const { isPending, error, mutate } = useDelete();\n\nawait mutate('org_123');\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Shared mutation behavior:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "advanced: true"
        }), " switches to the corresponding advanced client method when available."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "mutate(...)"
        }), " performs the request and returns an awaitable promise."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "isPending"
        }), " is true while ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "any"
        }), " invocation is in flight (see Concurrent Mutations)."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "reset()"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onSuccess"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onError"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onSettled"
        }), " are available on every mutation hook (see Lifecycle)."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "lifecycle",
      children: "Lifecycle"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The hooks share one unified query lifecycle and one unified mutation lifecycle."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "loading-flags",
      children: "Loading flags"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "isFetching"
        }), " is true while ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "any"
        }), " query request is in flight."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "isLoading"
        }), " is true only while no settled data exists for this hook instance. Once the first successful response lands, subsequent ", (0,jsx_runtime.jsx)(_components.code, {
          children: "refetch()"
        }), " calls set ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isFetching"
        }), " but not ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isLoading"
        }), ", so you can distinguish background fetches from the first load."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "isPending"
        }), " (mutations) is true while ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "any"
        }), " mutation invocation is in flight — overlapping mutations keep ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isPending"
        }), " true until the active count reaches zero."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "failure-handling",
      children: "Failure handling"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["A resolved ", (0,jsx_runtime.jsx)(_components.code, {
        children: "success: false"
      }), " response is treated as a hook-level failure. The hooks never invoke ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onSuccess"
      }), " for a failed response, never populate ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data"
      }), " with a failure payload, and surface a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ServiceError"
      }), " carrying ", (0,jsx_runtime.jsx)(_components.code, {
        children: "message"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "status"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "raw"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "headers"
      }), " via ", (0,jsx_runtime.jsx)(_components.code, {
        children: "error"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onError"
      }), ", and the rejected ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mutate"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "query"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "refetch"
      }), " promise. A thrown ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onSuccess"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "onError"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "onSettled"
      }), " callback is rethrown asynchronously as an uncaught microtask and never converts a successful request into a hook-level error."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "cancellation",
      children: "Cancellation"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["A dependency change, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "query()"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "refetch()"
      }), " invocation, or unmount aborts the in-flight request and replaces it. Cancellation is authoritative: an aborted request never writes ", (0,jsx_runtime.jsx)(_components.code, {
        children: "error"
      }), ", never fires ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onError"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onSettled"
      }), ", and converges ", (0,jsx_runtime.jsx)(_components.code, {
        children: "isLoading"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "isFetching"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "isPending"
      }), " to false. The hooks decide cancellation on ", (0,jsx_runtime.jsx)(_components.code, {
        children: "signal.aborted"
      }), " rather than ", (0,jsx_runtime.jsx)(_components.code, {
        children: "instanceof DOMException"
      }), ", so axios ", (0,jsx_runtime.jsx)(_components.code, {
        children: "CanceledError"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Error('Canceled')"
      }), " with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "code: 'ERR_CANCELED'"
      }), ", or any other transport-specific cancellation shape is handled uniformly."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const controller = new AbortController();\nconst result = await query('org_123', { signal: controller.signal });\ncontroller.abort(); // cancels the in-flight manual request\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The hook's internal ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requestConfig.signal"
      }), " is composed with the per-call ", (0,jsx_runtime.jsx)(_components.code, {
        children: "query()"
      }), " ", (0,jsx_runtime.jsx)(_components.code, {
        children: "options.signal"
      }), " and the hook-owned controller signal, then forwarded to the underlying client request via a fresh shallow copy of ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requestConfig"
      }), ". Aborting any source cancels the effective request; the caller's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requestConfig"
      }), " object, its ", (0,jsx_runtime.jsx)(_components.code, {
        children: "headers"
      }), ", and other fields are not mutated."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h3, {
      id: "previousdata-lifecycle-uselist-only",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "previousData"
      }), " lifecycle (", (0,jsx_runtime.jsx)(_components.code, {
        children: "useList"
      }), " only)"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "previousData"
      }), " is opt-in via ", (0,jsx_runtime.jsx)(_components.code, {
        children: "keepPreviousData: true"
      }), ". When enabled:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Captured at the ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "start"
        }), " of a replacement request, ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "only if"
        }), " the hook has previously produced at least one settled list response (the first request has nothing to preserve)."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Cleared on every terminal path: success (", (0,jsx_runtime.jsx)(_components.code, {
          children: "applyResult"
        }), "), failure (", (0,jsx_runtime.jsx)(_components.code, {
          children: "onFailed"
        }), "), abort (", (0,jsx_runtime.jsx)(_components.code, {
          children: "onAborted"
        }), "), disable / id-removed (", (0,jsx_runtime.jsx)(_components.code, {
          children: "onDisabled"
        }), "), and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "reset()"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["The first request after a ", (0,jsx_runtime.jsx)(_components.code, {
          children: "reset()"
        }), " is again treated as \"no prior settlement\" — ", (0,jsx_runtime.jsx)(_components.code, {
          children: "hasSettled"
        }), " is cleared on reset — so the next pending request does not capture stale state."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "reset",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "reset()"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "reset()"
      }), " is a synchronous state-clear, not a cancellation:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Query ", (0,jsx_runtime.jsx)(_components.code, {
          children: "reset()"
        }), " clears ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "error"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "isLoading"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "isFetching"
        }), " (and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "previousData"
        }), " for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useList"
        }), ")."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Mutation ", (0,jsx_runtime.jsx)(_components.code, {
          children: "reset()"
        }), " clears ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "error"
        }), " and bumps the latest-invocation token. Any already-running mutation loses its claim on the shared ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "error"
        }), " state — when it later settles, its per-invocation ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onSuccess"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "onSettled"
        }), " still fire, but it cannot repopulate the cleared ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "error"
        }), ". ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isPending"
        }), " remains true until the active count reaches zero; ", (0,jsx_runtime.jsx)(_components.code, {
          children: "reset"
        }), " does not implicitly cancel."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you need to cancel an in-flight query, drop ", (0,jsx_runtime.jsx)(_components.code, {
        children: "id"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "listParams"
      }), " or set ", (0,jsx_runtime.jsx)(_components.code, {
        children: "enabled: false"
      }), " rather than calling ", (0,jsx_runtime.jsx)(_components.code, {
        children: "reset"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h3, {
      id: "refetch-and-query",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "refetch()"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "query()"
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Both reuse the unified lifecycle: shared ", (0,jsx_runtime.jsx)(_components.code, {
        children: "isLoading"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "isFetching"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "error"
      }), " writes, shared callback observers, shared abort manager. They return an awaitable promise that resolves with the response or rejects with the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ServiceError"
      }), ". A trailing ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".catch"
      }), " suppression lets fire-and-forget callers skip ", (0,jsx_runtime.jsx)(_components.code, {
        children: "await"
      }), " without leaking an unhandled rejection."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "concurrent-mutations",
      children: "Concurrent Mutations"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "A mutation hook may be invoked more than once in flight — a caller clicking \"Save\" twice, a list-reordering UI firing two updates, a retry button hit before the first attempt finishes. The contract:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsxs)(_components.strong, {
          children: ["Active-count ", (0,jsx_runtime.jsx)(_components.code, {
            children: "isPending"
          })]
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isPending"
        }), " is true while ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "any"
        }), " invocation is in flight and stays true until the active count reaches zero. The first invocation's ", (0,jsx_runtime.jsx)(_components.code, {
          children: "finally"
        }), " cannot clear ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isPending"
        }), " while a second is still pending."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsxs)(_components.strong, {
          children: ["Latest-invocation-wins for ", (0,jsx_runtime.jsx)(_components.code, {
            children: "data"
          }), " and ", (0,jsx_runtime.jsx)(_components.code, {
            children: "error"
          })]
        }), ": an older invocation that settles after a newer one started (out-of-order completion) still resolves its own promise and fires its own ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onSuccess"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "onSettled"
        }), " observers, but cannot overwrite the newer invocation's already-written ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "error"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "No implicit cancellation"
        }), ": a newer invocation does ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "not"
        }), " abort an older one; they settle independently. The hook truthfully reports ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isPending === true"
        }), " until every pending mutation completes."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "function Save() {\n  const { mutate, isPending } = useUpdate({ advanced: true, select: ['name'] as const });\n\n  const saveTwice = async () => {\n    const [second] = await Promise.all([mutate('org_1', { name: 'A' }), mutate('org_1', { name: 'B' })]);\n    // `second.data` reflects whoever settled last as the latest-invocation.\n    return second.data;\n  };\n\n  return (\n    <button disabled={isPending} onClick={saveTwice}>\n      Save twice\n    </button>\n  );\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "projection-typing",
      children: "Projection Typing"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "useRead"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useList"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useCreate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useUpdate"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useUpsert"
      }), " accept a literal ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const { data } = useRead({\n  id: 'org_123',\n  advanced: true,\n  select: ['name', 'status'],\n});\n\nif (data) {\n  const name: string = data.name;\n  const status: string | undefined = data.status;\n  const id: string | undefined = data._id;\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["A literal ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), " narrows ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onSuccess(result)"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "onSettled(result, …)"
      }), " callbacks, manual ", (0,jsx_runtime.jsx)(_components.code, {
        children: "query()"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "refetch()"
      }), " response payloads, and mutation ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mutate()"
      }), " return promises uniformly. Acceptable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), " forms: a literal tuple (", (0,jsx_runtime.jsx)(_components.code, {
        children: "['name', 'status'] as const"
      }), ", recommended), a literal string (", (0,jsx_runtime.jsx)(_components.code, {
        children: "'name'"
      }), "), or a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ name: 1; age: -1 }"
      }), " object. Omitted properties become ", (0,jsx_runtime.jsx)(_components.code, {
        children: "T[key] | undefined"
      }), " rather than definitely-present. A literal ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), " requires ", (0,jsx_runtime.jsx)(_components.code, {
        children: "advanced: true"
      }), " to actually reach the server's narrowing code path; the basic ", (0,jsx_runtime.jsx)(_components.code, {
        children: "read"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "list"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "create"
      }), "/etc. APIs do not forward ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "dependency-key-policy",
      children: "Dependency-Key Policy"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The query hooks (", (0,jsx_runtime.jsx)(_components.code, {
        children: "useRead"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useList"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useCount"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useDistinct"
      }), ") build one canonical structural key from every request-affecting option and use that key as the React effect dependency. The policy guarantees the documented historical bug classes — refetch loops from inline array literals, missing ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requestConfig"
      }), " headers triggering or not triggering a request, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Date"
      }), " vs ISO-string collisions — cannot recur."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "what-participates-in-the-key",
      children: "What participates in the key"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Plain structural inputs — ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "field"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "advanced"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "enabled"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "listParams"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "filter"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sort"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "populate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "include"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "tasks"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "basicOptions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedOptions"
        }), ", and the full ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requestConfig"
        }), " object (including any authorization or tenant ", (0,jsx_runtime.jsx)(_components.code, {
          children: "headers"
        }), ") — each become a deterministic string via ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requestKeyFor"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Primitives (", (0,jsx_runtime.jsx)(_components.code, {
          children: "id"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "field"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "enabled"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "advanced"
        }), ") join the deps array directly."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "Date"
        }), " values compare by instant (", (0,jsx_runtime.jsx)(_components.code, {
          children: "d:<.getTime()>"
        }), "), never colliding with an ISO-string filter that happens to look like the date."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Inline array literals like ", (0,jsx_runtime.jsx)(_components.code, {
          children: "select: ['name', 'status']"
        }), " are safe: writing them at the call site does NOT cause a refetch loop, even if React creates a new array identity every render. Two ", (0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        }), " arrays with the same shape produce the same key."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["A meaningful structural change triggers exactly one replacement request, aborting the previous in-flight request via the hooks' owner-id / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "signal.aborted"
        }), " policy."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "what-is-not-a-key-input",
      children: "What is NOT a key input"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Callback identity (", (0,jsx_runtime.jsx)(_components.code, {
          children: "onSuccess"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onError"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onSettled"
        }), ") is ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "not"
        }), " part of the effect dependencies. The hooks wrap each callback in a stable invoker (the standard React \"useEvent\" pattern) so the latest underlying callback fires at settlement time without making callback identity churn trigger a network request. Re-rendering a parent with a fresh arrow expression every render is safe."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "initialData"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "keepPreviousData"
        }), " participate only as primitive boolean / data shape values, not as structural request inputs."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "unsupported-values",
      children: "Unsupported values"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requestKeyFor"
      }), " encounters a value it cannot represent deterministically, it throws a documented ", (0,jsx_runtime.jsx)(_components.code, {
        children: "RequestKeyError"
      }), " (re-thrown by the hook as an ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Error"
      }), " with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "cause"
      }), " set to the original ", (0,jsx_runtime.jsx)(_components.code, {
        children: "RequestKeyError"
      }), "). The hook's React lifecycle interrupts the render so the auto-effect never runs with an unsound key. The categories are:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "bigint"
          })
        }), " — silently losing precision is unsafe; convert to a ", (0,jsx_runtime.jsx)(_components.code, {
          children: "number"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "string"
        }), " before passing to a query hook."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "function"
          })
        }), " — callback identity is unstable by design; the request contract requires structural data."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "symbol"
          })
        }), " (including symbol-keyed object properties) — ", (0,jsx_runtime.jsx)(_components.code, {
          children: "JSON.stringify"
        }), " silently drops symbols, which would collide with an object that has no such key."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Cycles"
        }), " (direct, indirect, or array) — recursion is caught via a ", (0,jsx_runtime.jsx)(_components.code, {
          children: "WeakSet"
        }), " stack and rejected explicitly."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Accessor properties"
        }), " (getters/setters) — a getter would fire during dep-key construction. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requestKeyFor"
        }), " checks ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Object.getOwnPropertyDescriptor"
        }), " and rejects before any getter runs."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Built-in instances"
        }), " (", (0,jsx_runtime.jsx)(_components.code, {
          children: "RegExp"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Map"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Set"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "URL"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Error"
        }), ", and class instances whose prototype is not ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Object.prototype"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), ") — pass their plain-data representation (a URL string, a sorted array of entries, an ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{}"
        }), " literal) to the query hook instead."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "Date"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Object.create(null)"
      }), " plain objects are supported."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "importing-the-helper",
      children: "Importing the helper"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Downstream consumers that want to inspect or build keys themselves can import ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requestKeyFor"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "RequestKeyError"
      }), " directly from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/access-router-react"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { requestKeyFor, RequestKeyError } from '@web-ts-toolkit/access-router-react';\n\nconst key = requestKeyFor({ filter: { status: 'active', since: new Date('2026-01-01') } });\n\ntry {\n  requestKeyFor(someUserSuppliedFilter);\n} catch (e) {\n  if (e instanceof RequestKeyError) {\n    // handle the unsupported value\n  }\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "active-record-integration",
      children: "Active Record Integration"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Data returned from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useList"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useRead"
      }), " is backed by ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Model<T>"
      }), " wrappers from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/access-router-client"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["That means you can edit loaded models directly and persist with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "save()"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const { data, refetch } = useList({ listParams: { pageSize: 20 } });\n\nasync function rename(id: string, name: string) {\n  const organization = data.find((entry) => entry._id === id);\n  if (!organization) return;\n\n  organization.name = name;\n  const result = await organization.save();\n\n  if (result.success) {\n    refetch();\n  }\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use explicit mutation hooks when you want local pending and error state around a specific workflow."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "notes",
      children: "Notes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["These hooks do ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "not"
        }), " implement shared caching, deduplication, invalidation, retry, or background revalidation. They are thin stateful wrappers over ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ModelService"
        }), " from ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/access-router-client"
        }), ". If you need cache orchestration, use these services underneath a query library."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "requestConfig"
        }), " is forwarded to the underlying client request via a fresh shallow copy on every request; the caller's ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requestConfig"
        }), " object, its ", (0,jsx_runtime.jsx)(_components.code, {
          children: "headers"
        }), ", and other fields are not mutated. The hook's internal ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requestConfig.signal"
        }), " is composed with the caller-supplied ", (0,jsx_runtime.jsx)(_components.code, {
          children: "query()"
        }), " ", (0,jsx_runtime.jsx)(_components.code, {
          children: "options.signal"
        }), " and the hook-owned controller signal — aborting any source cancels the effective request. There is ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "no"
        }), " way to bypass the hook's abort manager; an inline ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requestConfig.signal"
        }), " you pass to a query hook is treated as a structural key input (so changing it triggers a refetch) but is ", (0,jsx_runtime.jsx)(_components.em, {
          children: "not"
        }), " forwarded verbatim, because the hook composes its own controller from the same options."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "related-packages",
      children: "Related Packages"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./access-router-client",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/access-router-client"
          })
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./access-router",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/access-router"
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