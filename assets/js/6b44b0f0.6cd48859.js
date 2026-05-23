"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[639],{

/***/ 2630
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_validation_mdx_6b4_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-validation-mdx-6b4.json
const site_docs_packages_access_router_validation_mdx_6b4_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router/validation","title":"Validation","description":"access-router validates requests before the service layer runs.","source":"@site/docs/packages/access-router/validation.mdx","sourceDirName":"packages/access-router","slug":"/packages/access-router/validation","permalink":"/docs/packages/access-router/validation","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":6,"frontMatter":{"sidebar_label":"Validation","sidebar_position":6},"sidebar":"packagesSidebar","previous":{"title":"Hooks","permalink":"/docs/packages/access-router/hooks"},"next":{"title":"Advanced","permalink":"/docs/packages/access-router/advanced"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
;// ./docs/packages/access-router/validation.mdx


const frontMatter = {
	sidebar_label: 'Validation',
	sidebar_position: 6
};
const contentTitle = 'Validation';

const assets = {

};



const toc = [{
  "value": "Built-in Validation",
  "id": "built-in-validation",
  "level": 2
}, {
  "value": "Request Schemas",
  "id": "request-schemas",
  "level": 2
}, {
  "value": "Root Batch Validation",
  "id": "root-batch-validation",
  "level": 2
}, {
  "value": "Custom Routes",
  "id": "custom-routes",
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
        id: "validation",
        children: "Validation"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " validates requests before the service layer runs."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "built-in-validation",
      children: "Built-in Validation"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The routers validate:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["path params such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "subId"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "field"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["query params such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "page_size"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "include_count"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "include_permissions"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "try_list"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "body shapes for list, read, create, update, upsert, distinct, count, and sub-document routes"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Naming conventions:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "query-string routes use snake_case"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "advanced body payloads use camelCase"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["advanced body payloads use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "filter"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "select"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "request-schemas",
      children: "Request Schemas"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Model routers support ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requestSchemas"
      }), " for stricter application-level validation."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Useful keys include:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "create"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "update"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "upsert"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "count"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "distinct"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedList"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedReadFilter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedRead"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedCreate"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedCreateData"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedUpdate"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedUpdateData"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedUpsert"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedUpsertData"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "subList"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "subRead"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "subCreate"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "subUpdate"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "subBulkUpdate"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Data routers support:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedList"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedReadFilter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedRead"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "root-batch-validation",
      children: "Root Batch Validation"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "RootRouter"
      }), " validates each batch entry by operation before dispatch."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["That means required fields such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "id"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "field"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "subId"
      }), " fail early with a bad request response."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "custom-routes",
      children: "Custom Routes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "advanced"
      }), " subpath when you want the same validation helpers in your own routes."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import {\n  parseBody,\n  parsePathParam,\n  parseQuery,\n  requestSchemas,\n  readByIdBodySchema,\n} from '@web-ts-toolkit/access-router/advanced';\n\nrouter.router.post('/custom/:id', async (req) => {\n  const id = parsePathParam(req.params.id, 'id');\n  const query = parseQuery(requestSchemas.readQuery, req.query);\n  const body = parseBody(readByIdBodySchema, req.body);\n\n  return { id, query, body };\n});\n"
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