"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[686],{

/***/ 9619
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_services_mdx_fee_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-services-mdx-fee.json
const site_docs_packages_access_router_services_mdx_fee_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router/services","title":"Services","description":"Routers expose service access for custom routes and tests.","source":"@site/docs/packages/access-router/services.mdx","sourceDirName":"packages/access-router","slug":"/packages/access-router/services","permalink":"/docs/packages/access-router/services","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":4,"frontMatter":{"sidebar_label":"Services","sidebar_position":4},"sidebar":"packagesSidebar","previous":{"title":"Configuration","permalink":"/docs/packages/access-router/configuration"},"next":{"title":"Hooks","permalink":"/docs/packages/access-router/hooks"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.3.0_react@19.3.0/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(3191);
;// ./docs/packages/access-router/services.mdx


const frontMatter = {
	sidebar_label: 'Services',
	sidebar_position: 4
};
const contentTitle = 'Services';

const assets = {

};



const toc = [{
  "value": "Model Router Services",
  "id": "model-router-services",
  "level": 2
}, {
  "value": "Trusted per-call authorization",
  "id": "trusted-per-call-authorization",
  "level": 3
}, {
  "value": "Mutation-only input grants",
  "id": "mutation-only-input-grants",
  "level": 3
}, {
  "value": "Dedicated parent/child authorization",
  "id": "dedicated-parentchild-authorization",
  "level": 3
}, {
  "value": "Call policy and document-result reuse",
  "id": "call-policy-and-document-result-reuse",
  "level": 3
}, {
  "value": "Row and related target scope",
  "id": "row-and-related-target-scope",
  "level": 3
}, {
  "value": "Route entry and service policy",
  "id": "route-entry-and-service-policy",
  "level": 3
}, {
  "value": "Important behavior",
  "id": "important-behavior",
  "level": 3
}, {
  "value": "Denial versus a missing row",
  "id": "denial-versus-a-missing-row",
  "level": 3
}, {
  "value": "Populate access selectors",
  "id": "populate-access-selectors",
  "level": 3
}, {
  "value": "Safe include output and exact counts",
  "id": "safe-include-output-and-exact-counts",
  "level": 3
}, {
  "value": "Nested updates",
  "id": "nested-updates",
  "level": 3
}, {
  "value": "Correlated Includes",
  "id": "correlated-includes",
  "level": 2
}, {
  "value": "Data Router Services",
  "id": "data-router-services",
  "level": 2
}, {
  "value": "Result Shapes",
  "id": "result-shapes",
  "level": 2
}, {
  "value": "Successful subdocument writes with hidden output",
  "id": "successful-subdocument-writes-with-hidden-output",
  "level": 3
}, {
  "value": "Permissions Helper",
  "id": "permissions-helper",
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
    h3: "h3",
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
        id: "services",
        children: "Services"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Routers expose service access for custom routes and tests."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "model-router-services",
      children: "Model Router Services"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "ModelRouter.getService(req)"
      }), " returns the internal model service.\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelRouter.getPublicService(req)"
      }), " returns the public wrapper used by the built-in routes."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Common public methods:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "_new()"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "_list(filter, args?, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "_read(id, args?, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "_readFilter(filter, args?, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "_create(data, args?, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "_update(id, data, args?, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "_upsert(data, args?, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "_delete(id)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "_distinct(field, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "_count(filter, access?)"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "These methods are what the built-in HTTP routes call internally."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "trusted-per-call-authorization",
      children: "Trusted per-call authorization"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Internal ", (0,jsx_runtime.jsx)(_components.code, {
        children: "find"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOne"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "findById"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateOne"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateById"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "upsert"
      }), " accept\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "options.authorization"
      }), " with independent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "rows"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "outputFields"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "related"
      }), "\ndimensions. Model ", (0,jsx_runtime.jsx)(_components.code, {
        children: "create"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateOne"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateById"
      }), " and both ", (0,jsx_runtime.jsx)(_components.code, {
        children: "upsert"
      }), " branches also\naccept independent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "inputFields"
      }), " authority. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "create"
      }), " rejects rows; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "new"
      }), " accepts output only and\ncontinues to ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "ignore select"
      }), ", including empty/exclusion selections. Standalone\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "exists"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "count"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "delete"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "distinct"
      }), " retain request-policy APIs. Dedicated subdocument\nmethods have their own parent/child/visibility policy below. Embedded output inside\nintegrated parent/target results inherits that model's output field paths; there is\nno recursive ", (0,jsx_runtime.jsx)(_components.code, {
        children: "subdocuments"
      }), " tree on model-root authorization."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["All authorization input is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "trusted server-only"
      }), ". Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "router.getService(req)"
      }), " or\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "req.macl.getService(...)"
      }), " after the owning runtime's middleware initializes the request.\nThere is no standalone ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Service"
      }), " export. Root and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/advanced"
      }), " expose the policy types\nand opaque consumer handles, while issuers, resolved execution and prepared queries\nremain private. The installed package README contains a complete runnable Mongo/Express\nexample and the full breaking-release migration table."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import type { ModelRouter, OutputAuthorization } from '@web-ts-toolkit/access-router';\nimport type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';\ntype Order = { status?: string; internalNote?: string; tenantId: string };\ndeclare const router: ModelRouter<Order>;\ndeclare const req: ModelRequest;\ndeclare const orderId: string;\ndeclare const tenantId: string; // resolved by trusted server code\nconst service = router.getService(req);\nconst output = { outputFields: { mode: 'grant', paths: ['internalNote'] } } as const satisfies OutputAuthorization<Order>;\nconst result = await service.findOne(\n  { _id: orderId },\n  { select: ['status', 'internalNote'] },\n  { skim: true, includePermissions: false, includeFieldPermissions: false,\n    authorization: { ...output, rows: { mode: 'scope', filter: { tenantId } } } },\n);\nif (result.success) {\n  const reuse = { documentAuthorization: result.context.documentAuthorization };\n  const picked = await service.pickAllowedFields(result.data, 'read', reuse);\n  await service.trimOutputFields(picked, 'read', reuse);\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Business output is selected AND (request permission OR explicit grant). Grants are\nadditive: the stored selected note survives false/missing user rules, while denied\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "status"
      }), " is omitted. A granted-but-unselected note is omitted too. Missing values are\nnever fabricated or made required by a grant. Omitted select uses normal request fields\nplus named grants; unrestricted uses the captured persisted/registered-virtual catalog.\nExplicit exclusions and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requireExplicitSelect"
      }), " still apply."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Grant paths use ordinary dotted response paths such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "contacts.email"
      }), ", without\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "sub"
      }), " markers, signed tokens, indices or wildcards. Readonly path arrays are accepted.\nKnown model/virtual shapes are checked; unknown models use a runtime-validated string\nfallback. A container grants its selected eligible subtree; a leaf grants only its\nbranch/minimal ancestors, not siblings. Schema ", (0,jsx_runtime.jsx)(_components.code, {
        children: "select: false"
      }), " is eligible, while\nidentity/permission metadata and implementation fields retain separate rules."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "mutation-only-input-grants",
      children: "Mutation-only input grants"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "MutationAuthorization<TModel, TVirtuals>"
      }), " for updates/upserts and\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "CreateAuthorization<TModel, TVirtuals>"
      }), " for creates. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ServiceAuthorization"
      }), " remains\nread-only. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "InputFieldAuthorization<TModel>"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "InputFieldPath<TModel>"
      }), " are exported\nfrom root and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/advanced"
      }), "; input paths never use the virtual generic."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import type { MutationAuthorization } from '@web-ts-toolkit/access-router';\nimport type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';\ntype Order = { internalNote?: string; contacts: { email: string; ssn: string }[] };\ndeclare const req: ModelRequest;\ndeclare const orderId: string;\nconst authorization = {\n  inputFields: { mode: 'grant', paths: ['internalNote', 'contacts.email'] },\n} as const satisfies MutationAuthorization<Order>;\nconst result = await req.macl.getService<Order>('Order').updateById(orderId, {\n  internalNote: 'server decision', contacts: [{ email: 'corrected@example.test' }],\n}, { select: ['internalNote'] }, { authorization });\n// Persisted note; no response elevation. Contact 0 keeps its denied ssn sibling.\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Missing/request input policy retains request admission; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "grant"
      }), " is additive and an\nempty grant adds nothing. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "unrestricted"
      }), " admits eligible persisted roots. Neither\nmode grants output, rows, query fields, route guards, related operations or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$$sq"
      }), ".\nRuntime schema validation rejects unknown/virtual/identity/control paths, indices,\nbrackets, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sub"
      }), " markers and wildcards. Safe Mixed/Map paths work; referenced interiors\ndo not. Business payload fields named authorization/overrides remain ordinary data."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Leaf writes preserve denied/omitted siblings. Object/array ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "container"
      }), " authority\nreplaces the eligible subtree (including omitted children, null/empty values, array\nlength and order). ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "Descendant array grants patch existing object elements by index"
      }), ",\nnot ID: trailing/omitted elements remain; excess/null/scalar/hole slots cannot alter\nstructure. No absent array creation is allowed through descendants, including on\ncreate/upsert-create. Authorize the array/ancestor container, or rely on existing\nrequest container permission, for structural writes. These rules recurse into nested\nand Mixed arrays. Elevated embedded replacements omit supplied IDs; normal Mongoose\nID generation applies unless request authority already permits IDs."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Validation, preparation, transforms, afterPersist/change hooks and Mongoose save\nremain active. Whole-container/prepared values exclude virtuals and control metadata\neven in JS containers with permissive schemas. Pre-write update document grants see\nschema-hidden embedded input and remain private and separate from fresh\npost-write output grants; input ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_permissions"
      }), " never establishes authority. Metadata\ncontinues to describe the actor. Reads/new/output helpers/related read-count targets/\npublic/default options reject ", (0,jsx_runtime.jsx)(_components.code, {
        children: "inputFields"
      }), ", including reusable mutation policies.\nFor migration, grant the specific input path and separately derive ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ outputFields }"
      }), "\nfor output helpers. See the installed README for the complete contract and executable\nMongo persistence example."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Mutation payloads obey ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requestComplexity"
      }), " through class/Map contents and sparse arrays,\nand cycles reject before parsing/input hooks. Admission and prepared sanitization also\ncap structural depth at 100 and nodes at 20,000. Untouched persisted virtual siblings\noutside the write boundary remain unchanged and excluded from ordinary output."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "dedicated-parentchild-authorization",
      children: "Dedicated parent/child authorization"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Internal ", (0,jsx_runtime.jsx)(_components.code, {
        children: "listSub"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "readSub"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createSub"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateSub"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "bulkUpdateSub"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "deleteSub"
      }), "\naccept a final options object with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "authorization: { parent, child, visibility }"
      }), ".\nThe named field must be a top-level embedded Mongoose document array. Child fields\nand row predicates are relative to its element (", (0,jsx_runtime.jsx)(_components.code, {
        children: "email"
      }), "); parent rows belong to the\nowning model (", (0,jsx_runtime.jsx)(_components.code, {
        children: "tenantId"
      }), "). Literal names infer bounded child/virtual paths. The\ninstalled README has the complete method/applicability table and runnable Mongo example."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import type { SubdocumentMutationAuthorization } from '@web-ts-toolkit/access-router';\nimport type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';\ntype Order = { tenantId: string; contacts: { email: string; ssn: string }[] };\ndeclare const req: ModelRequest;\ndeclare const orderId: string;\ndeclare const childId: string;\nconst authorization = {\n  parent: { operation: { mode: 'grant' }, rows: { mode: 'scope', filter: { tenantId: 'server-tenant' } } },\n  child: { operation: { mode: 'grant' }, inputFields: { mode: 'grant', paths: ['email'] } },\n  visibility: {\n    parent: { operation: { mode: 'grant' }, rows: { mode: 'scope', filter: { tenantId: 'server-tenant' } } },\n    child: { operation: { mode: 'grant' }, outputFields: { mode: 'grant', paths: ['email'] } },\n  },\n} as const satisfies SubdocumentMutationAuthorization<Order, Order['contacts'][number]>;\nconst result = await req.macl.getService<Order>('Order').updateSub(\n  orderId, 'contacts', childId, { email: 'corrected@example.test' }, { authorization },\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Supplying a policy (even ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), ") opts into independent ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "base-operation"
      }), " gates:\nparent read for list/read, parent update for every mutation, and the corresponding\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "subs.<sub>.<operation>"
      }), " child gate. Missing dimensions use request authority;\noperation grants authorize only their own gate. No-policy calls retain historical\nroute-owned initiating admission. PublicService overrides reject these capabilities,\nincluding JS/transformed inputs, so basic/advanced route guards retain their contract."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Parent accepts only operation/rows. Read/list child accepts operation/rows/outputFields;\nupdate/bulk child accepts operation/rows/inputFields. Create child has operation/inputFields\nand rejects rows. Delete accepts operation/rows only and returns the removed ID. Neither\nparent nor child accepts ", (0,jsx_runtime.jsx)(_components.code, {
        children: "related"
      }), ": populated targets keep their own request authority."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Mutation visibility is independent: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "visibility.parent"
      }), " authorizes parent read,\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "visibility.child"
      }), " child read/rows/outputFields. Create additionally requires child\nlist/rows via ", (0,jsx_runtime.jsx)(_components.code, {
        children: "visibility.list"
      }), "; update/bulk reject that dimension. Missing visibility\nuses request-only read/list gates. A successful hidden write returns null/[] as below.\nOutput grants cannot write; input grants cannot grant response visibility."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Rows replace/skip only baseFilter. The configured overrideFilter still runs once;\ncaptured parent ID, owner scope and selected child IDs/array membership are ANDed\nafterward, including for in-place rewriting. False remains terminal. Scope predicates\nstay inert and schema-validated; policy arrays, paths and predicates obey existing\nrequest complexity bounds. Unsupported dimensions and invalid paths reject before writes."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Child writes reuse model input semantics for nested containers/arrays: descendants\npatch existing objects by index, container authority replaces only that child's\neligible subtree, and outer membership changes only through create/delete. Update\ndocument grants use the original hydrated raw parent; output resolves a fresh parent\nread-stage result. Virtual access is list/read/create/update, output fields are list\nfor list and read otherwise, and document-grant access is read. Mongoose validation/\nsave hooks remain active; dedicated calls do not invoke root mutation hook chains on\na child. Virtual/control/identity input exclusion and original actor isolation remain.\nDedicated Mixed/plain writes also retain their recursive virtual-name scrub; explicit\ninput grants to those virtual aliases reject before effects."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Root and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/advanced"
      }), " export method-specific ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Subdocument*Authorization"
      }), " policies and\ninternal ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Subdocument*Options"
      }), ". Public adapters should migrate to\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "PublicSubdocumentListOptions"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PublicSubdocumentReadOptions"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "PublicSubdocumentCreateOptions"
      }), " and empty ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PublicSubdocumentMutationOptions"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "call-policy-and-document-result-reuse",
      children: "Call policy and document-result reuse"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["One immutable call policy governs fetch planning and output. Each document/scope/access\nstage owns separate hook grants and memoized field decisions. Declare projected private\nhook inputs (for example ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ownerId"
      }), ") with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "alwaysSelectFields"
      }), "; full document grants resolve\nonce even with skim or disabled/stripped/limited metadata. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_view"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "_edit"
      }), " and hook metadata\nstill describe request permissions, not backend grants."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Successful single results expose ", (0,jsx_runtime.jsx)(_components.code, {
        children: "context.documentAuthorization"
      }), "; lists/create expose one\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "contexts[index]"
      }), " per row. The non-enumerable opaque handle is outside ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data"
      }), " and preserves\nowner-dependent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "status"
      }), " and a granted note after ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ownerId"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_permissions"
      }), " are trimmed.\nIt accepts only unchanged original or package-created same-stage copies, not caller spreads,\nmatching IDs, another row/call, or pre-/post-write stage reuse. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getDocumentAuthorization(child)"
      }), "\nlooks up an unchanged registered child in the original result graph."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Named ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pickAllowedFields"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "trimOutputFields"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "genAllowedFields(..., { purpose: 'output', ... })"
      }), "\naccept either raw ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "output-only"
      }), " authorization or the handle, never both. Raw policy is a\nfresh evaluation; a recognized trimmed output keeps explicit/unconditional grants but cannot\nrerun its hook or recover lost document-dependent decisions. A fresh unassociated input needs\nthe projected hook inputs. Helpers filter existing values, without selection, virtual getter\nexecution, restoration, row checks or write authority. Named ", (0,jsx_runtime.jsx)(_components.code, {
        children: "genSelect"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "genQuerySelect"
      }), " return\nfresh fetch projections with private inputs, not output grants. Omitted/undefined helper\noptions now use the same canonical request-mode output semantics as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), "; hydrated picks\nare isolated, and serialized permissions never grant fields. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "genAllowedFields"
      }), " defaults\nto ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ purpose: 'output' }"
      }), " and reports existing paths, not an input/schema allowlist.\nSupplied objects still require that purpose; nullish documents yield ", (0,jsx_runtime.jsx)(_components.code, {
        children: "[]"
      }), " without hooks.\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "requireExplicitSelect"
      }), " restricts omitted/undefined selection; explicit null/empty\nselection retains all-candidates compatibility, still subject to field authorization."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Next breaking release:"
      }), " positional ", (0,jsx_runtime.jsx)(_components.code, {
        children: "skipChecks"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "subPaths"
      }), " and arbitrary ", (0,jsx_runtime.jsx)(_components.code, {
        children: "baseFields"
      }), "\nare removed now, with no adapter. JS booleans/arrays/extra arguments (including explicit\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), " plus an extra argument) reject with actionable BadRequest errors; installed\nTypeScript calls reject too. Use named output grants/handles and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "scopePath: ['contacts']"
      }), ".\nRequest/input, distinct/sort and request-user ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_view"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "_edit"
      }), " keep their separate evaluation.\nModel input keeps scope-aware virtual-name exclusion through Mixed/plain and prepared\ncontainers; explicit alias grants reject, while untouched persisted siblings remain intact.\nObsolete ", (0,jsx_runtime.jsx)(_components.code, {
        children: "buildVirtualPlan"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "buildSubVirtualPlan"
      }), " service builders are removed in favor of\nthe named fetch helpers; retained execution plans and system retention remain private."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "genPopulate(access?, populate?, options?)"
      }), " takes request-only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PopulatePlanningOptions"
      }), "\nwith ordinary response ", (0,jsx_runtime.jsx)(_components.code, {
        children: "scopePath"
      }), " segments. Source fields, target operation/rows and\nfield checks remain request-only; private source fetch does not authorize population.\nUse service ", (0,jsx_runtime.jsx)(_components.code, {
        children: "populate"
      }), " plus ", (0,jsx_runtime.jsx)(_components.code, {
        children: "authorization.related"
      }), " when backend target authority is needed."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "DataCore"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "DataService"
      }), " field helpers instead accept ", (0,jsx_runtime.jsx)(_components.strong, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "DataFieldOptions"
        })
      }), " (root and\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "/advanced"
      }), "), with only readonly ", (0,jsx_runtime.jsx)(_components.code, {
        children: "scopePath"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), " defaults. They retain the request-only\ndata evaluator, with no Mongoose catalogs, model document hooks or new DataService authority.\nAllowed-fields is still a schema allowlist (even with null input); pick/trim retain allowed\nexisting values, with whole-container behavior and no automatic identity/metadata retention.\nData selection is the intersection of normalized requested tokens and request fields.\nFor compatibility, empty intersections—including omitted/null/empty, exclusion-only and\ndenied-only selections—mean no extra projection after request trimming in find/findOne.\nOld data ", (0,jsx_runtime.jsx)(_components.code, {
        children: "skipChecks"
      }), " never elevated fields; arbitrary ", (0,jsx_runtime.jsx)(_components.code, {
        children: "baseFields"
      }), " elevation is removed\nand unsupported. See the shipped README's named-helper migration table and data example."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "row-and-related-target-scope",
      children: "Row and related target scope"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Row mode"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Effective predicate"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "request (default)"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "transformed ordinary query AND request baseFilter"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "scope"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "transformed ordinary query AND trusted scope, replacing baseFilter"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "unrestricted"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "transformed ordinary query, without baseFilter"
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Configured ", (0,jsx_runtime.jsx)(_components.code, {
        children: "overrideFilter"
      }), " still runs ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "once in every mode"
      }), ", including unrestricted;\nits restrictions/false denial remain effective. Trusted scope and mandatory reference/join\nconstraints are ANDed afterward. Scope is inert (no client ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$$sq"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "$$date"
      }), " expansion); ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), "\nmeans explicit all-row scope within those constraints. Upsert lookup scope does not stamp\nvalues into newly created data. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "find.totalCount"
      }), " and integrated include counts reuse their\neffective row scope through private prepared execution."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import type { ModelRequest } from '@web-ts-toolkit/access-router/advanced';\ndeclare const req: ModelRequest;\ndeclare const orderId: string;\ndeclare const tenantId: string;\nconst service = req.macl.getService<{ customer: string }>('Order');\nconst result = await service.findOne({ _id: orderId }, {\n  select: ['customer'], populate: [{ path: 'customer', select: ['name', 'billingEmail'] }],\n}, { authorization: {\n  outputFields: { mode: 'grant', paths: ['customer'] },\n  related: { customer: {\n    model: 'Customer', operation: { mode: 'grant' },\n    rows: { mode: 'scope', filter: { tenantId } },\n    outputFields: { mode: 'grant', paths: ['billingEmail'] },\n  } },\n} });\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The parent grant permits the relationship only. Exact requested populate/include path and\nregistered target model must match; unused/ambiguous/mismatched entries reject. Child operation,\nrows and output authority default independently to request mode, never parent elevation.\nReference IDs, populate match and include joins/filters still constrain all target row modes.\nNested policies belong under the immediate target's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "related"
      }), "; count entries accept only\nmodel/operation/rows. For a subsequent child pick, use its graph handle with ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "that target's"
      }), "\nservice. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$$sq"
      }), " does not inherit these policies."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Virtual grants permit selected applicable getters and their private dependency fetches; missing\ndependencies, undefined or errors can still omit output. Output grants do not authorize writes,\nquery/sort/distinct fields, database virtual filtering/sorting, rows or target operations implicitly.\nValidation, write admission and persistence hooks still apply. Trusted decorate/decorateAll/tasks\nrun afterward and may construct/remove output; there is no automatic second authorization pass."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "route-entry-and-service-policy",
      children: "Route entry and service policy"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Basic/advanced ", (0,jsx_runtime.jsx)(_components.code, {
        children: "operationAccess"
      }), " guards authorize the generated endpoint before\nservice dispatch, with HTTP 401 on denial. They replace only its initiating guard.\nDirect service calls are trusted application calls and retain their existing\nchecks; service methods do not universally enforce initiating operationAccess or\ninfer a transport variant from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "req.method"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Field selection, row/filter policy, validate/prepare/decorate hooks, related-model\nchecks, and root entry guards remain base-scoped. A permitted variant does not\ngrant fields or authorize a related target's advanced endpoint policy.\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedUpsert"
      }), " does not additionally require ", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedCreate"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedUpdate"
      }), ";\nits existing create/update branch policy still applies. Root entries keep base\noperation names/checks, returning entry 401 inside their HTTP 200 envelope."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "important-behavior",
      children: "Important behavior"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "skim"
        }), " is deprecated and retained as a compatibility no-op. Authorization,\ndocument grants, virtuals and decoration run regardless of its value. Use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "lean"
        }), "\nfor hydration and the explicit metadata flags for serialization choices."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "_read(id, args, { tryList: true })"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_readFilter(filter, args, options)"
        }), " can\nfall back from an authorized read miss to list access, subject to ", (0,jsx_runtime.jsxs)(_components.strong, {
          children: ["base ", (0,jsx_runtime.jsx)(_components.code, {
            children: "list"
          })]
        }), "\noperation access. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "list: false, advancedList: true"
        }), " cannot permit retry;\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "list: true, basicList: false"
        }), " cannot block it. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "tryList"
        }), " defaults to true.\nForbidden and BadRequest never retry. Denied route entry is distinct from an\nallowed read miss (ordinary 404 when retry is disabled)."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "_update(..., { returningAll: false })"
        }), " trims the response to the updated fields"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "_upsert(...)"
        }), " only supports the default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        }), " identifier"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "denial-versus-a-missing-row",
      children: "Denial versus a missing row"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["An ordinary false query, false identifier or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "rows: { mode: 'scope', filter: false }"
      }), "\nis terminal Forbidden in every row mode, before parsing/identifier/child/persistence work\nas applicable. A null/undefined scope predicate is BadRequest; omit row authority for\nrequest-mode behavior. A transform that needs the parsed read/list predicate can deny\nbefore primary persistence, but cannot undo subqueries already needed for parsing."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Breaking migration:"
      }), " the complete service ", (0,jsx_runtime.jsx)(_components.code, {
        children: "overrides"
      }), " container (select/filter/populate/\nidFilter/effectiveSelect/operation) is removed, including empty/null/undefined or mixed\nnew/old slots. It now returns actionable BadRequest before parsing/persistence. Use ordinary\nselect/query/populate plus explicit policy; custom IDs use findOne/updateOne and mutation\nselect is ordinary. Old object overrides.filter bypassed both filter hooks; new row modes\nreplace only base scope. Move replaceable user row restrictions into baseFilter when needed;\nthere is no transform-bypass option. See the package README for every before/after mapping."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Public ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_"
      }), " wrappers, root/HTTP/OpenAPI/client options, defaults, populate and include/", (0,jsx_runtime.jsx)(_components.code, {
        children: "$$sq"
      }), "\ncontrol slots reject authorization and internal/removed controls, including after custom\nvalidator transformations. Legitimate business properties named authorization/overrides\nare still ordinary data. The configured ", (0,jsx_runtime.jsx)(_components.code, {
        children: "overrideFilter"
      }), " hook/setter remains supported."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "exists(filter, options?)"
      }), " applies read row policy by default (", (0,jsx_runtime.jsx)(_components.code, {
        children: "options.access"
      }), "\nchanges it). Allowed matches/misses yield successful true/false, or an ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ _id }"
      }), "\nrecord/null with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "includeId: true"
      }), ". Explicit/base/override false returns a Forbidden\nErrorResult before adapter dispatch in both modes. This replaces the former\nsuccessful false/null denial result; check ", (0,jsx_runtime.jsx)(_components.code, {
        children: "success"
      }), " before ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Public reads no longer retry a terminal read denial through list policy. Public\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "_upsert"
      }), " with an ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " now propagates denied update-policy existence as Forbidden\ninstead of Unauthorized; an allowed miss remains Unauthorized. Neither case creates\nor updates a row. Generated direct routes use HTTP 403 and root batches use entry\n403 within HTTP 200. Custom Express handlers own response serialization: returning\nan ErrorResult or calling ", (0,jsx_runtime.jsx)(_components.code, {
        children: "res.json(result)"
      }), " does not automatically set status 403."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "populate-access-selectors",
      children: "Populate access selectors"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Wire ", (0,jsx_runtime.jsx)(_components.code, {
        children: "options.populateAccess"
      }), " and populate descriptor ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access"
      }), " accept only\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "'list' | 'read'"
      }), " (", (0,jsx_runtime.jsx)(_components.code, {
        children: "PopulateAccess"
      }), " from the existing ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/advanced"
      }), " entrypoint).\nRelated populate/include/subquery checks use target base operations, regardless\nof the initiating basic/advanced endpoint."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The shared Core populate boundary rejects all fourteen reserved route-variant\nnames in effective option and per-descriptor access, including generic legacy\ninclude/subquery options and trusted defaults, before target persistence. Other\ntrusted non-reserved custom access strings retain their runtime compatibility.\nInvalid selectors return controlled BadRequest: direct HTTP 400 or affected root\nentry 400/", (0,jsx_runtime.jsx)(_components.code, {
        children: "bad_request"
      }), " within HTTP 200. Legacy read/list includes now propagate\ntarget BadRequest instead of silently dropping output, so nested invalid selectors\nare visible. Existing denial/miss cardinality contracts remain."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "safe-include-output-and-exact-counts",
      children: "Safe include output and exact counts"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Legacy and correlated include ", (0,jsx_runtime.jsx)(_components.code, {
        children: "path"
      }), " values are output-only. They cannot equal,\ndescend from, or contain the receiving model's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "documentPermissionField"
      }), " (default\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "_permissions"
      }), "). With ", (0,jsx_runtime.jsx)(_components.code, {
        children: "auth.policy.permissions"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "auth"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "auth.policy"
      }), " and\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "auth.policy.permissions.canReadSecret"
      }), " reject; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "lineItemCount"
      }), " or the sibling\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "auth.policy.permissionsExtra"
      }), " do not overlap. Equivalent legacy bracket paths\nfollow the same rule. The entire supported include tree is preflighted with each\nnested receiving model's setting before target persistence. BadRequest returns direct\nHTTP 400 or root entry 400/", (0,jsx_runtime.jsx)(_components.code, {
        children: "bad_request"
      }), " within HTTP 200; malformed reads do not fall\nback to list access. Ordinary output collisions remain supported."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Legacy ", (0,jsx_runtime.jsx)(_components.code, {
        children: "op: 'count'"
      }), " uses one grouped aggregate per include execution for all parents,\ncounting distinct authorized target documents independently of listHardLimit and\ninclude pagination. Duplicate local/foreign array keys or documents matching multiple\nlocal keys do not inflate a parent's count; misses yield zero. The target schema casts\nthe authorized match (including tenant filters) and independent foreign operands\nbefore aggregation, retaining original parent-key association for normalized ObjectId/String keys\nand query setters. Invalid casts return controlled BadRequest rather than zero.\nTerminal false count row policy retains legacy omitted output; the grouped service\nreturns Forbidden. Operation denials prevent target work."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Mongo returns numeric parent-group counts, never matching target-ID arrays. Internal\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "countByFieldValues(foreignField, values, filter = {}, access = 'list')"
      }), " now returns\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "Promise<SingleResult<Map<string, number>> | ErrorResult>"
      }), ", with readonly inputs and\nzero for missing original ", (0,jsx_runtime.jsx)(_components.code, {
        children: "String(value)"
      }), " aliases. Replace ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".get(key)?.size"
      }), " with\n", (0,jsx_runtime.jsx)(_components.code, {
        children: ".get(key) ?? 0"
      }), ". Per-key counts can overlap; do not sum them for a multi-key union.\nPass ", (0,jsx_runtime.jsx)(_components.code, {
        children: "count"
      }), " as the access for count row policy; this helper accepts no authorization\noptions. Parent-union execution remains private."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Both paths enforce fixed limits: 1,000 groups, 10,000 key occurrences, 64 KiB per\nBSON key/alias, 1 MiB cumulative BSON-key plus alias bytes, depth 8 / 20,000 key nodes,\nand 1,024 UTF-8 foreign-path bytes. Original and cast group operands must fit;\nexcess returns BadRequest before aggregate dispatch. See the shipped README's\n“Numeric grouped-count service API (breaking migration)” for the complete contract."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Attachments are tracked separately from their original projected source. Source\npermission hooks/dependencies retain original values at collisions; only explicitly\nproduced target results are restored after source filtering. A legacy read miss\ndoes not turn a denied or unselected source value into an attachment."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Casting does not execute ", (0,jsx_runtime.jsx)(_components.code, {
        children: "countDocuments"
      }), " middleware/plugins or consume a persistence\npermit; the aggregate is admitted and runs aggregate middleware. Arbitrary model\naggregate pipelines are not auto-cast. Express count authorization in router operation\nand row policies. Correlated counts instead execute per parent through count semantics."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "nested-updates",
      children: "Nested updates"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["With only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "'profile.public': { update: true }"
      }), ", send nested JSON\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ profile: { public: 'New display name' } }"
      }), ": protected/omitted siblings survive.\nThis holds for updateOne/updateById, existing-row upsert and single/bulk subdocuments.\nWhole-parent grants permit replacement and remove omitted children; whole arrays\nreplace, while explicit indexed leaf grants patch only that path. Whole grants take\npriority over overlapping leaves. Admitted null clears the field; an empty/null client\ncontainer supplies no descendant leaves. Literal dotted client keys are ignored by\nselection, not interpreted as update operators. See ", (0,jsx_runtime.jsx)(_components.a, {
        href: "./hooks",
        children: "Hooks"
      }), " for trusted\nprepare/transform behavior and its omission compatibility change."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "correlated-includes",
      children: "Correlated Includes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Read/list service paths (", (0,jsx_runtime.jsx)(_components.code, {
        children: "_list"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_read"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_readFilter"
      }), ", and the grouped\nroot entries that dispatch to them) accept correlated ", (0,jsx_runtime.jsx)(_components.code, {
        children: "include"
      }), " entries\n(", (0,jsx_runtime.jsx)(_components.code, {
        children: "mode: 'correlated'"
      }), ") alongside legacy ", (0,jsx_runtime.jsx)(_components.code, {
        children: "localField"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "foreignField"
      }), " joins.\nEach correlated entry runs a target query ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "per parent document"
      }), " using\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ \"$parent\": \"<field>\" }"
      }), " markers resolved against the immediate parent\nsnapshot:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-json",
        children: "{ \"mode\": \"correlated\", \"model\": \"Org\", \"op\": \"read\", \"path\": \"org\", \"id\": { \"$parent\": \"orgId\" } }\n{ \"mode\": \"correlated\", \"model\": \"Post\", \"op\": \"list\", \"path\": \"posts\",\n  \"filter\": { \"authorId\": { \"$parent\": \"_id\" } },\n  \"args\": { \"select\": [\"title\"], \"sort\": { \"createdAt\": -1 }, \"limit\": 5 } }\n{ \"mode\": \"correlated\", \"model\": \"Post\", \"op\": \"count\", \"path\": \"postCount\",\n  \"filter\": { \"authorId\": { \"$parent\": \"_id\" } } }\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Execution notes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Reads attach the doc or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), ", lists attach per-parent paginated arrays,\ncounts attach numbers (count semantics, never a capped list count).\nMissing/", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), " references attach ", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "[]"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "0"
        }), " with no target query."]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Identifier reads use the target's configured identifier behavior with no\nread-to-list fallback; counts use explicit count access."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Dispatch goes through the authorized target service under the active\nrequest/runtime context. Target denials fail the whole request with zero\ntarget persistence queries."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Referenced parent fields are added to the parent DB select, then trimmed\nunless policy-allowed and selected. Sibling include output and\ndecorate/task output never feed references."
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Bounds: each entry counts toward ", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxIncludeCount"
        }), "; expanded filters are\nrevalidated (", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxNodes"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxDepth"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxInValues"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxLogicalClauses"
        }), ");\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxCorrelatedQueries"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "100"
        }), ") caps total inner executions and\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxCorrelatedDepth"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "5"
        }), ") caps nesting. See ", (0,jsx_runtime.jsx)(_components.a, {
          href: "./configuration",
          children: "Configuration"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Direct count parents carry no ", (0,jsx_runtime.jsx)(_components.code, {
          children: "include"
        }), ". Malformed correlated input is a\ncontrolled ", (0,jsx_runtime.jsx)(_components.code, {
          children: "BadRequest"
        }), ", never a silent drop. See ", (0,jsx_runtime.jsx)(_components.a, {
          href: "./validation",
          children: "Validation"
        }), "."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "data-router-services",
      children: "Data Router Services"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "DataRouter.getService(req)"
      }), " returns a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DataService"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Methods:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "find(filter, args?, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "findOne(filter, args?, options?)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "findById(id, args?, options?)"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "result-shapes",
      children: "Result Shapes"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Service methods return one of these shapes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "SingleResult"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "ListResult"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "ErrorResult"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["List results include ", (0,jsx_runtime.jsx)(_components.code, {
        children: "count"
      }), ", and may include ", (0,jsx_runtime.jsx)(_components.code, {
        children: "totalCount"
      }), " when count support is enabled.\nIntegrated internal model operations refine successful results to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "AuthorizedSingleResult"
      }), "\nor ", (0,jsx_runtime.jsx)(_components.code, {
        children: "AuthorizedListResult"
      }), " with opaque contexts. Public HTTP/root serializers omit context(s),\nquery diagnostics and private authority; they are not client transport fields."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "successful-subdocument-writes-with-hidden-output",
      children: "Successful subdocument writes with hidden output"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Create/single/bulk update response data requires post-save parent read operation/row\naccess. Full-array create output, including POST ", (0,jsx_runtime.jsx)(_components.code, {
        children: "[]"
      }), ", additionally intersects\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "subs.<sub>.list"
      }), " AND ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".read"
      }), " guards/row filters. Targeted single/bulk updates require\nsub read only, not list access. All use read fields plus ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), "; visible counts and\nstored array order are preserved. Bulk request order does not reorder the response;\nservice ", (0,jsx_runtime.jsx)(_components.code, {
        children: "addFirst"
      }), " still governs insertion order, without adding an HTTP option."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["These visibility checks default to ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "base"
      }), " parent/subdocument read/list policy.\nTrusted dedicated calls can explicitly configure ", (0,jsx_runtime.jsx)(_components.code, {
        children: "authorization.visibility"
      }), "; no\nmutation authority flows into it. Public routes always use request authority. Disabling\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "basicRead"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "basicList"
      }), " endpoints does not hide otherwise readable mutation output;\nallowing an advanced read route does not override a denied base response guard."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "A denied response guard, terminal false policy or no readable match hides output\nwithout failing the committed write:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Operation"
          }), (0,jsx_runtime.jsxs)(_components.th, {
            children: ["Service/root fields (all ", (0,jsx_runtime.jsx)(_components.code, {
              children: "success: true"
            }), ")"]
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Direct HTTP; root entry status"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Create"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "kind: 'list', code: 'created', data: [], count: 0"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "[]"
            }), ", 201; 201"]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Bulk update"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "kind: 'list', code: 'success', data: [], count: 0"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "[]"
            }), ", 200; 200"]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Single update"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "kind: 'single', code: 'success', data: null"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["JSON ", (0,jsx_runtime.jsx)(_components.code, {
              children: "null"
            }), ", 200; 200"]
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Root keeps its HTTP 200 envelope. Do not retry successful empty responses. Actual\nwrite denials and validation/persistence failures retain errors. Visibility adds at\nmost one parent query and resolves applicable row policies once per mutation."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "permissions-helper",
      children: "Permissions Helper"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "AccessRouterPermissions"
      }), " is method-based:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "permissions.has('isAdmin');\npermissions.hasAny('posts.read', 'posts.write');\npermissions.hasAll(['posts.read', 'posts.write']);\npermissions.keys;\n"
      })
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
          href: "./routing",
          children: "Routing"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./hooks",
          children: "Hooks"
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