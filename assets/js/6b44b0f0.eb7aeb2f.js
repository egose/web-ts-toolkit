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
const site_docs_packages_access_router_validation_mdx_6b4_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router/validation","title":"Validation","description":"access-router validates requests before the service layer runs.","source":"@site/docs/packages/access-router/validation.mdx","sourceDirName":"packages/access-router","slug":"/packages/access-router/validation","permalink":"/docs/packages/access-router/validation","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":6,"frontMatter":{"sidebar_label":"Validation","sidebar_position":6},"sidebar":"packagesSidebar","previous":{"title":"Hooks","permalink":"/docs/packages/access-router/hooks"},"next":{"title":"OpenAPI","permalink":"/docs/packages/access-router/openapi"}}');
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
  "value": "RequestSchemas Inputs",
  "id": "requestschemas-inputs",
  "level": 2
}, {
  "value": "Helper Adapters",
  "id": "helper-adapters",
  "level": 2
}, {
  "value": "<code>defineRequestSchema(...)</code>",
  "id": "definerequestschema",
  "level": 2
}, {
  "value": "Examples",
  "id": "examples",
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
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "requestSchemas"
      }), " are validation-library agnostic for user-defined validation:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "raw Zod schemas still work"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["raw ", (0,jsx_runtime.jsx)(_components.code, {
          children: "standard-schema"
        }), " objects work"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "custom validator functions work"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["adapter objects with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "validate(value)"
        }), " work"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you want custom OpenAPI output for a user-defined validator, wrap it with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "defineRequestSchema(...)"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "requestschemas-inputs",
      children: "RequestSchemas Inputs"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "requestSchemas"
      }), " can be provided as:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["a raw schema object the router already understands, such as Zod or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "standard-schema"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["a custom function returning ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ success, data }"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ success, issues }"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["an adapter object with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "validate(value)"
        }), " returning the same result shape"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Custom validators must return:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "{ success: true, data }\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "or:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "{\n  success: false,\n  issues: [{ message: 'Required', path: ['data', 'name'] }],\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The router converts those issues into the standard bad-request error format."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "helper-adapters",
      children: "Helper Adapters"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Helpers exported by ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/access-router"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["generic adapters: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "fromZod(schema)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "fromStandardSchema(schema)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["schema/helper adapters: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "fromYup(schema)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "fromJoi(schema)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "fromAjv(validate)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["schema/helper adapters: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "fromValibot(schema, safeParse)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "fromArkType(type)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["schema/helper adapters: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "fromIoTs(codec)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "fromSuperstruct(struct, validate)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "fromVine(validator)"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "definerequestschema",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "defineRequestSchema(...)"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "defineRequestSchema(validator, { openapi })"
      }), " when you want a custom validator and still want the generated OpenAPI document to describe that request body."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { defineRequestSchema } from '@web-ts-toolkit/access-router';\n\nrequestSchemas: {\n  advancedCreate: defineRequestSchema(\n    async (value) => {\n      const body = value as { data?: { role?: string } };\n\n      if (body?.data?.role !== 'user' && body?.data?.role !== 'admin') {\n        return {\n          success: false,\n          issues: [{ message: 'role must be user or admin', path: ['data', 'role'] }],\n        };\n      }\n\n      return { success: true, data: body };\n    },\n    {\n      openapi: {\n        type: 'object',\n        properties: {\n          data: {\n            type: 'object',\n            properties: {\n              role: { type: 'string', enum: ['user', 'admin'] },\n            },\n          },\n        },\n      },\n    },\n  ),\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Without ", (0,jsx_runtime.jsx)(_components.code, {
        children: "openapi"
      }), " metadata, custom validators still work for runtime validation, but the generated OpenAPI schema falls back to a generic object shape."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "examples",
      children: "Examples"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Example with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "standard-schema"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "requestSchemas: {\n  advancedRead: {\n    '~standard': {\n      version: 1,\n      vendor: 'my-validator',\n      validate(value) {\n        const body = value as { select?: unknown };\n\n        if (body.select !== undefined && !Array.isArray(body.select)) {\n          return {\n            issues: [{ message: 'Expected array', path: ['select'] }],\n          };\n        }\n\n        return { value: body };\n      },\n    },\n  },\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example with Valibot:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import * as v from 'valibot';\nimport { fromValibot } from '@web-ts-toolkit/access-router';\n\nrequestSchemas: {\n  advancedRead: fromValibot(\n    v.object({\n      select: v.optional(v.array(v.string())),\n    }),\n    v.safeParse,\n  ),\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example with ArkType:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { type } from 'arktype';\nimport { fromArkType } from '@web-ts-toolkit/access-router';\n\nrequestSchemas: {\n  advancedList: fromArkType(\n    type({\n      'filter?': {\n        'public?': 'boolean',\n      },\n    }),\n  ),\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example with io-ts:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import * as t from 'io-ts';\nimport { fromIoTs } from '@web-ts-toolkit/access-router';\n\nrequestSchemas: {\n  advancedRead: fromIoTs(\n    t.type({\n      select: t.union([t.undefined, t.array(t.string)]),\n    }),\n  ),\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example with Superstruct:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { object, optional, array, string, validate } from 'superstruct';\nimport { fromSuperstruct } from '@web-ts-toolkit/access-router';\n\nconst schema = object({\n  select: optional(array(string())),\n});\n\nrequestSchemas: {\n  advancedRead: fromSuperstruct(schema, validate),\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example with Vine:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import vine from '@vinejs/vine';\nimport { fromVine } from '@web-ts-toolkit/access-router';\n\nconst validator = vine.create({\n  select: vine.array(vine.string()).optional(),\n});\n\nrequestSchemas: {\n  advancedRead: fromVine(validator),\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example with a custom validator:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "requestSchemas: {\n  advancedCreate: {\n    data: async (value) => {\n      const data = value as { role?: unknown };\n\n      if (data.role !== 'user') {\n        return {\n          success: false,\n          issues: [{ message: 'Invalid role', path: ['role'] }],\n        };\n      }\n\n      return { success: true, data };\n    },\n  },\n}\n"
      })
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