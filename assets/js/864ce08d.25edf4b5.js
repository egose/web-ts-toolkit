"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[753],{

/***/ 3185
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_routing_mdx_864_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-routing-mdx-864.json
const site_docs_packages_access_router_routing_mdx_864_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router/routing","title":"Routing","description":"access-router gives you three router classes:","source":"@site/docs/packages/access-router/routing.mdx","sourceDirName":"packages/access-router","slug":"/packages/access-router/routing","permalink":"/docs/packages/access-router/routing","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":2,"frontMatter":{"sidebar_label":"Routing","sidebar_position":2},"sidebar":"packagesSidebar","previous":{"title":"Overview","permalink":"/docs/packages/access-router/"},"next":{"title":"Configuration","permalink":"/docs/packages/access-router/configuration"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.3.0_react@19.3.0/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(3191);
;// ./docs/packages/access-router/routing.mdx


const frontMatter = {
	sidebar_label: 'Routing',
	sidebar_position: 2
};
const contentTitle = 'Routing';

const assets = {

};



const toc = [{
  "value": "Router Factories",
  "id": "router-factories",
  "level": 2
}, {
  "value": "Mounting",
  "id": "mounting",
  "level": 2
}, {
  "value": "Model Router Routes",
  "id": "model-router-routes",
  "level": 2
}, {
  "value": "Data Router Routes",
  "id": "data-router-routes",
  "level": 2
}, {
  "value": "Root Router",
  "id": "root-router",
  "level": 2
}, {
  "value": "OpenAPI Router",
  "id": "openapi-router",
  "level": 2
}, {
  "value": "Mutability",
  "id": "mutability",
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
        id: "routing",
        children: "Routing"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " gives you three router classes:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "RootRouter"
        }), " for batch requests"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "ModelRouter"
        }), " for Mongoose models"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "DataRouter"
        }), " for in-memory collections"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The main factory is ", (0,jsx_runtime.jsx)(_components.code, {
        children: "acl.createRouter(...)"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "router-factories",
      children: "Router Factories"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import mongoose from 'mongoose';\nimport acl from '@web-ts-toolkit/access-router';\n\nconst modelRouter = acl.createRouter('User', { basePath: '/users' });\nconst dataRouter = acl.createDataRouter('fruit', { basePath: '/fruit', data: [] });\nconst rootRouter = acl.createRouter({ basePath: '/batch', operationAccess: true });\n\nconst typedRouter = acl.createRouter(\n  mongoose.model('User', new mongoose.Schema({ name: String })),\n  { basePath: '/users' },\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "createAccessRuntime()"
      }), " returns a fresh ", (0,jsx_runtime.jsx)(_components.code, {
        children: "acl"
      }), " instance with isolated runtime state."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "mounting",
      children: "Mounting"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Each router exposes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "router"
        }), " for the internal JsonRouter instance"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "routes"
        }), " for the underlying Express router"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "fullBasePath"
        }), " for the normalized mounted path"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "combineRoutes(...)"
      }), " to mount several routers at once."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\nimport acl, { combineRoutes } from '@web-ts-toolkit/access-router';\n\napp.use(combineRoutes(fruitRouter, userRouter, rootRouter));\napp.use(acl.combineRoutes(fruitRouter, userRouter, rootRouter));\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "combineRoutes(...)"
      }), " accepts ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelRouter"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DataRouter"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "RootRouter"
      }), ", or a plain Express ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Router"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "model-router-routes",
      children: "Model Router Routes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Default route segments are ", (0,jsx_runtime.jsx)(_components.code, {
        children: "__query"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "__mutation"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Base guard"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Basic endpoint → override"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Advanced endpoint → override"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "list"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "GET /base"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "basicList"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "POST /base/__query"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "advancedList"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "read"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "GET /base/:id"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "basicRead"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "POST /base/__query/:id"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "POST /base/__query/__filter"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "advancedRead"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "create"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "POST /base"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "basicCreate"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "POST /base/__mutation"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "advancedCreate"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "update"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "PATCH /base/:id"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "basicUpdate"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "PATCH /base/__mutation/:id"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "advancedUpdate"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "upsert"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "PUT /base"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "basicUpsert"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "PUT /base/__mutation"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "advancedUpsert"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "count"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "GET /base/count"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "basicCount"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "POST /base/count"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "advancedCount"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "distinct"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "GET /base/distinct/:field"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "basicDistinct"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "POST /base/distinct/:field"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "advancedDistinct"
            })]
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "GET /base/new"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DELETE /base/:id"
      }), " keep unpaired ", (0,jsx_runtime.jsx)(_components.code, {
        children: "new"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "delete"
      }), " guards.\nFiltered count/distinct POSTs are advanced even without an advanced path segment.\nCustom ", (0,jsx_runtime.jsx)(_components.code, {
        children: "idParam"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "queryRouteSegment"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mutationRouteSegment"
      }), " change the paths,\nnot the guard names."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["An exact variant replaces its base guard; only undefined inherits. Denials return\n", (0,jsx_runtime.jsx)(_components.strong, {
        children: "HTTP 401 Unauthorized"
      }), " before validation/service dispatch. All endpoints remain\nregistered in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "router.router.getEndpoints()"
      }), " and OpenAPI. HEAD fallback uses its\ncorresponding GET's basic guard. See ", (0,jsx_runtime.jsx)(_components.a, {
        href: "./configuration#operation-access",
        children: "Configuration"
      }), "\nfor fallback, model-default, and closed-subdocument-field behavior."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import acl from '@web-ts-toolkit/access-router';\n\n// User is already registered with the default runtime.\nconst router = acl.createRouter('User', {\n  basePath: '/users',\n  operationAccess: { list: true, read: true, basicRead: false },\n  permissionSchema: { name: true },\n});\nrouter.operationAccess('basicRead', false); // Live key update.\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Among top-level model routes, this denies GET/HEAD ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/users/:id"
      }), " only. Both advanced reads and GET ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/users"
      }), " remain\nallowed, subject to ordinary field/row policy; new/count/distinct/mutation guards\nare unaffected. Subdocument reads use the documented field fallback. With\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ list: true, advancedList: false }"
      }), ", only POST\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "/users/__query"
      }), " is denied among the list pair."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Basic model list GETs accept ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sort"
      }), " query params, for example\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "GET /base?select=name&sort=name%20-createdAt"
      }), ". ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sort"
      }), " is a single\nspace-separated list of fields, prefixed with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "-"
      }), " for descending; order sets\nmulti-field priority. Sort authorization and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sortableFields"
      }), "/\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "stripDisallowedSort"
      }), " apply exactly as on advanced lists. Omitted sort keeps\nbackend defaults; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "?sort="
      }), " disables them. Basic GET-by-id reads also accept\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Sub-document routes are generated for every referenced subpath discovered on the model schema."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For each subdocument path ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sub"
      }), ", these routes are added:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Base guard"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Basic endpoint → override"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Advanced endpoint → override"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "subs.<sub>.list"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "GET /base/:id/<sub>"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "subs.<sub>.basicList"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "POST /base/:id/<sub>/__query"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "subs.<sub>.advancedList"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "subs.<sub>.read"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "GET /base/:id/<sub>/:subId"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "subs.<sub>.basicRead"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "POST /base/:id/<sub>/:subId/__query"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "subs.<sub>.advancedRead"
            })]
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Unpaired subdocument mutations retain their base guards:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "PATCH /base/:id/<sub>"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "PATCH /base/:id/<sub>/:subId"
        }), " → ", (0,jsx_runtime.jsx)(_components.code, {
          children: "subs.<sub>.update"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "POST /base/:id/<sub>"
        }), " → ", (0,jsx_runtime.jsx)(_components.code, {
          children: "subs.<sub>.create"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "DELETE /base/:id/<sub>/:subId"
        }), " → ", (0,jsx_runtime.jsx)(_components.code, {
          children: "subs.<sub>.delete"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That gives you generated list, advanced list, bulk update, read, advanced read, update, create, and delete operations for each discovered subdocument collection."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "data-router-routes",
      children: "Data Router Routes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Default route segment is ", (0,jsx_runtime.jsx)(_components.code, {
        children: "__query"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Base guard"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Basic endpoint → override"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Advanced endpoint → override"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "list"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "GET /base"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "basicList"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "POST /base/__query"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "advancedList"
            })]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "read"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "GET /base/:id"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "basicRead"
            })]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "POST /base/__query/:id"
            }), ", ", (0,jsx_runtime.jsx)(_components.code, {
              children: "POST /base/__query/__filter"
            }), " → ", (0,jsx_runtime.jsx)(_components.code, {
              children: "advancedRead"
            })]
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["These four keys use data-router options only, with no model-default inheritance.\nSet ", (0,jsx_runtime.jsx)(_components.code, {
        children: "idParam: 'id'"
      }), " explicitly for the illustrated data identifier paths.\nBoth advanced reads share ", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedRead"
      }), "; HEAD follows the basic GET guard."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "root-router",
      children: "Root Router"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "RootRouter"
      }), " handles batch payloads that dispatch to model or data operations."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use it when you want a single request to run multiple operations in order."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Each batch item uses:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "target"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "model"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "name"
        }), ": the model or data router name"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "op"
        }), ": the operation name"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "order"
        }), ": optional execution bucket"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Operation-specific fields are kept at the top level:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "id"
        }), " for single-document operations"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "sub"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "subId"
        }), " for sub-document operations"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "field"
        }), " for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "distinct"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "filter"
        }), " for query-based lookups"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), " for writes"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "args"
        }), " for selection, populate, paging, and task inputs"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "options"
        }), " for behavior switches such as permissions and counts"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Root entries retain existing base operation names and target base entry checks;\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "basicList"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedRead"
      }), " (and the other variants) are not valid ", (0,jsx_runtime.jsx)(_components.code, {
        children: "op"
      }), " values.\nAllowing a direct variant does not override a denied root base entry. A denied\nentry has status 401 inside the HTTP 200 batch envelope. The enclosing root\nendpoint's own ", (0,jsx_runtime.jsx)(_components.code, {
        children: "operationAccess"
      }), " remains a scalar guard."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Root entries accept the same ", (0,jsx_runtime.jsx)(_components.code, {
        children: "include"
      }), " shapes as direct routes: legacy\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "localField"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "foreignField"
      }), " joins and correlated entries\n(", (0,jsx_runtime.jsx)(_components.code, {
        children: "mode: 'correlated'"
      }), " with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ \"$parent\": \"<field>\" }"
      }), " markers resolved per\nparent against the immediate parent snapshot). Direct and root validators\nshare one schema, so verdicts agree; malformed correlated input is a\ncontrolled ", (0,jsx_runtime.jsx)(_components.code, {
        children: "BadRequest"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The response wraps each operation as:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "{\n  index: number;\n  target: 'model' | 'data';\n  name: string;\n  op: string;\n  statusCode: number;\n  message: string;\n  result: unknown;\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "result"
      }), " keeps the underlying service response instead of flattening it into a second batch-only format."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "openapi-router",
      children: "OpenAPI Router"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " can also mount a separate documentation router:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "app.use(acl.createOpenApiRouter());\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "By default this exposes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "GET /openapi.json"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "GET /docs"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["You can customize those paths with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "jsonPath"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "docsPath"
      }), ", or disable Swagger UI entirely with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "docsPath: false"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "mutability",
      children: "Mutability"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Build-time route-shape options are immutable after router construction."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Model router build-time options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "basePath"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "parentPath"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "idParam"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "queryRouteSegment"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "mutationRouteSegment"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Data router build-time options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "basePath"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "parentPath"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "idParam"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "queryRouteSegment"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Behavior options such as filters, hooks, permissions, and defaults can be changed later with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "set(...)"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "setOption(...)"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "setOptions(...)"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Operation variants are live behavior options. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "router.operationAccess('basicRead', false)"
      }), " updates one key. Passing an object replaces the whole ", (0,jsx_runtime.jsx)(_components.code, {
        children: "operationAccess"
      }), "\nobject shallowly, not a deep merge. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "router.options"
      }), " stays a frozen construction\nsnapshot; read current stored values through the owning runtime's getters."]
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
          href: "./configuration",
          children: "Configuration"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./services",
          children: "Services"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./openapi",
          children: "OpenAPI"
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