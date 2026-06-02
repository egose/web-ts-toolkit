"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[833],{

/***/ 403
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_advanced_mdx_614_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-advanced-mdx-614.json
const site_docs_packages_access_router_advanced_mdx_614_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router/advanced","title":"Advanced","description":"Use @web-ts-toolkit/access-router/advanced when you need the lower-level contract surface.","source":"@site/docs/packages/access-router/advanced.mdx","sourceDirName":"packages/access-router","slug":"/packages/access-router/advanced","permalink":"/docs/packages/access-router/advanced","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":8,"frontMatter":{"sidebar_label":"Advanced","sidebar_position":8},"sidebar":"packagesSidebar","previous":{"title":"OpenAPI","permalink":"/docs/packages/access-router/openapi"},"next":{"title":"Processors","permalink":"/docs/packages/access-router/processors"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
;// ./docs/packages/access-router/advanced.mdx


const frontMatter = {
	sidebar_label: 'Advanced',
	sidebar_position: 8
};
const contentTitle = 'Advanced';

const assets = {

};



const toc = [{
  "value": "What It Exports",
  "id": "what-it-exports",
  "level": 2
}, {
  "value": "Common Validation Imports",
  "id": "common-validation-imports",
  "level": 2
}, {
  "value": "Example",
  "id": "example",
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
        id: "advanced",
        children: "Advanced"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/access-router/advanced"
      }), " when you need the lower-level contract surface."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-exports",
      children: "What It Exports"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["validation helpers and schemas from ", (0,jsx_runtime.jsx)(_components.code, {
          children: "validation/*"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["enums such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Codes"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "StatusCodes"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "CustomHeaders"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "FilterOperator"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["symbols such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "MIDDLEWARE"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DATA_MIDDLEWARE"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "CORE"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "PERMISSIONS"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "PERMISSION_KEYS"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["the full interface/type surface from ", (0,jsx_runtime.jsx)(_components.code, {
          children: "interfaces/*"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "common-validation-imports",
      children: "Common Validation Imports"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import {\n  parseBody,\n  parsePathParam,\n  parseQuery,\n  requestSchemas,\n  readByIdBodySchema,\n} from '@web-ts-toolkit/access-router/advanced';\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use these helpers in custom routes when you want the same request validation behavior as the built-in endpoints."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "example",
      children: "Example"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "router.router.post('/custom/:id', async (req) => {\n  const id = parsePathParam(req.params.id, 'id');\n  const query = parseQuery(requestSchemas.readQuery, req.query);\n  const body = parseBody(readByIdBodySchema, req.body);\n\n  return { id, query, body };\n});\n"
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