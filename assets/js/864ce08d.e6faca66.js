"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[753],{

/***/ 780
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
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
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
  "value": "Mutability",
  "id": "mutability",
  "level": 2
}];
function _createMdxContent(props) {
  const _components = {
    code: "code",
    h1: "h1",
    h2: "h2",
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
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "GET /base"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /base"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /base/__query"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /base/__mutation"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "GET /base/new"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "GET /base/:id"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /base/__query/:id"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "PATCH /base/:id"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "PATCH /base/__mutation/:id"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "PUT /base"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "PUT /base/__mutation"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "DELETE /base/:id"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "GET /base/count"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /base/count"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "GET /base/distinct/:field"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /base/distinct/:field"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Sub-document routes are generated for every referenced subpath discovered on the model schema."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "data-router-routes",
      children: "Data Router Routes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Default route segment is ", (0,jsx_runtime.jsx)(_components.code, {
        children: "__query"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "GET /base"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /base/__query"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "GET /base/:id"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /base/__query/__filter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /base/__query/:id"
        })
      }), "\n"]
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