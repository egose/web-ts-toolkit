"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[575],{

/***/ 1892
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_express_response_handler_md_83c_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-express-response-handler-md-83c.json
const site_docs_packages_express_response_handler_md_83c_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/express-response-handler","title":"@web-ts-toolkit/express-response-handler","description":"FastAPI-style return-value responses for Express.","source":"@site/docs/packages/express-response-handler.md","sourceDirName":"packages","slug":"/packages/express-response-handler","permalink":"/docs/packages/express-response-handler","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":4,"frontMatter":{"sidebar_label":"Express Response Handler","sidebar_position":4},"sidebar":"packagesSidebar","previous":{"title":"Express Runtime","permalink":"/docs/packages/express-runtime"},"next":{"title":"Express JSON Router","permalink":"/docs/packages/express-json-router"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(5250);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(6574);
;// ./docs/packages/express-response-handler.md


const frontMatter = {
	sidebar_label: 'Express Response Handler',
	sidebar_position: 4
};
const contentTitle = '@web-ts-toolkit/express-response-handler';

const assets = {

};





const toc = [{
  "value": "Installation",
  "id": "installation",
  "level": 2
}, {
  "value": "Quick Start",
  "id": "quick-start",
  "level": 2
}, {
  "value": "What It Exposes",
  "id": "what-it-exposes",
  "level": 2
}, {
  "value": "Import styles",
  "id": "import-styles",
  "level": 3
}, {
  "value": "How It Works",
  "id": "how-it-works",
  "level": 2
}, {
  "value": "Examples",
  "id": "examples",
  "level": 2
}, {
  "value": "Return JSON with <code>200 OK</code>",
  "id": "return-json-with-200-ok",
  "level": 3
}, {
  "value": "Return a custom success status",
  "id": "return-a-custom-success-status",
  "level": 3
}, {
  "value": "Throw HTTP errors",
  "id": "throw-http-errors",
  "level": 3
}, {
  "value": "Return CSV",
  "id": "return-csv",
  "level": 3
}, {
  "value": "Use more than one Express handler",
  "id": "use-more-than-one-express-handler",
  "level": 3
}, {
  "value": "Hooks",
  "id": "hooks",
  "level": 2
}, {
  "value": "Custom Error Messages",
  "id": "custom-error-messages",
  "level": 2
}, {
  "value": "Structured Error Format",
  "id": "structured-error-format",
  "level": 2
}, {
  "value": "Isolated Instances",
  "id": "isolated-instances",
  "level": 2
}, {
  "value": "When To Use It",
  "id": "when-to-use-it",
  "level": 2
}, {
  "value": "Related Packages",
  "id": "related-packages",
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
    ul: "ul",
    ...(0,lib/* useMDXComponents */.R)(),
    ...props.components
  };
  return (0,jsx_runtime.jsxs)(jsx_runtime.Fragment, {
    children: [(0,jsx_runtime.jsx)(_components.header, {
      children: (0,jsx_runtime.jsx)(_components.h1, {
        id: "web-ts-toolkitexpress-response-handler",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/express-response-handler"
        })
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "FastAPI-style return-value responses for Express."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Instead of calling ", (0,jsx_runtime.jsx)(_components.code, {
        children: "res.json(...)"
      }), " in every route, return a value. This package turns that return value into a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "200 OK"
      }), " JSON response, while still letting you return explicit response wrappers or throw errors when needed."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "installation",
      children: "Installation"
    }), "\n", (0,jsx_runtime.jsxs)(Tabs/* default */.A, {
      groupId: "npm2yarn",
      children: [(0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "npm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "npm install @web-ts-toolkit/express-response-handler\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add @web-ts-toolkit/express-response-handler\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add @web-ts-toolkit/express-response-handler\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add @web-ts-toolkit/express-response-handler\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\n\nimport apiHandler from '@web-ts-toolkit/express-response-handler';\nimport { NotFoundError } from '@web-ts-toolkit/http-errors';\n\nconst { handleResponse, HttpResponse } = apiHandler;\n\nconst app = express();\n\nasync function getUser(id: string) {\n  return id === 'missing' ? null : { id, name: 'Ada' };\n}\n\nasync function createJob() {\n  return { id: 'job_1' };\n}\n\napp.get(\n  '/health',\n  handleResponse(() => {\n    return { ok: true };\n  }),\n);\n\napp.get(\n  '/users/:id',\n  handleResponse(async (req) => {\n    const user = await getUser(req.params.id);\n\n    if (!user) {\n      throw new NotFoundError('user not found');\n    }\n\n    return user;\n  }),\n);\n\napp.post(\n  '/jobs',\n  handleResponse(async () => {\n    const job = await createJob();\n    return HttpResponse.created(job);\n  }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-exposes",
      children: "What It Exposes"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Root entrypoint:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "default handler instance"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "handleResponse(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "HttpResponse"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "createHandler(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "ErrorFormats"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Published subpaths:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/express-response-handler/types"
        }), " for public handler and middleware types such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ExpressResponseHandlerOptions"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "HandleResponse"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/express-response-handler/responses"
        }), " for response-wrapper exports"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/express-response-handler/responses/csv"
        }), " for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "CSVResponse"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/express-response-handler/responses/success"
        }), " for concrete success wrappers such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Created"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Accepted"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "NoContent"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example subpath import:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { Created, NoContent } from '@web-ts-toolkit/express-response-handler/responses/success';\n\nasync function createUser() {\n  return { id: 'user_1' };\n}\n\napp.post(\n  '/users',\n  handleResponse(async () => new Created(await createUser())),\n);\napp.delete(\n  '/users/:id',\n  handleResponse(async () => new NoContent()),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "import-styles",
      children: "Import styles"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The package supports both a default export and named exports:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import apiHandler from '@web-ts-toolkit/express-response-handler';\n\nconst { handleResponse, HttpResponse } = apiHandler;\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { handleResponse, HttpResponse } from '@web-ts-toolkit/express-response-handler';\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use one style consistently within a module so route code stays easy to scan."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "how-it-works",
      children: "How It Works"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "handleResponse(...)"
      }), " wraps one or more Express handlers."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "When a handler runs:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["a plain returned value becomes ", (0,jsx_runtime.jsx)(_components.code, {
          children: "res.json(value)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["a returned ", (0,jsx_runtime.jsx)(_components.code, {
          children: "HttpResponse.*(...)"
        }), " wrapper controls the status code"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["a returned ", (0,jsx_runtime.jsx)(_components.code, {
          children: "HttpResponse.csv(...)"
        }), " streams CSV"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["a returned ", (0,jsx_runtime.jsx)(_components.code, {
          children: "undefined"
        }), " means the handler is managing the response directly"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "a thrown error becomes an error response"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "a returned promise is awaited automatically"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Supported forms:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "handleResponse(fn)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "handleResponse(fn1, fn2)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "handleResponse([fn1, fn2])"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "examples",
      children: "Examples"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["In the focused snippets below, helpers such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createSession(...)"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getProject(...)"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getUserReportRows(...)"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requireAuth"
      }), " are application-specific placeholders."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h3, {
      id: "return-json-with-200-ok",
      children: ["Return JSON with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "200 OK"
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "app.get(\n  '/profile',\n  handleResponse(async (req) => {\n    return {\n      id: req.user.id,\n      email: req.user.email,\n    };\n  }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "return-a-custom-success-status",
      children: "Return a custom success status"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "app.post(\n  '/sessions',\n  handleResponse(async (req) => {\n    const session = await createSession(req.body);\n    return HttpResponse.created(session);\n  }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "throw-http-errors",
      children: "Throw HTTP errors"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { BadRequestError, NotFoundError } from '@web-ts-toolkit/http-errors';\n\napp.get(\n  '/projects/:id',\n  handleResponse(async (req) => {\n    if (!req.params.id) {\n      throw new BadRequestError('project id is required');\n    }\n\n    const project = await getProject(req.params.id);\n\n    if (!project) {\n      throw new NotFoundError('project not found');\n    }\n\n    return project;\n  }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "return-csv",
      children: "Return CSV"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "app.get(\n  '/reports/users.csv',\n  handleResponse(async () => {\n    const rows = await getUserReportRows();\n\n    return HttpResponse.csv(rows, {\n      filename: 'users.csv',\n    });\n  }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["CSV download filenames are emitted as standards-compliant attachment headers with an ASCII fallback and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "filename*"
      }), " for Unicode names. Filenames containing control characters such as CR, LF, or NUL are rejected before CSV headers are written."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["CSV sources can be arrays, synchronous iterables, or async iterables. Arrays keep automatic header inference from the first row. Lazy iterable sources are consumed once during response streaming and must pass an explicit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "headers"
      }), " option because the handler will not peek and buffer a row just to infer headers. If the client disconnects or CSV formatting fails, the active iterator's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "return()"
      }), " method is called so generators can release database cursors, files, or other resources."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "CSVResponse"
      }), " writes cell values exactly as supplied. It does not automatically neutralize spreadsheet formulas such as values beginning with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "="
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "+"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "-"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@"
      }), " because some exports intentionally include formulas. If user-controlled cells may be opened in spreadsheet software, neutralize them with the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "processor"
      }), " option:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const safeCell = (value: unknown) => {\n  if (typeof value === 'string' && /^[=+\\-@]/.test(value)) {\n    return `'${value}`;\n  }\n\n  return value;\n};\n\nconst safeRow = (row: Record<string, unknown>) => {\n  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, safeCell(value)]));\n};\n\nreturn HttpResponse.csv(rows, {\n  filename: 'users.csv',\n  processor: safeRow,\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "use-more-than-one-express-handler",
      children: "Use more than one Express handler"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "app.get(\n  '/me',\n  handleResponse(requireAuth, async (req) => {\n    return req.user;\n  }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you call ", (0,jsx_runtime.jsx)(_components.code, {
        children: "next()"
      }), " with no arguments, Express middleware flow continues normally."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Do not use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "next(value)"
      }), " for successful responses. Return the value instead."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "hooks",
      children: "Hooks"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Hooks let you observe response flow without repeating code in every route. They are observational side effects only: a hook may return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "void"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Promise<void>"
      }), ", but returned values never replace or transform the response payload."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Available setters:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "apiHandler.preJson = fn"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "apiHandler.postJson = fn"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "apiHandler.preError = fn"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "apiHandler.postError = fn"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "apiHandler.preJson = async function (data) {\n  console.log('about to send json response', data);\n};\n\napiHandler.preError = async function (err) {\n  console.error('request failed', err);\n};\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "preJson"
      }), " runs before a non-", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), " success value is serialized. This includes plain JSON values, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "HttpResponse"
      }), " wrappers, and CSV responses. If the wrapped handler returns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), ", the library assumes the handler owns the response and does not run ", (0,jsx_runtime.jsx)(_components.code, {
        children: "postJson"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "postJson"
      }), " runs after the HTTP response emits ", (0,jsx_runtime.jsx)(_components.code, {
        children: "finish"
      }), " for a successful response. It does not run on client ", (0,jsx_runtime.jsx)(_components.code, {
        children: "close"
      }), ", CSV/JSON serialization failure, or any path that never successfully finishes a response."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "preError"
      }), " runs before an error response is serialized. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "postError"
      }), " runs after the HTTP response emits ", (0,jsx_runtime.jsx)(_components.code, {
        children: "finish"
      }), " for an error response, and it receives the original error value observed by ", (0,jsx_runtime.jsx)(_components.code, {
        children: "preError"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If a pre-hook throws or rejects before headers are sent, the failure is routed through the normal error response path. If a post-hook throws or rejects, the response has already completed, so the failure is passed to Express with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "next(err)"
      }), " for logging/observability and no second response is sent."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The default export is a mutable process-wide singleton. Assigning ", (0,jsx_runtime.jsx)(_components.code, {
        children: "apiHandler.preJson"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "apiHandler.postJson"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "apiHandler.preError"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "apiHandler.postError"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "apiHandler.errorMessageProvider"
      }), " affects every route using that singleton after assignment. Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createHandler()"
      }), " for isolated hook and error-provider state."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "custom-error-messages",
      children: "Custom Error Messages"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Unexpected non-HTTP errors default to status ", (0,jsx_runtime.jsx)(_components.code, {
        children: "500"
      }), " with the generic message ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Internal Server Error"
      }), ". Raw thrown messages are not sent to clients, which prevents database, filesystem, assertion, or upstream details from leaking in production responses."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The original thrown value is still passed to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "preError"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "postError"
      }), ", and to Express error middleware if response serialization fails. Use those server-side paths for logging."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Only finite integer ", (0,jsx_runtime.jsx)(_components.code, {
        children: "4xx"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "5xx"
      }), " status codes are serialized as HTTP errors. Invalid status values from thrown objects, typed wrappers, or custom providers are rejected before response headers are written."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Breaking change: older versions returned generic thrown ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Error"
      }), " messages as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "422"
      }), " responses. Use typed errors from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/http-errors"
      }), " for intentional client-facing ", (0,jsx_runtime.jsx)(_components.code, {
        children: "4xx"
      }), " payloads."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "You can customize generic error payloads, but provider-derived status values must still be valid HTTP error statuses:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "apiHandler.errorMessageProvider = function (err) {\n  console.error('request failed', err);\n\n  return {\n    message: 'request failed',\n  };\n};\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "structured-error-format",
      children: "Structured Error Format"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The default error payload is intentionally small:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-json",
        children: "{ \"message\": \"project not found\" }\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you want an AIP-193-inspired error envelope, create a handler instance with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "errorFormat: 'aip193'"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import apiHandler from '@web-ts-toolkit/express-response-handler';\nimport { ErrorFormats } from '@web-ts-toolkit/express-response-handler';\n\nconst structuredHandler = apiHandler.createHandler({\n  errorFormat: ErrorFormats.aip193,\n  errorDomain: 'api.example.com',\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That mode returns errors in this shape:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-json",
        children: "{\n  \"error\": {\n    \"code\": 404,\n    \"status\": \"NOT_FOUND\",\n    \"message\": \"project not found\",\n    \"details\": [\n      {\n        \"type\": \"error_info\",\n        \"reason\": \"NOT_FOUND\",\n        \"domain\": \"api.example.com\"\n      }\n    ]\n  }\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "You can enrich HTTP errors with machine-readable fields:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { BadRequestError } from '@web-ts-toolkit/http-errors';\n\napp.get(\n  '/projects/:id',\n  structuredHandler.handleResponse(async () => {\n    throw new BadRequestError('invalid project id', {\n      reason: 'INVALID_PROJECT_ID',\n      metadata: { field: 'id' },\n      details: [\n        {\n          type: 'help',\n          links: [\n            {\n              description: 'Project ID format guide',\n              url: 'https://api.example.com/docs/errors/invalid-project-id',\n            },\n          ],\n        },\n      ],\n    });\n  }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you want RFC 9457 problem details instead, create a handler instance with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "errorFormat: 'rfc9457'"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import apiHandler from '@web-ts-toolkit/express-response-handler';\nimport { ErrorFormats } from '@web-ts-toolkit/express-response-handler';\n\nconst problemHandler = apiHandler.createHandler({\n  errorFormat: ErrorFormats.rfc9457,\n  errorDomain: 'api.example.com',\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["That mode returns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "application/problem+json"
      }), " payloads in this shape:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-json",
        children: "{\n  \"type\": \"https://api.example.com/problems/invalid-project-id\",\n  \"title\": \"Invalid project id\",\n  \"status\": 400,\n  \"detail\": \"invalid project id\",\n  \"instance\": \"/problems/invalid-project-id/123\",\n  \"errors\": [\n    {\n      \"detail\": \"must be a valid project id\",\n      \"pointer\": \"#/id\"\n    }\n  ]\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "You can enrich HTTP errors with problem detail fields:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { BadRequestError } from '@web-ts-toolkit/http-errors';\n\napp.get(\n  '/projects/:id',\n  problemHandler.handleResponse(async () => {\n    throw new BadRequestError('invalid project id', {\n      type: 'https://api.example.com/problems/invalid-project-id',\n      title: 'Invalid project id',\n      instance: '/problems/invalid-project-id/123',\n      errors: [\n        {\n          detail: 'must be a valid project id',\n          pointer: '#/id',\n        },\n      ],\n    });\n  }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "isolated-instances",
      children: "Isolated Instances"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The default export is a ready-to-use singleton. If you want separate hook configuration per router or module, create an isolated instance:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import apiHandler from '@web-ts-toolkit/express-response-handler';\n\nconst adminHandler = apiHandler.createHandler();\nconst publicHandler = apiHandler.createHandler();\n\nadminHandler.preError = async function (err) {\n  console.error('admin route failed', err);\n};\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "when-to-use-it",
      children: "When To Use It"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This package is a good fit when you want:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Express routes that return values instead of calling ", (0,jsx_runtime.jsx)(_components.code, {
          children: "res.json(...)"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "a small abstraction rather than a full framework"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "consistent JSON, error, and CSV response behavior"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "It is less useful if you want fully explicit low-level Express response control in every route."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "related-packages",
      children: "Related Packages"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./express-json-router",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/express-json-router"
          })
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./http-errors",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/http-errors"
          })
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

/***/ 6574
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  A: () => (/* binding */ TabItem)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/index.js
var react = __webpack_require__(489);
// EXTERNAL MODULE: ./node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
var clsx = __webpack_require__(3526);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.1_@docusaurus+plugin-content-docs@3.10.1_@mdx-js+react@3._5c760eb0e2d5ff300251aa280f7f631a/node_modules/@docusaurus/theme-common/lib/utils/tabsUtils.js
var tabsUtils = __webpack_require__(2329);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/styles.module.css
// extracted by mini-css-extract-plugin
/* harmony default export */ const styles_module = ({"tabItem":"tabItem_WPJy"});
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js
/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */function TabItemPanel({children,className,hidden}){return/*#__PURE__*/(0,jsx_runtime.jsx)("div",{role:"tabpanel",className:(0,clsx/* default */.A)(styles_module.tabItem,className),hidden,children:children});}function TabItem({children,className,value}){const{selectedValue,lazy}=(0,tabsUtils/* useTabs */.uc)();const isSelected=value===selectedValue;// TODO Docusaurus v4: use <Activity> ?
if(!isSelected&&lazy){return null;}return/*#__PURE__*/(0,jsx_runtime.jsx)(TabItemPanel,{className:className,hidden:!isSelected,children:children});}

/***/ },

