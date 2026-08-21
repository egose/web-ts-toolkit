"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[325],{

/***/ 3181
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_express_oidc_vault_md_584_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-express-oidc-vault-md-584.json
const site_docs_packages_express_oidc_vault_md_584_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/express-oidc-vault","title":"@web-ts-toolkit/express-oidc-vault","description":"OIDC session middleware for Express with body or cookie session transport and server-side storage of upstream refresh tokens and logout-capable id_tokens.","source":"@site/docs/packages/express-oidc-vault.md","sourceDirName":"packages","slug":"/packages/express-oidc-vault","permalink":"/docs/packages/express-oidc-vault","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":6,"frontMatter":{"sidebar_label":"Express OIDC Vault","sidebar_position":6},"sidebar":"packagesSidebar","previous":{"title":"Express JSON Router","permalink":"/docs/packages/express-json-router"},"next":{"title":"OIDC Vault Memory Store","permalink":"/docs/packages/express-oidc-vault-memory-store"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(7008);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(362);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(4340);
;// ./docs/packages/express-oidc-vault.md


const frontMatter = {
	sidebar_label: 'Express OIDC Vault',
	sidebar_position: 6
};
const contentTitle = '@web-ts-toolkit/express-oidc-vault';

const assets = {

};





const toc = [{
  "value": "What It Handles",
  "id": "what-it-handles",
  "level": 2
}, {
  "value": "Installation",
  "id": "installation",
  "level": 2
}, {
  "value": "What It Exposes",
  "id": "what-it-exposes",
  "level": 2
}, {
  "value": "Frontend Storage Policy",
  "id": "frontend-storage-policy",
  "level": 2
}, {
  "value": "Session Transport Modes",
  "id": "session-transport-modes",
  "level": 2
}, {
  "value": "<code>sessionTransport: &#39;body&#39;</code>",
  "id": "sessiontransport-body",
  "level": 3
}, {
  "value": "<code>sessionTransport: &#39;cookie&#39;</code>",
  "id": "sessiontransport-cookie",
  "level": 3
}, {
  "value": "Endpoints",
  "id": "endpoints",
  "level": 2
}, {
  "value": "Quick Start",
  "id": "quick-start",
  "level": 2
}, {
  "value": "Public Options And Defaults",
  "id": "public-options-and-defaults",
  "level": 2
}, {
  "value": "Frontend Integration Example",
  "id": "frontend-integration-example",
  "level": 2
}, {
  "value": "Cookie transport frontend example",
  "id": "cookie-transport-frontend-example",
  "level": 3
}, {
  "value": "Backchannel Logout",
  "id": "backchannel-logout",
  "level": 2
}, {
  "value": "Backend Wiring",
  "id": "backend-wiring",
  "level": 2
}, {
  "value": "Memory Store",
  "id": "memory-store",
  "level": 3
}, {
  "value": "Redis Store",
  "id": "redis-store",
  "level": 3
}, {
  "value": "MongoDB Store",
  "id": "mongodb-store",
  "level": 3
}, {
  "value": "Cookie Transport",
  "id": "cookie-transport",
  "level": 3
}, {
  "value": "Config Modes",
  "id": "config-modes",
  "level": 2
}, {
  "value": "Issuer mode",
  "id": "issuer-mode",
  "level": 3
}, {
  "value": "Manual mode",
  "id": "manual-mode",
  "level": 3
}, {
  "value": "Provider Token Validation",
  "id": "provider-token-validation",
  "level": 2
}, {
  "value": "Local Access Token Example",
  "id": "local-access-token-example",
  "level": 2
}, {
  "value": "Access Token Validation Middleware",
  "id": "access-token-validation-middleware",
  "level": 2
}, {
  "value": "JWT validator helper",
  "id": "jwt-validator-helper",
  "level": 3
}, {
  "value": "Hook Examples",
  "id": "hook-examples",
  "level": 2
}, {
  "value": "Security Checklist",
  "id": "security-checklist",
  "level": 2
}, {
  "value": "Store Packages",
  "id": "store-packages",
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
        id: "web-ts-toolkitexpress-oidc-vault",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/express-oidc-vault"
        })
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["OIDC session middleware for Express with body or cookie session transport and server-side storage of upstream refresh tokens and logout-capable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "id_token"
      }), "s."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-handles",
      children: "What It Handles"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["OIDC login redirect with PKCE, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "state"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "nonce"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["callback token exchange and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id_token"
        }), " validation"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["server-side storage of upstream refresh tokens and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id_token"
        }), "s"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "one-time local exchange codes for the frontend callback handoff"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "session refresh with session ID rotation"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["server-driven upstream logout redirect using stored ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id_token"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["OIDC backchannel logout handling via ", (0,jsx_runtime.jsx)(_components.code, {
          children: "logout_token"
        })]
      }), "\n"]
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
            children: "npm install @web-ts-toolkit/express-oidc-vault express\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add @web-ts-toolkit/express-oidc-vault express\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add @web-ts-toolkit/express-oidc-vault express\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add @web-ts-toolkit/express-oidc-vault express\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "For local development and tests, also install the memory store:"
    }), "\n", (0,jsx_runtime.jsxs)(Tabs/* default */.A, {
      groupId: "npm2yarn",
      children: [(0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "npm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "npm install @web-ts-toolkit/express-oidc-vault-memory-store\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add @web-ts-toolkit/express-oidc-vault-memory-store\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add @web-ts-toolkit/express-oidc-vault-memory-store\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add @web-ts-toolkit/express-oidc-vault-memory-store\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-exposes",
      children: "What It Exposes"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Main exports:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "createOidcVaultMiddleware(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "createOidcVaultAccessTokenMiddleware(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "createOidcVaultJwtAccessTokenValidator(...)"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["route-path and default-value constants such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DEFAULT_OIDC_VAULT_BASE_PATH"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_VAULT_ROUTE_PATHS"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "public types for sessions, hooks, token issuing, validators, config, and store-provider interfaces"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "frontend-storage-policy",
      children: "Frontend Storage Policy"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Default browser-side transport:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["mirror ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " into ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionStorage"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["keep ", (0,jsx_runtime.jsx)(_components.code, {
          children: "accessToken"
        }), " in memory only"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["do not store either value in ", (0,jsx_runtime.jsx)(_components.code, {
          children: "localStorage"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Why:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " needs to survive page refresh so the frontend can call ", (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /auth/oidc/refresh"
        }), " during app bootstrap"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "accessToken"
        }), " is the normal API credential and should remain non-persistent in the browser"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "sessionStorage"
        }), " narrows persistence compared with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "localStorage"
        }), ", but it is still readable by JavaScript, so XSS prevention remains critical"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Optional alternative:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["set ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionTransport: 'cookie'"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["store ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " in an ", (0,jsx_runtime.jsx)(_components.code, {
          children: "HttpOnly"
        }), " browser cookie instead of ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionStorage"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["keep ", (0,jsx_runtime.jsx)(_components.code, {
          children: "accessToken"
        }), " in memory only"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This mode simplifies the frontend and keeps the session pointer out of JavaScript-visible storage, but it reintroduces cookie deployment concerns such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "SameSite"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Secure"
      }), ", and cross-origin credential handling."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "session-transport-modes",
      children: "Session Transport Modes"
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "sessiontransport-body",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "sessionTransport: 'body'"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This is the default mode."
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "exchange"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "refresh"
        }), " responses include ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["the frontend stores ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), ", typically in ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionStorage"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["the frontend sends ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " back in the JSON body for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "refresh"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "logout"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "refresh"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "logout"
        }), " do not read session cookies in this mode"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "sessiontransport-cookie",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "sessionTransport: 'cookie'"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This mode stores ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sessionId"
      }), " in a backend-managed cookie."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "exchange"
        }), " sets the session cookie and does not need to return ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " in the JSON body"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "refresh"
        }), " reads the cookie, rotates the session, and updates the cookie"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "logout"
        }), " reads the cookie and clears it"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "refresh"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "logout"
        }), " require the cookie and reject body-only ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " values"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["the frontend does not need to keep ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " in ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionStorage"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Backchannel logout is separate from both transport modes because it is a server-to-server request from the IdP and does not rely on browser storage at all."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Available cookie options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "cookie.name"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "cookie.deploymentMode"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "'same-origin' | 'same-site' | 'cross-site'"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "cookie.sameSite"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "'lax' | 'strict' | 'none'"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "cookie.secure"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "cookie.domain"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "cookie.path"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "trustedOrigins"
        }), ": browser origins allowed to call cookie-authenticated ", (0,jsx_runtime.jsx)(_components.code, {
          children: "refresh"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "logout"
        }), "; required when cross-site cookie transport is enabled"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "cookie.httpOnly"
      }), " is always enforced as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "true"
      }), ". Middleware creation rejects ", (0,jsx_runtime.jsx)(_components.code, {
        children: "httpOnly: false"
      }), " and unsafe cookie names, domains, or paths so untrusted values cannot be serialized into ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Set-Cookie"
      }), " headers."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Cookie-authenticated ", (0,jsx_runtime.jsx)(_components.code, {
        children: "refresh"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "logout"
      }), " requests use a fail-closed CSRF policy for every ", (0,jsx_runtime.jsx)(_components.code, {
        children: "SameSite"
      }), " mode. The request must include an ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Origin"
      }), " header, or a valid ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Referer"
      }), " header, whose origin matches ", (0,jsx_runtime.jsx)(_components.code, {
        children: "backendOrigin"
      }), " or one of the configured ", (0,jsx_runtime.jsx)(_components.code, {
        children: "trustedOrigins"
      }), ". Requests with no source-origin header are rejected. Backchannel logout is not affected because it is authenticated with the signed OIDC logout token rather than the browser session cookie."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "endpoints",
      children: "Endpoints"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The middleware exposes these routes under a configurable base path such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/auth/oidc"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "GET /auth/oidc/login"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "GET /auth/oidc/callback"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /auth/oidc/exchange"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /auth/oidc/refresh"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /auth/oidc/logout"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /auth/oidc/backchannel-logout"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The OIDC router parses JSON and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "application/x-www-form-urlencoded"
      }), " request bodies with an explicit default limit of ", (0,jsx_runtime.jsx)(_components.code, {
        children: "16kb"
      }), ". This is enough for the small ", (0,jsx_runtime.jsx)(_components.code, {
        children: "exchange"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "refresh"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "logout"
      }), ", and backchannel logout payloads. If an IdP requires a larger form-encoded ", (0,jsx_runtime.jsx)(_components.code, {
        children: "logout_token"
      }), ", set ", (0,jsx_runtime.jsx)(_components.code, {
        children: "requestBodyLimit"
      }), " to a string or byte count accepted by Express body parsers."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Parser failures return JSON client errors before route handlers or store/provider hooks run:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_VAULT_REQUEST_BODY_TOO_LARGE"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_VAULT_REQUEST_BODY_PARAMETER_LIMIT_EXCEEDED"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_ENCODING"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_VAULT_MALFORMED_REQUEST_BODY"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_VAULT_INVALID_REQUEST_BODY"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\nimport { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';\nimport { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';\n\nconst app = express();\n\napp.use(\n  createOidcVaultMiddleware({\n    basePath: '/auth/oidc',\n    backendOrigin: 'https://api.example.com',\n    config: {\n      issuer: process.env.OIDC_ISSUER,\n      clientId: process.env.OIDC_CLIENT_ID,\n      clientSecret: process.env.OIDC_CLIENT_SECRET,\n    },\n    frontendRedirectUri: 'https://frontend.example.com/callback',\n    postLogoutRedirectUri: 'https://frontend.example.com/logged-out',\n    storeProvider: createMemoryOidcVaultStore(),\n  }),\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use the memory store for local development and tests. For production deployments, use the Redis or MongoDB store package."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "backendOrigin"
      }), " must be the public backend origin registered with your OIDC provider, such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "https://api.example.com"
      }), ". Callback ", (0,jsx_runtime.jsx)(_components.code, {
        children: "redirect_uri"
      }), " values are built from this pinned origin and the configured ", (0,jsx_runtime.jsx)(_components.code, {
        children: "basePath"
      }), ", so reverse proxies and untrusted ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Host"
      }), " headers cannot change the provider callback URL. Configure Express ", (0,jsx_runtime.jsx)(_components.code, {
        children: "trust proxy"
      }), " only for other request metadata needs; it is not used to derive the OIDC callback origin."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "postLogoutRedirectUri"
      }), " is optional. When configured, it must be an absolute HTTP(S) URL registered with the OIDC provider for post-logout redirects. It may be hosted on a different origin from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "frontendRedirectUri"
      }), " when that exact URL is provider-registered."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "public-options-and-defaults",
      children: "Public Options And Defaults"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Option"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Default"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Contract"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "basePath"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "/auth/oidc"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Mount path for the OIDC router."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "backendOrigin"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "required"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Public backend origin registered with the provider. Callback redirect URIs are derived from this pinned origin, not request host headers."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "storeProvider"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "required"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Durable vault store provider. Use Redis or MongoDB for production and multi-instance deployments."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "config"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "env-compatible helper input"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Provider config. ", (0,jsx_runtime.jsx)(_components.code, {
              children: "issuer"
            }), " is required for discovery and manual modes so ID and logout tokens are issuer-bound."]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "frontendRedirectUri"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "unset"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Default browser return target after backend callback completion. Required if login accepts custom ", (0,jsx_runtime.jsx)(_components.code, {
              children: "returnTo"
            }), "."]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "postLogoutRedirectUri"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "unset"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Optional provider-registered HTTP(S) URL used in the upstream end-session redirect."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "fetchUserInfo"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "implementation default"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["When enabled, UserInfo claims are fetched and merged only after the ", (0,jsx_runtime.jsx)(_components.code, {
              children: "sub"
            }), " matches the verified ID token subject."]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "authorizationTransactionTtlMs"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "600000"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "TTL for one-time authorization transactions created during login."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "exchangeCodeTtlMs"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "30000"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "TTL for one-time local exchange codes returned to the frontend callback route."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "sessionTransport"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "body"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "body"
            }), " returns and accepts JSON ", (0,jsx_runtime.jsx)(_components.code, {
              children: "sessionId"
            }), "; ", (0,jsx_runtime.jsx)(_components.code, {
              children: "cookie"
            }), " stores the session pointer in an ", (0,jsx_runtime.jsx)(_components.code, {
              children: "HttpOnly"
            }), " cookie and rejects body-only refresh/logout IDs."]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "cookie"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "default cookie settings"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Cookie transport options. ", (0,jsx_runtime.jsx)(_components.code, {
              children: "httpOnly"
            }), " is always enforced as ", (0,jsx_runtime.jsx)(_components.code, {
              children: "true"
            }), "; unsafe names, paths, and domains are rejected."]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "trustedOrigins"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "[]"
            }), " plus ", (0,jsx_runtime.jsx)(_components.code, {
              children: "backendOrigin"
            }), " internally"]
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Browser origins allowed to call cookie-authenticated ", (0,jsx_runtime.jsx)(_components.code, {
              children: "refresh"
            }), " and ", (0,jsx_runtime.jsx)(_components.code, {
              children: "logout"
            }), ". Required for cross-site cookie transport."]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "requestBodyLimit"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "16kb"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Express JSON and URL-encoded parser limit for OIDC route bodies. Increase only for known provider backchannel logout token size needs."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "providerRequestTimeoutMs"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "5000"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Timeout for discovery, token, UserInfo, and remote JWKS requests. Must be a positive finite integer."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "hooks"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "unset"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Pre-commit hooks can veto operations by throwing; post-commit notification hook failures are reported to ", (0,jsx_runtime.jsx)(_components.code, {
              children: "onError"
            }), " without undoing committed state."]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "tokenIssuer"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "unset"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Issues app-local access tokens for ", (0,jsx_runtime.jsx)(_components.code, {
              children: "exchange"
            }), " and ", (0,jsx_runtime.jsx)(_components.code, {
              children: "refresh"
            }), ". This lifetime is separate from upstream token and vault-session lifetimes."]
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "frontend-integration-example",
      children: "Frontend Integration Example"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The intended frontend model is:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "accessToken"
        }), " stays in memory"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " is mirrored into ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionStorage"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["refresh calls are deduplicated so concurrent ", (0,jsx_runtime.jsx)(_components.code, {
          children: "401"
        }), " responses do not race session rotation"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "type AuthState = {\n  accessToken: string | null;\n  sessionId: string | null;\n};\n\nconst authState: AuthState = {\n  accessToken: null,\n  sessionId: sessionStorage.getItem('sessionId'),\n};\n\nlet refreshPromise: Promise<void> | null = null;\n\nfunction persistSessionId(sessionId: string | null): void {\n  authState.sessionId = sessionId;\n\n  if (sessionId) {\n    sessionStorage.setItem('sessionId', sessionId);\n  } else {\n    sessionStorage.removeItem('sessionId');\n  }\n}\n\nfunction setAuthState(payload: { accessToken?: string; sessionId: string }): void {\n  authState.accessToken = payload.accessToken ?? null;\n  persistSessionId(payload.sessionId);\n}\n\nfunction clearAuthState(): void {\n  authState.accessToken = null;\n  persistSessionId(null);\n}\n\nasync function refreshAuthState(): Promise<void> {\n  if (!authState.sessionId) {\n    clearAuthState();\n    return;\n  }\n\n  const response = await fetch('/auth/oidc/refresh', {\n    method: 'POST',\n    headers: { 'content-type': 'application/json' },\n    body: JSON.stringify({ sessionId: authState.sessionId }),\n  });\n\n  if (!response.ok) {\n    clearAuthState();\n    throw new Error('OIDC refresh failed.');\n  }\n\n  setAuthState(await response.json());\n}\n\nasync function ensureFreshAccessToken(): Promise<void> {\n  if (!refreshPromise) {\n    refreshPromise = refreshAuthState().finally(() => {\n      refreshPromise = null;\n    });\n  }\n\n  await refreshPromise;\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "cookie-transport-frontend-example",
      children: "Cookie transport frontend example"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["When ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sessionTransport"
      }), " is ", (0,jsx_runtime.jsx)(_components.code, {
        children: "'cookie'"
      }), ", the frontend no longer needs to store ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sessionId"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "type AuthState = {\n  accessToken: string | null;\n};\n\nconst authState: AuthState = {\n  accessToken: null,\n};\n\nlet refreshPromise: Promise<void> | null = null;\n\nfunction setAuthState(payload: { accessToken?: string }): void {\n  authState.accessToken = payload.accessToken ?? null;\n}\n\nfunction clearAuthState(): void {\n  authState.accessToken = null;\n}\n\nasync function refreshAuthState(): Promise<void> {\n  const response = await fetch('/auth/oidc/refresh', {\n    method: 'POST',\n    credentials: 'include',\n  });\n\n  if (!response.ok) {\n    clearAuthState();\n    throw new Error('OIDC refresh failed.');\n  }\n\n  setAuthState(await response.json());\n}\n\nasync function ensureFreshAccessToken(): Promise<void> {\n  if (!refreshPromise) {\n    refreshPromise = refreshAuthState().finally(() => {\n      refreshPromise = null;\n    });\n  }\n\n  await refreshPromise;\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "For cross-origin cookie deployments, also remember:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["the frontend requests must use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "credentials: 'include'"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "the backend CORS policy must allow credentials"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["the cookie typically needs ", (0,jsx_runtime.jsx)(_components.code, {
          children: "SameSite=None"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Secure"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["set ", (0,jsx_runtime.jsx)(_components.code, {
          children: "trustedOrigins"
        }), " so refresh and logout only accept requests from your frontend origin"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "backchannel-logout",
      children: "Backchannel Logout"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The package supports OIDC backchannel logout at:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "POST /auth/oidc/backchannel-logout"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Expected request shape:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "application/x-www-form-urlencoded"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["field: ", (0,jsx_runtime.jsx)(_components.code, {
          children: "logout_token=<provider-signed-jwt>"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The middleware validates the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "logout_token"
      }), " against the provider JWKS and then revokes matching local sessions by:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["upstream ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sid"
        }), " when present"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["otherwise ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sub"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The logout token must include ", (0,jsx_runtime.jsx)(_components.code, {
        children: "iat"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "exp"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "jti"
      }), ", the standard backchannel logout event claim, and either ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sid"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sub"
      }), ". If the protected header includes ", (0,jsx_runtime.jsx)(_components.code, {
        children: "typ"
      }), ", it must be ", (0,jsx_runtime.jsx)(_components.code, {
        children: "logout+jwt"
      }), "; tokens without ", (0,jsx_runtime.jsx)(_components.code, {
        children: "typ"
      }), " remain accepted for provider compatibility. Each ", (0,jsx_runtime.jsx)(_components.code, {
        children: "jti"
      }), " is consumed once and remembered until the token ", (0,jsx_runtime.jsx)(_components.code, {
        children: "exp"
      }), ", so replaying the same valid token returns a successful no-op response without repeating revocation hooks."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example request:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "await fetch('/auth/oidc/backchannel-logout', {\n  method: 'POST',\n  headers: { 'content-type': 'application/x-www-form-urlencoded' },\n  body: new URLSearchParams({\n    logout_token: '<provider-signed-logout-token>',\n  }),\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example response:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-json",
        children: "{\n  \"loggedOut\": true,\n  \"revokedSessions\": 1\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Notes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "this route is intended for the IdP to call directly, not the browser"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "cookie transport does not change how backchannel logout works"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "after a successful backchannel logout, the next browser refresh will fail because the local session is gone; in cookie mode the package clears the stale session cookie on that failed refresh"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "backend-wiring",
      children: "Backend Wiring"
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "memory-store",
      children: "Memory Store"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';\n\ncreateOidcVaultMiddleware({\n  basePath: '/auth/oidc',\n  backendOrigin: 'https://api.example.com',\n  config: {\n    issuer: process.env.OIDC_ISSUER,\n    clientId: process.env.OIDC_CLIENT_ID,\n    clientSecret: process.env.OIDC_CLIENT_SECRET,\n  },\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  postLogoutRedirectUri: 'https://frontend.example.com/logged-out',\n  storeProvider: createMemoryOidcVaultStore(),\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "redis-store",
      children: "Redis Store"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createClient } from 'redis';\nimport { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';\n\nconst redis = createClient({ url: process.env.REDIS_URL });\nawait redis.connect();\n\ncreateOidcVaultMiddleware({\n  basePath: '/auth/oidc',\n  backendOrigin: 'https://api.example.com',\n  config: {\n    issuer: process.env.OIDC_ISSUER,\n    clientId: process.env.OIDC_CLIENT_ID,\n    clientSecret: process.env.OIDC_CLIENT_SECRET,\n  },\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  postLogoutRedirectUri: 'https://frontend.example.com/logged-out',\n  storeProvider: createRedisOidcVaultStore({\n    client: redis,\n    keyPrefix: 'oidc-vault',\n  }),\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "mongodb-store",
      children: "MongoDB Store"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { MongoClient } from 'mongodb';\nimport { createMongoOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-mongodb-store';\n\nconst mongo = new MongoClient(process.env.MONGODB_URI!);\nawait mongo.connect();\n\ncreateOidcVaultMiddleware({\n  basePath: '/auth/oidc',\n  backendOrigin: 'https://api.example.com',\n  config: {\n    issuer: process.env.OIDC_ISSUER,\n    clientId: process.env.OIDC_CLIENT_ID,\n    clientSecret: process.env.OIDC_CLIENT_SECRET,\n  },\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  postLogoutRedirectUri: 'https://frontend.example.com/logged-out',\n  storeProvider: createMongoOidcVaultStore({\n    db: mongo.db('app-auth'),\n  }),\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "cookie-transport",
      children: "Cookie Transport"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createClient } from 'redis';\nimport { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';\n\nconst redis = createClient({ url: process.env.REDIS_URL });\nawait redis.connect();\n\ncreateOidcVaultMiddleware({\n  basePath: '/auth/oidc',\n  backendOrigin: 'https://api.example.com',\n  config: {\n    issuer: process.env.OIDC_ISSUER,\n    clientId: process.env.OIDC_CLIENT_ID,\n    clientSecret: process.env.OIDC_CLIENT_SECRET,\n  },\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  postLogoutRedirectUri: 'https://frontend.example.com/logged-out',\n  sessionTransport: 'cookie',\n  cookie: {\n    deploymentMode: 'same-site',\n    domain: '.example.com',\n    secure: true,\n  },\n  trustedOrigins: ['https://frontend.example.com'],\n  storeProvider: createRedisOidcVaultStore({\n    client: redis,\n    keyPrefix: 'oidc-vault',\n  }),\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "config-modes",
      children: "Config Modes"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The package supports issuer discovery and manual endpoint configuration."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "issuer-mode",
      children: "Issuer mode"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_ISSUER"
      }), " is set, discovery mode resolves the provider endpoints. The discovered issuer must match the configured issuer, after normal trailing-slash normalization."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Provider discovery metadata and remote JWKS resolvers are cached in bounded process-wide maps keyed by configured issuer URL and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "jwks_uri"
      }), ". These keys are intended to come from static middleware configuration, not request input. Successful discovery entries are reused for up to 10 minutes and both discovery and JWKS resolver maps retain at most 32 entries with oldest-entry eviction. Failed discovery requests are removed from the cache so a later request can retry."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Discovery, token, UserInfo, and remote JWKS HTTP requests use a 5 second default timeout and manual redirect handling. Set ", (0,jsx_runtime.jsx)(_components.code, {
        children: "providerRequestTimeoutMs"
      }), " on ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createOidcVaultMiddleware(...)"
      }), " to a positive integer number of milliseconds if your provider needs a different bound. Provider response parse errors return sanitized client messages; oversized or malformed provider bodies are not returned to callers."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_AUTHORIZATION_ENDPOINT"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_TOKEN_ENDPOINT"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_USERINFO_ENDPOINT"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_JWKS_URI"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_END_SESSION_ENDPOINT"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_CLIENT_ID"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_CLIENT_SECRET"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_SCOPES"
      }), " still apply."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "manual-mode",
      children: "Manual mode"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If your provider metadata is not discoverable, configure the endpoints directly. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "issuer"
      }), " is still required so ID and logout tokens are verified against the expected issuer."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "createOidcVaultMiddleware({\n  basePath: '/auth/oidc',\n  backendOrigin: 'https://api.example.com',\n  config: {\n    issuer: process.env.OIDC_ISSUER,\n    authorizationEndpoint: process.env.OIDC_AUTHORIZATION_ENDPOINT,\n    tokenEndpoint: process.env.OIDC_TOKEN_ENDPOINT,\n    userInfoEndpoint: process.env.OIDC_USERINFO_ENDPOINT,\n    jwksUri: process.env.OIDC_JWKS_URI,\n    endSessionEndpoint: process.env.OIDC_END_SESSION_ENDPOINT,\n    clientId: process.env.OIDC_CLIENT_ID,\n    clientSecret: process.env.OIDC_CLIENT_SECRET,\n    scopes: process.env.OIDC_SCOPES,\n  },\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  storeProvider: createMemoryOidcVaultStore(),\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Minimum required manual config:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "authorizationEndpoint"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "tokenEndpoint"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "jwksUri"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "clientId"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "issuer"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "provider-token-validation",
      children: "Provider Token Validation"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Token responses must include ", (0,jsx_runtime.jsx)(_components.code, {
          children: "token_type: Bearer"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "expires_in"
        }), ", when present, must be a finite non-negative integer."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Upstream OAuth ", (0,jsx_runtime.jsx)(_components.code, {
          children: "expires_in"
        }), " describes the upstream access token only. It does not set ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultSession.expiresAt"
        }), " or shorten the refresh-token-backed vault session."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultSession.expiresAt"
        }), ", when set by application code or store policy, is an explicit vault-session expiry in epoch milliseconds and remains enforced by store providers."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["ID tokens must include ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sub"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "exp"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "iat"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["ID-token ", (0,jsx_runtime.jsx)(_components.code, {
          children: "azp"
        }), " must equal ", (0,jsx_runtime.jsx)(_components.code, {
          children: "clientId"
        }), " when present and is required for multi-audience ID tokens."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["UserInfo responses must include a ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sub"
        }), " matching the verified ID-token subject before claims are merged."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Refresh responses may omit ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id_token"
        }), "; in that case, the existing verified identity claims are retained. If refresh returns a new ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id_token"
        }), ", its ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sub"
        }), " must match the current session subject."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "local-access-token-example",
      children: "Local Access Token Example"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Provide ", (0,jsx_runtime.jsx)(_components.code, {
        children: "tokenIssuer"
      }), " if you want ", (0,jsx_runtime.jsx)(_components.code, {
        children: "exchange"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "refresh"
      }), " to return an app-issued local access token."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { SignJWT } from 'jose';\n\nconst jwtSecret = new TextEncoder().encode(process.env.APP_JWT_SECRET ?? 'dev-secret-change-me');\n\ncreateOidcVaultMiddleware({\n  basePath: '/auth/oidc',\n  backendOrigin: 'https://api.example.com',\n  config: {\n    issuer: process.env.OIDC_ISSUER,\n    clientId: process.env.OIDC_CLIENT_ID,\n    clientSecret: process.env.OIDC_CLIENT_SECRET,\n  },\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  storeProvider: createMemoryOidcVaultStore(),\n  tokenIssuer: {\n    async issue({ session }) {\n      const accessToken = await new SignJWT({\n        sub: session.subject,\n        sid: session.sessionId,\n        scope: session.scope,\n      })\n        .setProtectedHeader({ alg: 'HS256' })\n        .setIssuedAt()\n        .setExpirationTime('15m')\n        .sign(jwtSecret);\n\n      return {\n        accessToken,\n        expiresIn: 900,\n        tokenType: 'Bearer',\n      };\n    },\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That local access token is separate from the upstream IdP token. The upstream refresh token stays only in the server-side vault."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "access-token-validation-middleware",
      children: "Access Token Validation Middleware"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use a separate middleware for validating the app-issued local access token on normal API routes."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\nimport { createOidcVaultAccessTokenMiddleware } from '@web-ts-toolkit/express-oidc-vault';\nimport { jwtVerify } from 'jose';\n\nconst app = express();\nconst jwtSecret = new TextEncoder().encode(process.env.APP_JWT_SECRET ?? 'dev-secret-change-me');\n\napp.get(\n  '/api/me',\n  createOidcVaultAccessTokenMiddleware({\n    validator: {\n      async validate(token) {\n        const result = await jwtVerify(token, jwtSecret, {\n          algorithms: ['HS256'],\n        });\n\n        return {\n          subject: String(result.payload.sub),\n          sessionId: typeof result.payload.sid === 'string' ? result.payload.sid : undefined,\n          scope: typeof result.payload.scope === 'string' ? result.payload.scope : undefined,\n          claims: result.payload as Record<string, unknown>,\n        };\n      },\n    },\n  }),\n  (req, res) => {\n    res.json({\n      subject: req.auth?.subject,\n      sessionId: req.auth?.sessionId,\n      scope: req.auth?.scope,\n    });\n  },\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This middleware:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["reads ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Authorization: Bearer ..."
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["delegates token validation to your ", (0,jsx_runtime.jsx)(_components.code, {
          children: "validator"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["attaches ", (0,jsx_runtime.jsx)(_components.code, {
          children: "req.auth"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["rejects missing, malformed, invalid, or expired tokens with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "401"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The package augments Express request typing so ", (0,jsx_runtime.jsx)(_components.code, {
        children: "req.auth"
      }), " is available without casting in TypeScript route handlers."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "jwt-validator-helper",
      children: "JWT validator helper"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If your local access token is a JWT, you can use a built-in helper instead of writing the same ", (0,jsx_runtime.jsx)(_components.code, {
        children: "jwtVerify(...)"
      }), " adapter manually."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import {\n  createOidcVaultAccessTokenMiddleware,\n  createOidcVaultJwtAccessTokenValidator,\n} from '@web-ts-toolkit/express-oidc-vault';\n\nconst jwtSecret = new TextEncoder().encode(process.env.APP_JWT_SECRET ?? 'dev-secret-change-me');\n\napp.get(\n  '/api/me',\n  createOidcVaultAccessTokenMiddleware({\n    validator: createOidcVaultJwtAccessTokenValidator({\n      key: jwtSecret,\n      issuer: 'https://api.example.com',\n      audience: 'api-audience',\n      algorithms: ['HS256'],\n    }),\n  }),\n  (req, res) => {\n    res.json({\n      subject: req.auth?.subject,\n      sessionId: req.auth?.sessionId,\n      scope: req.auth?.scope,\n    });\n  },\n);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Default JWT claim mapping:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "sub"
        }), " -> ", (0,jsx_runtime.jsx)(_components.code, {
          children: "auth.subject"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "sid"
        }), " -> ", (0,jsx_runtime.jsx)(_components.code, {
          children: "auth.sessionId"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "scope"
        }), " -> ", (0,jsx_runtime.jsx)(_components.code, {
          children: "auth.scope"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["full verified payload -> ", (0,jsx_runtime.jsx)(_components.code, {
          children: "auth.claims"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "hook-examples",
      children: "Hook Examples"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Hooks let the app observe or extend the OIDC flow without forking the middleware."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "createOidcVaultMiddleware({\n  basePath: '/auth/oidc',\n  backendOrigin: 'https://api.example.com',\n  config: {\n    issuer: process.env.OIDC_ISSUER,\n    clientId: process.env.OIDC_CLIENT_ID,\n    clientSecret: process.env.OIDC_CLIENT_SECRET,\n  },\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  storeProvider: createMemoryOidcVaultStore(),\n  hooks: {\n    async onLoginStart({ req }) {\n      console.log('OIDC login started', {\n        ip: req.ip,\n        userAgent: req.get('user-agent'),\n      });\n    },\n    async onSessionCreated({ session }) {\n      if (!session?.user) {\n        return;\n      }\n\n      await upsertLocalUser({\n        oidcSubject: session.subject,\n        email: typeof session.user.email === 'string' ? session.user.email : undefined,\n        displayName: typeof session.user.name === 'string' ? session.user.name : undefined,\n      });\n    },\n    async onSessionRefreshed({ session, metadata }) {\n      console.log('OIDC session rotated', {\n        previousSessionId: metadata?.previousSessionId,\n        nextSessionId: session?.sessionId,\n      });\n    },\n    async onLogout({ session, metadata }) {\n      console.log('OIDC logout completed', {\n        subject: session?.subject,\n        revokedSessions: metadata?.revokedSessions,\n      });\n    },\n    async onError({ error, route, req }) {\n      console.error('OIDC vault error', {\n        route,\n        path: req.originalUrl,\n        error,\n      });\n    },\n  },\n});\n\nasync function upsertLocalUser(input: { oidcSubject: string; email?: string; displayName?: string }): Promise<void> {\n  console.log('upsertLocalUser', input);\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Recommended hook usage:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "onLoginStart"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onAuthorizationUrl"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onCallbackTokens"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onUserInfo"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onBeforeSessionCreate"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onBeforeLogout"
        }), " are pre-commit hooks. Throwing from one of these hooks vetoes the operation before related durable session state is created, rotated, or deleted."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "onSessionCreated"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onSessionRefreshed"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onLogout"
        }), " are post-commit notification hooks. Their failures are reported to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onError"
        }), " but do not change a successful callback redirect, refresh response, logout response, or already-committed store mutation."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["client error responses keep a stable ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ code, message }"
        }), " shape and intentionally avoid returning raw provider, store, hook, token issuer, or access-token validator details. Use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onError"
        }), " to observe the original error object for private server-side logs."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "security-checklist",
      children: "Security Checklist"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["keep ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " in ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionStorage"
        }), " and keep ", (0,jsx_runtime.jsx)(_components.code, {
          children: "accessToken"
        }), " in memory only"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "never store the upstream refresh token in the browser"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "use HTTPS end-to-end for frontend, backend, and IdP communication"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["set ", (0,jsx_runtime.jsx)(_components.code, {
          children: "backendOrigin"
        }), " to the public backend origin registered with the provider; do not rely on request host or proxy headers for callback URL construction"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["keep the default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requestBodyLimit"
        }), " of ", (0,jsx_runtime.jsx)(_components.code, {
          children: "16kb"
        }), " unless a provider requires a larger form-encoded backchannel ", (0,jsx_runtime.jsx)(_components.code, {
          children: "logout_token"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["treat XSS prevention as critical because ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionStorage"
        }), " is still readable by JavaScript"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "enable a strict Content Security Policy and avoid unsafe inline scripts"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["rotate ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " on refresh and overwrite the mirrored ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionStorage"
        }), " value immediately"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["clear in-memory auth state and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionStorage"
        }), " on logout, even if upstream logout fails"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["set ", (0,jsx_runtime.jsx)(_components.code, {
          children: "postLogoutRedirectUri"
        }), " explicitly to an HTTP(S) URL registered with the OIDC provider so logout destinations stay predictable"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["when using cookie transport, rely on cookie credentials only for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "refresh"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "logout"
        }), "; do not send fallback body ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " values"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["when using cross-site cookie transport, send frontend requests with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "credentials: 'include'"
        }), ", enable credentialed CORS, use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "SameSite=None; Secure"
        }), ", and allow only known frontend origins via ", (0,jsx_runtime.jsx)(_components.code, {
          children: "trustedOrigins"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["keep cookie-authenticated CSRF protection fail-closed for every ", (0,jsx_runtime.jsx)(_components.code, {
          children: "SameSite"
        }), " mode by requiring an ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Origin"
        }), " or valid ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Referer"
        }), " matching ", (0,jsx_runtime.jsx)(_components.code, {
          children: "backendOrigin"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "trustedOrigins"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "configure a stable expected issuer in both discovery and manual endpoint modes"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "require matching UserInfo subjects before merging provider claims into the local session user"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["treat upstream OAuth ", (0,jsx_runtime.jsx)(_components.code, {
          children: "expires_in"
        }), ", local access-token lifetime, and vault-session expiry as separate policies"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "keep any local app-issued access token short-lived, such as 5 to 15 minutes"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "use Redis or MongoDB, not the memory store, for production or multi-instance deployments"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["monitor ", (0,jsx_runtime.jsx)(_components.code, {
          children: "onError"
        }), " and other hooks so failed callback, refresh, and logout flows are visible in private server logs without returning raw provider, token, store, or hook errors to clients"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "store-packages",
      children: "Store Packages"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./express-oidc-vault-memory-store",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/express-oidc-vault-memory-store"
          })
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./express-oidc-vault-redis-store",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/express-oidc-vault-redis-store"
          })
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./express-oidc-vault-mongodb-store",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/express-oidc-vault-mongodb-store"
          })
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "related-packages",
      children: "Related Packages"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./express-oidc-vault-memory-store",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/express-oidc-vault-memory-store"
          })
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./express-oidc-vault-redis-store",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/express-oidc-vault-redis-store"
          })
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./express-oidc-vault-mongodb-store",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/express-oidc-vault-mongodb-store"
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

