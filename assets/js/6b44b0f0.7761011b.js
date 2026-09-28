"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[639],{

/***/ 8644
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
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(7008);
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
  "value": "Include Validation (Legacy And Correlated)",
  "id": "include-validation-legacy-and-correlated",
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
  "value": "AJV: synchronous verdicts and tagged asynchronous data",
  "id": "ajv-synchronous-verdicts-and-tagged-asynchronous-data",
  "level": 3
}, {
  "value": "<code>defineRequestSchema(...)</code>",
  "id": "definerequestschema",
  "level": 2
}, {
  "value": "Examples",
  "id": "examples",
  "level": 2
}, {
  "value": "Related Pages",
  "id": "related-pages",
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
      id: "include-validation-legacy-and-correlated",
      children: "Include Validation (Legacy And Correlated)"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "include"
      }), " entries are validated by the shared ", (0,jsx_runtime.jsx)(_components.code, {
        children: "includeItemSchema"
      }), ", reused\nidentically by direct model routes and grouped root entries, so both paths\nreturn the same verdicts. Two variants are accepted:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Legacy"
        }), " (", (0,jsx_runtime.jsx)(_components.code, {
          children: "mode"
        }), " absent or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "'legacy'"
        }), "): requires\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "localField"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "foreignField"
        }), " for batched joins."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Correlated"
        }), " (", (0,jsx_runtime.jsx)(_components.code, {
          children: "mode: 'correlated'"
        }), "): requires ", (0,jsx_runtime.jsx)(_components.code, {
          children: "model"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "op"
        }), "\n(", (0,jsx_runtime.jsx)(_components.code, {
          children: "'read'"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "'list'"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "'count'"
        }), "), and an explicit output ", (0,jsx_runtime.jsx)(_components.code, {
          children: "path"
        }), "; exactly one\nof ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id"
        }), " (identifier reads) or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "filter"
        }), " (filter reads, lists, counts) must\nbe present. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "localField"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "foreignField"
        }), " must be absent. Args are\nallowlisted per operation (reads ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ select, sort, include }"
        }), "; lists add\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ skip, limit, page, pageSize }"
        }), "; counts take no args) and wire ", (0,jsx_runtime.jsx)(_components.code, {
          children: "options"
        }), "\nmust be absent or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{}"
        }), ". A legacy-shaped entry carrying ", (0,jsx_runtime.jsx)(_components.code, {
          children: "$parent"
        }), " markers\nis ", (0,jsx_runtime.jsx)(_components.code, {
          children: "BadRequest"
        }), " — never silently reinterpreted."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Marker rules enforced at validation: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ \"$parent\": \"<field>\" }"
      }), " (exactly\none own key, non-empty string value, dotted paths allowed except\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "__proto__"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "prototype"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "constructor"
      }), " segments) only in supported filter\nvalue positions; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ \"$escape\": { \"$parent\": \"<field>\" } }"
      }), " matches the\nliteral object. Bare ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ note: { $escape: { $parent: 'x' } } }"
      }), " resolves to\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ note: { $eq: { $parent: 'x' } } }"
      }), ", consistent with bare substituted parent\nobjects. Explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$eq"
      }), " remains equivalent; operator operands and array elements\nreceive the literal without another equality wrapper. Escape resolution is\nsingle-pass and never reads parent data, even if ", (0,jsx_runtime.jsx)(_components.code, {
        children: "x"
      }), " is absent, null or changed.\nMalformed escapes are rejected and expanded operands still consume complexity\nbudgets. The corrected bare form requires an updated server; older servers with\nthe bare-escape defect still need explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$eq"
      }), ".\nMarkers in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$$sq"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "$$date"
      }), " subtrees, as object keys, in root\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "$text"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "$where"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "$comment"
      }), ", in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "populate.match"
      }), ", or in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sort"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), " are\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "BadRequest"
      }), ". Output ", (0,jsx_runtime.jsx)(_components.code, {
        children: "path"
      }), " must be a non-empty valid field path (not\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), ", no ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$"
      }), " prefix); duplicate correlated paths in one include array are\nrejected. Direct count bodies reject ", (0,jsx_runtime.jsx)(_components.code, {
        children: "include"
      }), " entirely."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["After shape validation, shared service preflight also rejects any legacy/correlated\noutput path overlapping the receiving model's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "documentPermissionField"
      }), " (equal,\nancestor or descendant, including equivalent legacy bracket paths). Nested receiving\nmodels use their own settings, before target persistence. Direct HTTP returns 400;\nthe affected root entry returns statusCode 400/code ", (0,jsx_runtime.jsx)(_components.code, {
        children: "bad_request"
      }), " in its HTTP 200\nenvelope. Legacy grouped-count schema cast failures are also controlled BadRequest."]
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
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "ajv-synchronous-verdicts-and-tagged-asynchronous-data",
      children: "AJV: synchronous verdicts and tagged asynchronous data"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Install ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ajv"
      }), " in the application; access-router has no mandatory AJV runtime dependency.\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "fromAjv"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "AjvValidatorLike<T>"
      }), " are root exports."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { Ajv, type AsyncSchema } from 'ajv';\nimport { fromAjv } from '@web-ts-toolkit/access-router';\n\nconst ajv = new Ajv();\nconst sync = fromAjv<boolean>(ajv.compile<boolean>({ type: 'boolean' }));\nconst asyncSchema: AsyncSchema = { $async: true, type: 'boolean' };\nconst asyncData = fromAjv(ajv.compile<boolean>(asyncSchema));\nawait sync(false);      // { success: true, data: false }\nawait asyncData(false); // { success: true, data: false }\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Sync boolean results are verdicts: true returns input (with any in-place AJV\nmutations), false returns issues snapshotted from mutable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "validate.errors"
      }), " before\nanother call. Tagged ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$async: true"
      }), " promises/thenables return validated data:\nfalse, true, null, scalars and objects all succeed with the fulfilled value.\nAsync paths never consult shared errors. Real AJV ValidationError rejections\n(", (0,jsx_runtime.jsx)(_components.code, {
        children: "ajv: true"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "validation: true"
      }), ", errors array) retain input-local diagnostics under\nconcurrency; other throws/rejections propagate unchanged as operational failures."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Migration:"
      }), " untagged promises/thenables now reject with a configuration TypeError\nand are observed to prevent unhandled rejection; synchronous non-boolean returns\nalso reject. Pass genuine compiled validators directly without casts or tag-dropping\nwrappers. Structural async validators require a literal ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$async: true as const"
      }), "\nand data/rejection semantics. Do not merely tag an async boolean-verdict wrapper:\nits false/true would now be successful data. Convert it to a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "RequestSchemaValidator"
      }), "\nwith explicit result objects, or return validated data and reject AJV validation\nerrors. An ", (0,jsx_runtime.jsx)(_components.code, {
        children: "errors"
      }), " property alone no longer identifies validation failure.\nAJV's async type extends its sync type with overloads, so a sync-typed reference can\nhide the tag; runtime discrimination remains authoritative. Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "fromAjv<T>(sync)"
      }), "\nfor explicit structural sync output types; genuine AJV sync/async types infer output\nvia their type guard, structural async types via their promise. An ", (0,jsx_runtime.jsx)(_components.code, {
        children: "AsyncSchema"
      }), "-typed\nschema selects AJV's async compile/compileAsync overload without casts; inline\nschemas can match its earlier sync overload even with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$async: true"
      }), "."]
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
      }), "\n"]
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
          href: "./hooks",
          children: "Hooks"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./openapi",
          children: "OpenAPI"
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