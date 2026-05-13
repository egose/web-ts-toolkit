"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[899],{

/***/ 9468
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_http_errors_md_be6_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-http-errors-md-be6.json
const site_docs_packages_http_errors_md_be6_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/http-errors","title":"@web-ts-toolkit/http-errors","description":"HTTP error classes for backend APIs, including 4xx client errors and 5xx server errors.","source":"@site/docs/packages/http-errors.md","sourceDirName":"packages","slug":"/packages/http-errors","permalink":"/docs/packages/http-errors","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":4,"frontMatter":{"sidebar_label":"HTTP Errors","sidebar_position":4},"sidebar":"packagesSidebar","previous":{"title":"Express Response Handler","permalink":"/docs/packages/express-response-handler"},"next":{"title":"Moo","permalink":"/docs/packages/moo"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(5250);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.1_@types+react@19.2.14_react-dom@19.2.6_react@19.2.6__react@19.2.6_typescript@6.0.3/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(6574);
;// ./docs/packages/http-errors.md


const frontMatter = {
	sidebar_label: 'HTTP Errors',
	sidebar_position: 4
};
const contentTitle = '@web-ts-toolkit/http-errors';

const assets = {

};





const toc = [{
  "value": "Installation",
  "id": "installation",
  "level": 2
}, {
  "value": "Usage",
  "id": "usage",
  "level": 2
}, {
  "value": "Basic TypeScript usage",
  "id": "basic-typescript-usage",
  "level": 3
}, {
  "value": "Use a specific 4xx error",
  "id": "use-a-specific-4xx-error",
  "level": 3
}, {
  "value": "Use the category base classes",
  "id": "use-the-category-base-classes",
  "level": 3
}, {
  "value": "Attach a cause",
  "id": "attach-a-cause",
  "level": 3
}, {
  "value": "Add machine-readable error metadata",
  "id": "add-machine-readable-error-metadata",
  "level": 3
}, {
  "value": "Convert an error to an AIP-193-style payload",
  "id": "convert-an-error-to-an-aip-193-style-payload",
  "level": 3
}, {
  "value": "Convert an error to an RFC 9457 payload",
  "id": "convert-an-error-to-an-rfc-9457-payload",
  "level": 3
}, {
  "value": "Use the typed RFC 9457 validation helper",
  "id": "use-the-typed-rfc-9457-validation-helper",
  "level": 3
}, {
  "value": "Express route example",
  "id": "express-route-example",
  "level": 3
}, {
  "value": "Express error middleware example",
  "id": "express-error-middleware-example",
  "level": 3
}, {
  "value": "Error Hierarchy",
  "id": "error-hierarchy",
  "level": 2
}, {
  "value": "Client Errors",
  "id": "client-errors",
  "level": 2
}, {
  "value": "Server Errors",
  "id": "server-errors",
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
        id: "web-ts-toolkithttp-errors",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/http-errors"
        })
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "HTTP error classes for backend APIs, including 4xx client errors and 5xx server errors."
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
            children: "npm install @web-ts-toolkit/http-errors\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add @web-ts-toolkit/http-errors\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add @web-ts-toolkit/http-errors\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add @web-ts-toolkit/http-errors\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "usage",
      children: "Usage"
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "basic-typescript-usage",
      children: "Basic TypeScript usage"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { HttpError, UnauthorizedError, ServiceUnavailableError } from '@web-ts-toolkit/http-errors';\n\nthrow new UnauthorizedError();\nthrow new UnauthorizedError('missing bearer token');\n\nthrow new HttpError(503);\nthrow new HttpError(503, 'please try again later');\n\nthrow new ServiceUnavailableError();\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "use-a-specific-4xx-error",
      children: "Use a specific 4xx error"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { BadRequestError } from '@web-ts-toolkit/http-errors';\n\nfunction parseLimit(value: string | undefined): number {\n  const limit = Number(value);\n\n  if (!Number.isInteger(limit) || limit <= 0) {\n    throw new BadRequestError('limit must be a positive integer');\n  }\n\n  return limit;\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "use-the-category-base-classes",
      children: "Use the category base classes"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { ClientError, ServerError } from '@web-ts-toolkit/http-errors';\n\nthrow new ClientError(403, 'forbidden project access');\nthrow new ServerError(503, 'search index is rebuilding');\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "attach-a-cause",
      children: "Attach a cause"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { ServiceUnavailableError } from '@web-ts-toolkit/http-errors';\n\ntry {\n  await fetch('https://api.example.com/health');\n} catch (cause) {\n  throw new ServiceUnavailableError('upstream API is unavailable', { cause });\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "add-machine-readable-error-metadata",
      children: "Add machine-readable error metadata"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { BadRequestError } from '@web-ts-toolkit/http-errors';\n\nthrow new BadRequestError('invalid email', {\n  reason: 'INVALID_EMAIL',\n  domain: 'api.example.com',\n  type: 'https://api.example.com/problems/invalid-email',\n  title: 'Invalid email address',\n  instance: '/problems/invalid-email/123',\n  metadata: {\n    field: 'email',\n  },\n  details: [\n    {\n      type: 'help',\n      links: [\n        {\n          description: 'Validation guide',\n          url: 'https://api.example.com/docs/errors/invalid-email',\n        },\n      ],\n    },\n  ],\n  errors: [\n    {\n      field: 'email',\n      description: 'Email must be a valid address.',\n    },\n  ],\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The base ", (0,jsx_runtime.jsx)(_components.code, {
        children: "HttpError"
      }), " carries optional structured fields that are useful when building AIP-193 and RFC 9457 error payloads:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "statusCode"
        }), ": HTTP status code"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "status"
        }), ": canonical status string for common HTTP codes, otherwise ", (0,jsx_runtime.jsx)(_components.code, {
          children: "UNKNOWN"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "reason"
        }), ": application-specific machine-readable identifier"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "domain"
        }), ": logical error domain such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "api.example.com"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "type"
        }), ": RFC 9457 problem type URI"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "title"
        }), ": RFC 9457 problem title"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "instance"
        }), ": RFC 9457 problem instance URI"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "metadata"
        }), ": stringified key-value metadata"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "details"
        }), ": structured detail entries"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "errors"
        }), ": validation or field-level error payloads"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "convert-an-error-to-an-aip-193-style-payload",
      children: "Convert an error to an AIP-193-style payload"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { BadRequestError, toAip193ErrorPayload } from '@web-ts-toolkit/http-errors';\n\nconst error = new BadRequestError('invalid email', {\n  reason: 'INVALID_EMAIL',\n  domain: 'api.example.com',\n  metadata: {\n    field: 'email',\n  },\n});\n\nconst payload = toAip193ErrorPayload(error);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "convert-an-error-to-an-rfc-9457-payload",
      children: "Convert an error to an RFC 9457 payload"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { BadRequestError, toRfc9457ErrorPayload } from '@web-ts-toolkit/http-errors';\n\nconst error = new BadRequestError('Email must be a valid address.', {\n  type: 'https://api.example.com/problems/invalid-email',\n  title: 'Invalid email address',\n  instance: '/problems/invalid-email/123',\n  errors: [\n    {\n      detail: 'must be a valid email address',\n      pointer: '#/email',\n      parameter: 'email',\n    },\n    {\n      detail: 'x-request-id header is required',\n      header: 'x-request-id',\n    },\n  ],\n});\n\nconst payload = toRfc9457ErrorPayload(error);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "use-the-typed-rfc-9457-validation-helper",
      children: "Use the typed RFC 9457 validation helper"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { BadRequestError, toRfc9457ValidationErrorPayload } from '@web-ts-toolkit/http-errors';\n\nconst error = new BadRequestError('Email must be a valid address.', {\n  type: 'https://api.example.com/problems/invalid-email',\n  title: 'Invalid email address',\n  errors: [\n    {\n      detail: 'must be a valid email address',\n      pointer: '#/email',\n    },\n  ],\n});\n\nconst payload = toRfc9457ValidationErrorPayload(error);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "express-route-example",
      children: "Express route example"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\nimport { BadRequestError, ForbiddenError, NotFoundError } from '@web-ts-toolkit/http-errors';\n\ntype User = {\n  id: string;\n  role: 'admin' | 'member';\n};\n\ntype Project = {\n  id: string;\n  ownerId: string;\n  name: string;\n};\n\nconst app = express();\n\nconst projects = new Map<string, Project>([['project-1', { id: 'project-1', ownerId: 'user-1', name: 'Toolkit' }]]);\n\napp.use(express.json());\n\napp.put('/projects/:id', (req, res) => {\n  const user = req.user as User | undefined;\n  const project = projects.get(req.params.id);\n\n  if (!user) {\n    throw new ForbiddenError('authentication required');\n  }\n\n  if (!project) {\n    throw new NotFoundError('project was not found');\n  }\n\n  if (project.ownerId !== user.id && user.role !== 'admin') {\n    throw new ForbiddenError('you cannot update this project');\n  }\n\n  if (typeof req.body.name !== 'string' || req.body.name.trim() === '') {\n    throw new BadRequestError('name is required');\n  }\n\n  project.name = req.body.name.trim();\n  res.json(project);\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "express-error-middleware-example",
      children: "Express error middleware example"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import type { NextFunction, Request, Response } from 'express';\nimport express from 'express';\nimport { HttpError, InternalServerError } from '@web-ts-toolkit/http-errors';\n\nconst app = express();\n\napp.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {\n  if (err instanceof HttpError) {\n    return res.status(err.statusCode).json({\n      error: {\n        name: err.name,\n        message: err.message,\n        statusCode: err.statusCode,\n      },\n    });\n  }\n\n  const fallback = new InternalServerError('unexpected server error');\n\n  return res.status(fallback.statusCode).json({\n    error: {\n      name: fallback.name,\n      message: fallback.message,\n      statusCode: fallback.statusCode,\n    },\n  });\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "error-hierarchy",
      children: "Error Hierarchy"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "HttpError"
      }), " is the neutral base class for HTTP responses."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "ClientError"
      }), " is the base class for 4xx responses."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "ServerError"
      }), " is the base class for 5xx responses."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "client-errors",
      children: "Client Errors"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Code"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Description"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Class Name"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Default Message"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "400"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Bad Request"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "BadRequestError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server cannot process the request due to a client error"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "401"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Unauthorized"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "UnauthorizedError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The user is not authorized"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "403"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Forbidden"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "ForbiddenError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server refused to authorize the request"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "404"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Not Found"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "NotFoundError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server did not find a current representation for the target resource"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "405"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Method Not Allowed"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "MethodNotAllowedError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The method received is not allowed"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "406"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Not Acceptable"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "NotAcceptableError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The request is not acceptable to the user agent"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "407"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Proxy Authentication Required"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "ProxyAuthRequiredError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The client needs to authenticate itself in order to use a proxy"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "408"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Request Timeout"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "RequestTimeoutError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The request was not completed in the expected time"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "409"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Conflict"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "ConflictError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The request was not completed due to a conflict with the target resource"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "410"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Gone"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "GoneError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The target resource is no longer available at the origin server"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "411"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Length Required"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "LengthRequiredError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server refuses to accept the request without a defined Content-Length"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "412"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Precondition Failed"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "PreconditionFailedError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "One or more conditions given in the request header fields evaluated to false"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "413"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Payload Too Large"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "PayloadTooLargeError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The request payload is too large"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "414"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "URI Too Long"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "UriTooLongError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The request target is too long"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "415"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Unsupported Media Type"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "UnsupportedMediaTypeError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The payload is in a format not supported"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "416"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Requested Range Not Satisfiable"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "RequestedRangeNotSatisfiableError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "None of the ranges in the request's Range header field overlap the current extent of the selected resource"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "417"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Expectation Failed"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "ExpectationFailedError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The expectation given in the request's Expect header field could not be met"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "418"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "I'm a teapot"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "TeapotError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "I'm a teapot"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "421"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Misdirected Request"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "MisdirectedRequestError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The request was directed at a server that is not able to produce a response"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "422"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Unprocessable Entity"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "UnprocessableEntityError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server is unable to process the request"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "423"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Locked"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "LockedError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The source or destination resource of a method is locked"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "424"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Failed Dependency"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "FailedDependencyError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The requested action depended on another action"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "426"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Upgrade Required"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "UpgradeRequiredError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "This service requires use of a different protocol"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "428"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Precondition Required"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "PreconditionRequiredError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "This request is required to be conditional"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "429"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Too Many Requests"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "TooManyRequestsError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The user has sent too many requests in a given amount of time"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "431"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Request Header Fields Too Large"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "RequestHeaderFieldsTooLargeError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Request header fields too large"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "451"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Unavailable For Legal Reasons"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "UnavailableForLegalReasonsError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Denied access due to a consequence of a legal demand"
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "server-errors",
      children: "Server Errors"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Code"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Description"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Class Name"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Default Message"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "500"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Internal Server Error"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "InternalServerError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server encountered an unexpected condition"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "501"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Not Implemented"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "NotImplementedError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server does not support the functionality required to fulfill the request"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "502"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Bad Gateway"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "BadGatewayError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server received an invalid response from an upstream server"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "503"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Service Unavailable"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "ServiceUnavailableError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server is temporarily unable to handle the request"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "504"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Gateway Timeout"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "GatewayTimeoutError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server did not receive a timely response from an upstream server"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "505"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "HTTP Version Not Supported"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "HttpVersionNotSupportedError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server does not support the HTTP protocol version used in the request"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "506"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Variant Also Negotiates"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "VariantAlsoNegotiatesError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server has an internal configuration error"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "507"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Insufficient Storage"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "InsufficientStorageError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server is unable to store the representation needed to complete the request"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "508"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Loop Detected"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "LoopDetectedError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The server detected an infinite loop while processing the request"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "510"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Not Extended"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "NotExtendedError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Further extensions to the request are required for the server to fulfill it"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "511"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Network Authentication Required"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "NetworkAuthenticationRequiredError"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "The client needs to authenticate to gain network access"
          })]
        })]
      })]
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