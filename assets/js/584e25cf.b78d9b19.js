"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[325],{

/***/ 9043
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
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.3.0_react@19.3.0/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(3191);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(5430);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(2608);
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
  "value": "Requirements",
  "id": "requirements",
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
  "value": "DPoP: complete local JWT and API configuration",
  "id": "dpop-complete-local-jwt-and-api-configuration",
  "level": 2
}, {
  "value": "Modes, defaults and migration",
  "id": "modes-defaults-and-migration",
  "level": 3
}, {
  "value": "POST login, cookie-authenticated callback and original-key vault requests",
  "id": "post-login-cookie-authenticated-callback-and-original-key-vault-requests",
  "level": 3
}, {
  "value": "Optional Fingerprint Recognition (Not PoP)",
  "id": "optional-fingerprint-recognition-not-pop",
  "level": 2
}, {
  "value": "Frontend adapter and wire flow",
  "id": "frontend-adapter-and-wire-flow",
  "level": 3
}, {
  "value": "Privacy and retention",
  "id": "privacy-and-retention",
  "level": 3
}, {
  "value": "Absolute Session Lifetime",
  "id": "absolute-session-lifetime",
  "level": 2
}, {
  "value": "Frontend Integration Example",
  "id": "frontend-integration-example",
  "level": 2
}, {
  "value": "Persistent-key DPoP SPA example",
  "id": "persistent-key-dpop-spa-example",
  "level": 3
}, {
  "value": "Default unbound bearer frontend",
  "id": "default-unbound-bearer-frontend",
  "level": 3
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
  "value": "Local issuer result contract",
  "id": "local-issuer-result-contract",
  "level": 3
}, {
  "value": "Migration And Behavior Changes",
  "id": "migration-and-behavior-changes",
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
  "value": "Request-aware API policy and public URL",
  "id": "request-aware-api-policy-and-public-url",
  "level": 3
}, {
  "value": "Guarded store and per-request replay contracts",
  "id": "guarded-store-and-per-request-replay-contracts",
  "level": 3
}, {
  "value": "Fixed errors, challenges and nonces",
  "id": "fixed-errors-challenges-and-nonces",
  "level": 3
}, {
  "value": "Hook Examples",
  "id": "hook-examples",
  "level": 2
}, {
  "value": "Session Identity And Store Namespaces",
  "id": "session-identity-and-store-namespaces",
  "level": 2
}, {
  "value": "Rotation alias retention",
  "id": "rotation-alias-retention",
  "level": 3
}, {
  "value": "Known Browser And Concurrency Limits",
  "id": "known-browser-and-concurrency-limits",
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
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "opt-in JSON POST login, HttpOnly browser transaction cookie, and original-key DPoP through callback/exchange/refresh/logout"
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
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "request-aware local JWT API authentication with proof/nonce/shared replay enforcement"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "separate opt-in generic fingerprint recognition at POST login and before exchange/refresh (change detection, not PoP)"
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
      id: "requirements",
      children: "Requirements"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Express ", (0,jsx_runtime.jsx)(_components.code, {
          children: ">=5.0.0"
        }), " is the runtime peer dependency. TypeScript applications need ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@types/express"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "@types/node"
        }), " as development dependencies."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Node.js ", (0,jsx_runtime.jsx)(_components.code, {
          children: ">=22.12.0"
        }), ". The published CJS entry (", (0,jsx_runtime.jsx)(_components.code, {
          children: "index.js"
        }), ") synchronously requires the ESM-only ", (0,jsx_runtime.jsx)(_components.code, {
          children: "jose"
        }), " dependency, which needs Node's ", (0,jsx_runtime.jsx)(_components.code, {
          children: "require(esm)"
        }), " support. That support is enabled by default starting with Node ", (0,jsx_runtime.jsx)(_components.code, {
          children: "22.12.0"
        }), "; earlier Node 22 releases fail to load the CJS root with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ERR_REQUIRE_ESM"
        }), " unless an experimental flag is passed. Both the CJS (", (0,jsx_runtime.jsx)(_components.code, {
          children: "require"
        }), ") and ESM (", (0,jsx_runtime.jsx)(_components.code, {
          children: "import"
        }), ") roots load without experimental flags on every verified runtime (", (0,jsx_runtime.jsx)(_components.code, {
          children: "22.12.0"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "22.18.0"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "22.20.0"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "24.x"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "26.x"
        }), ")."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["TypeScript consumers typecheck with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "skipLibCheck: false"
        }), " under strict ", (0,jsx_runtime.jsx)(_components.code, {
          children: "NodeNext"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "Bundler"
        }), " settings. ESM consumers resolve the ", (0,jsx_runtime.jsx)(_components.code, {
          children: "import"
        }), " declaration condition (", (0,jsx_runtime.jsx)(_components.code, {
          children: "index.d.mts"
        }), "); CommonJS (", (0,jsx_runtime.jsx)(_components.code, {
          children: ".cts"
        }), ") consumers resolve the ", (0,jsx_runtime.jsx)(_components.code, {
          children: "require"
        }), " condition (", (0,jsx_runtime.jsx)(_components.code, {
          children: "index.d.ts"
        }), "). Both include the public Express ", (0,jsx_runtime.jsx)(_components.code, {
          children: "req.auth"
        }), " augmentation. Workspace builds place these files under ", (0,jsx_runtime.jsx)(_components.code, {
          children: "dist/"
        }), "; release packaging moves them to the package root and rewrites metadata accordingly. Consumer imports always use the package name."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-exposes",
      children: "What It Exposes"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Main exports:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "named imports from the package root"
      }), ". There is no default export or public subpath API."]
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
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_VAULT_ROUTE_PATHS"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DEFAULT_OIDC_VAULT_REQUEST_BODY_LIMIT"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_VAULT_URL_ENCODED_PARAMETER_LIMIT"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["public types for sessions, hooks, token issuing, validators, config, and store-provider interfaces (including ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultConfig"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultSessionInput"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultStoreConflictError"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultExchangeResult"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultLogoutResult"
        }), "; curated subset — see the package exports for the full list)"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "type OidcVaultFingerprintRecognitionOptions"
        }), " for separate opt-in recognition"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultDeviceBindingOptions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultApiDeviceBindingOptions"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultDpopBinding"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultVerifiedDpopBinding"
        }), ", proof/nonce options, POST-login DTOs and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultTransactionCookieOptions"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultRequestAwareAccessTokenValidator"
        }), ", mandatory verified ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultAccessTokenConfirmation"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultDeviceBindingStoreProvider"
        }), ", exact/null match inputs, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultDpopReplayStore"
        }), ", revocation context and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultDpopReplayCapacityError"
        })]
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
        }), " sets the session cookie and omits ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " from the JSON body"]
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
        }), ": browser sources for POST login/guarded exchange in both transports and cookie-authenticated refresh/logout; required when cross-site session cookie transport is enabled"]
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
      }), " headers. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "__Secure-"
      }), " names require an effectively ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Secure"
      }), " cookie; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "__Host-"
      }), " names additionally require no ", (0,jsx_runtime.jsx)(_components.code, {
        children: "cookie.domain"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "cookie.path: '/'"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Default cookie behavior:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "name"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "oidc_vault_session"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "path"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "/"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "httpOnly"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "true"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "deploymentMode"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "same-origin"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "sameSite"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "lax"
        }), " unless ", (0,jsx_runtime.jsx)(_components.code, {
          children: "deploymentMode"
        }), " is ", (0,jsx_runtime.jsx)(_components.code, {
          children: "cross-site"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "secure"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "true"
        }), " for HTTPS ", (0,jsx_runtime.jsx)(_components.code, {
          children: "backendOrigin"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sameSite: 'none'"
        }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "deploymentMode: 'cross-site'"
        }), "; otherwise ", (0,jsx_runtime.jsx)(_components.code, {
          children: "false"
        }), " as an intentional HTTP local-development policy (set ", (0,jsx_runtime.jsx)(_components.code, {
          children: "secure: true"
        }), " explicitly when terminating TLS upstream of an ", (0,jsx_runtime.jsx)(_components.code, {
          children: "http"
        }), " origin, or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "secure: false"
        }), " explicitly to opt out on HTTPS)"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "SameSite=None"
        }), " is always serialized with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Secure"
        }), " because browsers reject ", (0,jsx_runtime.jsx)(_components.code, {
          children: "SameSite=None"
        }), " without it, even with explicit ", (0,jsx_runtime.jsx)(_components.code, {
          children: "secure: false"
        })]
      }), "\n"]
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
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Session transport and binding mode are independent. POST login and guarded exchange need the ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "temporary transaction cookie even in body transport"
      }), ". The session cookie starts at successful exchange. Same-site subdomains can use Lax with credentialed cross-origin fetch; cross-origin does not itself mean cross-site. Cross-site SPAs need HTTPS ", (0,jsx_runtime.jsx)(_components.code, {
        children: "transactionCookie: { sameSite: 'none' }"
      }), ", compatible session-cookie policy, credentialed CORS and browser cookie permission."]
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
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "POST /auth/oidc/login"
        }), " when ", (0,jsx_runtime.jsx)(_components.code, {
          children: "deviceBinding"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "fingerprintRecognition"
        }), " is configured (JSON initiation)"]
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
      }), ", and backchannel logout payloads. Opt-in POST login accepts only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "application/json"
      }), "; other media types return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "415 OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE"
      }), " before general parsing. If an IdP requires a larger form-encoded ", (0,jsx_runtime.jsx)(_components.code, {
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
        children: "import express from 'express';\nimport { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';\nimport { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';\n\nconst app = express();\n\napp.use(\n  createOidcVaultMiddleware({\n    basePath: '/auth/oidc',\n    backendOrigin: 'https://api.example.com',\n    config: {\n      issuer: process.env.OIDC_ISSUER,\n      clientId: process.env.OIDC_CLIENT_ID,\n      clientSecret: process.env.OIDC_CLIENT_SECRET,\n    },\n    frontendRedirectUri: 'https://frontend.example.com/callback',\n    postLogoutRedirectUri: 'https://frontend.example.com/logged-out',\n    storeProvider: createMemoryOidcVaultStore(),\n    sessionTtlMs: 8 * 60 * 60 * 1000, // Opt in to an eight-hour absolute session lifetime.\n  }),\n);\n"
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
      }), " when that exact URL is provider-registered. It is only consulted for redirected logout (", (0,jsx_runtime.jsx)(_components.code, {
        children: "redirect: true"
      }), ")."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["After original live/alias lineage identity and required proof/nonce/replay checks, local logout (", (0,jsx_runtime.jsx)(_components.code, {
        children: "redirect"
      }), " unset or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "false"
      }), ") never contacts the provider: it revokes the local lineage, clears the cookie under cookie transport, delivers ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onLogout"
      }), " for a live handle, and returns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "200 { loggedOut: true }"
      }), ". Redirected live logout commits that local result before best-effort upstream discovery/redirect; failure or a missing endpoint falls back to local success with private ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onError"
      }), ". Built-in alias-only logout authenticates the surviving lineage's key/provider using ", (0,jsx_runtime.jsx)(_components.code, {
        children: "getSessionRevocationContext"
      }), ", then revokes without live-session hooks or upstream credentials. No currently live target is idempotent success without deletion/proof reservation/hooks; the selected transport's handle/cookie is still required. A proof/identity mismatch leaves the lineage/cookie untouched. Stateless JWTs are not revoked."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Every vault route response carries ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Cache-Control: no-store"
      }), " (login/callback/logout redirects, exchange/refresh/logout/backchannel JSON, and error JSON including body-parser errors) so caches do not retain session/access credentials, one-time exchange codes, or authorization redirects. Only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "no-store"
      }), " is emitted: legacy ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Pragma"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "Expires"
      }), " add no protection once ", (0,jsx_runtime.jsx)(_components.code, {
        children: "no-store"
      }), " is present, and no ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Referrer-Policy"
      }), " is set because redirect targets intentionally expose protocol-required values (provider authorization URL, frontend ", (0,jsx_runtime.jsx)(_components.code, {
        children: "?code="
      }), ", upstream ", (0,jsx_runtime.jsx)(_components.code, {
        children: "id_token_hint"
      }), ") to the navigation target. This does not clear browser history, disable reverse-proxy request logging, strip ", (0,jsx_runtime.jsx)(_components.code, {
        children: "?code="
      }), " from frontend URLs/history (the frontend must still clean up the callback URL, e.g. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "history.replaceState"
      }), "), or hide intentional provider redirect exposure. Verify with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "curl -i"
      }), " (expect ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Cache-Control: no-store"
      }), " on ", (0,jsx_runtime.jsx)(_components.code, {
        children: "GET /auth/oidc/login"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "POST /auth/oidc/exchange"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "POST /auth/oidc/refresh"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "POST /auth/oidc/logout"
      }), ") or assert ", (0,jsx_runtime.jsx)(_components.code, {
        children: "response.headers['cache-control'] === 'no-store'"
      }), " in integration tests under both transports."]
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
            children: "required provider values"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Supply ", (0,jsx_runtime.jsx)(_components.code, {
              children: "issuer"
            }), " and ", (0,jsx_runtime.jsx)(_components.code, {
              children: "clientId"
            }), ", or use ", (0,jsx_runtime.jsx)(_components.code, {
              children: "resolveOidcVaultConfigFromEnv(process.env)"
            }), ". Endpoint settings select manual mode; see Config Modes."]
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
            }), ". Validated before durable callback state; missing destination fails the callback with ", (0,jsx_runtime.jsx)(_components.code, {
              children: "500 OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI"
            }), "."]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "postLogoutRedirectUri"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "unset"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Optional provider-registered HTTP(S) URL used in the upstream end-session redirect. Only consulted for redirected logout (", (0,jsx_runtime.jsx)(_components.code, {
              children: "redirect: true"
            }), "); upstream failures fall back to local ", (0,jsx_runtime.jsx)(_components.code, {
              children: "200 { loggedOut: true }"
            }), " with ", (0,jsx_runtime.jsx)(_components.code, {
              children: "onError"
            }), "."]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "fetchUserInfo"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "enabled when usable"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Fetches UserInfo if an endpoint exists and the response supplies an access token; false disables it. Claims merge only after matching subject."
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
              children: "sessionTtlMs"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "unset"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Opt-in positive safe-integer lifetime in milliseconds from callback session creation. Hooks may shorten it; refresh never extends it."
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
            }), "; unsafe names, paths, domains, and ", (0,jsx_runtime.jsx)(_components.code, {
              children: "__Secure-"
            }), "/", (0,jsx_runtime.jsx)(_components.code, {
              children: "__Host-"
            }), " prefix violations are rejected."]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "deviceBinding"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "disabled"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Vault DPoP policy; object defaults to optional. Selects the key at POST login and enforces it through callback/exchange/refresh/logout; API enforcement is separate."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "fingerprintRecognition"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "disabled"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Separate opt-in recognition; ", (0,jsx_runtime.jsx)(_components.code, {
              children: "headerName"
            }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
              children: "X-Device-Fingerprint"
            }), ". POST-only enrollment, precommit exchange/refresh comparison, fresh login on change; never PoP or an API sender constraint."]
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "transactionCookie"
            })
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["HTTPS ", (0,jsx_runtime.jsx)(_components.code, {
              children: "__Host-oidc_vault_transaction"
            }), ", Lax"]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Temporary cookie independent of session transport. Only name and SameSite lax/none are configurable; HTTP default name is oidc_vault_transaction."
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
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "POST-login/guarded-exchange sources in both transports, plus cookie refresh/logout. Required for cross-site session cookies."
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
            children: "Deadline per provider HTTP exchange (headers plus complete body). Cancellation is attempted without awaiting cleanup. Positive finite integer; validated before cache lookup."
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
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "now"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "Date.now"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Epoch-millisecond clock for TTL and vault proof/nonce/replay checks; shared policy/store clocks must agree."
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Construction takes an internal resolved snapshot without mutating caller options. Cookie/config/trusted-origin containers are copied; transaction-cookie, fingerprint and DPoP policies/allowlists are detached/frozen, and nonce bytes are privately copied. Store/hooks/issuer/clock services remain shared references. Frozen/reused inputs work. Config itself is optional in the type, but issuer/clientId or the complete manual set is required by construction. Vault and API deviceBinding must be configured independently."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "dpop-complete-local-jwt-and-api-configuration",
      children: "DPoP: complete local JWT and API configuration"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Install the core, a store, Express, and your application's direct signing/CORS dependencies (", (0,jsx_runtime.jsx)(_components.code, {
        children: "jose"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "cors"
      }), "; TypeScript also needs ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@types/express"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@types/node"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@types/cors"
      }), "). This development-memory example matches the shipped README. Set OIDC issuer/client values and a stable strong random APP_JWT_SECRET encoding at least 32 bytes; register ", (0,jsx_runtime.jsx)(_components.strong, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "https://api.example.com/auth/oidc/callback",
          children: "https://api.example.com/auth/oidc/callback"
        })
      }), ", serve HTTPS at that public origin and preserve the vault mount path."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\nimport cors from 'cors';\nimport { SignJWT } from 'jose';\nimport {\n  createOidcVaultMiddleware,\n  createOidcVaultAccessTokenMiddleware,\n  createOidcVaultJwtAccessTokenValidator,\n} from '@web-ts-toolkit/express-oidc-vault';\nimport { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';\n\nconst backendOrigin = 'https://api.example.com';\nconst frontendOrigin = 'https://frontend.example.com';\nconst audience = 'app-api-v1';\nconst rawSecret = process.env.APP_JWT_SECRET;\nif (!rawSecret || Buffer.byteLength(rawSecret, 'utf8') < 32) {\n  throw new Error('APP_JWT_SECRET must encode at least 32 strong random bytes.');\n}\nconst signingKey = new TextEncoder().encode(rawSecret);\nconst store = createMemoryOidcVaultStore({ dpopReplayMaxEntries: 100_000 });\nconst app = express();\napp.use(\n  cors({\n    origin: frontendOrigin,\n    credentials: true,\n    allowedHeaders: ['Content-Type', 'Authorization', 'DPoP', 'X-Device-Fingerprint'],\n    exposedHeaders: ['DPoP-Nonce', 'WWW-Authenticate'],\n  }),\n);\napp.use(\n  createOidcVaultMiddleware({\n    backendOrigin,\n    basePath: '/auth/oidc',\n    config: {\n      issuer: process.env.OIDC_ISSUER,\n      clientId: process.env.OIDC_CLIENT_ID,\n      clientSecret: process.env.OIDC_CLIENT_SECRET,\n    },\n    frontendRedirectUri: `${frontendOrigin}/callback`,\n    trustedOrigins: [frontendOrigin],\n    storeProvider: store,\n    sessionTransport: 'body',\n    sessionTtlMs: 8 * 60 * 60 * 1000,\n    deviceBinding: { mode: 'required' }, // ES256, age 60s, skew 5s, nonces off.\n    tokenIssuer: {\n      async issue({ session, deviceBinding }) {\n        if (!deviceBinding) throw new Error('A verified DPoP binding is required.');\n        const accessToken = await new SignJWT({ scope: session.scope, cnf: { jkt: deviceBinding.jkt } })\n          .setSubject(session.subject)\n          .setProtectedHeader({ alg: 'HS256' })\n          .setIssuer(backendOrigin)\n          .setAudience(audience)\n          .setIssuedAt()\n          .setExpirationTime('5m')\n          .sign(signingKey);\n        return { accessToken, tokenType: 'DPoP', expiresIn: 300 };\n      },\n    },\n  }),\n);\napp.use(\n  '/api',\n  createOidcVaultAccessTokenMiddleware({\n    validator: createOidcVaultJwtAccessTokenValidator({\n      key: signingKey,\n      issuer: backendOrigin,\n      audience,\n      algorithms: ['HS256'],\n    }),\n    deviceBinding: { mode: 'required', publicOrigin: backendOrigin, replayNamespace: 'app-api-v1', replayStore: store },\n  }),\n);\napp.get('/api/profile', (req, res) => {\n  res.json({ subject: req.auth?.subject, scope: req.auth?.scope, binding: req.auth?.deviceBinding?.jkt });\n});\napp.listen(3000);\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use verified ", (0,jsx_runtime.jsx)(_components.code, {
        children: "IssueTokenInput.deviceBinding.jkt"
      }), ", not mutable profile/session fields. Local HS256 signing is independent of asymmetric ES256 proof signing. The JWT contains no vault handle/", (0,jsx_runtime.jsx)(_components.code, {
        children: "sid"
      }), ", preserving the HttpOnly boundary when using cookie mode. Keep authorization application-owned and use a shared Redis/Mongo provider in production. No tokenIssuer is also supported: binding is enforced, but no local token fields are emitted."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "modes-defaults-and-migration",
      children: "Modes, defaults and migration"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Vault policy"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "New login"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Existing records"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "Omitted"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Legacy unbound GET; POST only if recognition configured"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Unbound compatible, bound fails closed"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "{}"
            }), " / optional"]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "GET unbound; JSON POST binds from valid proof, otherwise cookie-only"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Legacy unbound permitted; later proof never enrolls"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "required"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "JSON POST with proof; GET rejects before discovery/allocation"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Unbound transaction/code/session rejects; original key required on bound credentials"
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["There is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "no legacyPolicy/downgrade switch"
      }), ". Configure proof-aware clients, issuer and all API acceptance points before selecting required. Disabling DPoP never converts bound sessions/JWTs into Bearer. The persisted binding is only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ type: 'dpop', jkt }"
      }), " (canonical RFC 7638 SHA-256 thumbprint), without JWK/algorithm/mode; hooks/mappers cannot strip/rebind it. Algorithms are checked against current policy on every request."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Defaults: ES256/P-256, proof age ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "60s"
      }), " (integer 1–300), skew ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "5s"
      }), " (integer 0–30), nonce ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "off"
      }), ". Explicit PS256/RS256 use RSA 2048–4096 bits. Reject private/symmetric/remote keys and unsupported critical headers. Bounds: proof ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "8192 bytes"
      }), ", decoded protected header/JWK ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "2048 bytes"
      }), ", JTI ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "1–128 printable ASCII bytes"
      }), ", nonce ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "512 bytes"
      }), ". Signed iat is a nonnegative integer with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "nowSeconds - age - skew < iat <= nowSeconds + skew"
      }), ". Reject raw duplicate/comma-joined Authorization/DPoP; sign a new proof with at least 128 random JTI bits on every attempt."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "post-login-cookie-authenticated-callback-and-original-key-vault-requests",
      children: "POST login, cookie-authenticated callback and original-key vault requests"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["JSON ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "POST <basePath>/login"
      }), " takes ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ returnTo?: string }"
      }), " and returns only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "200 { authorizationUrl }"
      }), "; navigate after persisting the key. Body/query JWK/jkt shortcuts cannot bind. Optional absent proof creates a cookie-only transaction; invalid supplied proof rejects. GET never selects a key. ReturnTo is body-only and remains on the configured frontend origin."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["POST login/guarded exchange validate Origin (valid Referer fallback only when Origin is absent) in ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "both transports"
      }), ", rejecting missing/null/duplicate/untrusted sources. After source/body checks, proof/nonce/replay precede discovery/hooks/allocation. Callback is headerless: state and the temporary cookie hash authenticate the original record, atomically matched before upstream exchange/session/code creation. PKCE/state/OIDC nonce remain unchanged. Missing/wrong cookies do not spend or clear; authenticated terminal provider-error callbacks consume/clear with fixed callback-error JSON."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The fresh ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "32-byte"
      }), " transaction secret is HttpOnly, host-only, Path=/, Secure on HTTPS, default Lax; HTTPS name ", (0,jsx_runtime.jsx)(_components.code, {
        children: "__Host-oidc_vault_transaction"
      }), ", HTTP ", (0,jsx_runtime.jsx)(_components.code, {
        children: "oidc_vault_transaction"
      }), ". Only name/lax-or-none are configurable; None requires HTTPS. No Domain/path/Strict/HttpOnly/Secure opt-out. Session/transaction names must differ; multiple mounts need distinct names. Duplicate/malformed/noncanonical selected cookies reject; unrelated malformed cookies are ignored. One pending flow per browser/mount: new initiation replaces the cookie. Its deadline rounds down to the transaction TTL (default 10m), then callback shortens it to the code TTL (30s). Successful exchange/authenticated terminal issuance failure clears it; mismatches/nonces do not. Abandoned records/cookies expire."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "POST route"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Body/credentials/proof"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Result"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "exchange"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: [(0,jsx_runtime.jsx)(_components.code, {
              children: "{ code }"
            }), ", temporary cookie/include in both modes, source check, original-key proof"]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Credential/profile result; body includes sessionId, cookie sets its session cookie and omits sessionId"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "refresh"
          }), (0,jsx_runtime.jsxs)(_components.td, {
            children: ["Body ", (0,jsx_runtime.jsx)(_components.code, {
              children: "{ sessionId }"
            }), " or cookie ", (0,jsx_runtime.jsx)(_components.code, {
              children: "{}"
            }), "/include, original-key proof; cookie source check"]
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Rotated handle, same key/lineage/subject/absolute expiry"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "logout"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Same handle/cookie and proof, no fingerprint requirement; redirect true only for live handles"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Local success or best-effort upstream redirect after revocation"
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Vault proofs require ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "no access-token Authorization or ath"
      }), ", so refresh/logout work after local JWT expiry. Optional supplied proofs validate/nonces/reserve without enrolling legacy records. Identity/cookie/recognition/key preflight precede atomic consumption/upstream use; atomic returned code/session authority is rechecked. Wrong/stale/replayed proofs preserve honest records/upstream refresh tokens. Browser proofs never go upstream: this milestone constrains local JWTs/vault sessions; IdP tokens/UserInfo remain Bearer/server-held."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "optional-fingerprint-recognition-not-pop",
      children: "Optional Fingerprint Recognition (Not PoP)"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "fingerprintRecognition?: OidcVaultFingerprintRecognitionOptions"
      }), " is a separate opt-in browser recognition/change-detection policy. ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "Fingerprint matching is recognition/change detection, not theft prevention against deliberate copying."
      }), " FingerprintJS ", (0,jsx_runtime.jsx)(_components.code, {
        children: "visitorId"
      }), " or another browser-computed identifier is copyable/spoofable, does not prove private-key possession or identify a physical device, and never satisfies ", (0,jsx_runtime.jsx)(_components.code, {
        children: "deviceBinding.mode: 'required'"
      }), ". The backend has no FingerprintJS dependency."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use named package-root imports and one of the built-in guarded stores:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import {\n  createOidcVaultMiddleware,\n  type OidcVaultFingerprintRecognitionOptions,\n} from '@web-ts-toolkit/express-oidc-vault';\nimport { createMemoryOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-memory-store';\n\nconst fingerprintRecognition: OidcVaultFingerprintRecognitionOptions = {};\nconst vault = createOidcVaultMiddleware({\n  backendOrigin: 'https://api.example.com',\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  trustedOrigins: ['https://frontend.example.com'],\n  config: { issuer: process.env.OIDC_ISSUER, clientId: process.env.OIDC_CLIENT_ID },\n  storeProvider: createMemoryOidcVaultStore(), // Development; shared Redis/Mongo in production.\n  fingerprintRecognition, // Or { headerName: 'X-App-Browser' }.\n  sessionTtlMs: 8 * 60 * 60 * 1000,\n  // Add deviceBinding: { mode: 'required' } for cryptographic sender constraint.\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Header:"
        }), " default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "X-Device-Fingerprint"
        }), "; custom names must be valid HTTP field names without auth/cookie/origin/content/transport collisions, case-insensitively. Exactly one raw field, ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "nonempty printable ASCII, max 256 bytes"
        }), ". The opaque server-observed value is not trimmed, case-folded, comma-split or normalized by core. Malformed/duplicate/oversized opted-in signals return ", (0,jsx_runtime.jsxs)(_components.strong, {
          children: ["400 ", (0,jsx_runtime.jsx)(_components.code, {
            children: "OIDC_VAULT_INVALID_FINGERPRINT"
          }), " / ", (0,jsx_runtime.jsx)(_components.code, {
            children: "Fingerprint signal is invalid."
          })]
        }), " before credential work. Omitted configuration means no capture/check."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Login-only enrollment:"
        }), " JSON POST login alone captures a supplied signal; absence intentionally leaves the session unenrolled. Legacy/GET login stays unenrolled even with a header, provider/profile claim or later exchange/refresh signal. Fingerprint-only POST is unbound and rejects a supplied DPoP header while DPoP is disabled; it still requires trusted Origin/Referer and the single temporary HttpOnly transaction cookie in both body/cookie session transports. All six guarded-store capabilities are checked at construction. The headerless callback authenticates the cookie and copies the original transaction evidence to the original new session."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Precommit matching:"
        }), " enrolled exchange/refresh compare the original signal ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "before proof/nonce/replay, guarded consume, upstream refresh-token use or rotation"
        }), ". Missing/mismatch returns ", (0,jsx_runtime.jsxs)(_components.strong, {
          children: ["403 ", (0,jsx_runtime.jsx)(_components.code, {
            children: "OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED"
          }), " / ", (0,jsx_runtime.jsx)(_components.code, {
            children: "Browser recognition changed; sign in again."
          })]
        }), " without spending the code/provider token, rotating/revoking the session, or setting/clearing cookies. Clear frontend auth state and start fresh POST login. No tolerance, automatic re-enrollment or recognition rotation occurs at exchange/refresh. Fresh login creates a new session/value; an earlier session remains until explicit revocation or expiry."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Reserved private metadata:"
        }), " SHA-256 canonical base64url is carried in ", (0,jsx_runtime.jsx)(_components.code, {
          children: "transaction.metadata.oidcVaultFingerprintRecognition"
        }), ", then ", (0,jsx_runtime.jsx)(_components.code, {
          children: "session.metadata.oidcVaultFingerprintRecognition = { version: 1, hash }"
        }), ". Hooks/profile claims cannot strip/rebind it or enroll an absent value. Core stores no raw signal, removes recognition evidence from public user/credential responses and token-issuer session input, and logs neither raw signals nor hashes. Use allowlisted token claims and exclude fingerprint headers/reserved metadata from hook/application/proxy logs."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Logout/API:"
        }), " recognition checks apply only to exchange/refresh; live/alias logout and signed backchannel logout retain their existing rules. A changed fingerprint does not prevent revocation; bound logout still requires its original DPoP key. Aliases contain no recognition metadata and do not authenticate refresh. Fingerprint-only local tokens remain ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Bearer"
        }), "; API recognition/risk policy is application-owned. DPoP tokens still need request-aware proof enforcement at every API."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "frontend-adapter-and-wire-flow",
      children: "Frontend adapter and wire flow"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Collect in the frontend and inject a current signal source. Send its header on each POST login/exchange/refresh; an intentional ", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), " means unenrolled, while collection failures should stop the operation rather than silently omit an enrolled check. Login/exchange always use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "credentials: 'include'"
      }), " for the temporary cookie; cookie refresh does too. Bodies are ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ returnTo?: string }"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ code }"
      }), ", and body ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ sessionId }"
      }), " or cookie ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), " respectively. Navigate to login's validated ", (0,jsx_runtime.jsx)(_components.code, {
        children: "200 { authorizationUrl }"
      }), "; the callback is headerless. Obtain the current signal each operation instead of persisting a login-time identifier that would hide changes. Recognition 403 requires fresh login, not a retry loop."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The published browser client ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md",
        children: "@web-ts-toolkit/oidc-vault-dpop-client"
      }), " ships this generic adapter, not a backend export:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import {\n  createDeviceFingerprint,\n  fingerprintJsSignalSource,\n  type FingerprintJsAgent,\n} from '@web-ts-toolkit/oidc-vault-dpop-client';\n\nfunction recognitionWithOptionalFingerprintJs(load: () => Promise<FingerprintJsAgent>) {\n  return createDeviceFingerprint(fingerprintJsSignalSource(load));\n}\n// If YOUR frontend installs @fingerprintjs/fingerprintjs, inject:\n// recognitionWithOptionalFingerprintJs(() => FingerprintJS.load());\n// Agent shape: { get(): Promise<{ visitorId: string }> }.\n// Await recognition.headers() for each login/exchange/refresh.\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Its generic ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createDeviceFingerprint(source, { headerName? })"
      }), " is vendor-independent. The optional FingerprintJS adapter lazily shares load but calls get() each operation, caches/persists no identifier, bounds signals, and emits fixed errors. ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/main/packages/express-oidc-vault/README.md#optional-fingerprint-recognition-not-pop",
        children: "The shipped README"
      }), " includes a self-contained generic snippet. The private app integrates recognition through real login/callback/exchange/refresh and current-recognition cookie-tab checks."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["CORS must allow ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Content-Type"
      }), ", the configured fingerprint header, explicit trusted origins and credentials; with DPoP also allow ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Authorization"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "DPoP"
      }), " and expose ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DPoP-Nonce"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "WWW-Authenticate"
      }), ". Cross-site SPAs may require HTTPS ", (0,jsx_runtime.jsx)(_components.code, {
        children: "transactionCookie: { sameSite: 'none' }"
      }), "; browser third-party-cookie restrictions still apply."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "privacy-and-retention",
      children: "Privacy and retention"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Disclose collection, matching purpose, transaction/session retention and fresh-login behavior on change. Hashing is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "not anonymization"
      }), ": stable/low-entropy identifiers and deterministic hashes remain correlation data that can be copied or guessed. Keep raw headers out of application/proxy logs. The hash exists in the pending transaction (default 10-minute TTL), then lasts with the vault session through refresh, independent of local JWT/upstream access-token expiry. Configure ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sessionTtlMs"
      }), " or an application/store lifetime; unset assigns no default session expiry. Account for physical store cleanup and backup retention after logical expiry/deletion. Abandoned transactions expire; session logout/revocation follows store deletion/cleanup policy. The frontend utility stores no identifier."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "absolute-session-lifetime",
      children: "Absolute Session Lifetime"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The quick start opts in with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sessionTtlMs: 8 * 60 * 60 * 1000"
      }), ". New server-side sessions receive ", (0,jsx_runtime.jsx)(_components.code, {
        children: "expiresAt = now + sessionTtlMs"
      }), " at ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "callback session creation"
      }), ", not login start. Refresh preserves that timestamp. At ", (0,jsx_runtime.jsx)(_components.code, {
        children: "now >= expiresAt"
      }), ", the store treats the session as expired, so exchange and refresh can no longer use it, even if an exchange code is still live."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Before ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onBeforeSessionCreate"
      }), ", the session already has its expiry. A hook may shorten it with a valid integer epoch-millisecond timestamp. Removing, extending, or assigning an invalid expiry restores the original cap after the hook; hook delay and changes to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createdAt"
      }), " do not move that cap. For example, add this optional hook to the middleware options to shorten new sessions to one hour:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "hooks: {\n  onBeforeSessionCreate({ session }) {\n    if (session?.expiresAt !== undefined) {\n      session.expiresAt = Math.min(session.expiresAt, session.createdAt + 60 * 60 * 1000);\n    }\n  },\n},\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Omitting ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sessionTtlMs"
      }), " assigns no default session expiry and retains application/hook/store-owned policy. Enabling it affects new sessions; it does not retrofit existing sessions. Upstream OAuth ", (0,jsx_runtime.jsx)(_components.code, {
        children: "expires_in"
      }), ", local access-token lifetime, and vault-session lifetime are independent."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "authorizationTransactionTtlMs"
      }), " (default 10 minutes), ", (0,jsx_runtime.jsx)(_components.code, {
        children: "exchangeCodeTtlMs"
      }), " (default 30 seconds), and optional ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sessionTtlMs"
      }), " must be positive safe-integer numbers of milliseconds. Construction rejects zero, negative, fractional, nonnumeric, null, NaN, infinite, and unsafe values. It samples ", (0,jsx_runtime.jsx)(_components.code, {
        children: "now"
      }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Date.now"
      }), "): the clock and computed expiry must be integer epoch milliseconds within JavaScript Date's inclusive ±8,640,000,000,000,000 ms range, with expiry after now. Record creation rechecks computed expiries; an unusable later clock/expiry returns sanitized HTTP 500 / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_VAULT_INTERNAL_ERROR"
      }), " before new transaction/session/code persistence, with the original error available to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "hooks.onError"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "frontend-integration-example",
      children: "Frontend Integration Example"
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "persistent-key-dpop-spa-example",
      children: "Persistent-key DPoP SPA example"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The shipped README contains a ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/main/packages/express-oidc-vault/README.md#standalone-body-transport-dpop-client",
        children: "standalone body-transport client"
      }), ", including key persistence, proof signing, POST login/exchange/API/refresh/logout and nonce retry, with no repo-only imports. For cookie coordination and a fuller scoped fetch helper, install the published browser client ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md",
        children: "@web-ts-toolkit/oidc-vault-dpop-client"
      }), " in your frontend. Its four intended APIs are getOrCreateDpopKey, createDpopProof, createOidcVaultDpopSession and fetchWithDpop; they are not Express package exports."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createOidcVaultDpopSession, fetchWithDpop } from '@web-ts-toolkit/oidc-vault-dpop-client';\n\nconst backendOrigin = 'http://127.0.0.1:4318';\nconst session = createOidcVaultDpopSession({ backendOrigin, basePath: '/auth/oidc/body', sessionTransport: 'body' }); // Cookie: basePath '/auth/oidc/cookie', sessionTransport 'cookie'.\n\nexport const signIn = (): Promise<void> => session.login('/callback?transport=body');\n\nexport async function bootstrapBoundAuth(): Promise<void> {\n  const url = new URL(location.href);\n  const code = url.searchParams.get('code');\n  if (code) {\n    url.searchParams.delete('code');\n    history.replaceState(null, '', url.href);\n    await session.exchange(code);\n  } else {\n    await session.refresh(); // Persisted key; no access-token Authorization/ath.\n  }\n}\n\nexport async function getBoundProfile(): Promise<unknown> {\n  const response = await fetchWithDpop(\n    { session, apis: [{ origin: backendOrigin, replayNamespace: 'oidc-vault-dpop-example-api' }] },\n    `${backendOrigin}/api/profile`,\n  );\n  if (!response.ok) throw new Error('Protected API request failed.');\n  return response.json();\n}\nexport const signOut = (): Promise<void> => session.logout();\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Repository commands: pnpm --filter oidc-vault-dpop-example dev", ":server", " and, in another terminal, pnpm --filter oidc-vault-dpop-example dev; open ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "127.0.0.1:4317/?transport=body"
      }), " or cookie. The local fixture IdP is 4319; backend 4318, two public mounts /auth/oidc/body and /auth/oidc/cookie. Your own core default mount is /auth/oidc. Match frontend/server mounts/origins and API replayNamespace exactly."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Login creates a non-extractable ES256/P-256 private CryptoKey plus public JWK in IndexedDB before navigation, scoped by frontend/backend/basePath; atomic first-key creation has one winner. Key loss/change requires fresh login, not rebinding/Bearer fallback. Tokens stay memory-only; body handles/pending key markers use sessionStorage, cookie handles remain backend HttpOnly (not JWT sid). All flows need secure context, Web Crypto and IndexedDB CryptoKey clone; cookie mode additionally requires Web Locks/BroadcastChannel. Cookie refresh has per-context single-flight plus same-origin lock/winner-token coordination, including current recognition. Body handles remain tab-local."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Each request/retry signs fresh JTI/iat/signature; API-only ath. Fetch is exact-origin scoped with auth-bearing redirects rejected, one nonce retry total and at most one refresh/retry for DPoP invalid_token. Proof errors/403/503/network failures do not trigger generic refresh loops. Mutations are single-attempt unless explicit authorized server-idempotent/replayable-body retry is selected. CORS must allow explicit frontend origin/credentials and Content-Type/Authorization/DPoP/configured fingerprint; expose DPoP-Nonce/WWW-Authenticate. These settings do not replace vault Origin checks. Same-site loopback browser checks passed on Chromium 151/Firefox 153; WebKit/Safari was not certified due to unavailable Linux libraries, and arbitrary cross-site HTTPS/third-party-cookie/external-IdP behavior is deployment-specific. Browser locks are not a backend refresh lease."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "default-unbound-bearer-frontend",
      children: "Default unbound bearer frontend"
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
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The shared promise below coordinates callers in this JavaScript context only. It does not coordinate tabs, backend instances, or response arrival order; see ", (0,jsx_runtime.jsx)(_components.a, {
        href: "#known-browser-and-concurrency-limits",
        children: "Known Browser And Concurrency Limits"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "type AuthState = {\n  accessToken: string | null;\n  sessionId: string | null;\n};\n\nconst authState: AuthState = {\n  accessToken: null,\n  sessionId: sessionStorage.getItem('sessionId'),\n};\n\nlet refreshPromise: Promise<void> | null = null;\n\nfunction persistSessionId(sessionId: string | null): void {\n  authState.sessionId = sessionId;\n\n  if (sessionId) {\n    sessionStorage.setItem('sessionId', sessionId);\n  } else {\n    sessionStorage.removeItem('sessionId');\n  }\n}\n\nfunction setAuthState(payload: { accessToken?: string; sessionId: string }): void {\n  authState.accessToken = payload.accessToken ?? null;\n  persistSessionId(payload.sessionId);\n}\n\nfunction readBodyCredentials(value: unknown): { accessToken?: string; sessionId: string } {\n  if (\n    !value ||\n    typeof value !== 'object' ||\n    !('sessionId' in value) ||\n    typeof value.sessionId !== 'string' ||\n    ('accessToken' in value && typeof value.accessToken !== 'string')\n  )\n    throw new Error('Invalid credential response.');\n  return {\n    sessionId: value.sessionId,\n    ...('accessToken' in value ? { accessToken: value.accessToken as string } : {}),\n  };\n}\n\nfunction clearAuthState(): void {\n  authState.accessToken = null;\n  persistSessionId(null);\n}\n\nasync function refreshAuthState(): Promise<void> {\n  if (!authState.sessionId) {\n    clearAuthState();\n    return;\n  }\n\n  const response = await fetch('/auth/oidc/refresh', {\n    method: 'POST',\n    headers: { 'content-type': 'application/json' },\n    body: JSON.stringify({ sessionId: authState.sessionId }),\n  });\n\n  if (!response.ok) {\n    clearAuthState();\n    throw new Error('OIDC refresh failed.');\n  }\n\n  setAuthState(readBodyCredentials(await response.json()));\n}\n\nasync function ensureFreshAccessToken(): Promise<void> {\n  if (!refreshPromise) {\n    refreshPromise = refreshAuthState().finally(() => {\n      refreshPromise = null;\n    });\n  }\n\n  await refreshPromise;\n}\n"
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
        children: "type AuthState = {\n  accessToken: string | null;\n};\n\nconst authState: AuthState = {\n  accessToken: null,\n};\n\nlet refreshPromise: Promise<void> | null = null;\n\nfunction setAuthState(payload: { accessToken?: string }): void {\n  authState.accessToken = payload.accessToken ?? null;\n}\n\nfunction readCookieCredentials(value: unknown): { accessToken?: string } {\n  if (\n    !value ||\n    typeof value !== 'object' ||\n    'sessionId' in value ||\n    ('accessToken' in value && typeof value.accessToken !== 'string')\n  )\n    throw new Error('Invalid cookie credential response.');\n  return 'accessToken' in value ? { accessToken: value.accessToken as string } : {};\n}\n\nfunction clearAuthState(): void {\n  authState.accessToken = null;\n}\n\nasync function refreshAuthState(): Promise<void> {\n  const response = await fetch('/auth/oidc/refresh', {\n    method: 'POST',\n    credentials: 'include',\n  });\n\n  if (!response.ok) {\n    clearAuthState();\n    throw new Error('OIDC refresh failed.');\n  }\n\n  setAuthState(readCookieCredentials(await response.json()));\n}\n\nasync function ensureFreshAccessToken(): Promise<void> {\n  if (!refreshPromise) {\n    refreshPromise = refreshAuthState().finally(() => {\n      refreshPromise = null;\n    });\n  }\n\n  await refreshPromise;\n}\n"
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
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "same-site subdomains can use Lax; truly cross-site requests need SameSite=None; Secure and browser cookie permission"
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
      }), " is reserved once per issuer/client ID (replay keys namespace the raw ", (0,jsx_runtime.jsx)(_components.code, {
        children: "jti"
      }), ", so independent issuers sharing a store and reusing a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "jti"
      }), " do not suppress each other) and remembered until the token ", (0,jsx_runtime.jsx)(_components.code, {
        children: "exp"
      }), ". The first presentation performs the idempotent session deletion and emits ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onLogout"
      }), "; a duplicate presentation repeats the same idempotent deletion without emitting ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onLogout"
      }), " unless the catch-up actually removed sessions (retry after a deletion failure still revokes and still delivers the hook). A sequential replay after completed revocation returns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "revokedSessions: 0"
      }), " without a hook. Hooks are therefore at-least-once under failure/concurrency, except a crash between durable deletion and hook delivery can lose that delivery. Pre-upgrade raw-", (0,jsx_runtime.jsx)(_components.code, {
        children: "jti"
      }), " replay records expire naturally with their token ", (0,jsx_runtime.jsx)(_components.code, {
        children: "exp"
      }), " and are never matched by namespaced keys."]
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
        children: "import { createClient } from 'redis';\nimport { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';\n\nconst redis = createClient({ url: process.env.REDIS_URL });\nredis.on('error', () => console.warn('OIDC vault Redis connection error.'));\nawait redis.connect();\n\ncreateOidcVaultMiddleware({\n  basePath: '/auth/oidc',\n  backendOrigin: 'https://api.example.com',\n  config: {\n    issuer: process.env.OIDC_ISSUER,\n    clientId: process.env.OIDC_CLIENT_ID,\n    clientSecret: process.env.OIDC_CLIENT_SECRET,\n  },\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  postLogoutRedirectUri: 'https://frontend.example.com/logged-out',\n  storeProvider: createRedisOidcVaultStore({\n    client: redis,\n    keyPrefix: 'oidc-vault',\n  }),\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "mongodb-store",
      children: "MongoDB Store"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { MongoClient } from 'mongodb';\nimport { createMongoOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-mongodb-store';\n\nconst mongo = new MongoClient(process.env.MONGODB_URI!);\nawait mongo.connect();\nconst storeProvider = createMongoOidcVaultStore({ db: mongo.db('app-auth') });\nawait storeProvider.ready();\n\ncreateOidcVaultMiddleware({\n  basePath: '/auth/oidc',\n  backendOrigin: 'https://api.example.com',\n  config: {\n    issuer: process.env.OIDC_ISSUER,\n    clientId: process.env.OIDC_CLIENT_ID,\n    clientSecret: process.env.OIDC_CLIENT_SECRET,\n  },\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  postLogoutRedirectUri: 'https://frontend.example.com/logged-out',\n  storeProvider,\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "cookie-transport",
      children: "Cookie Transport"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createClient } from 'redis';\nimport { createRedisOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-redis-store';\n\nconst redis = createClient({ url: process.env.REDIS_URL });\nredis.on('error', () => console.warn('OIDC vault Redis connection error.'));\nawait redis.connect();\n\ncreateOidcVaultMiddleware({\n  basePath: '/auth/oidc',\n  backendOrigin: 'https://api.example.com',\n  config: {\n    issuer: process.env.OIDC_ISSUER,\n    clientId: process.env.OIDC_CLIENT_ID,\n    clientSecret: process.env.OIDC_CLIENT_SECRET,\n  },\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  postLogoutRedirectUri: 'https://frontend.example.com/logged-out',\n  sessionTransport: 'cookie',\n  cookie: {\n    // Host-only (no `domain`): the browser scopes the cookie to\n    // `api.example.com` and still sends it on credentialed cross-origin\n    // requests from `https://frontend.example.com`.\n    deploymentMode: 'same-site',\n    secure: true,\n  },\n  trustedOrigins: ['https://frontend.example.com'],\n  storeProvider: createRedisOidcVaultStore({\n    client: redis,\n    keyPrefix: 'oidc-vault',\n  }),\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Only set ", (0,jsx_runtime.jsx)(_components.code, {
        children: "cookie.domain"
      }), " (for example ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".example.com"
      }), ") as an advanced expansion when sibling subdomains must share the credential. Sharing widens the credential trust boundary and is not required for normal cross-origin API requests."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "config-modes",
      children: "Config Modes"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The package supports issuer discovery and manual endpoint configuration."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "resolveOidcVaultConfigFromEnv(process.env)"
      }), " to read the documented environment variables, or supply ", (0,jsx_runtime.jsx)(_components.code, {
        children: "config"
      }), " explicitly to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "createOidcVaultMiddleware"
      }), ". ", (0,jsx_runtime.jsx)(_components.code, {
        children: "clientId"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_CLIENT_ID"
      }), " is always required; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "scopes"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_SCOPES"
      }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "openid email profile"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "issuer-mode",
      children: "Issuer mode"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["With ", (0,jsx_runtime.jsx)(_components.code, {
        children: "issuer"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "clientId"
      }), " but no endpoint settings, discovery resolves the provider endpoints. The configured issuer identifier is preserved exactly after surrounding-whitespace trimming (no trailing slash is added; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/tenant"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/tenant/"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/tenant//"
      }), " are distinct) and the discovered issuer must exactly equal it without additional trimming. Issuers must be absolute http(s) URLs without userinfo, query, or fragment; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "http"
      }), " is accepted for local-test providers."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Discovery may omit ", (0,jsx_runtime.jsx)(_components.code, {
        children: "userinfo_endpoint"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "end_session_endpoint"
      }), ". If present, each must be a nonempty absolute HTTP(S) URL string. Null, arrays, objects, numbers, booleans, blank strings, malformed URLs, and non-HTTP(S) URLs invalidate metadata with HTTP 502 / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_VAULT_DISCOVERY_INVALID"
      }), ", identifying the field without echoing its value. Failed metadata is evicted so later requests can fetch corrected metadata; only validated successes are shared across timeout policies. During redirected logout, discovery errors instead reach ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onError"
      }), " while local revocation still succeeds; local-only logout does not discover metadata."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Provider discovery metadata and remote JWKS resolvers are cached in bounded process-wide maps. Discovery fetches are isolated by ", (0,jsx_runtime.jsx)(_components.code, {
        children: "(issuer, providerRequestTimeoutMs)"
      }), " so differing instance policies never inherit each other's deadline, while settled successful metadata is additionally shared across timeouts for reuse. JWKS resolvers are isolated by ", (0,jsx_runtime.jsx)(_components.code, {
        children: "(jwks_uri, providerRequestTimeoutMs)"
      }), " because JOSE fixes the fetch timeout at creation. These keys are intended to come from static middleware configuration, not request input. Successful discovery entries are reused for up to 10 minutes and both discovery and JWKS resolver maps retain at most 32 entries with oldest-entry eviction. Failed discovery requests evict only the owning policy entry so a later request can retry. Timeout options are validated before any cache lookup, so cached entries cannot bypass option validation."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Discovery, token, UserInfo, and remote JWKS HTTP requests use a 5 second default deadline covering response headers plus complete success/error body consumption; stalled or slow bodies fail with sanitized endpoint-specific timeout errors. Cancellation is attempted promptly without awaiting its promise, so an uncooperative custom stream cannot hold up error delivery through pending cleanup. Request completion does not guarantee completed resource cleanup; the hanging-cancellation evidence uses custom streams, with no native-undici remote exploit established. Upstream redirects are never followed. Set ", (0,jsx_runtime.jsx)(_components.code, {
        children: "providerRequestTimeoutMs"
      }), " to a positive integer number of milliseconds to change the bound. JWKS documents additionally enforce 1 MiB and 100-key limits. Provider response parse errors return sanitized client messages; oversized or malformed bodies are not returned to callers."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Pre-header network rejection and mid-body transport reset return HTTP 502 with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_VAULT_DISCOVERY_FAILED"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_VAULT_TOKEN_REQUEST_FAILED"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_VAULT_USERINFO_FAILED"
      }), " and message ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC provider request failed."
      }), " JWKS transport failures use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_VAULT_JWKS_FAILED"
      }), "; JOSE timeouts retain ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ERR_JWKS_TIMEOUT"
      }), ". Discovery success-body timeout/size/JSON failures retain ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_VAULT_DISCOVERY_INVALID"
      }), ". Original transport diagnostics are privately available as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "hooks.onError"
      }), " context ", (0,jsx_runtime.jsx)(_components.code, {
        children: "error.cause"
      }), " (narrow the unknown error before reading it); they are not browser payload fields."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "manual-mode",
      children: "Manual mode"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Any nonempty endpoint (", (0,jsx_runtime.jsx)(_components.code, {
        children: "authorizationEndpoint"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "tokenEndpoint"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "jwksUri"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "userInfoEndpoint"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "endSessionEndpoint"
      }), ") selects manual mode with no discovery. Optional endpoints are not partial discovery overrides. This also applies to the environment variables:"]
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
      children: ["Undefined, empty, and whitespace-only config/env strings are absent after trimming. Manual mode requires the complete set listed below, even if only ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_USERINFO_ENDPOINT"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_END_SESSION_ENDPOINT"
      }), " selected it. Complete manual configuration preserves valid optional endpoints. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_CLIENT_ID"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_CLIENT_SECRET"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "OIDC_SCOPES"
      }), " still apply; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "issuer"
      }), " binds ID and logout tokens to the exact expected issuer."]
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
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Discovery, token, and UserInfo JSON bodies must be non-null, non-array objects; valid non-object JSON is a controlled 502 provider error."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Non-success token/UserInfo responses always surface 502 with a stable code/message regardless of JSON versus HTML bodies, without leaking body content or the upstream status; rejected upstream redirects never become browser-facing 3xx."
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Present ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access_token"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "id_token"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "refresh_token"
        }), " fields must be non-empty strings and a present ", (0,jsx_runtime.jsx)(_components.code, {
          children: "scope"
        }), " must be a string; malformed present fields are rejected rather than treated as omissions. Callback responses additionally require ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id_token"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "refresh_token"
        }), ", and no session is persisted until all provider checks pass. The callback destination (transaction ", (0,jsx_runtime.jsx)(_components.code, {
          children: "returnTo"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "frontendRedirectUri"
        }), ") is validated before any provider call or durable session/code creation and fails with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "500 OIDC_VAULT_MISSING_FRONTEND_REDIRECT_URI"
        }), " when neither is configured, so a missing destination cannot strand credentials."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Upstream OAuth ", (0,jsx_runtime.jsx)(_components.code, {
          children: "expires_in"
        }), " describes the upstream access token only. It does not set ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultSession.expiresAt"
        }), " or shorten the refresh-token-backed vault session."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "OidcVaultSession.expiresAt"
        }), ", assigned by ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionTtlMs"
        }), ", application code, or store policy, is an explicit vault-session expiry in epoch milliseconds and remains enforced by store providers."]
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
        children: ["UserInfo responses must be objects including a ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sub"
        }), " matching the verified ID-token subject before claims are merged; JSON ", (0,jsx_runtime.jsx)(_components.code, {
          children: "null"
        }), " never bypasses the subject check."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Refresh responses may omit ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id_token"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "refresh_token"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access_token"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "scope"
        }), "; omitted fields retain their current session values (an omitted ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id_token"
        }), " keeps the existing verified identity without revalidating the stored token). If refresh returns a new ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id_token"
        }), ", its ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sub"
        }), " must match the current session subject, and no rotation happens until all provider checks pass."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Refresh profile precedence: fresh verified ID claims are the base when a new ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id_token"
        }), " is present, freshly fetched matching UserInfo overlays whichever base applies, and the retained profile is used only when no new ", (0,jsx_runtime.jsx)(_components.code, {
          children: "id_token"
        }), " arrives (fresh UserInfo still overlays the retained base per key). Retained values are never merged over fresh claims and are never treated as fresh UserInfo. Claims absent from the fresh sources are dropped when fresh identity arrives, so removed provider claims disappear; keep application custom attributes in ", (0,jsx_runtime.jsx)(_components.code, {
          children: "session.metadata"
        }), ", not in ", (0,jsx_runtime.jsx)(_components.code, {
          children: "user"
        }), ", because application-added ", (0,jsx_runtime.jsx)(_components.code, {
          children: "user"
        }), " keys are not carried forward across a fresh identity refresh."]
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
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This is the default unbound Bearer example. Bound JWTs use the complete DPoP configuration above. A browser-readable JWT must omit the vault handle/sid if cookie transport is intended to keep that credential HttpOnly; the sid example deliberately exposes the body-transport handle."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { SignJWT } from 'jose';\n\n// Fail startup when no suitably strong signing key is configured. There is no\n// public fallback: `APP_JWT_SECRET` must be a strong random value that encodes\n// to at least 32 bytes for HS256.\nconst requireSigningKey = (raw: string | undefined): Uint8Array => {\n  if (!raw) {\n    throw new Error('APP_JWT_SECRET must be set to a strong random value at least 32 bytes long.');\n  }\n\n  const key = new TextEncoder().encode(raw);\n\n  if (key.length < 32) {\n    throw new Error('APP_JWT_SECRET must decode to at least 32 bytes for HS256 local access tokens.');\n  }\n\n  return key;\n};\n\nconst jwtSecret = requireSigningKey(process.env.APP_JWT_SECRET);\nconst localTokenIssuer = 'https://api.example.com';\nconst localTokenAudience = 'api-audience';\n\ncreateOidcVaultMiddleware({\n  basePath: '/auth/oidc',\n  backendOrigin: 'https://api.example.com',\n  config: {\n    issuer: process.env.OIDC_ISSUER,\n    clientId: process.env.OIDC_CLIENT_ID,\n    clientSecret: process.env.OIDC_CLIENT_SECRET,\n  },\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  storeProvider: createMemoryOidcVaultStore(),\n  tokenIssuer: {\n    async issue({ session }) {\n      const accessToken = await new SignJWT({\n        sub: session.subject,\n        sid: session.sessionId,\n        scope: session.scope,\n      })\n        .setProtectedHeader({ alg: 'HS256' })\n        .setIssuer(localTokenIssuer)\n        .setAudience(localTokenAudience)\n        .setIssuedAt()\n        .setExpirationTime('15m')\n        .sign(jwtSecret);\n\n      return {\n        accessToken,\n        expiresIn: 900,\n        tokenType: 'Bearer',\n      };\n    },\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That local access token is separate from the upstream IdP token. The upstream refresh token stays only in the server-side vault."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "local-issuer-result-contract",
      children: "Local issuer result contract"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "tokenIssuer.issue"
      }), " must resolve to a non-null, non-array object with:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "accessToken"
        }), ": nonempty opaque string, returned verbatim without trimming or a new whitespace policy;"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "expiresIn"
        }), ": finite nonnegative safe-integer seconds, from 0 through ", (0,jsx_runtime.jsx)(_components.code, {
          children: "Number.MAX_SAFE_INTEGER"
        }), ";"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "tokenType"
        }), ": exact Bearer or DPoP. Unbound permits Bearer or omission (undefined stays absent in JSON); bound requires exact DPoP and compact signed JWT with matching cnf.jkt from the verified IssueTokenInput.deviceBinding. Null/lowercase/whitespace variants and bound Bearer output are invalid."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Only these three fields are copied once into a fresh result. Extra fields (including upstream tokens, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "metadata"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sessionId"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "user"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toJSON"
      }), ") are ignored without evaluating their getters. The vault supplies the response session ID/profile: body transport includes ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sessionId"
      }), ", cookie transport omits it, and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "user"
      }), " is the session profile. Omitting ", (0,jsx_runtime.jsx)(_components.code, {
        children: "tokenIssuer"
      }), " is supported and returns no local token fields."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Malformed results return HTTP 500 with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{\"code\":\"OIDC_VAULT_INTERNAL_ERROR\",\"message\":\"Unexpected OIDC vault error.\"}"
      }), " inside issuance rollback: the logical lineage is revoked and cookie transport clears its cookie instead of minting one. Exchange has already consumed its code; refresh has already contacted the provider and rotated the handle, and its success notification does not run. Correct the issuer and start a new login. Field-specific diagnostics are the original ", (0,jsx_runtime.jsx)(_components.code, {
        children: "hooks.onError"
      }), " context ", (0,jsx_runtime.jsx)(_components.code, {
        children: "error"
      }), " (narrow it before use); allowed-field getter exceptions also enter rollback."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Core decodes trusted issuer output only to check the cnf contract; APIs independently verify JWT signature/issuer/audience/expiry. Local signing algorithms and proof algorithms are independent. Issuers receive owned session/plain containers with reserved recognition evidence omitted; original key/lineage rollback authority survives mutable hooks/issuer calls. This contains accidental extensions, while issuers/hooks remain trusted code with request/response access. Deliberate secrets in allowed fields are not redacted."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "migration-and-behavior-changes",
      children: "Migration And Behavior Changes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Optional-only endpoint settings previously ignored now select manual mode and fail without the complete manual set. Supply all required manual values or remove endpoint settings to use discovery. Correct malformed optional discovery capabilities at the provider, or omit unsupported fields."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "DPoP remains opt-in: an object defaults to optional; required rejects legacy unbound records and requires fresh proof-aware login. Later proofs never enroll/rebind legacy records, and disabled DPoP rejects existing bound credentials. Recognition is independent, POST-only enrollment and fresh login on enrolled change."
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["Invalid transaction/code TTLs previously had store-dependent behavior; supply positive safe-integer milliseconds. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionTtlMs"
        }), " is opt-in for new sessions and never renews on refresh. Custom clocks are now sampled during construction."]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Route each session to its owning issuer/client configuration. Known foreign live sessions now fail with 401. Correct inaccurate stored identity only from trusted provenance or require login again; do not remove identity fields to bypass the guard. Legacy omissions and shared code/alias limits remain as described below."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Issuers must return the declared local credential shape; previously accepted malformed results now fail with rollback. Extra result properties no longer extend/override JSON responses."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Provider network/reset failures now produce sanitized endpoint-specific 502s instead of generic internal errors. Cancellation no longer waits for an uncooperative cleanup promise. Alias-retention wording reflects existing SVH-05 behavior, with no store migration."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "access-token-validation-middleware",
      children: "Access Token Validation Middleware"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use a separate middleware for validating the app-issued local access token on normal API routes."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "For JWTs prefer the built-in helper, which captures verified cnf before custom mapping and implements both validator methods. A custom signature-only adapter must faithfully preserve original confirmation to accept these tokens; the following legacy adapter is suitable only for credentials guaranteed unbound."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\nimport { createOidcVaultAccessTokenMiddleware } from '@web-ts-toolkit/express-oidc-vault';\nimport { jwtVerify } from 'jose';\n\nconst app = express();\n\n// Fail startup when no suitably strong signing key is configured. There is no\n// public fallback: `APP_JWT_SECRET` must be a strong random value that encodes\n// to at least 32 bytes for HS256.\nconst requireSigningKey = (raw: string | undefined): Uint8Array => {\n  if (!raw) {\n    throw new Error('APP_JWT_SECRET must be set to a strong random value at least 32 bytes long.');\n  }\n\n  const key = new TextEncoder().encode(raw);\n\n  if (key.length < 32) {\n    throw new Error('APP_JWT_SECRET must decode to at least 32 bytes for HS256 local access tokens.');\n  }\n\n  return key;\n};\n\nconst jwtSecret = requireSigningKey(process.env.APP_JWT_SECRET);\nconst localTokenIssuer = 'https://api.example.com';\nconst localTokenAudience = 'api-audience';\n\napp.get(\n  '/api/me',\n  createOidcVaultAccessTokenMiddleware({\n    validator: {\n      async validate(token) {\n        const result = await jwtVerify(token, jwtSecret, {\n          issuer: localTokenIssuer,\n          audience: localTokenAudience,\n          algorithms: ['HS256'],\n        });\n\n        return {\n          subject: String(result.payload.sub),\n          sessionId: typeof result.payload.sid === 'string' ? result.payload.sid : undefined,\n          scope: typeof result.payload.scope === 'string' ? result.payload.scope : undefined,\n          claims: result.payload as Record<string, unknown>,\n        };\n      },\n    },\n  }),\n  (req, res) => {\n    res.json({\n      subject: req.auth?.subject,\n      sessionId: req.auth?.sessionId,\n      scope: req.auth?.scope,\n    });\n  },\n);\n"
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
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "onAuthContext"
      }), " is a pre-", (0,jsx_runtime.jsx)(_components.code, {
        children: "next()"
      }), " veto hook, not a post-commit notification:\nwhen it throws, downstream middleware never runs and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "req.auth"
      }), " is detached\nbefore the error response is sent. A valid token plus a failing hook never\nsurfaces as an invalid-token ", (0,jsx_runtime.jsx)(_components.code, {
        children: "401"
      }), ": a forwarded controlled package error keeps\nits own status/code/client message (only a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "401"
      }), " veto carries the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Bearer"
      }), "\nchallenge), while any other hook error becomes a sanitized ", (0,jsx_runtime.jsx)(_components.code, {
        children: "500 OIDC_VAULT_AUTH_CONTEXT_FAILED"
      }), " without leaking the original message. Pass\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "onError"
      }), " to observe original extraction/token/proof/nonce/replay/hook errors for private server-side logs; it never affects the sanitized client response. Successful hooks cannot replace security-owned token/confirmation/binding; vetoes detach req.auth and keep replay reservations. API middleware responses carry no-store."]
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
        children: "import {\n  createOidcVaultAccessTokenMiddleware,\n  createOidcVaultJwtAccessTokenValidator,\n} from '@web-ts-toolkit/express-oidc-vault';\n\nconst requireSigningKey = (raw: string | undefined): Uint8Array => {\n  if (!raw) {\n    throw new Error('APP_JWT_SECRET must be set to a strong random value at least 32 bytes long.');\n  }\n\n  const key = new TextEncoder().encode(raw);\n\n  if (key.length < 32) {\n    throw new Error('APP_JWT_SECRET must decode to at least 32 bytes for HS256 local access tokens.');\n  }\n\n  return key;\n};\n\nconst jwtSecret = requireSigningKey(process.env.APP_JWT_SECRET);\n\napp.get(\n  '/api/me',\n  createOidcVaultAccessTokenMiddleware({\n    validator: createOidcVaultJwtAccessTokenValidator({\n      key: jwtSecret,\n      issuer: 'https://api.example.com',\n      audience: 'api-audience',\n      algorithms: ['HS256'],\n    }),\n  }),\n  (req, res) => {\n    res.json({\n      subject: req.auth?.subject,\n      sessionId: req.auth?.sessionId,\n      scope: req.auth?.scope,\n    });\n  },\n);\n"
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
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The JWT helper exposes validate(token) and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "validateWithRequest({ token, scheme, req })"
      }), ". It snapshots verified ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "cnf before mapClaims"
      }), ", discarding mapper-supplied confirmation/deviceBinding. An unbound legacy result omits confirmation; request-aware unbound is explicit null. Bound confirmation survives mapper removal and is rejected when DPoP is disabled. Supported cnf is exactly ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ jkt: '<canonical SHA-256 thumbprint>' }"
      }), "; malformed/null/unsupported cnf is an invalid token, never legacy. The helper verifies JWTs; the API middleware verifies possession."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "request-aware-api-policy-and-public-url",
      children: "Request-aware API policy and public URL"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Every API accepting bound JWTs needs createOidcVaultAccessTokenMiddleware with deviceBinding. Construction requires a callable ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "validateWithRequest"
      }), " (called for both Bearer/DPoP); custom verified JWT/introspection adapters return mandatory ", (0,jsx_runtime.jsx)(_components.code, {
        children: "confirmation: { jkt } | null"
      }), ". Adapters are trusted to report original binding independently of mapping. Omitted policy keeps the exact one-argument validate(token) legacy path, refusing any known bound confirmation. Optional accepts unbound Bearer but never upgrades it; required rejects unbound JWTs. Bound Bearer fails even with proof; DPoP presentation of an unbound JWT is invalid_token."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["API wire: ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "Authorization: DPoP <local-JWT>"
      }), " plus ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "DPoP: <fresh-proof-JWT>"
      }), ". Protected header ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ typ: 'dpop+jwt', alg: 'ES256', jwk: publicP256Jwk }"
      }), "; signed method/absolute htu/current integer iat/fresh jti and API ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ath = base64url(SHA-256(ASCII(token)))"
      }), ", plus nonce if challenged. Original verified cnf.jkt must match the proof's RFC 7638 thumbprint. Wrong key/signature/method/URL/hash/stale/replayed/duplicate proofs fail before req.auth/hooks/downstream. An optional unbound supplied proof also validates ath/nonce/replay without producing deviceBinding."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["API target is pinned ", (0,jsx_runtime.jsx)(_components.code, {
        children: "publicOrigin"
      }), " plus optional ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "publicPathPrefix"
      }), " plus the pathname of Express's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "req.originalUrl"
      }), ". Prefix is only for a public prefix stripped by a proxy; default empty, no query/fragment. For example publicPathPrefix ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/public"
      }), " with app route ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/api/me"
      }), " verifies ", (0,jsx_runtime.jsx)(_components.code, {
        children: "https://api.example.com/public/api/me"
      }), ". Do not add ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/api"
      }), " if Express already retains it. Vault proxies must preserve the configured public basePath. Host/Forwarded/X-Forwarded-* and trust proxy never select origin. Static origins require HTTPS except loopback HTTP development; strip query/fragment, normalize scheme/host/default port/dot/unreserved escapes, uppercase other percent escapes and preserve reserved ", (0,jsx_runtime.jsx)(_components.code, {
        children: "%2F"
      }), ". Origin-form ", (0,jsx_runtime.jsx)(_components.code, {
        children: "//host/path"
      }), " remains a path on the pinned origin."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "guarded-store-and-per-request-replay-contracts",
      children: "Guarded store and per-request replay contracts"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["All built-ins return ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "OidcVaultDeviceBindingStoreProvider"
      }), " (Mongo retains ready), requiring live getAuthorizationTransaction/getExchangeCode, atomic consumeAuthorizationTransactionIfMatches/consumeExchangeCodeIfMatches, getSessionRevocationContext and reserveDpopProof. They remain optional on the base custom bearer interface; either opt-in feature checks all six at construction. Getters are detached live snapshots, not locks. Match includes both ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ deviceBinding, browserBindingHash }"
      }), "; ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "null requires absence/undefined, not a wildcard or stored null"
      }), ". Valid shapes: legacy neither field, cookie-only hash, bound hash+key. Exchange also atomically matches expectedSessionId; mismatch leaves a live record available, matching races have one winner, and original consumes refuse guarded records. Rotation inherits omitted binding and rejects changing/removing it or enrolling an unbound lineage."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Revocation context resolves a live handle/unexpired alias to the currently live lineage's logical ID/provider/key, with no tokens/profile/metadata returned. Mixed/malformed lineage authority fails closed; aliases never authenticate refresh. Built-in logout uses it even with DPoP disabled, so bound aliases cannot downgrade."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Replay key is opaque ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dpop:v1:"
      }), " plus base64url SHA-256 of JSON([effectiveNamespace,jkt,jti]). Space is ", (0,jsx_runtime.jsx)(_components.code, {
        children: "['vault', normalizedBackendOrigin, normalizedBasePath, exactIssuer, exactClientId]"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "['api', normalizedPublicOrigin, replayNamespace]"
      }), "; static API label is 1–128 printable ASCII bytes. Never partition by instance/route/token/code/session or release after downstream failure. Core expiry is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "(iat + age + skew) × 1000"
      }), ", remaining TTL ≤360000ms including future skew. Invalid/expired/unsafe/fractional/overlong windows return false without allocation; duplicates return false without renewal before capacity checks. Matching windows/namespaces/store limits/secrets and synchronized clocks are required across instances. No implicit fallback exists."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Every provider has dpopReplayMaxEntries (positive safe integer, default ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "100000"
      }), ") shared per memory object/Redis prefix/paired Mongo replay collections. At capacity throw root OidcVaultDpopReplayCapacityError; never evict live state/fail open. Memory uses an indexed heap, Redis one cached EVALSHA/server TIME, Mongo transaction-serialized capacity plus a non-TTL expiry ledger (proof TTL cannot leak accounting). Admission reclaims at most ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "64"
      }), " expired entries plus the requested expired key; expired data can conservatively consume capacity. DPoP writes per proof/API request; Mongo's common admission is seven data commands plus commit with a shared contention row. These are work bounds, not latency/throughput guarantees. Full provider READMEs describe lifecycle/topology/durability costs."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "fixed-errors-challenges-and-nonces",
      children: "Fixed errors, challenges and nonces"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "HTTP"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Code"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Fixed message"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "401"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "OIDC_VAULT_MISSING_ACCESS_TOKEN"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Missing access token. (enabled API only)"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "401"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "OIDC_VAULT_DEVICE_BINDING_REQUIRED"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "A device-bound login is required."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "401"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "OIDC_VAULT_DPOP_REQUIRED"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "DPoP authentication is required."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "401"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "OIDC_VAULT_INVALID_DPOP_PROOF"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "DPoP proof validation failed."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "400"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "OIDC_VAULT_INVALID_BROWSER_BINDING"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Login browser binding validation failed."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "415"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_TYPE"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Login initiation requires a JSON request body."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "400 vault / 401 API"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "OIDC_VAULT_USE_DPOP_NONCE"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "A fresh DPoP nonce is required."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "503"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "OIDC_VAULT_DPOP_REPLAY_UNAVAILABLE"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "DPoP replay protection is unavailable."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "400"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "OIDC_VAULT_INVALID_FINGERPRINT"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Fingerprint signal is invalid."
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: "403"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "OIDC_VAULT_FINGERPRINT_REAUTH_REQUIRED"
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Browser recognition changed; sign in again."
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Source failures keep 403 OIDC_VAULT_UNTRUSTED_ORIGIN and route-specific fixed Login/Exchange/Refresh/Logout request origin is not trusted. Authenticated provider-error callback uses 400 OIDC_VAULT_CALLBACK_ERROR / OIDC callback failed. Browser JSON is only code/message, never raw claims/URLs/keys/provider diagnostics; original errors go privately to core hooks.onError or API onError (replay cause retained)."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For default ES256, API proof/downgrade errors use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DPoP error=\"invalid_dpop_proof\", algs=\"ES256\""
      }), "; invalid DPoP token/unbound DPoP use invalid_token, invalid Bearer/required-unbound Bearer use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Bearer error=\"invalid_token\""
      }), ". Missing optional credentials advertise ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Bearer, DPoP algs=\"ES256\""
      }), "; required only DPoP. Nonce uses ", (0,jsx_runtime.jsx)(_components.code, {
        children: "DPoP error=\"use_dpop_nonce\", algs=\"ES256\""
      }), ". No error_description; non-401 failures have no auth challenge. Disabled legacy parser/errors remain compatible."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Nonce is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "off by default"
      }), "; enable with shared random Uint8Array of at least 32 bytes, lifetime default 60s/integer 1–300. Stateless versioned HMAC-SHA-256 challenges include 128 random bits, issue/expiry, namespace digest and jkt, max 512 bytes, no per-client nonce storage. Any authentic live issued nonce works for parallel fresh proofs; not single-use/latest-only, and normal iat/JTI replay still apply. After other valid target/key/token/cookie checks, missing/expired/wrong nonce challenges ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "before reservation/mutation/upstream"
      }), ": one DPoP-Nonce, fixed 400 vault POST/401 API. Vault 400 has no auth challenge; API 401 has use_dpop_nonce. Headerless callback/no-proof unbound are excluded. Cache per space/key and retry once with new proof/JTI/iat/signature; repeated challenge stops. Secret rotation causes a new challenge, with no previous-secret list. All responses carry no-store."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "hook-examples",
      children: "Hook Examples"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Hooks let the app observe or extend the OIDC flow without forking the middleware."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createHmac } from 'node:crypto';\n\nconst auditKey = new TextEncoder().encode(process.env.APP_AUDIT_KEY ?? '');\n\n// Purpose-specific keyed fingerprint for audit logs. Never log the raw\n// refresh-session ID: it is a credential that redeems a new session.\nconst fingerprintSessionId = (sessionId: string | undefined): string | undefined => {\n  if (!sessionId || auditKey.length === 0) {\n    return undefined;\n  }\n\n  return createHmac('sha256', auditKey).update(sessionId, 'utf8').digest('hex').slice(0, 16);\n};\n\n// Query-free route label. Never log `req.originalUrl`: callback and frontend\n// URLs can carry `code`, `state`, or tokens in the query string.\nconst queryFreeRoute = (req: { method?: string; path?: string }): string =>\n  `${req.method ?? 'UNKNOWN'} ${req.path ?? 'unknown'}`;\n\n// Selected sanitized error fields. Never log the arbitrary error object or its\n// message: provider, store, and hook errors may carry secrets or token bodies.\nconst sanitizeErrorForLog = (error: unknown): { code: string; status?: number } => {\n  if (typeof error === 'object' && error !== null && 'code' in error) {\n    const { code, status } = error as { code?: unknown; status?: unknown };\n\n    return {\n      code: typeof code === 'string' ? code : 'UNKNOWN',\n      ...(typeof status === 'number' ? { status } : {}),\n    };\n  }\n\n  return { code: 'UNKNOWN' };\n};\n\ncreateOidcVaultMiddleware({\n  basePath: '/auth/oidc',\n  backendOrigin: 'https://api.example.com',\n  config: {\n    issuer: process.env.OIDC_ISSUER,\n    clientId: process.env.OIDC_CLIENT_ID,\n    clientSecret: process.env.OIDC_CLIENT_SECRET,\n  },\n  frontendRedirectUri: 'https://frontend.example.com/callback',\n  storeProvider: createMemoryOidcVaultStore(),\n  hooks: {\n    async onLoginStart({ req }) {\n      console.log('OIDC login started', {\n        ip: req.ip,\n        userAgent: req.get('user-agent'),\n      });\n    },\n    async onSessionCreated({ session }) {\n      if (!session?.user) {\n        return;\n      }\n\n      await upsertLocalUser({\n        oidcSubject: session.subject,\n        email: typeof session.user.email === 'string' ? session.user.email : undefined,\n        displayName: typeof session.user.name === 'string' ? session.user.name : undefined,\n      });\n    },\n    async onSessionRefreshed({ session, metadata }) {\n      console.log('OIDC session rotated', {\n        previousSession: fingerprintSessionId(\n          typeof metadata?.previousSessionId === 'string' ? metadata.previousSessionId : undefined,\n        ),\n        nextSession: fingerprintSessionId(session?.sessionId),\n      });\n    },\n    async onLogout({ session, metadata }) {\n      console.log('OIDC logout completed', {\n        subject: session?.subject,\n        revokedSessions: metadata?.revokedSessions,\n      });\n    },\n    async onError({ error, route, req }) {\n      console.error('OIDC vault error', {\n        route,\n        path: queryFreeRoute(req),\n        ...sanitizeErrorForLog(error),\n      });\n    },\n  },\n});\n\nasync function upsertLocalUser(input: { oidcSubject: string; email?: string; displayName?: string }): Promise<void> {\n  console.log('upsertLocalUser', input);\n}\n"
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
        }), " shape; original provider/store/hook/issuer diagnostics reach private hooks.onError, while separate API extraction/token/proof/nonce/replay/hook diagnostics reach API onError. Private observers are not automatic log redaction."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "session-identity-and-store-namespaces",
      children: "Session Identity And Store Namespaces"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Exchange, refresh and logout compare every stored provider.issuer/clientId that is defined against resolved config; built-in logout also checks surviving lineage authority through unexpired aliases. Each field matches independently/verbatim, without URL normalization; issuer trailing-slash variants are distinct. Config strings still trim at construction."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["A known mismatch returns HTTP 401 with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{\"code\":\"OIDC_VAULT_INVALID_SESSION\",\"message\":\"Session is missing or expired.\"}"
      }), " before discovery, upstream token use, local issuance, lifecycle hooks, rotation, or lineage deletion. It neither sets nor clears a cookie and produces no provider logout redirect. The normal ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onError"
      }), " observer runs without the foreign session in its context."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Legacy sessions with absent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "provider"
      }), ", an empty provider object, or omitted/undefined identity fields remain supported. Only known fields are checked: an omitted issuer permits cross-issuer use, an omitted client ID permits cross-client use, and entirely absent identity permits both. Refresh does not backfill identity."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "For complete identity isolation use separate session/alias, exchange-code and transaction namespaces. Opt-in/guarded exchange preflights identity before code consumption; built-in live/alias logout checks identity before deletion. Disabled genuinely legacy bearer exchange retains consume-before-identity ordering, so a rejected foreign legacy code can still be spent. Old custom bearer stores without revocation context retain historical alias deletion; they cannot opt into DPoP. Absent identity remains compatibility, not isolation."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "rotation-alias-retention",
      children: "Rotation alias retention"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Session rotation preserves the logical session ID when the next session omits one. Rotation aliases are a finite bridge for in-flight requests: each old ID revokes its lineage only until its immediate successor's ", (0,jsx_runtime.jsx)(_components.code, {
        children: "expiresAt"
      }), "; later rotations do not extend earlier aliases. After that window, use the live ID or a scoped ", (0,jsx_runtime.jsx)(_components.code, {
        children: "deleteSessionsByLogicalSessionId"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "deleteSessionsBySubject"
      }), " / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "deleteSessionsByProviderSessionId"
      }), " call. An explicitly changed logical ID moves the new alias to that lineage; earlier aliases keep their previous lineage."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Without successor ", (0,jsx_runtime.jsx)(_components.code, {
        children: "expiresAt"
      }), ", memory and Redis impose no alias time limit and can accumulate arbitrarily many aliases; MongoDB uses ", (0,jsx_runtime.jsx)(_components.code, {
        children: "rotatedSessionAliasRetentionMs"
      }), " (default 5 minutes). Memory eagerly retires inactive old-lineage aliases on rotation/upsert; MongoDB/Redis can retain them until expiry or explicit cleanup. Use distinct logical IDs for unrelated login families. Core refresh uses the live ID and preserves expiry. This retains the ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/main/docs/tasks/20260908-130120-oidc-vault-stores-health-follow-up.md#task-svh-05-decide-a-portable-rotation-alias-lifetime-contract",
        children: "SVH-05 decision"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Scoped/direct deletion preserves unexpired aliases while a live member survives, including another provider scope. Bulk counts exclude alias cleanup; memory excludes expired sessions, MongoDB can count expired rows awaiting TTL cleanup, and Redis counts actual primary deletions during one cursor traversal. MongoDB scoped deletion repeats until an empty query. Later arrivals can survive and errors can follow committed deletion; counts do not prove an empty scope. Portable plain-object/array inputs are snapshotted at invocation; opaque native objects retain backend-specific serialization without portable mutation isolation. See the shipped store READMEs for client lifecycle, safe diagnostics, and actual resource bounds (SCAN COUNT is a hint, not a cap)."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "known-browser-and-concurrency-limits",
      children: "Known Browser And Concurrency Limits"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Legacy browser binding:"
        }), " unbound GET flows retain the transferred-callback/session-swap and stolen-unused-code risks in both transports. Legacy exchange accepts forms with no source check. Opt-in POST callback/guarded exchange authenticate the temporary cookie; bound exchange/refresh/logout/API additionally require the original key. CORS/cookie refresh source checks do not supply legacy browser binding."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Refresh families:"
        }), " local atomic rotation allows one winner, but overlapping requests can send the same upstream refresh token multiple times, including across backend instances. A single-use provider with reuse detection can revoke the entire upstream refresh family, leaving the local winner unable to refresh. Deduplicate frontend refreshes, including bootstrap and retry paths; a per-context promise is not a distributed guarantee."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Cookie ordering:"
        }), " a loser reaching a local rotation conflict (or a stale missing-session retry) clears the cookie. A late clear can erase the winner's cookie even while its server session remains live. Upstream-failure losers do not set a cookie. Response ordering is not enforced."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Logout and stateless tokens:"
        }), " local/provider/backchannel logout revoke vault refresh sessions, not outstanding stateless application access tokens. Those remain valid until their own expiry unless your validator checks application revocation state. A refresh racing logout can still return 200 and an access token after its lineage is deleted. Keep local tokens short-lived; immediate API revocation requires application-owned validation state. Vault-session expiry likewise does not revoke an already-issued stateless token."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Browser-bound proofs (BOV-02-FU1) are implemented for opt-in POST lifecycle and bound refresh/logout/API; the private app implements persistent keys and real-browser coordination. Cross-instance refresh lease (BOV-03-FU1) and stale-cookie ordering (BOV-03-FU2) remain separate ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/main/docs/tasks/20260908-070811-express-oidc-vault-boundary-review.md",
        children: "boundary-review follow-ups"
      }), ". Different honest fresh proofs outside one frontend partition can still race a single-use upstream family. DPoP/replay and browser locks do not establish a distributed lease or response ordering."]
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
        children: "in cookie mode keep the vault handle backend-only, including omitting it from JWT/profile claims"
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
        children: "POST login/exchange need temporary cookie credentials and trusted source in both transports, independent of CORS/DPoP"
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
        children: "every accepting API must enforce request-aware original-key DPoP, pinned public origin/prefix and shared replay; never reuse proofs/fall back to Bearer"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "non-extractable IndexedDB keys bind a browser profile, not hardware; XSS can still invoke same-browser signing, and proofs do not sign bodies/query strings"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "logout revokes refresh lineage, not stateless JWTs; immediate API revocation requires validator-owned state"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "disclose fingerprint recognition/retention; it is copyable non-PoP and hashing is not anonymization"
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

