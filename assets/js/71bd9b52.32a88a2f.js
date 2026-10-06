"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[905],{

/***/ 6939
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
const site_docs_packages_access_router_configuration_mdx_71b_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router/configuration","title":"Configuration","description":"Global Options","source":"@site/docs/packages/access-router/configuration.mdx","sourceDirName":"packages/access-router","slug":"/packages/access-router/configuration","permalink":"/docs/packages/access-router/configuration","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":3,"frontMatter":{"sidebar_label":"Configuration","sidebar_position":3},"sidebar":"packagesSidebar","previous":{"title":"Routing","permalink":"/docs/packages/access-router/routing"},"next":{"title":"Services","permalink":"/docs/packages/access-router/services"}}');
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
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "global-options",
      children: "Global Options"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Set once per runtime with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "acl.setGlobalOptions(...)"
      }), "."]
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
        children: "acl.setGlobalOptions({\n  requestPermissionField: '_permissions',\n  globalPermissions(req) {\n    return req.headers.user === 'admin' ? ['isAdmin'] : [];\n  },\n});\n"
      })
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
      }), "\n"]
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
        }), " accepts booleans, permission names, or per-operation rule objects"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "alwaysSelectFields"
        })
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
        }), " accepts booleans, permission names, or per-operation rule objects"]
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
        children: "import mongoose from 'mongoose';\nimport { createAccessRuntime } from '@web-ts-toolkit/access-router';\n\nconst runtime = createAccessRuntime();\nconst User = mongoose.model('ConfigurationVariantUser', new mongoose.Schema({ name: String }));\nconst router = runtime.createRouter(User, {\n  basePath: '/users',\n  operationAccess: { list: true, read: true },\n  permissionSchema: { name: true },\n});\nrouter.operationAccess('basicRead', false); // Preserve the other keys.\nrouter.operationAccess('subs.comments.basicRead', false);\nrouter.set('operationAccess.advancedList', 'isAdmin');\nrouter.setOption('operationAccess.basicRead', undefined); // Restore inheritance.\nruntime.setModelOption(router.modelName, 'operationAccess.basicRead', false);\n\nrouter.operationAccess({ list: true, read: true, basicRead: false }); // Whole rule replacement.\nrouter.setOptions({ operationAccess: { list: true, advancedList: false } }); // Same shallow assignment.\nconst current = runtime.getModelOptions(router.modelName);\nconst exactVariant = runtime.runtime.getExactModelOption(router.modelName, 'operationAccess.basicRead');\n\nconst dataRouter = runtime.createDataRouter('VariantData', {\n  idParam: 'id', data: [], operationAccess: { list: true, read: true },\n});\ndataRouter.setOption('operationAccess.basicRead', false);\ndataRouter.runtime.setDataOption('VariantData', 'operationAccess.advancedRead', true);\nconst currentData = dataRouter.runtime.getDataOptions('VariantData');\n"
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
      }), " is a frozen construction-time snapshot. Getter results are frozen\nsnapshots too; fetch again for current stored values. Generic\n", (0,jsx_runtime.jsx)(_components.code, {
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