/***/ 4340
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  A: () => (/* binding */ TabItem)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/index.js
var react = __webpack_require__(1763);
// EXTERNAL MODULE: ./node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
var clsx = __webpack_require__(3526);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._fff214706bdcd4b0d830559fcbe68fdf/node_modules/@docusaurus/theme-common/lib/utils/tabsUtils.js
var tabsUtils = __webpack_require__(7002);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/styles.module.css
// extracted by mini-css-extract-plugin
/* harmony default export */ const styles_module = ({"tabItem":"tabItem_V2tX"});
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js
/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */function TabItemPanel({children,className,hidden}){return/*#__PURE__*/(0,jsx_runtime.jsx)("div",{role:"tabpanel",className:(0,clsx/* default */.A)(styles_module.tabItem,className),hidden,children:children});}function TabItem({children,className,value}){const{selectedValue,lazy}=(0,tabsUtils/* useTabs */.uc)();const isSelected=value===selectedValue;// TODO Docusaurus v4: use <Activity> ?
if(!isSelected&&lazy){return null;}return/*#__PURE__*/(0,jsx_runtime.jsx)(TabItemPanel,{className:className,hidden:!isSelected,children:children});}

/***/ },

/***/ 362
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  A: () => (/* binding */ Tabs)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/index.js
var react = __webpack_require__(1763);
// EXTERNAL MODULE: ./node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
var clsx = __webpack_require__(3526);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._fff214706bdcd4b0d830559fcbe68fdf/node_modules/@docusaurus/theme-common/lib/utils/ThemeClassNames.js
var ThemeClassNames = __webpack_require__(6638);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._fff214706bdcd4b0d830559fcbe68fdf/node_modules/@docusaurus/theme-common/lib/utils/tabsUtils.js
var tabsUtils = __webpack_require__(7002);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._fff214706bdcd4b0d830559fcbe68fdf/node_modules/@docusaurus/theme-common/lib/utils/scrollUtils.js
var scrollUtils = __webpack_require__(381);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+core@3.10.2_@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8__clean-cs_84cbf6b1589841776422739c13a66bb6/node_modules/@docusaurus/core/lib/client/exports/useIsBrowser.js
var useIsBrowser = __webpack_require__(3995);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/styles.module.css
// extracted by mini-css-extract-plugin
/* harmony default export */ const styles_module = ({"tabList":"tabList_HP23","tabItem":"tabItem__W4u"});
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js
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

/***/ 7002
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   OC: () => (/* binding */ useTabsContextValue),
/* harmony export */   O_: () => (/* binding */ TabsProvider),
/* harmony export */   uc: () => (/* binding */ useTabs),
/* harmony export */   vT: () => (/* binding */ sanitizeTabsChildren)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1763);
/* harmony import */ var _docusaurus_router__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(6532);
/* harmony import */ var _docusaurus_useIsomorphicLayoutEffect__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(8409);
/* harmony import */ var _docusaurus_theme_common_internal__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(7606);
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(5488);
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(9591);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(1987);
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