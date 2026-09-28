"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[686],{

/***/ 731
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
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(7008);
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
  "value": "Important behavior",
  "id": "important-behavior",
  "level": 3
}, {
  "value": "Denial versus a missing row",
  "id": "denial-versus-a-missing-row",
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
      id: "important-behavior",
      children: "Important behavior"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "_read(id, args, { tryList: true })"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_readFilter(filter, args, options)"
        }), " can\nfall back from an authorized read miss to list access, subject to list operation\naccess. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "tryList"
        }), " defaults to true. Forbidden and BadRequest never retry."]
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
      children: ["Model service ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOne"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "find"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateOne"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "upsert"
      }), " accept trusted\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "args.overrides.filter"
      }), "; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findById"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "updateById"
      }), " accept ", (0,jsx_runtime.jsx)(_components.code, {
        children: "args.overrides.idFilter"
      }), ".\nFalse is terminal Forbidden, with no fallback filter/identifier generation or\npersistence, including client subqueries. Omitted/undefined/null uses normal\ngeneration. Object filter overrides replace generated row policy; object idFilter\noverrides replace identifier resolution and still receive row policy."]
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
      }), " uses one grouped aggregate per include execution for all parents,\ncounting distinct authorized target documents independently of listHardLimit and\ninclude pagination. Duplicate local/foreign array keys or documents matching multiple\nlocal keys do not inflate a parent's count; misses yield zero. The target schema casts\nthe authorized match (including tenant filters) and foreign operands before/after\nunwind, retaining original parent-key association for normalized ObjectId/String keys\nand query setters. Invalid casts return controlled BadRequest rather than zero.\nTerminal false count row policy retains legacy omitted output; the grouped service\nreturns Forbidden. Operation denials prevent target work."]
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
      }), " when count support is enabled."]
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