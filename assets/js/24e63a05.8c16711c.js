"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[705],{

/***/ 3168
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_openapi_mdx_24e_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-openapi-mdx-24e.json
const site_docs_packages_access_router_openapi_mdx_24e_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router/openapi","title":"OpenAPI","description":"access-router registers generated routes into an internal OpenAPI registry and can expose that registry as JSON and Swagger UI.","source":"@site/docs/packages/access-router/openapi.mdx","sourceDirName":"packages/access-router","slug":"/packages/access-router/openapi","permalink":"/docs/packages/access-router/openapi","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":7,"frontMatter":{"sidebar_label":"OpenAPI","sidebar_position":7},"sidebar":"packagesSidebar","previous":{"title":"Validation","permalink":"/docs/packages/access-router/validation"},"next":{"title":"Advanced","permalink":"/docs/packages/access-router/advanced"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
;// ./docs/packages/access-router/openapi.mdx


const frontMatter = {
	sidebar_label: 'OpenAPI',
	sidebar_position: 7
};
const contentTitle = 'OpenAPI';

const assets = {

};



const toc = [{
  "value": "Quick Start",
  "id": "quick-start",
  "level": 2
}, {
  "value": "What Gets Documented",
  "id": "what-gets-documented",
  "level": 2
}, {
  "value": "Operation IDs",
  "id": "operation-ids",
  "level": 2
}, {
  "value": "Swagger UI Options",
  "id": "swagger-ui-options",
  "level": 2
}, {
  "value": "Custom Validation Schemas",
  "id": "custom-validation-schemas",
  "level": 2
}, {
  "value": "Response Metadata",
  "id": "response-metadata",
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
        id: "openapi",
        children: "OpenAPI"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " registers generated routes into an internal OpenAPI registry and can expose that registry as JSON and Swagger UI."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\nimport acl from '@web-ts-toolkit/access-router';\n\nconst app = express();\n\nconst userRouter = acl.createRouter('User', {\n  basePath: '/users',\n});\n\napp.use(userRouter.routes);\napp.use(\n  acl.createOpenApiRouter({\n    title: 'Example API',\n    version: '1.0.0',\n  }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Default routes:"
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
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-gets-documented",
      children: "What Gets Documented"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Generated documentation includes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "model router endpoints"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "data router endpoints"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "root batch router endpoints"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "generated path parameters, query parameters, and request bodies"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "default success and error responses"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "route tags and operation ids"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Paths are emitted as OpenAPI-style paths such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/users/{id}"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "operation-ids",
      children: "Operation IDs"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Generated operation ids follow the router naming conventions, for example:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "User.list"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "User.createAdvanced"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "User.read"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "User.readByFilterAdvanced"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "User.updateAdvanced"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "User.members.list"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "root.query"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "swagger-ui-options",
      children: "Swagger UI Options"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "createOpenApiRouter(...)"
      }), " accepts:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "title"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "version"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "description"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "servers"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "jsonPath"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "docsPath"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "swaggerUiCssUrl"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "swaggerUiBundleUrl"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example with custom paths:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "app.use(\n  acl.createOpenApiRouter({\n    title: 'Internal API',\n    version: '2026-06-01',\n    jsonPath: '/spec/openapi.json',\n    docsPath: '/reference',\n  }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "JSON-only mode:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "app.use(\n  acl.createOpenApiRouter({\n    title: 'Internal API',\n    version: '1.0.0',\n    docsPath: false,\n  }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "custom-validation-schemas",
      children: "Custom Validation Schemas"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Built-in request schemas are translated automatically."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For custom validators, attach explicit OpenAPI metadata with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "defineRequestSchema(...)"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { defineRequestSchema } from '@web-ts-toolkit/access-router';\n\nconst advancedCreateSchema = defineRequestSchema(\n  async (value) => {\n    return { success: true, data: value };\n  },\n  {\n    openapi: {\n      type: 'object',\n      properties: {\n        data: {\n          type: 'object',\n          additionalProperties: true,\n        },\n      },\n    },\n  },\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "response-metadata",
      children: "Response Metadata"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If a route does not override responses manually, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " derives default responses from route metadata:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "list-like routes get list-style responses"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["create routes get ", (0,jsx_runtime.jsx)(_components.code, {
          children: "201 Created"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "delete routes get delete-style responses"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "other routes get single-resource responses"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Default error responses are documented with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "application/problem+json"
      }), " payloads."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "notes",
      children: "Notes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["The generated document is OpenAPI ", (0,jsx_runtime.jsx)(_components.code, {
          children: "3.1.0"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Duplicate routes are replaced by ", (0,jsx_runtime.jsx)(_components.code, {
          children: "method + path"
        }), ", so later registrations win."]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "The OpenAPI router documents generated routes only; your custom Express endpoints need separate registration if you want them in the same spec."
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