/***/ 5250
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  A: () => (/* binding */ Tabs)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/index.js
var react = __webpack_require__(489);
// EXTERNAL MODULE: ./node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
var clsx = __webpack_require__(3526);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.1_@docusaurus+plugin-content-docs@3.10.1_@mdx-js+react@3._5c760eb0e2d5ff300251aa280f7f631a/node_modules/@docusaurus/theme-common/lib/utils/ThemeClassNames.js
var ThemeClassNames = __webpack_require__(1905);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.1_@docusaurus+plugin-content-docs@3.10.1_@mdx-js+react@3._5c760eb0e2d5ff300251aa280f7f631a/node_modules/@docusaurus/theme-common/lib/utils/tabsUtils.js
var tabsUtils = __webpack_require__(2329);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.1_@docusaurus+plugin-content-docs@3.10.1_@mdx-js+react@3._5c760eb0e2d5ff300251aa280f7f631a/node_modules/@docusaurus/theme-common/lib/utils/scrollUtils.js
var scrollUtils = __webpack_require__(4714);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+core@3.10.1_@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6__postcss@_8e4f15980c67c89e41a59896d33471aa/node_modules/@docusaurus/core/lib/client/exports/useIsBrowser.js
var useIsBrowser = __webpack_require__(2288);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/styles.module.css
// extracted by mini-css-extract-plugin
/* harmony default export */ const styles_module = ({"tabList":"tabList_Ardb","tabItem":"tabItem_astB"});
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js
/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */function TabList({className}){const{selectedValue,selectValue,tabValues,block}=(0,tabsUtils/* useTabs */.uc)();const tabRefs=[];const{blockElementScrollPositionUntilNextRender}=(0,scrollUtils/* useScrollPositionBlocker */.a_)();const handleTabChange=event=>{const newTab=event.currentTarget;const newTabIndex=tabRefs.indexOf(newTab);const newTabValue=tabValues[newTabIndex].value;if(newTabValue!==selectedValue){blockElementScrollPositionUntilNextRender(newTab);selectValue(newTabValue);}};const handleKeydown=event=>{let focusElement=null;switch(event.key){case'Enter':{handleTabChange(event);break;}case'ArrowRight':{const nextTab=tabRefs.indexOf(event.currentTarget)+1;focusElement=tabRefs[nextTab]??tabRefs[0];break;}case'ArrowLeft':{const prevTab=tabRefs.indexOf(event.currentTarget)-1;focusElement=tabRefs[prevTab]??tabRefs[tabRefs.length-1];break;}default:break;}focusElement?.focus();};return/*#__PURE__*/(0,jsx_runtime.jsx)("ul",{role:"tablist","aria-orientation":"horizontal",className:(0,clsx/* default */.A)('tabs',{'tabs--block':block},className),children:tabValues.map(({value,label,attributes})=>/*#__PURE__*/(0,jsx_runtime.jsx)("li",{// TODO extract TabListItem
role:"tab",tabIndex:selectedValue===value?0:-1,"aria-selected":selectedValue===value,ref:ref=>{tabRefs.push(ref);},onKeyDown:handleKeydown,onClick:handleTabChange,...attributes,className:(0,clsx/* default */.A)('tabs__item',styles_module.tabItem,attributes?.className,{'tabs__item--active':selectedValue===value}),children:label??value},value))});}function TabContent({children}){return/*#__PURE__*/(0,jsx_runtime.jsx)("div",{className:"margin-top--md",children:children});}function TabsContainer({className,children}){return/*#__PURE__*/(0,jsx_runtime.jsxs)("div",{className:(0,clsx/* default */.A)(ThemeClassNames/* ThemeClassNames */.G.tabs.container,// former name kept for backward compatibility
// see https://github.com/facebook/docusaurus/pull/4086
'tabs-container',styles_module.tabList),children:[/*#__PURE__*/(0,jsx_runtime.jsx)(TabList// Surprising but historical
// className is applied on TabList, not on TabsContainer
,{className:className}),/*#__PURE__*/(0,jsx_runtime.jsx)(TabContent,{children:children})]});}function Tabs(props){const isBrowser=(0,useIsBrowser/* default */.A)();const value=(0,tabsUtils/* useTabsContextValue */.OC)(props);return/*#__PURE__*/(0,jsx_runtime.jsx)(tabsUtils/* TabsProvider */.O_,{value:value// Remount tabs after hydration
// Temporary fix for https://github.com/facebook/docusaurus/issues/5653
,children:/*#__PURE__*/(0,jsx_runtime.jsx)(TabsContainer,{className:props.className,children:(0,tabsUtils/* sanitizeTabsChildren */.vT)(props.children)})},String(isBrowser));}