/***/ 2608
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  A: () => (/* binding */ TabItem)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/index.js
var react = __webpack_require__(2990);
// EXTERNAL MODULE: ./node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
var clsx = __webpack_require__(3526);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._d351382fa164602fcc676fe5d3a173bd/node_modules/@docusaurus/theme-common/lib/utils/tabsUtils.js
var tabsUtils = __webpack_require__(6825);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/styles.module.css
// extracted by mini-css-extract-plugin
/* harmony default export */ const styles_module = ({"tabItem":"tabItem_AjYd"});
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js
/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */function TabItemPanel({children,className,hidden}){return/*#__PURE__*/(0,jsx_runtime.jsx)("div",{role:"tabpanel",className:(0,clsx/* default */.A)(styles_module.tabItem,className),hidden,children:children});}function TabItem({children,className,value}){const{selectedValue,lazy}=(0,tabsUtils/* useTabs */.uc)();const isSelected=value===selectedValue;// TODO Docusaurus v4: use <Activity> ?
if(!isSelected&&lazy){return null;}return/*#__PURE__*/(0,jsx_runtime.jsx)(TabItemPanel,{className:className,hidden:!isSelected,children:children});}

/***/ },

/***/ 5430
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  A: () => (/* binding */ Tabs)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/index.js
var react = __webpack_require__(2990);
// EXTERNAL MODULE: ./node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
var clsx = __webpack_require__(3526);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._d351382fa164602fcc676fe5d3a173bd/node_modules/@docusaurus/theme-common/lib/utils/ThemeClassNames.js
var ThemeClassNames = __webpack_require__(9137);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._d351382fa164602fcc676fe5d3a173bd/node_modules/@docusaurus/theme-common/lib/utils/tabsUtils.js
var tabsUtils = __webpack_require__(6825);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-common@3.10.2_@docusaurus+plugin-content-docs@3.10.2_@mdx-js+react@3._d351382fa164602fcc676fe5d3a173bd/node_modules/@docusaurus/theme-common/lib/utils/scrollUtils.js
var scrollUtils = __webpack_require__(234);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+core@3.10.2_@mdx-js+react@3.1.1_@types+react@19.3.0_react@19.3.0__clean-css_2cb997e804faf8cfe5cbdf831cf9efd3/node_modules/@docusaurus/core/lib/client/exports/useIsBrowser.js
var useIsBrowser = __webpack_require__(1419);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/styles.module.css
// extracted by mini-css-extract-plugin
/* harmony default export */ const styles_module = ({"tabList":"tabList_cAVk","tabItem":"tabItem_BqLW"});
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
;// ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js
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

/***/ 6825
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   OC: () => (/* binding */ useTabsContextValue),
/* harmony export */   O_: () => (/* binding */ TabsProvider),
/* harmony export */   uc: () => (/* binding */ useTabs),
/* harmony export */   vT: () => (/* binding */ sanitizeTabsChildren)
/* harmony export */ });
/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(2990);
/* harmony import */ var _docusaurus_router__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(8029);
/* harmony import */ var _docusaurus_useIsomorphicLayoutEffect__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(6009);
/* harmony import */ var _docusaurus_theme_common_internal__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(2911);
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(8291);
/* harmony import */ var _index__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(3268);
/* harmony import */ var react_jsx_runtime__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(4686);
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