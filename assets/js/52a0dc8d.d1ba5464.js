"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[174],{

/***/ 1464
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
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
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
  "value": "Subdocument Helpers",
  "id": "subdocument-helpers",
  "level": 2
}, {
  "value": "Important return-shape note for subdocument helpers",
  "id": "important-return-shape-note-for-subdocument-helpers",
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
  "value": "Example",
  "id": "example-2",
  "level": 3
}, {
  "value": "Request Config And Errors",
  "id": "request-config-and-errors",
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
          children: "countAdvanced(filter, args?, axiosRequestConfig?)"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "These methods map closely to the server-side model router operations."
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
      }), " in their options."]
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
          children: "create(data, axiosRequestConfig?)"
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
      id: "important-return-shape-note-for-subdocument-helpers",
      children: "Important return-shape note for subdocument helpers"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Subdocument helpers intentionally expose more of the raw route payload."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "In practice:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "subs(...).list(...)"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "listAdvanced(...)"
        }), " return data in ", (0,jsx_runtime.jsx)(_components.code, {
          children: "raw"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), " is not wrapped into ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Model"
        }), " instances"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "subs(...).read(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "readAdvanced(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "create(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "update(...)"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "delete(...)"
        }), " also keep the useful payload in ", (0,jsx_runtime.jsx)(_components.code, {
          children: "raw"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you are handling subdocument routes, prefer reading from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "raw"
      }), " unless you have verified the higher-level ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data"
      }), " shape you want."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "example-1",
      children: "Example"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const statusHistory = userService.id(userId).subs('statusHistory');\n\nconst created = await statusHistory.create({\n  label: 'queued',\n  flag: 'orange',\n});\n\nconst listed = await statusHistory.list();\n\nconst bulkUpdated = await statusHistory.bulkUpdate([\n  { _id: 'sub-1', label: 'approved', flag: 'green' },\n  { _id: 'sub-2', label: 'rejected', flag: 'red' },\n]);\n"
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
      id: "example-2",
      children: "Example"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const fruits = await fruitService.listAdvanced(\n  { public: true },\n  { select: ['id', 'name'], limit: 10 },\n  { includeCount: true },\n);\n\nconst apple = await fruitService.readAdvanced('apple', { select: ['name'] });\n"
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