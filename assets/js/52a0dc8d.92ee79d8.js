"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[174],{

/***/ 151
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_client_services_mdx_52a_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-client-services-mdx-52a.json
const site_docs_packages_access_router_client_services_mdx_52a_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router-client/services","title":"Services","description":"access-router-client exposes two service classes:","source":"@site/docs/packages/access-router-client/services.mdx","sourceDirName":"packages/access-router-client","slug":"/packages/access-router-client/services","permalink":"/docs/packages/access-router-client/services","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":3,"frontMatter":{"sidebar_label":"Services","sidebar_position":3},"sidebar":"packagesSidebar","previous":{"title":"Adapter And Setup","permalink":"/docs/packages/access-router-client/adapter"},"next":{"title":"Model","permalink":"/docs/packages/access-router-client/model"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(7008);
;// ./docs/packages/access-router-client/services.mdx


const frontMatter = {
	sidebar_label: 'Services',
	sidebar_position: 3
};
const contentTitle = 'Services';

const assets = {

};



const toc = [{
  "value": "<code>ModelService&lt;T&gt;</code>",
  "id": "modelservicet",
  "level": 2
}, {
  "value": "Standard model methods",
  "id": "standard-model-methods",
  "level": 3
}, {
  "value": "Advanced query and mutation methods",
  "id": "advanced-query-and-mutation-methods",
  "level": 3
}, {
  "value": "Common advanced args and options",
  "id": "common-advanced-args-and-options",
  "level": 3
}, {
  "value": "Example",
  "id": "example",
  "level": 3
}, {
  "value": "Subqueries",
  "id": "subqueries",
  "level": 2
}, {
  "value": "Correlated Includes",
  "id": "correlated-includes",
  "level": 2
}, {
  "value": "Client preparation limits",
  "id": "client-preparation-limits",
  "level": 3
}, {
  "value": "Subdocument Helpers",
  "id": "subdocument-helpers",
  "level": 2
}, {
  "value": "Return shape",
  "id": "return-shape",
  "level": 3
}, {
  "value": "Example",
  "id": "example-1",
  "level": 3
}, {
  "value": "<code>DataService&lt;T&gt;</code>",
  "id": "dataservicet",
  "level": 2
}, {
  "value": "Advanced read options",
  "id": "advanced-read-options",
  "level": 3
}, {
  "value": "Example",
  "id": "example-2",
  "level": 3
}, {
  "value": "Request Config And Errors",
  "id": "request-config-and-errors",
  "level": 2
}, {
  "value": "Related Pages",
  "id": "related-pages",
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
        id: "services",
        children: "Services"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "access-router-client"
      }), " exposes two service classes:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "ModelService<T>"
        }), " for model routers"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "DataService<T>"
        }), " for data routers"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "They share the same response normalization and lazy-request behavior, but their method sets are different."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "modelservicet",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelService<T>"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelService<T>"
      }), " against a server-side model router."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Model reads usually return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data"
      }), " as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Model<T>"
      }), " wrappers. That means read results are both typed data and persistence-aware editing objects."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "standard-model-methods",
      children: "Standard model methods"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "list(args?, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "read(id, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "new(axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "create(data, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "update(id, data, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "upsert(data, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "delete(id, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "distinct(field, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "distinctAdvanced(field, filter, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "count(axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "countAdvanced(filter, axiosRequestConfig?)"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "distinct"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "distinctAdvanced"
      }), " return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Response<unknown[]>"
      }), ": the sibling\nserver returns raw distinct values without string conversion, so numeric and\nboolean values arrive as-is. Narrow elements (for example with\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "typeof v === 'string'"
      }), ") before calling string methods."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "These methods map closely to the server-side model router operations."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "create(...)"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createAdvanced(...)"
      }), " preserve input cardinality: one object\nreturns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelResponse<T>"
      }), ", while an array returns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ArrayModelResponse<T>"
      }), ".\nOne-item arrays still return arrays."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "In broad terms:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "list(...)"
        }), " is the simple GET-based list route"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "listAdvanced(...)"
        }), " is the richer POST-based query route"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "read(...)"
        }), " is the simple GET-by-id route"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "readAdvanced(...)"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "readAdvancedFilter(...)"
        }), " are richer POST-based read routes"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "create(...)"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "update(...)"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "upsert(...)"
        }), " are the simpler mutation helpers"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "createAdvanced(...)"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "updateAdvanced(...)"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "upsertAdvanced(...)"
        }), " expose richer mutation arguments such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "populate"
        }), ", and task execution"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "advanced-query-and-mutation-methods",
      children: "Advanced query and mutation methods"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "listAdvanced(filter, args?, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "readAdvanced(id, args?, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "readAdvancedFilter(filter, args?, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "createAdvanced(data, args?, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "updateAdvanced(id, data, args?, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "upsertAdvanced(data, args?, options?, axiosRequestConfig?)"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "common-advanced-args-and-options",
      children: "Common advanced args and options"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Advanced methods can use combinations of:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "populate"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "include"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "sort"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "skip"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "limit"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "page"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "pageSize"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "tasks"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "skim"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "includePermissions"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "includeCount"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "includeExtraHeaders"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "populateAccess"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "tryList"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "ignoreCache"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The exact shape depends on the specific method, but the names mirror the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " request contract."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Rules of thumb:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "use non-advanced methods for straightforward CRUD by id"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "use advanced methods when you need projection, populate, includes, server tasks, or filter-based reads"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "includeCount"
        }), " only when you actually need total counts, since it may add work on the server side"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "includeExtraHeaders"
        }), " when the server exposes count metadata through headers rather than body metadata"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "ignoreCache"
        }), " always lives on the ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "options"
        }), " argument (never on args); use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ ignoreCache: true }"
        }), " to bypass an existing cache entry"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "includePermissions"
        }), " is honored by ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ModelService<T>"
        }), " advanced and mutation methods (including ", (0,jsx_runtime.jsx)(_components.code, {
          children: "update(...)"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "upsert(...)"
        }), ", which transmit it as the ", (0,jsx_runtime.jsx)(_components.code, {
          children: "include_permissions"
        }), " query parameter). ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DataService<T>"
        }), " does ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "not"
        }), " advertise ", (0,jsx_runtime.jsx)(_components.code, {
          children: "includePermissions"
        }), " at all — the server data routers do not parse ", (0,jsx_runtime.jsx)(_components.code, {
          children: "include_permissions"
        }), ", so the client removed it from ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DataListOptions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DataListAdvancedOptions"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DataReadOptions"
        }), "; data records are returned without ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_permissions"
        }), ". See the ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DataService<T>"
        }), " section below for details."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "example",
      children: "Example"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const users = await userService.listAdvanced(\n  { public: true },\n  {\n    select: ['name', 'role'],\n    sort: { name: 1 },\n    limit: 20,\n  },\n  {\n    includeCount: true,\n    includePermissions: true,\n  },\n  {\n    headers: { user: 'admin' },\n  },\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "subqueries",
      children: "Subqueries"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Many model methods accept ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sq"
      }), " in their options. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sq"
      }), " is also accepted in\nadapter and service defaults for ", (0,jsx_runtime.jsx)(_components.code, {
        children: "list"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "listAdvanced"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "read"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "readAdvanced"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "readAdvancedFilter"
      }), ", with per-call, service, then adapter\nprecedence (a per-call ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sq"
      }), " wins over defaults)."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["That is a client-side way to embed another lazy request into a filter, so the server can resolve it as an ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " subquery."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const orgs = await orgService.listAdvanced(\n  {\n    _id: userService.readAdvancedFilter(\n      { name: 'lucy2' },\n      undefined,\n      { sq: { path: 'orgs', compact: true } },\n    ),\n  },\n  { select: ['name'] },\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This works because the client replaces embedded lazy requests with the special ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$$sq"
      }), " root-query metadata expected by the server."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That gives you a way to express server-side dependent queries without manually constructing the low-level root-router payload."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "correlated-includes",
      children: "Correlated Includes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["A correlated include runs a target query ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "per parent document"
      }), " using values\nfrom that parent. Build the inner query with the familiar service methods,\nreference parent fields explicitly with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "parentField()"
      }), ", and attach the\nresult with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$include(path)"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { parentField } from '@web-ts-toolkit/access-router-client';\n\nconst userWithIncludes = await userService.readAdvanced('user-id-1', {\n  include: [\n    orgService\n      .readAdvanced(parentField('orgId'), { select: ['name', 'description'] })\n      .$include('org'),\n    postService\n      .listAdvanced(\n        { authorId: parentField('_id'), reviewerId: parentField('managerId'), title: '$special' },\n        { select: ['title'], sort: { createdAt: -1 }, limit: 5 },\n      )\n      .$include('posts'),\n    postService.countAdvanced({ authorId: parentField('_id') }).$include('postCount'),\n  ],\n});\nvoid userWithIncludes;\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "All seven builders compose this way:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Method"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Reference position"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Inner operation"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "read(id)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "identifier argument"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "read"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "readAdvanced(id, args)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "identifier argument"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "read"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "readAdvancedFilter(filter, args)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "filter argument"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "read"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "list(args)"
            }), " + ", (0,jsx_runtime.jsx)(_components.code, {
              children: "$include(path, { filter })"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "supplemental filter"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "list"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "listAdvanced(filter, args)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "filter argument"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "list"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "count()"
            }), " + ", (0,jsx_runtime.jsx)(_components.code, {
              children: "$include(path, { filter })"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "supplemental filter"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "count"
            })
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "countAdvanced(filter)"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "filter argument"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "count"
            })
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const basicPosts = postService.list({ limit: 5 }).$include('posts', {\n  filter: { authorId: parentField('_id') },\n});\nvoid basicPosts;\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Reference scope and result-shape notes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["References resolve against the ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "immediate parent"
        }), " document on the outer\nserver. Nested includes inside ", (0,jsx_runtime.jsx)(_components.code, {
          children: "args.include"
        }), " bind to the target doc of\nthe enclosing include, never to the outer parent."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Plain strings are never references: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "title: '$special'"
        }), " keeps its literal\nquery meaning. Match a literal ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ $parent: 'x' }"
        }), " object with\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ $escape: { $parent: 'x' } }"
        }), " (use the ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$eq"
        }), "-wrapped form when the\nliteral sits in a bare field position)."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Reads attach the doc or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), ", lists attach arrays, counts attach\nnumbers. A missing or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), " reference skips the target query and attaches\nthe same no-match shape (", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "[]"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "0"
        }), ")."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Identifier reads preserve the target's configured identifier behavior\n(custom id fields included). Lists apply ", (0,jsx_runtime.jsx)(_components.code, {
          children: "limit"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "page"
        }), " per parent\n(contrast with legacy ", (0,jsx_runtime.jsx)(_components.code, {
          children: "localField"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "foreignField"
        }), " includes, whose batch\npagination applies across the whole parent set); counts use count\nsemantics, never a capped list count."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Conversion is synchronous and performs zero HTTP calls. A call carrying\nreferences returns a frozen, non-thenable descriptor — it cannot be\nawaited into data or grouped; convert it with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$include()"
        }), " first.\nReference-free calls keep their ordinary lazy/grouped behavior."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Descriptors are transport-inert: the inner query always executes on the\n", (0,jsx_runtime.jsx)(_components.strong, {
          children: "outer"
        }), " server under the outer request context. Mixing adapters in one\ninclude tree is allowed at build time and never dispatches to the inner\nservice's transport."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Supported inner args are allowlisted per operation: reads forward\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "sort"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "include"
        }), ", lists additionally forward per-parent\npagination (", (0,jsx_runtime.jsx)(_components.code, {
          children: "skip"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "limit"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "page"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "pageSize"
        }), "), basic ", (0,jsx_runtime.jsx)(_components.code, {
          children: "read"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "count"
        }), " carry\nno args. Explicit ", (0,jsx_runtime.jsx)(_components.code, {
          children: "populate"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "tasks"
        }), ", execution-only options (", (0,jsx_runtime.jsx)(_components.code, {
          children: "skim"
        }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "includePermissions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "includeCount"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "tryList"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "populateAccess"
        }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "ignoreCache"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "includeExtraHeaders"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sq"
        }), "), or transport config on a\nreference-bearing call throws at ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$include()"
        }), "; the same keys inherited\nfrom service/adapter defaults are silently dropped. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "options"
        }), " on the wire\nentry must stay empty."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Referenced parent fields are loaded internally for resolution even when\nomitted from ", (0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        }), ", then trimmed from output unless selected (or\noverride-selected). A policy-forbidden reference still resolves — only its\nquery effects are visible, never the value itself. Sibling include output\nand ", (0,jsx_runtime.jsx)(_components.code, {
          children: "decorate"
        }), "/task output never feed references (stable pre-include\nsnapshot)."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Execution is bounded per request (", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxCorrelatedQueries"
        }), " total inner\nexecutions, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxCorrelatedDepth"
        }), " nesting depth); exceeding either fails the\nwhole request. Target authorization denials and runtime errors fail the\nwhole parent request — partial per-parent error shapes are never attached."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Typed output needs an explicit result generic with the path first:\n", (0,jsx_runtime.jsx)(_components.code, {
          children: ".$include<'org', Org>('org')"
        }), ". Without it the path is still attached but\ntyped ", (0,jsx_runtime.jsx)(_components.code, {
          children: "unknown"
        }), "; nothing is inferred from partial projections, reads admit\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), ", and nested values stay plain (never ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Model"
        }), "-wrapped)."]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Requires a server with correlated-include support. Older servers silently\ndrop the new entries instead of executing them — check the server release\nnotes for the minimum version."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "client-preparation-limits",
      children: "Client preparation limits"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Filter scanning, correlated capture/copy, and subquery rewriting now reject\ncycles, depth over ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "64 edges"
      }), " (each root is depth 0), or over ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "10,000\nexpanded value visits"
      }), " per boundary with synchronous ", (0,jsx_runtime.jsx)(_components.code, {
        children: "CorrelatedIncludeError"
      }), ".\nThis includes reference-free and supplemental ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$include()"
      }), " filters. Preparation\nperforms zero HTTP and does not execute lazy requests or freeze caller containers."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Count containers, primitive leaves, array slots (including holes), and each\nrepeated shared-object occurrence. Shared acyclic references are supported.\nCapture combines supplied id/filter/args/options; undefined optional roots are\nabsent. Conversion combines id or rewritten filter with effective forwarded\nargs, including defaults. Internal wire-envelope keys do not count toward the\nfilter-only budget. A conversion can exceed its aggregate budget even if the\nindividual builder inputs fit, especially after ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$$sq"
      }), " metadata expansion."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "$escape"
      }), " contents stay literal during marker scanning and rewriting but are\nstill structurally checked. Live requests remain opaque until their ", (0,jsx_runtime.jsx)(_components.code, {
        children: "__query"
      }), "\nbecomes ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$$sq"
      }), " wire data, which is checked before copying. Reduce oversized\nfilters/args instead of relying on previously unbounded preparation. These\nplain-object/array structural limits are not byte limits, latency guarantees,\nor bounds on arbitrary getter/proxy/exotic-instance behavior. Service defaults\nhave a ", (0,jsx_runtime.jsx)(_components.a, {
        href: "./adapter#service-defaults",
        children: "separate normalization budget"
      }), "; server\nexecution limits remain separate as well."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "subdocument-helpers",
      children: "Subdocument Helpers"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "ModelService<T>"
      }), " also exposes subdocument helpers from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "id(id)"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const statusHistory = userService.id(userId).subs('statusHistory');\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Available methods:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "list(axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "listAdvanced(filter?, args?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "read(subId, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "readAdvanced(subId, args?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "create(data | data[], axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "update(subId, data, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "bulkUpdate(data[], options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "delete(subId, axiosRequestConfig?)"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Also available:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "id(id).fetch(args?, options?, axiosRequestConfig?)"
        }), " as a convenience alias for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "readAdvanced(id, ...)"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["These helpers are only as capable as the matching subdocument operations exposed by the server router. If the server did not enable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "subs.someField.create"
      }), ", the client helper exists but the request will still be rejected by the server."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "return-shape",
      children: "Return shape"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Subdocument helpers return ", (0,jsx_runtime.jsxs)(_components.strong, {
        children: ["plain data, not ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Model<S>"
        }), " instances"]
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "list(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "listAdvanced(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "create(...)"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "bulkUpdate(...)"
        }), " return a ", (0,jsx_runtime.jsx)(_components.code, {
          children: "SubDocumentListResponse<S>"
        }), ": after narrowing on ", (0,jsx_runtime.jsx)(_components.code, {
          children: "success"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "raw"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), " are the ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "plain array"
        }), " of subdocument objects and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "count"
        }), " is the array length. The sibling server never emits ", (0,jsx_runtime.jsx)(_components.code, {
          children: "totalCount"
        }), " on subdocument list results, so ", (0,jsx_runtime.jsx)(_components.code, {
          children: "SubDocumentListResponse<S>"
        }), " does ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "not"
        }), " carry ", (0,jsx_runtime.jsx)(_components.code, {
          children: "totalCount"
        }), " (use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "count"
        }), " on successful results instead)."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "read(...)"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "readAdvanced(...)"
        }), " return a ", (0,jsx_runtime.jsx)(_components.code, {
          children: "SubDocumentResponse<S>"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "raw"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), " are the ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "plain single"
        }), " subdocument object on success, or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), " on failure."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Subdocuments are deliberately not wrapped as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Model<S>"
      }), ": a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Model<S>"
      }), " returned here would expose ", (0,jsx_runtime.jsx)(_components.code, {
        children: "save()"
      }), ", which would target the ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "parent"
      }), " model route (", (0,jsx_runtime.jsx)(_components.code, {
        children: "/:parentId"
      }), ") with the subdocument ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " instead of the correct subdocument route (", (0,jsx_runtime.jsx)(_components.code, {
        children: "/:parentId/:sub/:subId"
      }), "). To persist a subdocument, always call the parent-scoped helper explicitly:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "await statusHistory.update(subId, { label: 'processed' });\nawait statusHistory.create({ label: 'queued', flag: 'orange' });\nawait statusHistory.bulkUpdate([{ _id: subId, label: 'processed' }]);\nawait statusHistory.delete(subId);\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "create(...)"
      }), " accepts a single object ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "or"
      }), " an array of objects (the server's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "subMutationBodySchema"
      }), " is ", (0,jsx_runtime.jsx)(_components.code, {
        children: "z.union([record, array(record)])"
      }), "). It always returns the post-create subdocument ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "array"
      }), " — the server responds with the full subdocument list, and the client normalizes the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "count === 1"
      }), " case to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "[newDoc]"
      }), " for one consistent shape."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "example-1",
      children: "Example"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const statusHistory = userService.id(userId).subs('statusHistory');\n\n// `created.data` is the plain post-create array (e.g. all entries on the\n// parent). `created.raw` is the same array; `created.count` is its length.\nconst created = await statusHistory.create({\n  label: 'queued',\n  flag: 'orange',\n});\nconst newDoc = created.data[created.data.length - 1];\n\n// `create(...)` also accepts an array when adding multiple rows at once:\nconst createdMany = await statusHistory.create([\n  { label: 'queued', flag: 'orange' },\n  { label: 'in-review', flag: 'blue' },\n]);\nconst added = createdMany.data.slice(-2);\n\n// `listed.data` is the plain array of subdocuments; `listed.count` mirrors\n// the server's `count` field (not `totalCount`).\nconst listed = await statusHistory.list();\n\n// `bulkUpdated.data` is the plain updated array.\nconst bulkUpdated = await statusHistory.bulkUpdate([\n  { _id: 'sub-1', label: 'approved', flag: 'green' },\n  { _id: 'sub-2', label: 'rejected', flag: 'red' },\n]);\n\n// `read.data` is the plain single subdocument (or null on 404).\nconst read = await statusHistory.read('sub-1');\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "dataservicet",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "DataService<T>"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DataService<T>"
      }), " against a server-side data router."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Supported methods:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "list(args?, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "listAdvanced(filter, args?, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "read(id, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "readAdvanced(id, args?, options?, axiosRequestConfig?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "readAdvancedFilter(filter, args?, options?, axiosRequestConfig?)"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Unlike ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelService<T>"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DataService<T>"
      }), " is read-only from the client’s point of view."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["It returns plain data objects rather than ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Model<T>"
      }), " wrappers."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use it when the server data source is not a Mongoose model router and does not need client-side persistence helpers."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "advanced-read-options",
      children: "Advanced read options"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For ", (0,jsx_runtime.jsx)(_components.code, {
        children: "readAdvanced(...)"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "readAdvancedFilter(...)"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "ignoreCache"
        }), " lives on the ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "options"
        }), " argument (", (0,jsx_runtime.jsx)(_components.code, {
          children: "DataReadAdvancedOptions"
        }), "), not on the args. Use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ ignoreCache: true }"
        }), " in the options position to bypass an existing cache entry. This matches the placement used by ", (0,jsx_runtime.jsx)(_components.code, {
          children: "list"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "listAdvanced"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "read"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "includePermissions"
        }), " is intentionally absent. The access-router data router body schema for advanced reads rejects the ", (0,jsx_runtime.jsx)(_components.code, {
          children: "options"
        }), " key, and the root router drops ", (0,jsx_runtime.jsx)(_components.code, {
          children: "item.options"
        }), " for data operations, so advertising it here was a type-level promise the server cannot honor. Direct and grouped advanced reads compose identical payloads as a result."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "example-2",
      children: "Example"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const fruits = await fruitService.listAdvanced(\n  { public: true },\n  { select: ['id', 'name'], limit: 10 },\n  { includeCount: true },\n);\n\nconst apple = await fruitService.readAdvanced('apple', { select: ['name'] });\n\n// Cache-bypass on an advanced read uses the options position:\nconst freshApple = await fruitService.readAdvanced(\n  'apple',\n  { select: ['name'] },\n  { ignoreCache: true },\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "request-config-and-errors",
      children: "Request Config And Errors"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Every service method accepts an Axios request config as its last argument."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Common patterns:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["pass ", (0,jsx_runtime.jsx)(_components.code, {
          children: "headers"
        }), " for auth or request-scoped permissions"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["pass ", (0,jsx_runtime.jsx)(_components.code, {
          children: "throwOnError: true"
        }), " to convert a failed normalized response into ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ServiceError"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["pass ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ignoreCache: true"
        }), " in supported method options when you need a fresh read"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Request-scoped permissions are especially common with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " setups. For example, if the server derives permissions from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "req.headers.user"
      }), ", the same header needs to be sent from the client for reads, writes, and grouped requests."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const user = await userService.read('user-1', undefined, {\n  headers: { user: 'admin' },\n  throwOnError: true,\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "related-pages",
      children: "Related Pages"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./",
          children: "Overview"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./adapter",
          children: "Adapter And Setup"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./model",
          children: "Model"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./typescript-and-errors",
          children: "TypeScript And Errors"
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