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
const site_docs_packages_access_router_react_md_f13_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router-react","title":"@web-ts-toolkit/access-router-react","description":"React hooks for @web-ts-toolkit/access-router-client model services.","source":"@site/docs/packages/access-router-react.md","sourceDirName":"packages","slug":"/packages/access-router-react","permalink":"/docs/packages/access-router-react","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":3,"frontMatter":{"sidebar_label":"Access Router React","sidebar_position":3},"sidebar":"packagesSidebar","previous":{"title":"Express JSON Router","permalink":"/docs/packages/express-json-router"},"next":{"title":"Express Response Handler","permalink":"/docs/packages/express-response-handler"}}');
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
	sidebar_position: 3
};
const contentTitle = '@web-ts-toolkit/access-router-react';

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
  "value": "Factory",
  "id": "factory",
  "level": 2
}, {
  "value": "<code>createModelHooks({ modelService })</code>",
  "id": "createmodelhooks-modelservice-",
  "level": 3
}, {
  "value": "Naming Convention",
  "id": "naming-convention",
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
  "value": "Result Summary",
  "id": "result-summary",
  "level": 2
}, {
  "value": "<code>useRead</code> and <code>useList</code>",
  "id": "useread-and-uselist",
  "level": 3
}, {
  "value": "<code>useCount</code> and <code>useDistinct</code>",
  "id": "usecount-and-usedistinct",
  "level": 3
}, {
  "value": "<code>useCreate</code>, <code>useUpdate</code>, <code>useUpsert</code>",
  "id": "usecreate-useupdate-useupsert",
  "level": 3
}, {
  "value": "<code>useDelete</code>",
  "id": "usedelete-1",
  "level": 3
}, {
  "value": "Active Record Integration",
  "id": "active-record-integration",
  "level": 2
}, {
  "value": "Notes",
  "id": "notes",
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
      children: ["This package provides a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createModelHooks"
      }), " factory that binds one ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelService"
      }), " to eight hooks covering query and mutation flows."]
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
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "import { createModelHooks } from '@web-ts-toolkit/access-router-react';\nimport { adapter } from './api';\n\nconst organizationService = adapter.createModelService<Organization>({\n  modelName: 'Organization',\n  basePath: 'organizations',\n});\n\nconst { useList, useRead, useCreate, useUpdate, useDelete } = createModelHooks({\n  modelService: organizationService,\n});\n\nfunction OrganizationList() {\n  const { data, isLoading, error } = useList({\n    listParams: { pageSize: 20 },\n  });\n\n  if (isLoading) return <p>Loading...</p>;\n  if (error) return <p>Error: {error.message}</p>;\n\n  return (\n    <ul>\n      {data.map((org) => (\n        <li key={org._id}>{org.name}</li>\n      ))}\n    </ul>\n  );\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "factory",
      children: "Factory"
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "createmodelhooks-modelservice-",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "createModelHooks({ modelService })"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Call the factory once, outside your components, and reuse the returned hooks."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const { useRead, useList, useCreate, useUpdate, useUpsert, useDelete, useCount, useDistinct } = createModelHooks({\n  modelService: organizationService,\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The factory accepts one property:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Property"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Type"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Description"
          })]
        })
      }), (0,jsx_runtime.jsx)(_components.tbody, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "modelService"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "ModelService<T>"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["A model service created by ", (0,jsx_runtime.jsx)(_components.code, {
              children: "adapter.createModelService(...)"
            })]
          })]
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "naming-convention",
      children: "Naming Convention"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The current API uses:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["verb-based hook names: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useRead"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useList"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useCreate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useUpdate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useUpsert"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useDelete"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useCount"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "useDistinct"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "query(...)"
        }), " for query hooks"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "mutate(...)"
        }), " for mutation hooks"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That keeps the React surface consistent even though the underlying client methods still map to read, list, create, update, upsert, delete, count, and distinct operations."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "query-hooks",
      children: "Query Hooks"
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "useread",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "useRead"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Fetches one model by ID."
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
        }), " controls auto-fetching"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "advanced: true"
        }), " switches to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "readAdvanced(...)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "populate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sort"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "include"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "tasks"
        }), " are forwarded to advanced reads"]
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
        }), " control request behavior"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "uselist",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "useList"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Fetches a list of models."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-tsx",
        children: "const { data, totalCount, previousData, isLoading, isFetching, error, query, refetch, reset } = useList({\n  listParams: { pageSize: 20 },\n  filter: { status: 'active' },\n  advanced: true,\n  sort: { name: 1 },\n  keepPreviousData: true,\n});\n"
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
        }), " preserves the last resolved list during refetch"]
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
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Fetches a count."
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
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Fetches distinct values for a field."
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
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "usecreate",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "useCreate"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Creates a document."
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
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Updates a document by ID."
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
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Creates or updates, depending on the server-side upsert result."
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
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Deletes a document by ID."
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
        }), " switches to the corresponding advanced client method when available"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "mutate(...)"
        }), " performs the request"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "isPending"
        }), " tracks in-flight state"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "reset()"
        }), " clears local hook state"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "onSuccess"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onError"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onSettled"
        }), " are available on every mutation hook"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "useCreate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useUpdate"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useUpsert"
      }), " also expose ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data"
      }), " with the last returned ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Model<T>"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "result-summary",
      children: "Result Summary"
    }), "\n", (0,jsx_runtime.jsxs)(_components.h3, {
      id: "useread-and-uselist",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "useRead"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useList"
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "isLoading"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "isFetching"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "error"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "query(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "refetch()"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "reset()"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h3, {
      id: "usecount-and-usedistinct",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "useCount"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useDistinct"
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "isLoading"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "error"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "query()"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "refetch()"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "reset()"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h3, {
      id: "usecreate-useupdate-useupsert",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "useCreate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useUpdate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "useUpsert"
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "isPending"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "error"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "mutate(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "reset()"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "usedelete-1",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "useDelete"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "isPending"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "error"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "mutate(id)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "reset()"
        })
      }), "\n"]
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
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "These hooks do not implement shared caching, deduping, or invalidation."
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["They are thin stateful wrappers over ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ModelService"
        }), " from ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/access-router-client"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "requestConfig"
        }), " is forwarded to the underlying client request and can include headers, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "signal"
        }), ", and transport-specific options."]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "If you need cache orchestration, use these services underneath a query library."
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