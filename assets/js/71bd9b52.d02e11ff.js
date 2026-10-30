"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[905],{

/***/ 2747
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_configuration_mdx_71b_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-configuration-mdx-71b.json
const site_docs_packages_access_router_configuration_mdx_71b_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router/configuration","title":"Configuration","description":"Configuration has separate layers: runtime GlobalOptions, shared model starting","source":"@site/docs/packages/access-router/configuration.mdx","sourceDirName":"packages/access-router","slug":"/packages/access-router/configuration","permalink":"/docs/packages/access-router/configuration","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":3,"frontMatter":{"sidebar_label":"Configuration","sidebar_position":3},"sidebar":"packagesSidebar","previous":{"title":"Routing","permalink":"/docs/packages/access-router/routing"},"next":{"title":"Services","permalink":"/docs/packages/access-router/services"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.3.0_react@19.3.0/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(3191);
;// ./docs/packages/access-router/configuration.mdx


const frontMatter = {
	sidebar_label: 'Configuration',
	sidebar_position: 3
};
const contentTitle = 'Configuration';

const assets = {

};



const toc = [{
  "value": "Global Options",
  "id": "global-options",
  "level": 2
}, {
  "value": "Default Model Options",
  "id": "default-model-options",
  "level": 2
}, {
  "value": "Model Router Options",
  "id": "model-router-options",
  "level": 2
}, {
  "value": "Authority, hook inputs and metadata",
  "id": "authority-hook-inputs-and-metadata",
  "level": 3
}, {
  "value": "Temporary unsafe read/list-performance switches",
  "id": "temporary-unsafe-readlist-performance-switches",
  "level": 3
}, {
  "value": "Separate initial output-copy opt-outs",
  "id": "separate-initial-output-copy-opt-outs",
  "level": 4
}, {
  "value": "Populate operation policies",
  "id": "populate-operation-policies",
  "level": 3
}, {
  "value": "Private populated virtual dependencies",
  "id": "private-populated-virtual-dependencies",
  "level": 3
}, {
  "value": "Operation Access",
  "id": "operation-access",
  "level": 2
}, {
  "value": "Model default specificity",
  "id": "model-default-specificity",
  "level": 3
}, {
  "value": "Subdocument field rules",
  "id": "subdocument-field-rules",
  "level": 3
}, {
  "value": "Request Complexity And Correlated Limits",
  "id": "request-complexity-and-correlated-limits",
  "level": 2
}, {
  "value": "Persistence admission",
  "id": "persistence-admission",
  "level": 3
}, {
  "value": "Hook admission and nested service calls",
  "id": "hook-admission-and-nested-service-calls",
  "level": 3
}, {
  "value": "OpenAPI Router Options",
  "id": "openapi-router-options",
  "level": 2
}, {
  "value": "Data Router Options",
  "id": "data-router-options",
  "level": 2
}, {
  "value": "Option APIs",
  "id": "option-apis",
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
    h4: "h4",
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
        id: "configuration",
        children: "Configuration"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Configuration has separate layers: runtime ", (0,jsx_runtime.jsx)(_components.code, {
        children: "GlobalOptions"
      }), ", shared model starting\ndefaults, per-model/data/root options, model per-method ", (0,jsx_runtime.jsx)(_components.code, {
        children: "defaults"
      }), ", request ", (0,jsx_runtime.jsx)(_components.code, {
        children: "args"
      }), "/\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "options"
      }), ", and trusted service ", (0,jsx_runtime.jsx)(_components.code, {
        children: "authorization"
      }), ". Data/root routers do not inherit model\ndefaults; authorization is never a default or wire option. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createAccessRuntime()"
      }), "\nreturns a bound API whose ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".runtime"
      }), " owns the options and registries."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "global-options",
      children: "Global Options"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Configure a runtime with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "acl.setGlobalOptions(...)"
      }), " or the corresponding isolated\nAPI method. Assignment is shallow. Request initialization and hook/persistence\ncaptures are not restarted by later setters."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "requestPermissionField"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_permissions"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "globalPermissions(req)"
        }), " returns the permission set for the current request"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "logger"
        }), " receives ", (0,jsx_runtime.jsx)(_components.code, {
          children: "debug"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "info"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "warn"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "error"
        }), " calls"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import acl from '@web-ts-toolkit/access-router';\n\ndeclare module '@web-ts-toolkit/access-router' {\n  interface AccessRouterRequestExtensions {\n    actor?: { permissions: string[] }; // set by application authentication middleware\n  }\n}\n\nacl.setGlobalOptions({\n  requestPermissionField: '_permissions',\n  globalPermissions(req) {\n    return req.actor?.permissions ?? [];\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Null/undefined resolver results establish empty grants, replacing prior runtime-owned\nvalues. Application-supplied unowned maps are preserved; same-runtime middleware\nreuses its initialized state. Populate targets always require actual runtime model\nregistration and an effective object ", (0,jsx_runtime.jsx)(_components.code, {
        children: "permissionSchema"
      }), ". See the independent\n", (0,jsx_runtime.jsx)(_components.a, {
        href: "#populate-operation-policies",
        children: "populate operation policies"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "default-model-options",
      children: "Default Model Options"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["These values supply model defaults. Assignment is shallow; nested rule objects\nare not recursively merged. See ", (0,jsx_runtime.jsx)(_components.a, {
        href: "#operation-access",
        children: "Operation access"
      }), " for exact\nvariant/default lookup and live updates."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "listHardLimit"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "1000"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "documentPermissionField"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_permissions"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "idParam"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "idField"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "parentPath"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "/"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "queryRouteSegment"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "__query"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "mutationRouteSegment"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "__mutation"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "operationAccess"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "false"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "modelPermissionPrefix"
        }), " defaults to an empty string"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "requireOperationAccessForPopulateQueries"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "true"
        }), "; only primitive ", (0,jsx_runtime.jsx)(_components.code, {
          children: "false"
        }), "\nbypasses the actual target's ordinary effective read/list/trusted custom admission"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "requireOperationAccessForPopulateDependencies"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "true"
        }), "; only primitive\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "false"
        }), " bypasses the actual target's private base-read operation gate"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Model options inherit live defaults without being copied into permanent model overrides.\nEach populate flag resolves explicit target override → captured runtime model default →\ntrue. Explicit undefined restores inheritance; omission retains an override. Nested\noption objects replace shallowly."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Include output cannot equal, descend from, or contain ", (0,jsx_runtime.jsx)(_components.code, {
        children: "documentPermissionField"
      }), ",\nincluding dotted custom fields and equivalent legacy bracket paths. Nested include\nlevels use the receiving model's setting; violations are BadRequest before target\npersistence. See ", (0,jsx_runtime.jsx)(_components.a, {
        href: "./services#safe-include-output-and-exact-counts",
        children: "Services"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "model-router-options",
      children: "Model Router Options"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Common model options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "basePath"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "permissionSchema"
        }), " maps fields to booleans, permission names, or per-operation rule objects"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "alwaysSelectFields"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "virtuals"
        }), ", including server-only ", (0,jsx_runtime.jsx)(_components.code, {
          children: "dependsOn"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "dependsOnPopulate"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "docPermissions"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "baseFilter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "overrideFilter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "decorate"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "decorateAll"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "validate"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "prepare"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "transform"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "afterPersist"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "onChange"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "beforeDelete"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "afterDelete"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "defaults"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "the two target-owned populate operation flags (also available on model defaults)"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Live property helpers include:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "listHardLimit"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "documentPermissionField"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "idField"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "resolveIdFilter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "operationAccess"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "basePath"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "parentPath"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "idParam"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "queryRouteSegment"
      }), ", and\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "mutationRouteSegment"
      }), " determine route shape and are fixed after construction."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "authority-hook-inputs-and-metadata",
      children: "Authority, hook inputs and metadata"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Router ", (0,jsx_runtime.jsx)(_components.code, {
        children: "defaults"
      }), ", including dotted setters, contain query/presentation settings only.\nPer-call service authorization, document handles, prepared/execution state and removed\nservice overrides are not defaults or HTTP/OpenAPI/client options. Supply trusted\nserver-only policy to the service acquired from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "router.getService(req)"
      }), " instead.\nMissing policy dimensions use request authority and never inherit a prior call's elevation."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "alwaysSelectFields"
      }), " declares persisted inputs needed by document-permission hooks beyond\nselected output, such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ownerId"
      }), ". Hooks see the untrimmed projected document; fetch-only\ninputs do not grant output. The immutable call captures configuration, while each document/\nscope/access stage has separate hook grants and decisions. Opaque result-context handles\npreserve them after those inputs and metadata trim. See ", (0,jsx_runtime.jsx)(_components.a, {
        href: "./services#call-policy-and-document-result-reuse",
        children: "Services"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Internal document grants resolve independently of ", (0,jsx_runtime.jsx)(_components.code, {
        children: "includePermissions"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "includeFieldPermissions"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "stripPermissionsField"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "disableFieldPermissions"
      }), " and exposed-key\nlimits. These switches govern request-user metadata serialization; temporary backend grants\nnever forge ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_view"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "_edit"
      }), ". ", (0,jsx_runtime.jsx)(_components.code, {
        children: "overrideFilter"
      }), " remains the query-transform hook and runs once\neven in unrestricted row mode; scope/unrestricted replace only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "baseFilter"
      }), " authority."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "skim"
      }), " is a deprecated compatibility no-op in canonical model operations. True, false\nand omission all retain authorization, document grants, virtuals and decoration.\nServer model ", (0,jsx_runtime.jsx)(_components.code, {
        children: "hydration"
      }), " separately chooses Mongoose materialization; there is no\nper-call/wire ", (0,jsx_runtime.jsx)(_components.code, {
        children: "lean"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "hydration"
      }), " control, and field enforcement always runs."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["At each method resolver, non-nullish supplied values win over its ", (0,jsx_runtime.jsx)(_components.code, {
        children: "defaults"
      }), " bucket,\nthen built-ins. Public wrappers resolve ", (0,jsx_runtime.jsx)(_components.code, {
        children: "public*Args"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "public*Options"
      }), " before internal\nmethods; already-resolved flags take precedence over internal defaults. Public upsert\nuses its create/update branch's public bucket. A model service captures current presentation\ndefaults from its originating runtime per call; per-call model authority captures current\npolicy before awaiting hooks. Retained services keep their original core, actor, model\nconnection and related registry across a same-request runtime handoff. Base-filter cache\nentries are reused only for the same model/access and policy function.\nRequest base-filter caches remain owned by their request/runtime/access."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "temporary-unsafe-readlist-performance-switches",
      children: "Temporary unsafe read/list-performance switches"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Model-only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "unsafeSkipListDocumentSnapshotChecks: true"
      }), " skips repeated source snapshot\ncomparisons on top-level ", (0,jsx_runtime.jsx)(_components.code, {
        children: "find"
      }), ", generated lists and root-list entries. Independent\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "unsafeSkipReadDocumentSnapshotChecks: true"
      }), " does the same for ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOne"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findById"
      }), ",\npublic identifier/filter reads and root reads."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Four further independent flags are available:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "LIST"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "READ"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Skips"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "unsafeSkipListOutputSnapshotChecks"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "unsafeSkipReadOutputSnapshotChecks"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Output-value comparisons for root and embedded/populated/included outputs"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "unsafeSkipListNestedDocumentSnapshotChecks"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "unsafeSkipReadNestedDocumentSnapshotChecks"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Source comparisons on embedded/populated/included document stages"
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Read-to-list retries follow all three ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "READ"
      }), " settings, not LIST settings. All six\ndefault to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "false"
      }), ", are captured before awaits, and warn independently on enablement.\nConfigure them with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "api.setModelOption"
      }), " or\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "api.setDefaultModelOptions"
      }), "; unspecified model flags inherit later default updates,\nincluding after router creation. Explicit per-model ", (0,jsx_runtime.jsx)(_components.code, {
        children: "false"
      }), " wins over default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "true"
      }), ";\nmodel ", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), " restores inheritance. This precedence applies to all model-default\noptions; object/array overrides replace shallowly. Restore ", (0,jsx_runtime.jsx)(_components.code, {
        children: "false"
      }), " for new calls as soon as possible. Never\nderive these flags from request input."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Inherited enablement warns once per effective model/flag transition, just like an\nexplicit model setter. Defaults configured before model setup warn when applied to\nthat model. Existing call/handle snapshots and mounted route paths do not change."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Output/nested settings propagate recursively from the ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "initiating model"
      }), ", not the\ntarget model's flags. Root-source, nested-source and output-value checks are independent;\nnested flags do not prune child values from still-strict parent comparisons."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Permission rules, exact associations/bindings, output graph identities and initial\nsnapshots/detached copies remain with the new copy flags below off. Writes, dedicated subdocument operations and fresh\nhelpers stay strict. Originating handles, captured retries and later descendants\nretain their original mode after rollback. ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "Source mutation can leave stale grants/\ndecisions; output flags additionally allow changed values with unchanged identities\nto reuse authorization and expose incorrectly authorized data."
      }), " Use only as a\ntemporary, measured workaround, not as a security-equivalent fast path. Per-call,\nwire and method-default controls cannot enable it. See the shipped README for the contract."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h4, {
      id: "separate-initial-output-copy-opt-outs",
      children: "Separate initial output-copy opt-outs"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "unsafeSkipListInitialOutputSnapshotCopy"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "unsafeSkipReadInitialOutputSnapshotCopy"
      }), "\nare two additional server model/default booleans, ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "false by default"
      }), ". Each requires\nits matching ", (0,jsx_runtime.jsx)(_components.code, {
        children: "unsafeSkipListOutputSnapshotChecks"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "unsafeSkipReadOutputSnapshotChecks"
      }), "\nto be true. Copy true with comparisons strict is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "dormant"
      }), ": copying/comparisons stay\non and a prerequisite warning is logged. Neither option silently changes another flag."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "When active, eligible initial output-association snapshots (including authenticated\nembedded/populated/included outputs and package-created transfers) are omitted. READ\nretries keep READ settings; targets cannot override the initiating model. Inheritance,\nliteral-true enablement, server-only controls and captured-handle rollback match the\ncomparison flags. Active/dormant warnings follow effective model/operation transitions,\nnot rows/requests. Writes, dedicated subdocument operations and fresh helpers stay strict."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Additional risk:"
      }), " this pass no longer clones/normalizes native leaves or runs BSON\nwire-validation hooks. Changed observations can alter exceptions, side effects and\npermission outcomes—even turn denial into allowance. Ordinary graph admission retains\nsafe keys/descriptors, cycles, 20,000 visited-node/array-length and depth-100 limits,\nplus exact graph/binding ownership. Standard native leaves are admitted without this\nnormalization; invalid/forged BSON content is not wire-validated by the omitted pass.\nProxies, Map/Set, unproven subclasses/unsupported graphs use the original copy fallback.\nAccessor/proxy ownership bindings also fall back, rather than retaining graph admission\nacross binding callbacks."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Source snapshots, detached callback inputs/grants, configuration, getters, metadata\nand actual response-copy boundaries remain. This is not an all-cloning opt-out and\ndoes not promise historical performance. Prefer temporary per-model opt-in only after\nreviewing trusted data/hooks and measured rollout evidence. Restore the copy flag to\nfalse and then restore strict comparisons for new calls; retained authority keeps its\ncaptured mode. The ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/main/packages/access-router/README.md#temporary-unsafe-initial-output-snapshot-copy-switches",
        children: "shipped README"
      }), "\ncontains the four-combination table and server-only example."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "populate-operation-policies",
      children: "Populate operation policies"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Both optional model/default booleans have built-in true. Each actual target resolves\nexplicit override → captured runtime model default → true. Explicit undefined clears\nan override to inherit; omission preserves it. Only primitive false disables a gate;\nmalformed non-undefined JavaScript values normalize conservatively to true."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Project.documentIds → Document"
      }), ", use ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "Document's"
      }), " Q/D, regardless of Project's\nsettings. A Document virtual referencing User uses ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "User's D"
      }), ". Different pairs can\ncoexist for Document/User/Report in one runtime/request. Defaults are captured before\nsource/target option reads and the first await; each target contributes its captured\noptions. In-flight nested/include/embedded/dedicated-child stages retain that capture;\nlater calls on existing services refresh and see live defaults without an override.\nUnrelated updates/router construction/repeated decorator setup do not freeze inherited\ndefaults. Nested option objects replace shallowly."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use model/default bulk/exact setters and model-router setters. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "GlobalOptions"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "api.setGlobal*"
      }), " and global ", (0,jsx_runtime.jsx)(_components.code, {
        children: "api.set"
      }), " reject stale placements with actionable\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "setModelOptions"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "setDefaultModelOptions"
      }), " migration diagnostics, without aliases\nor broadcasting. Query, method-default, HTTP/root/client options gain no capability.\nSame-spelled business fields remain ordinary data. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getModelOptions()"
      }), " and\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "router.options"
      }), " retain raw flag overrides; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getModelOption()"
      }), " reads the live default.\nAn unset undefined can still resolve strictly to true during operation capture."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Every requested ordinary target and declared private target needs the actual Mongoose\nmodel and ACL configuration in its owning runtime, with an ", (0,jsx_runtime.jsxs)(_components.strong, {
        children: ["effective object\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "permissionSchema"
        })]
      }), ". Model defaults may supply it; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), " is a closed business-field\npolicy. Missing target registration/schema fails with controlled ", (0,jsx_runtime.jsx)(_components.code, {
        children: "bad_request"
      }), " and\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "errors[].detail"
      }), " (HTTP 400) before target I/O or initiating writes. Direct helpers/\nconfiguration setters throw with that controlled ", (0,jsx_runtime.jsx)(_components.code, {
        children: "result"
      }), "; private declaration validation\nis eager/atomic. Unused ordinary schema refs need not be configured at startup."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Configuration-only models need no HTTP routes:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import mongoose from 'mongoose';\nimport { createAccessRuntime } from '@web-ts-toolkit/access-router';\n\nconst api = createAccessRuntime();\nconst Document = mongoose.model('Document', new mongoose.Schema({ name: String, internalNote: String }));\nconst User = mongoose.model('User', new mongoose.Schema({ name: String }));\napi.registerModelInstance(Document.modelName, Document);\napi.registerModelInstance(User.modelName, User);\napi.setDefaultModelOptions({\n  requireOperationAccessForPopulateQueries: true,\n  requireOperationAccessForPopulateDependencies: true,\n});\napi.setModelOptions(Document.modelName, {\n  operationAccess: { read: false, list: false },\n  permissionSchema: { name: true, internalNote: false },\n  requireOperationAccessForPopulateQueries: false,\n  requireOperationAccessForPopulateDependencies: false,\n});\napi.setModelOptions(User.modelName, {\n  operationAccess: { read: false, list: false },\n  permissionSchema: {}, // explicitly closed business fields\n  requireOperationAccessForPopulateQueries: true,\n  requireOperationAccessForPopulateDependencies: true,\n});\n// One source request can populate permitted Document fields while User stays strict.\n// Neither target needs HTTP routes; standalone guarded/root target reads/lists deny.\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Q is the target's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requireOperationAccessForPopulateQueries"
      }), "; D is its\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "requireOperationAccessForPopulateDependencies"
      }), ". Independently for each target, with public/read operations\ndenied, selected/permitted source refs and otherwise eligible rows/fields:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Q"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "D"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Ordinary requested population"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Authorized private virtual"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "true"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "true"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Original parent IDs"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Omitted"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "false"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "true"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Selected/authorized target DTOs"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Omitted"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "true"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "false"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Original parent IDs"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Computed from declared inputs"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "false"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "false"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Selected/authorized target DTOs"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Computed from declared inputs"
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Q=false skips only target operation admission. Source entry/source-field permissions,\ntarget field/document grants, row/base/transform filters, original selection and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), "\nexclusions, requested match and mandatory reference IDs remain. Direct/generated/root\ntarget operations still enforce their own guards. Required ordinary guard errors\npropagate; bypass does not call the guard. False guards deny population and leave\npermitted parent IDs; actual admitted match/missing-row population yields null/filtered\narrays, not IDs. Scoped trusted related operation grants retain their separate authority."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Ordinary static string refs resolve on the source model's Mongoose connection and\nmust be the exact instance registered/configured in the owning runtime. Missing or\nsame-named mismatched models fail preflight before target reads or initiating writes.\nExplicit Model-valued schema refs can cross connections when that exact target is\nregistered/configured in the same runtime. The validated model stays pinned with its\ncaptured policy through in-flight work; late ", (0,jsx_runtime.jsx)(_components.code, {
        children: "db.models"
      }), " substitution cannot replace\nit. The public ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Populate"
      }), " wire gains no ", (0,jsx_runtime.jsx)(_components.code, {
        children: "model"
      }), "/authority property. Private declarations\nretain their narrower static-string, same-connection limit below.\nDynamic callback/refPath refs reject with a controlled diagnostic because they cannot\nbe statically bound before I/O."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Removed:"
      }), " ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requireRegisteredPopulateModels"
      }), " and\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "requireReadOperationAccessForPopulateDependencies"
      }), ", with no aliases/raw-mode mapping.\nRegister/configure targets, then choose Q/D independently; migrate an intentional\nprivate bypass to the new dependency name at model/default scope. Previous global\nplacements must move to model/default setters or scoped decorators; they are rejected,\nnot broadcast. The former PPR whole-reference omission\nrule is superseded: deny the source field if its IDs must be hidden. See the\n", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://www.npmjs.com/package/@web-ts-toolkit/access-router#runnable-private-dependency-example",
        children: "installed README's runnable Document example"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "private-populated-virtual-dependencies",
      children: "Private populated virtual dependencies"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Declare ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dependsOnPopulate"
      }), " in trusted model virtual configuration when an authorized\ncomputed output needs related persisted fields the caller cannot receive. Local\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "dependsOn"
      }), " remains the current scope's persisted inputs in getter argument one;\nordinary query ", (0,jsx_runtime.jsx)(_components.code, {
        children: "populate"
      }), " remains public related output. The new declaration supplies\nonly that getter's ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "fourth argument"
      }), ", independently of public population."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Register the actual target model ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "and its options first"
      }), ", in the source's runtime\nand Mongoose connection. Validation is eager/atomic for construction, bulk and dotted\nsetters, regardless of either operation flag. Operation capture\nrechecks bindings before hooks/writes; in-flight calls retain coherent getter/masks/policies."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The actual target's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelRouterOptions.requireOperationAccessForPopulateDependencies"
      }), "\ninherits ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DefaultModelRouterOptions"
      }), " and then built-in ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "true"
      }), ":\nprivate loading requires the captured original caller's target base ", (0,jsx_runtime.jsx)(_components.code, {
        children: "operationAccess.read"
      }), ".\nOnly primitive boolean ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "false"
      }), " bypasses that operation gate. Explicit undefined\nrestores inheritance, omission retains an override, and other malformed JavaScript\nvalues are conservatively true. Configure model defaults on the owning runtime:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createAccessRuntime, type DefaultModelRouterOptions } from '@web-ts-toolkit/access-router';\n\nconst api = createAccessRuntime();\napi.setDefaultModelOptions({\n  requireOperationAccessForPopulateQueries: true,\n  requireOperationAccessForPopulateDependencies: false,\n});\napi.setDefaultModelOption('requireOperationAccessForPopulateDependencies', false);\nconst snapshot: DefaultModelRouterOptions = api.getDefaultModelOptions();\nvoid snapshot;\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Model setters provide explicit target overrides; set a target flag to undefined to\ninherit again. Later top-level calls on existing unoverridden models/services see\nupdated defaults; nested related/embedded/child stages retain their owning capture.\nThis is independent of the same target's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requireOperationAccessForPopulateQueries"
      }), ";\nregistration/effective object schema and static declarations stay mandatory.\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "getDefaultModelOptions()"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getModelOptions()"
      }), " return frozen raw snapshots, not\nresolved effective policy; read them again for later storage changes. Named root\ngetters/setters use the active runtime, falling back to the shared default runtime."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import mongoose from 'mongoose';\nimport { createAccessRuntime, type ModelVirtualDescriptor } from '@web-ts-toolkit/access-router';\n\ninterface Account {\n  name: string;\n  balance: number;\n  creditLimit: number;\n  tenantId: string;\n}\ninterface Order {\n  total: number;\n  account: mongoose.Types.ObjectId | null;\n}\nconst api = createAccessRuntime();\nconst AccountModel = mongoose.model<Account>(\n  'ConfiguredAccount',\n  new mongoose.Schema<Account>({\n    name: String,\n    balance: Number,\n    creditLimit: Number,\n    tenantId: String,\n  }),\n);\napi.createRouter(AccountModel, {\n  operationAccess: { read: true },\n  baseFilter: { read: () => ({ tenantId: 'example-server-owned-tenant' }) },\n  permissionSchema: { name: true, balance: false, creditLimit: false },\n});\nconst OrderModel = mongoose.model<Order>(\n  'ConfiguredOrder',\n  new mongoose.Schema<Order>({\n    total: Number,\n    account: { type: mongoose.Schema.Types.ObjectId, ref: AccountModel.modelName },\n  }),\n);\nconst canPlaceOrder: ModelVirtualDescriptor<Order, boolean, { account: Account }> = {\n  dependsOn: ['total'],\n  dependsOnPopulate: [{ path: 'account', select: ['balance', 'creditLimit'] }],\n  get(doc, _permissions, _context, populated = {}) {\n    const account = populated.account;\n    if (doc.total === undefined || account?.balance === undefined || account.creditLimit === undefined)\n      return undefined;\n    return doc.total <= account.balance + account.creditLimit;\n  },\n};\nconst orders = api.createRouter<Order, { canPlaceOrder: boolean }>(OrderModel, {\n  operationAccess: { read: true },\n  permissionSchema: { total: false, account: true, canPlaceOrder: true },\n  virtuals: { canPlaceOrder },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The ref is automatically retained; there is no need for ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dependsOn: ['account']"
      }), ".\nUse the authenticated server actor's tenant in real row hooks. Source/target input-field\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "permissionSchema"
      }), " is already bypassed by the declaration; the virtual's own output\nauthorization still applies. True requires captured ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "base read"
      }), " admission; false skips\nonly that private operation guard. Both modes retain request-mode\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "overrideFilter.read"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "baseFilter.read"
      }), ", with source IDs ANDed after transforms.\nThere is no read-to-list fallback, route-variant gate or private ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access"
      }), " override.\nOrdinary ", (0,jsx_runtime.jsx)(_components.code, {
        children: "populate.match"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access"
      }), ", selection and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "authorization.related"
      }), " cannot\nredefine these inputs or grant private reads. A related policy for a dependency-only\npath is unused/invalid. False-mode virtual-only output performs no operation check\nsolely to fetch private inputs; it grants no public field/operation, row or write authority."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Compatible public/private target queries fetch a normalized persisted union; the\noriginal public selection and authorization stay separate and immutable:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["In ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "all four modes"
        }), ", source unselection/exclusion/field denial omits the ref.\nThere is no additional target-base-read reference-visibility gate. Adding a virtual\ndoes not change ordinary ref shape, including when private strict admission fails."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["With source selected/permitted, ordinary admitted\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "populate: [{ path: 'account', select: 'name -_id' }]"
        }), " returns\nonly ", (0,jsx_runtime.jsx)(_components.code, {
          children: "account.name"
        }), ", even if private fetched fields are readable but unrequested."]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "With source selected/permitted, no admitted ordinary population restores the exact original\nID/array: missing IDs, order, duplicates, nulls, absence and empty arrays survive."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "An actual admitted population miss returns scalar null or a filtered array, never\nrestored IDs. Private denial/row/query/getter failure or deferred virtual denial\ncannot hide otherwise permitted IDs or widen a public mask."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Resolved default population counts as ordinary; explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "populate: []"
      }), " suppresses\ndefaults. Public ", (0,jsx_runtime.jsx)(_components.code, {
        children: "-_id"
      }), " exclusions survive private identity fetching. Cleanup runs\nbefore output copying/handles and decorate/decorateAll/tasks, including on unavailable inputs, undefined/throw\nand post-fetch virtual denial. No private maps/raw values are implicitly transported\nto DTOs, hooks, handles or metadata; only the authorized getter's deliberate return\nbecomes computed output."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Declarations accept only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ path, select? }"
      }), ", no model/match/access/populate. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "path"
      }), "\nmust be a scope-local static string ref on an ObjectId scalar or 1D ObjectId array\nto a registered ObjectId-identity model. Embedded virtuals declare the field in their\n", (0,jsx_runtime.jsx)(_components.code, {
        children: ".sub"
      }), " scope, never a dotted root path. Dynamic/refPath/function/model-valued refs,\nMap/Mixed, virtual populate, discriminator-varying scopes/targets, cross-connection\nmodels, non-ObjectId IDs and multidimensional ref arrays reject explicitly."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "select"
      }), " accepts comma/space strings, string arrays or ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "1/-1"
      }), " objects (not 0).\nOmitted/empty selects all eligible static stored fields; exclusion-only subtracts\nfrom that catalog; negative paths win over positives. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " is supplied unless\nexcluded, while association identity stays privately fetched. Static embedded dotted\npaths/containers expand to eligible stored leaves; target refs remain IDs, not traversed\nobjects. Explicit virtual/alias/unknown/unsafe/control/metadata/version/dynamic paths\nand invalid exclusions/tokens reject. No recursive private target virtual computation\noccurs; target service defaults/requireExplicitSelect do not replace this mask."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Per-access lists inherit independently of local ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dependsOn"
      }), ": exact getter then\ndefault, bare getter inherits shared lists, defined leaf list replaces wholesale,\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "[]"
      }), " clears, undefined inherits, null rejects. Duplicate paths within one declaration\nreject. Different getters may share a path but receive only their own isolated mask."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Support includes direct/root/trusted reads, writes/upserts, templates, ordinary\npopulated/included outputs, embedded scopes and visible dedicated subdocuments.\nWrites capture post-lifecycle refs without changing saved refs/snapshots or retry\nsemantics; hidden rows run no getter. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "new"
      }), " ignores args.select and loads present\ndefault refs under the captured private-read mode/request read-row scope without saving. Count/distinct/exists/delete identities\nand include-count/field helpers add no dependency I/O. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "SubPopulate"
      }), " stays path/select-only."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Private reads inherit receiving hydration: direct read/populate mode, fixed lean for\nincludes and child mutation visibility, hydrated for dedicated child read/list and\nordinary writes/templates. Native values/defaults/getters/transforms can differ; exact\nrestoration refers to that captured materialized value, not cross-mode raw BSON equality.\nMeasured one-versus-24-row lists with two compatible target groups both used two target\nfinds (plus one parent find), at persistence/getter limits 1 and 2. Independent public\ncorrelated queries remain per parent; no universal constant query count is promised."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["See ", (0,jsx_runtime.jsx)(_components.a, {
        href: "./hooks#private-populated-getter-inputs",
        children: "Getter absence/error rules"
      }), " and the\n", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://www.npmjs.com/package/@web-ts-toolkit/access-router#private-populated-dependencies",
        children: "installed README's runnable example"
      }), "\nfor the executable four-mode response shapes and breaking migration guidance."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "operation-access",
      children: "Operation Access"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OperationAccess"
      }), " in ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelRouterOptions.operationAccess"
      }), " for all fourteen\nmodel keys: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basicList"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedList"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basicRead"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedRead"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "basicCreate"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedCreate"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basicUpdate"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedUpdate"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "basicUpsert"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedUpsert"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basicCount"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedCount"
      }), ", and\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "basicDistinct"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedDistinct"
      }), ". The ", (0,jsx_runtime.jsx)(_components.a, {
        href: "./routing#model-router-routes",
        children: "complete routing matrix"
      }), "\nmaps endpoints to these keys. Data routers use four list/read keys; subdocument\nfields use four nested list/read keys."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["An exact variant ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "replaces"
      }), " the base guard. Only undefined inherits the existing\nbase exact → ", (0,jsx_runtime.jsx)(_components.code, {
        children: "operationAccess.default"
      }), " → scalar ", (0,jsx_runtime.jsx)(_components.code, {
        children: "operationAccess"
      }), " shorthand\nresolution. False, an empty array, and a false-returning hook are final. With no\nother fallback/default variant configured:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Rules"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Basic list"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Advanced list"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Root list entry"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "list: true"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "allowed"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "allowed"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "allowed"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "list: false"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "denied"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "denied"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "denied"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "list: true, basicList: false"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "denied"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "allowed"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "allowed"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "list: true, advancedList: false"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "allowed"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "denied"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "allowed"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "list: false, basicList: true"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "allowed"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "denied"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "denied"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsxs)(_components.td, {
            children: ["only ", (0,jsx_runtime.jsx)(_components.code, {
              children: "basicList: true"
            })]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "allowed"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "denied"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "denied"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "list: true, basicList: undefined"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "allowed"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "allowed"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "allowed"
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import acl, { type ModelRouterOptions } from '@web-ts-toolkit/access-router';\n\nconst baseOnly = {\n  operationAccess: { list: true, read: true },\n  permissionSchema: { name: true },\n} satisfies ModelRouterOptions;\nconst advancedReadsOnly = {\n  basePath: '/users',\n  operationAccess: { list: true, read: true, basicRead: false },\n  permissionSchema: { name: true },\n} satisfies ModelRouterOptions;\nconst basicListsOnly = {\n  operationAccess: { list: true, advancedList: false },\n} satisfies ModelRouterOptions;\nconst permissionBased = {\n  operationAccess: { list: true, read: true, advancedList: 'isAdmin', advancedRead: ['canRead', 'isAdmin'] },\n  permissionSchema: { name: { list: true, read: true } },\n} satisfies ModelRouterOptions;\nconst shorthand = { operationAccess: 'canUseApi' } satisfies ModelRouterOptions;\nconst withDefault = {\n  operationAccess: { default: 'canUseApi', list: true, basicRead: false },\n} satisfies ModelRouterOptions;\n\nacl.setDefaultModelOptions({ operationAccess: { list: true, read: true } });\nacl.setDefaultModelOption('operationAccess.advancedRead', 'isAdmin');\nconst defaultRead = acl.getDefaultModelOption('operationAccess.advancedRead');\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Among top-level model routes, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basicRead: false"
      }), " denies only GET-by-id (and its HEAD fallback), leaving both\nadvanced read POSTs authorized by ", (0,jsx_runtime.jsx)(_components.code, {
        children: "read: true"
      }), ". List/new/count/distinct/mutation\nguards remain independent. Denial is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "HTTP 401"
      }), ", with endpoints still present\nin ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getEndpoints()"
      }), " and OpenAPI."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Rule values are ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Validation"
      }), " (", (0,jsx_runtime.jsx)(_components.code, {
        children: "boolean | string | string[] | GuardHook"
      }), "). Strings\nAND space-separated permissions; arrays OR their entries. Hooks receive\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "AccessRouterPermissions"
      }), ", bind ", (0,jsx_runtime.jsx)(_components.code, {
        children: "this"
      }), " to the request, and may be async. Only the\nselected guard runs; operational errors do not become permission fallback.\nConfigure permission names with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "globalPermissions"
      }), ". Field grants stay in\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "PermissionSchema"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "FieldOperationAccess"
      }), " under base names, not variant names."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "model-default-specificity",
      children: "Model default specificity"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Model exact variant lookup consults the runtime's same exact default path if the\nmodel value is undefined, ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "before"
      }), " base fallback. A default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "advancedRead"
      }), " can\ntherefore outrank a model's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "read"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "default"
      }), ", or shorthand; an exact model variant\noutranks that default variant. A model object still replaces its stored\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "operationAccess"
      }), " object shallowly, rather than recursively inheriting all siblings."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Copied default values remain stored until updated. Later default setter calls do\nnot broadcast replacement over existing model values; clearing a stored variant\nmay expose the current exact runtime default. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getDefaultModelOption"
      }), " reads a\npath exactly, without variant/base or ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".default"
      }), " resolution.\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "getDefaultModelOptions()"
      }), " returns a frozen snapshot. Data routers have no model\ndefault inheritance."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "subdocument-field-rules",
      children: "Subdocument field rules"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For ", (0,jsx_runtime.jsx)(_components.code, {
        children: "subs.comments.basicList"
      }), ", precedence is exact field variant → field ", (0,jsx_runtime.jsx)(_components.code, {
        children: "list"
      }), "\n→ defined field scalar/closed object → top-level ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basicList"
      }), " ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "only for an absent\nfield"
      }), " → existing top-level ", (0,jsx_runtime.jsx)(_components.code, {
        children: "list"
      }), " fallback. Read/advanced variants follow the\nsame ordering."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import type { ModelRouterOptions } from '@web-ts-toolkit/access-router';\n\nconst options = {\n  operationAccess: {\n    list: true,\n    read: true,\n    subs: {\n      comments: { list: true, read: true, basicList: false, advancedRead: 'isAdmin' },\n      items: { read: true }, // Closed: omitted list rules deny both items list routes.\n      attachments: 'isAdmin',\n    },\n  },\n} satisfies ModelRouterOptions;\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["A defined object without the applicable operation cannot be reopened by top-level\nallows. Exact field lookups retain model-default specificity; an inherited defined\nfield also stays closed. There is no nested ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".default"
      }), " fallback. Legacy scalar ", (0,jsx_runtime.jsx)(_components.code, {
        children: "subs"
      }), " rules remain\naccepted, but do not act as an umbrella for absent fields; use explicit field rules."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Route grants retain base field/row/hook, root-entry, related-target, read-miss\nfallback, upsert branch, and mutation-response policies. See ", (0,jsx_runtime.jsx)(_components.a, {
        href: "./services#route-entry-and-service-policy",
        children: "Services"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "request-complexity-and-correlated-limits",
      children: "Request Complexity And Correlated Limits"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "requestComplexity"
      }), " bounds apply to every read/list/count request, including\ncorrelated-include templates and their per-parent expansions:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "maxDepth"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "8"
        }), "), ", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxNodes"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "500"
        }), "),\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxLogicalClauses"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "50"
        }), "), ", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxInValues"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "100"
        }), "),\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxBulkItems"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "100"
        }), "), ", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxIncludeCount"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "10"
        }), "),\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxSubQueryCount"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "10"
        }), "), ", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxBulkConcurrency"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "10"
        }), "),\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxHookConcurrency"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "10"
        }), ")"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "maxCorrelatedQueries"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "100"
        }), "): cumulative inner target executions per\nrequest/runtime (each executed per-parent read/list/count counts 1; nested levels\nmultiply). Exceeding it fails the request/affected root entry."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "maxCorrelatedDepth"
        }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "5"
        }), "): nesting depth of correlated includes."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Each correlated entry counts toward ", (0,jsx_runtime.jsx)(_components.code, {
        children: "maxIncludeCount"
      }), " and its markers count\nas nodes; template ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$in"
      }), " lengths count toward ", (0,jsx_runtime.jsx)(_components.code, {
        children: "maxInValues"
      }), ". After\nper-parent substitution the expanded filter is revalidated against\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "maxNodes"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "maxDepth"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "maxInValues"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "maxLogicalClauses"
      }), ", so a short template\nexpanding against a large parent array can still be rejected. Prefer tight parent\nfilters and small per-parent limits to bound relationship work."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "persistence-admission",
      children: "Persistence admission"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Both concurrency limits are normalized and captured together on first use of a\nrequest/runtime's private work state. Existing owners retain that capture after\nconfiguration changes; new requests capture the new limits."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "maxBulkConcurrency"
      }), " bounds awaited adapter/document persistence operations across\nmodel-service calls, root entries, subqueries, legacy includes and nested correlated\nlevels sharing one request/runtime. Each request and runtime has an independent pool;\nservices capture their runtime at construction. Admission awaits lazy queries,\nsave/delete and service-triggered post-write populate. Bulk create admits one\nsingleton-array adapter call per item, preserving result order and submitting every\nitem even if another rejects."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Recursive orchestration holds no permit while awaiting descendants, so limit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "1"
      }), "\nsupports nested includes. Internal map/run bounds remain per invocation.\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "RootRouter.maxConcurrentOperations"
      }), " separately limits whole root operations per\norder group. Permits release on success/error with FIFO transfer; release does not\ncancel submitted siblings or refund the cumulative correlated-query budget."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This is an adapter-operation ceiling, not a count of MongoDB driver commands: one\noperation can issue multiple commands via Mongoose middleware/populate. Router ACL,\nprepare, afterPersist and decorate run outside the permit; Mongoose middleware is\ninside the awaited operation. Direct DB/network calls in trusted hooks are outside\nadmission. This is not a process-wide connection limit, transaction/optimistic-edit\nguard or throughput guarantee. Controlled nested-query tests measured peak collection\ncalls falling from 9 to 3 at limit 3; that does not bound arbitrary middleware fan-out."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "hook-admission-and-nested-service-calls",
      children: "Hook admission and nested service calls"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "maxHookConcurrency"
      }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "10"
      }), ") counts independent ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "hook chains"
      }), " across one\nrequest/runtime's services, root entries, includes, populate and subdocuments. The\npool covers model document-grant hooks (including pre-write/helper/owning-parent\nstages), virtual getters, model/data ", (0,jsx_runtime.jsx)(_components.code, {
        children: "decorate"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "decorateAll"
      }), ", service output\ndecorators and data request-field selection/trimming stages. Other guards, row/ID\nfilters, model field-rule callbacks and write lifecycle hooks are outside this pool."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["A hook can await a nested service at limit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "1"
      }), ". Private async context lets its\ndescendant hooks reuse the chain, while each callback scope admits ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "one immediate\nchild branch at a time"
      }), ", FIFO through descendant settlement. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Promise.all"
      }), " sibling\nhook stages therefore serialize rather than bypassing admission. Waiting ancestors\nare additional frames, not additional permits: the limit bounds independent leaf\nbranches, not all unsettled callbacks. Reentrant depth is capped at 64 admission\nscopes per chain, including internal wrappers; overflow uses the existing hook\nfailure policy. Settled scopes close to new reentry and drain queued children even\non failure; detached late continuations reacquire root admission. Await hook work\nand avoid cross-branch dependency cycles. Root and child queues each transfer FIFO."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Row/traversal maps retain per-call worker limits and stable output/context order.\nHook and persistence pools are separate; no persistence permit is held over hooks\nor orchestration. Trusted direct DB/network fan-out, total queued work and query\ncounts are outside these limits. They do not provide process-wide connection limits\nor automatic N+1 batching."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "openapi-router-options",
      children: "OpenAPI Router Options"
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
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "jsonPath"
        }), " defaulting to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "/openapi.json"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "docsPath"
        }), " defaulting to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "/docs"
        }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "false"
        }), " to disable Swagger UI"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "swaggerUiCssUrl"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "swaggerUiBundleUrl"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "data-router-options",
      children: "Data Router Options"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Common data options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "data"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "basePath"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "operationAccess"
        }), " supports ", (0,jsx_runtime.jsx)(_components.code, {
          children: "list"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "read"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "default"
        }), ", scalar shorthand, and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "basicList"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedList"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "basicRead"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "advancedRead"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "permissionSchema"
        }), " maps fields to booleans, permission names, or per-operation rule objects"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "baseFilter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "overrideFilter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "decorate"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "decorateAll"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "requestSchemas"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Router-specific options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "listHardLimit"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "idParam"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "idField"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "resolveIdFilter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "parentPath"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "queryRouteSegment"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "operationAccess"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "dataName"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Set both ", (0,jsx_runtime.jsx)(_components.code, {
        children: "idParam"
      }), " (Express parameter name) and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "idField"
      }), " (lookup field) explicitly\nfor data identifier routes; data has no model-default layer. Callable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "resolveIdFilter"
      }), "\ntakes precedence over ", (0,jsx_runtime.jsx)(_components.code, {
        children: "idField"
      }), " for both model and data lookups. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "parentPath"
      }), " describes\nan external mount prefix in metadata/logging; mount that prefix in Express yourself."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Data owns configured nested/native values and rejects unsupported values at assignment.\nServices capture one dataset version and detach only selected/page-returned values.\nFrozen snapshot native properties return detached mutable copies on access; native\nidentity is not stable. Replace through ", (0,jsx_runtime.jsx)(_components.code, {
        children: "router.data(next)"
      }), " or runtime data setters.\nSee the installed README's “In-memory data ownership” for the exact supported values."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "option-apis",
      children: "Option APIs"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The runtime exposes getter/setter pairs for each option group:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "acl.setGlobalOptions(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "acl.setGlobalOption(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "acl.getGlobalOptions()"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "acl.getGlobalOption(...)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "acl.setModelOptions(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "acl.setModelOption(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "acl.getModelOptions()"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "acl.getModelOption(...)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "acl.setDefaultModelOptions(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "acl.setDefaultModelOption(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "acl.getDefaultModelOptions()"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "acl.getDefaultModelOption(...)"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use router instance methods when you want to mutate one router in place."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import mongoose from 'mongoose';\nimport { createAccessRuntime } from '@web-ts-toolkit/access-router';\n\nconst runtime = createAccessRuntime();\nconst User = mongoose.model('ConfigurationVariantUser', new mongoose.Schema({ name: String }));\nconst router = runtime.createRouter(User, {\n  basePath: '/users',\n  operationAccess: { list: true, read: true },\n  permissionSchema: { name: true },\n});\nrouter.operationAccess('basicRead', false); // Preserve the other keys.\nrouter.operationAccess('subs.comments.basicRead', false);\nrouter.set('operationAccess.advancedList', 'isAdmin');\nrouter.setOption('operationAccess.basicRead', undefined); // Restore inheritance.\nruntime.setModelOption(router.modelName, 'operationAccess.basicRead', false);\n\nrouter.operationAccess({ list: true, read: true, basicRead: false }); // Whole rule replacement.\nrouter.setOptions({ operationAccess: { list: true, advancedList: false } }); // Same shallow assignment.\nconst current = runtime.getModelOptions(router.modelName);\nconst exactVariant = runtime.runtime.getExactModelOption(router.modelName, 'operationAccess.basicRead');\n\nconst dataRouter = runtime.createDataRouter('VariantData', {\n  idParam: 'id',\n  data: [],\n  operationAccess: { list: true, read: true },\n});\ndataRouter.setOption('operationAccess.basicRead', false);\ndataRouter.runtime.setDataOption('VariantData', 'operationAccess.advancedRead', true);\nconst currentData = dataRouter.runtime.getDataOptions('VariantData');\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "set({ operationAccess: ... })"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "setOption('operationAccess', ...)"
      }), ", and property\nhelper object forms replace that entire object shallowly. Dotted paths are setter\narguments, not flat dotted properties in constructor options. A path update under\nscalar shorthand starts an object; use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "default"
      }), " to retain the broad base fallback.\nUse typed ", (0,jsx_runtime.jsx)(_components.code, {
        children: "set"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "setOption"
      }), " with undefined to clear; property-helper key updates\nare for defined values."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "router.options"
      }), " is a frozen construction-time snapshot. Getter results are frozen\nsnapshots too (with data's native-copy behavior above); fetch again for current stored values. Generic\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "getModelOption"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "getDataOption"
      }), " use nested-option fallback, not route-specific\nvariant-to-base resolution. Exact getters expose the variant path (with exact model\ndefault fallback); request guards resolve live runtime options."]
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
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./validation",
          children: "Validation"
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