"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[163],{

/***/ 7646
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_hooks_mdx_fc5_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-hooks-mdx-fc5.json
const site_docs_packages_access_router_hooks_mdx_fc5_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router/hooks","title":"Hooks","description":"Model and data routers support request-time hooks for ACL decisions, filtering, decoration, and persistence side effects.","source":"@site/docs/packages/access-router/hooks.mdx","sourceDirName":"packages/access-router","slug":"/packages/access-router/hooks","permalink":"/docs/packages/access-router/hooks","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":5,"frontMatter":{"sidebar_label":"Hooks","sidebar_position":5},"sidebar":"packagesSidebar","previous":{"title":"Services","permalink":"/docs/packages/access-router/services"},"next":{"title":"Validation","permalink":"/docs/packages/access-router/validation"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
;// ./docs/packages/access-router/hooks.mdx


const frontMatter = {
	sidebar_label: 'Hooks',
	sidebar_position: 5
};
const contentTitle = 'Hooks';

const assets = {

};



const toc = [{
  "value": "Lifecycle",
  "id": "lifecycle",
  "level": 2
}, {
  "value": "Common Hook Signatures",
  "id": "common-hook-signatures",
  "level": 2
}, {
  "value": "<code>baseFilter</code>",
  "id": "basefilter",
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
  "value": "<code>beforeDelete</code> / <code>afterDelete</code>",
  "id": "beforedelete--afterdelete",
  "level": 3
}, {
  "value": "<code>docPermissions</code>",
  "id": "docpermissions",
  "level": 3
}, {
  "value": "<code>decorate</code> / <code>decorateAll</code>",
  "id": "decorate--decorateall",
  "level": 3
}, {
  "value": "Request Augmentation",
  "id": "request-augmentation",
  "level": 2
}, {
  "value": "Guard Helper",
  "id": "guard-helper",
  "level": 2
}, {
  "value": "Permissions Plugin",
  "id": "permissions-plugin",
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
        id: "hooks",
        children: "Hooks"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Model and data routers support request-time hooks for ACL decisions, filtering, decoration, and persistence side effects."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "lifecycle",
      children: "Lifecycle"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Model router flow:"
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
        children: ["delete flow: ", (0,jsx_runtime.jsx)(_components.code, {
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
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Data router flow is simpler and mainly uses ", (0,jsx_runtime.jsx)(_components.code, {
        children: "operationAccess"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "baseFilter"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "overrideFilter"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "decorate"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "decorateAll"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "common-hook-signatures",
      children: "Common Hook Signatures"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["All of these hooks run with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "this"
      }), " bound to the current Express request."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "basefilter",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "baseFilter"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Return a filter, or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "true"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), " to leave the query unmodified."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "overridefilter",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "overrideFilter"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Rewrite the caller-provided filter before the base filter is applied."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "validate",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "validate"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "true"
      }), " to allow the write, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "false"
      }), " to reject it, or an error array to surface validation errors."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "prepare",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "prepare"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Normalize incoming data before it is written."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "transform",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "transform"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Mutate the live Mongoose document before save."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "afterpersist",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "afterPersist"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Run after persistence and before response shaping."
    }), "\n", (0,jsx_runtime.jsxs)(_components.h3, {
      id: "beforedelete--afterdelete",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "beforeDelete"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "afterDelete"
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use these for audit logs, cache invalidation, and external side effects."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "docpermissions",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "docPermissions"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Return the document-level permission object stored on the configured permission field."
    }), "\n", (0,jsx_runtime.jsxs)(_components.h3, {
      id: "decorate--decorateall",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "decorate"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "decorateAll"
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use these to shape the response payload before it is returned."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "request-augmentation",
      children: "Request Augmentation"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Augment the package types when you want custom request fields or permission names:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import '@web-ts-toolkit/access-router';\n\ndeclare module '@web-ts-toolkit/access-router' {\n  interface AccessRouterPermissionMap {\n    isAdmin?: boolean;\n  }\n\n  interface AccessRouterRequestExtensions {\n    requestId?: string;\n  }\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "guard-helper",
      children: "Guard Helper"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "guard(...)"
      }), " is a route middleware helper."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "It accepts:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "a permission string"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "a permission string array"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "a hook function"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "a model condition object"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "router.router.get('/admin', guard('isAdmin'), async () => {\n  return { ok: true };\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "permissions-plugin",
      children: "Permissions Plugin"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "permissionsPlugin"
      }), " adds a virtual permission field to a schema and reads the configured document permission field from the active router options."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "schema.plugin(permissionsPlugin, {\n  modelName: 'User',\n  virtualPermissionField: 'permissions',\n});\n"
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