/***/ },

/***/ 2329
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   OC: () => (/* binding */ useTabsContextValue),
/* harmony export */   O_: () => (/* binding */ TabsProvider),
/* harmony export */   uc: () => (/* binding */ useTabs),
/* harmony export */   vT: () => (/* binding */ sanitizeTabsChildren)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(489);
/* harmony import */ var _docusaurus_router__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(4510);
/* harmony import */ var _docusaurus_useIsomorphicLayoutEffect__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(8804);
/* harmony import */ var _docusaurus_theme_common_internal__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(9231);
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(5037);
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(7252);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(1325);
/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */function sanitizeTabsChildren(children){return react__WEBPACK_IMPORTED_MODULE_0__.Children.toArray(children).filter(child=>child!=='\n');}function extractChildrenTabValues(children){// ✅ <TabItem value="red"/> => true
// ✅ <CustomTabItem value="red"/> => true
// ❌ <RedTabItem value="tab-value"/> => requires <Tabs values> prop
function isTabItemWithValueProp(comp){const{props}=comp;return!!props&&typeof props==='object'&&'value'in props;}const elements=react__WEBPACK_IMPORTED_MODULE_0__.Children.toArray(children).flatMap(child=>{// Historical case, not sure when it happens, do we really need this?
if(!child){return[];}if(/*#__PURE__*/(0,react__WEBPACK_IMPORTED_MODULE_0__.isValidElement)(child)&&isTabItemWithValueProp(child)){return[child];}// child.type.name will give non-sensical values in prod because of
// minification, but we assume it won't throw in prod.
const badChildTypeName=// @ts-expect-error: guarding against unexpected cases
typeof child.type==='string'?child.type:child.type.name;throw new Error(`Docusaurus error: Bad <Tabs> child <${badChildTypeName}>: all children of the <Tabs> component should be <TabItem>, and every <TabItem> should have a unique "value" prop.
If you do not want to pass on a "value" prop to the direct children of <Tabs>, you can also pass an explicit <Tabs values={...}> prop.`);});return elements.map(({props:{value,label,attributes,default:isDefault}})=>({value,label,attributes,default:isDefault}));}function ensureNoDuplicateValue(values){const dup=(0,_index__WEBPACK_IMPORTED_MODULE_5__/* .duplicates */ .XI)(values,(a,b)=>a.value===b.value);if(dup.length>0){throw new Error(`Docusaurus error: Duplicate values "${dup.map(a=>`'${a.value}'`).join(', ')}" found in <Tabs>. Every value needs to be unique.`);}}function useTabValues(props){const{values:valuesProp,children}=props;return (0,react__WEBPACK_IMPORTED_MODULE_0__.useMemo)(()=>{const values=valuesProp??extractChildrenTabValues(children);ensureNoDuplicateValue(values);return values;},[valuesProp,children]);}function isValidValue({value,tabValues}){return tabValues.some(a=>a.value===value);}function getInitialStateValue({defaultValue,tabValues}){if(tabValues.length===0){throw new Error('Docusaurus error: the <Tabs> component requires at least one <TabItem> children component');}if(defaultValue){// Warn user about passing incorrect defaultValue as prop.
if(!isValidValue({value:defaultValue,tabValues})){throw new Error(`Docusaurus error: The <Tabs> has a defaultValue "${defaultValue}" but none of its children has the corresponding value. Available values are: ${tabValues.map(a=>a.value).join(', ')}. If you intend to show no default tab, use defaultValue={null} instead.`);}return defaultValue;}const defaultTabValue=tabValues.find(tabValue=>tabValue.default)??tabValues[0];if(!defaultTabValue){throw new Error('Unexpected error: 0 tabValues');}return defaultTabValue.value;}function getStorageKey(groupId){if(!groupId){return null;}return`docusaurus.tab.${groupId}`;}function getQueryStringKey({queryString=false,groupId}){if(typeof queryString==='string'){return queryString;}if(queryString===false){return null;}if(queryString===true&&!groupId){throw new Error(`Docusaurus error: The <Tabs> component groupId prop is required if queryString=true, because this value is used as the search param name. You can also provide an explicit value such as queryString="my-search-param".`);}return groupId??null;}function useTabQueryString({queryString=false,groupId}){const history=(0,_docusaurus_router__WEBPACK_IMPORTED_MODULE_1__/* .useHistory */ .W6)();const key=getQueryStringKey({queryString,groupId});const value=(0,_docusaurus_theme_common_internal__WEBPACK_IMPORTED_MODULE_3__/* .useQueryStringValue */ .aZ)(key);const setValue=(0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)(newValue=>{if(!key){return;// no-op
}const searchParams=new URLSearchParams(history.location.search);searchParams.set(key,newValue);history.replace({...history.location,search:searchParams.toString()});},[key,history]);return[value,setValue];}function useTabStorage({groupId}){const key=getStorageKey(groupId);const[value,storageSlot]=(0,_index__WEBPACK_IMPORTED_MODULE_4__/* .useStorageSlot */ .Dv)(key);const setValue=(0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)(newValue=>{if(!key){return;// no-op
}storageSlot.set(newValue);},[key,storageSlot]);return[value,setValue];}function useTabsContextValue(props){const{defaultValue,queryString=false,groupId}=props;const tabValues=useTabValues(props);const[selectedValue,setSelectedValue]=(0,react__WEBPACK_IMPORTED_MODULE_0__.useState)(()=>getInitialStateValue({defaultValue,tabValues}));const[queryStringValue,setQueryString]=useTabQueryString({queryString,groupId});const[storageValue,setStorageValue]=useTabStorage({groupId});// We sync valid querystring/storage value to state on change + hydration
const valueToSync=(()=>{const value=queryStringValue??storageValue;if(!isValidValue({value,tabValues})){return null;}return value;})();// Sync in a layout/sync effect is important, for useScrollPositionBlocker
// See https://github.com/facebook/docusaurus/issues/8625
(0,_docusaurus_useIsomorphicLayoutEffect__WEBPACK_IMPORTED_MODULE_2__/* ["default"] */ .A)(()=>{if(valueToSync){setSelectedValue(valueToSync);}},[valueToSync]);const selectValue=(0,react__WEBPACK_IMPORTED_MODULE_0__.useCallback)(newValue=>{if(!isValidValue({value:newValue,tabValues})){throw new Error(`Can't select invalid tab value=${newValue}`);}setSelectedValue(newValue);setQueryString(newValue);setStorageValue(newValue);},[setQueryString,setStorageValue,tabValues]);return{selectedValue,selectValue,tabValues,lazy:props.lazy??false,block:props.block??false};}const TabsContext=/*#__PURE__*/(0,react__WEBPACK_IMPORTED_MODULE_0__.createContext)(null);function useTabs(){const contextValue=react__WEBPACK_IMPORTED_MODULE_0__.useContext(TabsContext);if(!contextValue){throw new Error('useTabsContext() must be used within a Tabs component');}return contextValue;}function TabsProvider(props){return/*#__PURE__*/(0,react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__.jsx)(TabsContext.Provider,{value:props.value,children:props.children});}

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