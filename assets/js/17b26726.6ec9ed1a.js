"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[218],{

/***/ 3052
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_client_typescript_and_errors_mdx_17b_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-client-typescript-and-errors-mdx-17b.json
const site_docs_packages_access_router_client_typescript_and_errors_mdx_17b_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router-client/typescript-and-errors","title":"TypeScript And Errors","description":"This package is strongly typed around your document and data shapes.","source":"@site/docs/packages/access-router-client/typescript-and-errors.mdx","sourceDirName":"packages/access-router-client","slug":"/packages/access-router-client/typescript-and-errors","permalink":"/docs/packages/access-router-client/typescript-and-errors","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":5,"frontMatter":{"sidebar_label":"TypeScript And Errors","sidebar_position":5},"sidebar":"packagesSidebar","previous":{"title":"Model","permalink":"/docs/packages/access-router-client/model"},"next":{"title":"Express JSON Router","permalink":"/docs/packages/express-json-router"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
;// ./docs/packages/access-router-client/typescript-and-errors.mdx


const frontMatter = {
	sidebar_label: 'TypeScript And Errors',
	sidebar_position: 5
};
const contentTitle = 'TypeScript And Errors';

const assets = {

};



const toc = [{
  "value": "Generic Model And Data Types",
  "id": "generic-model-and-data-types",
  "level": 2
}, {
  "value": "Selected Field Inference",
  "id": "selected-field-inference",
  "level": 2
}, {
  "value": "Overriding The Inferred Shape",
  "id": "overriding-the-inferred-shape",
  "level": 2
}, {
  "value": "Important Response Types",
  "id": "important-response-types",
  "level": 2
}, {
  "value": "Error Handling Modes",
  "id": "error-handling-modes",
  "level": 2
}, {
  "value": "<code>ServiceError</code>",
  "id": "serviceerror",
  "level": 2
}, {
  "value": "Lazy Request Type",
  "id": "lazy-request-type",
  "level": 2
}, {
  "value": "One Practical Rule",
  "id": "one-practical-rule",
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
        id: "typescript-and-errors",
        children: "TypeScript And Errors"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This package is strongly typed around your document and data shapes."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "generic-model-and-data-types",
      children: "Generic Model And Data Types"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "You usually start by providing a document shape when you create a service."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "interface User {\n  _id?: string;\n  name: string;\n  role: string;\n  public: boolean;\n}\n\nconst userService = adapter.createModelService<User>({\n  modelName: 'User',\n  basePath: 'users',\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That type then flows through:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "ModelService<User>"
        }), " methods"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "Model<User>"
        }), " wrappers"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["response ", (0,jsx_runtime.jsx)(_components.code, {
          children: "raw"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), " types"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "For model services, there are usually two useful layers of typing:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "the raw server document shape"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["the wrapped client-facing ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Model<T> & TData"
        }), " shape in ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "selected-field-inference",
      children: "Selected Field Inference"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Advanced methods infer narrower response shapes when ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), " is precise enough."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const user = await userService.readAdvanced('user-1', {\n  select: ['name', 'role'] as const,\n});\n\nuser.raw;\n// Pick<User, 'name' | 'role'>\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Projection styles that participate in inference:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["readonly tuple arrays such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "['name', 'role'] as const"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["exact string literals such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "'name'"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["exact projection objects such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ name: 1, role: 1 } as const"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If the projection is too wide, the client falls back to a looser ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Partial<T>"
      }), "-style shape."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That fallback is intentional. The client only narrows types when the projection is specific enough to be trustworthy at compile time."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "overriding-the-inferred-shape",
      children: "Overriding The Inferred Shape"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "You can provide an explicit result type if you want something narrower than the inferred selection."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const user = await userService.readAdvanced<{ name: string }>('user-1', {\n  select: { name: 1, role: 1 } as const,\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That is most useful when:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "the server adds derived fields"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "you intentionally want to hide part of the selected type at the call site"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "you are bridging older code that expects a custom shape"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "important-response-types",
      children: "Important Response Types"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Common exported types include:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "Response<TRaw, TData = TRaw>"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "ModelResponse<T, TData = T>"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "ListModelResponse<T, TData = T>"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "DataResponse<T>"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "ListDataResponse<T>"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "Projection"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "FilterQuery<T>"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "Populate"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "Include"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "WrapOptions"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "WrapOptions"
      }), " is used by wrapped endpoints:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "interface WrapOptions {\n  queryParams?: Record<string, unknown>;\n  pathParams?: Record<string, string | number>;\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Two practical distinctions matter a lot:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ModelService"
        }), " reads, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "raw"
        }), " is usually plain selected document data while ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), " is usually a ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Model<T>"
        }), " wrapper"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DataService"
        }), " reads, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "raw"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        }), " are usually the same plain value"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "error-handling-modes",
      children: "Error Handling Modes"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "By default, service methods resolve to normalized failure objects instead of throwing."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const result = await userService.read('missing-id');\n\nif (!result.success) {\n  console.log(result.status, result.message);\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you prefer exceptions, enable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "throwOnError"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const userService = adapter.createModelService<User>({\n  modelName: 'User',\n  basePath: 'users',\n  throwOnError: true,\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Or per request:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "await userService.read('missing-id', undefined, {\n  throwOnError: true,\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["In that mode, failed requests reject with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ServiceError"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This gives you two consistent styles:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["result-oriented control flow with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "if (!result.success)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["exception-oriented control flow with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "try/catch"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "serviceerror",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "ServiceError"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "ServiceError"
      }), " extends ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Error"
      }), " and keeps the normalized response fields:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "success"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "raw"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "status"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "headers"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { ServiceError } from '@web-ts-toolkit/access-router-client';\n\ntry {\n  await userService.read('missing-id', undefined, { throwOnError: true });\n} catch (error) {\n  if (error instanceof ServiceError) {\n    console.log(error.status);\n    console.log(error.message);\n    console.log(error.raw);\n  }\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The ", (0,jsx_runtime.jsx)(_components.code, {
        children: "message"
      }), " is extracted from structured server payloads in this order when available:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "detail"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "message"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "title"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["nested entries inside ", (0,jsx_runtime.jsx)(_components.code, {
          children: "errors"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That makes validation and problem-detail responses much easier to log and display than raw Axios errors."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "If the response payload is not structured, the client falls back to stringifying the payload or using the underlying Axios error message."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "lazy-request-type",
      children: "Lazy Request Type"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Service methods return a promise-like ", (0,jsx_runtime.jsx)(_components.code, {
        children: "LazyRequest<T>"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "interface LazyRequest<T> extends Promise<T> {\n  exec(): Promise<T>;\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This matters for two reasons:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["you can force execution with ", (0,jsx_runtime.jsx)(_components.code, {
          children: ".exec()"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "adapter.group(...)"
        }), " relies on the lazy request metadata attached to these objects"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Treat them like promises in normal code, but remember they also carry batching metadata internally."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "one-practical-rule",
      children: "One Practical Rule"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you plan to batch requests with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "adapter.group(...)"
      }), ", keep them as client-returned lazy requests until the group call."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This works:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const readUser = userService.read('user-1');\nconst countUsers = userService.count();\n\nconst [user, count] = await adapter.group(readUser, countUsers);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This does not:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const user = await userService.read('user-1');\nconst count = await userService.count();\n\nawait adapter.group(user, count);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Once awaited, the lazy request metadata is gone and you no longer have a batchable request object."
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