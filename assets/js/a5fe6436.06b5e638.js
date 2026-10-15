"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[283],{

/***/ 263
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_oidc_vault_dpop_client_md_a5f_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-oidc-vault-dpop-client-md-a5f.json
const site_docs_packages_oidc_vault_dpop_client_md_a5f_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/oidc-vault-dpop-client","title":"@web-ts-toolkit/oidc-vault-dpop-client","description":"Framework-agnostic browser sessions and scoped API fetch for","source":"@site/docs/packages/oidc-vault-dpop-client.md","sourceDirName":"packages","slug":"/packages/oidc-vault-dpop-client","permalink":"/docs/packages/oidc-vault-dpop-client","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":6.1,"frontMatter":{"sidebar_label":"OIDC Vault DPoP Client","sidebar_position":6.1},"sidebar":"packagesSidebar","previous":{"title":"Express OIDC Vault","permalink":"/docs/packages/express-oidc-vault"},"next":{"title":"OIDC Vault Memory Store","permalink":"/docs/packages/express-oidc-vault-memory-store"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.3.0_react@19.3.0/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(3191);
;// ./docs/packages/oidc-vault-dpop-client.md


const frontMatter = {
	sidebar_label: 'OIDC Vault DPoP Client',
	sidebar_position: 6.1
};
const contentTitle = '@web-ts-toolkit/oidc-vault-dpop-client';

const assets = {

};



const toc = [{
  "value": "Install and import",
  "id": "install-and-import",
  "level": 2
}, {
  "value": "Session and gateway example",
  "id": "session-and-gateway-example",
  "level": 2
}, {
  "value": "Recovery and limits",
  "id": "recovery-and-limits",
  "level": 2
}];
function _createMdxContent(props) {
  const _components = {
    a: "a",
    code: "code",
    h1: "h1",
    h2: "h2",
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
        id: "web-ts-toolkitoidc-vault-dpop-client",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/oidc-vault-dpop-client"
        })
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Framework-agnostic browser sessions and scoped API fetch for\n", (0,jsx_runtime.jsx)(_components.a, {
        href: "/docs/packages/express-oidc-vault",
        children: "Express OIDC Vault"
      }), ". The installed package ships a\nself-contained ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md",
        children: "README"
      }), "\nwith body/cookie quickstarts, API types, recovery tables and upgrade notes."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "install-and-import",
      children: "Install and import"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-sh",
        children: "pnpm add @web-ts-toolkit/oidc-vault-dpop-client\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "jose"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "idb"
      }), " are included dependencies. Browser code needs neither Express\nnor the backend package or Node ambient types. Strict DOM-only Bundler/NodeNext\nconsumers can use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "types: []"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "skipLibCheck: false"
      }), "; ESM/CJS declaration\nconditions are separate. Use named root imports, with no default/deep imports.\nNode tooling/import/require needs ", (0,jsx_runtime.jsx)(_components.strong, {
        children: ">=22.12.0"
      }), " for CJS ", (0,jsx_runtime.jsx)(_components.code, {
        children: "require(esm)"
      }), " of ", (0,jsx_runtime.jsx)(_components.code, {
        children: "jose"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Sessions require a secure context, Web Crypto, sessionStorage and IndexedDB\nCryptoKey persistence. Cookie transport also needs Web Locks + BroadcastChannel.\nImporting is safe before browser startup; construct one session per tab/mount\nwhen browser features are available. Match the vault's public origin/basePath\nand the APIs' replay namespaces; configure credentialed CORS exposing\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "DPoP-Nonce"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "WWW-Authenticate"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "session-and-gateway-example",
      children: "Session and gateway example"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import {\n  createOidcVaultDpopSession,\n  fetchWithDpop,\n  OidcVaultDpopClientError,\n  type DpopApi,\n} from '@web-ts-toolkit/oidc-vault-dpop-client';\n\nconst origin = 'https://gateway.example.com';\nconst session = createOidcVaultDpopSession({\n  backendOrigin: origin,\n  basePath: '/auth/oidc',\n  sessionTransport: 'body',\n  requestTimeoutMs: 15_000,\n  maxResponseBytes: 1_048_576,\n});\nconst apis: readonly DpopApi[] = [\n  { origin, pathPrefix: '/orders', replayNamespace: 'orders-api' },\n  { origin, pathPrefix: '/billing', replayNamespace: 'billing-api' },\n];\n\nexport const signIn = (): Promise<void> => session.login('/callback');\nexport const signOut = (): Promise<void> => session.logout();\n\nexport async function bootstrap(): Promise<'ready' | 'sign-in'> {\n  try {\n    const url = new URL(location.href);\n    const code = url.searchParams.get('code');\n    if (code !== null) {\n      url.searchParams.delete('code');\n      history.replaceState(null, '', url.href);\n      await session.exchange(code);\n    } else await session.refresh();\n    return 'ready';\n  } catch (error) {\n    if (error instanceof OidcVaultDpopClientError && error.requiresLogin) return 'sign-in';\n    throw error; // Retain recovery state; no automatic mutation retry.\n  }\n}\n\nexport function loadOrders(signal: AbortSignal): Promise<Response> {\n  return fetchWithDpop({ session, apis }, `${origin}/orders?limit=20`, { signal });\n}\n\n// Explicit recovery action for an unusable persisted key, followed by fresh login.\nexport async function recoverBrowserKey(): Promise<void> {\n  await session.resetKey();\n  await signIn();\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Select ", (0,jsx_runtime.jsx)(_components.code, {
        children: "cookie"
      }), " and the matching mount on both sides for cookie transport.\nLogin/exchange always include credentials for the temporary transaction cookie;\nrefresh/logout need no access JWT or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ath"
      }), ". Access JWTs stay memory-only, body\nhandles/pending login are tab-local sessionStorage, and cookie handles remain\nbackend HttpOnly cookies. Keys are scoped by frontend/backend/normalized mount."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "pathPrefix"
      }), " selects the longest normalized segment match: ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/orders"
      }), " excludes\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "/orders-evil"
      }), ". Omission or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "/"
      }), " permits the entire origin. Duplicate normalized\nscopes reject before auth work. Outbound paths and proofs normalize unreserved\nescapes/dot segments, retain reserved separators, and preserve query data in\nthe request. Distinct namespaces isolate gateway services' nonces."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "recovery-and-limits",
      children: "Recovery and limits"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Credentials:"
        }), " exact ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DPoP"
        }), ", canonical compact signed JWT, exact ", (0,jsx_runtime.jsx)(_components.code, {
          children: "cnf: { jkt }"
        }), ",\nsafe mandatory ", (0,jsx_runtime.jsx)(_components.code, {
          children: "exp"
        }), " seconds and safe lifetime arithmetic. Browser decoding\nchecks the response contract; APIs authenticate JWTs and same-key proofs.\nGeneric server unbound/opaque compatibility remains. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "expiresIn: 0"
        }), " retains\nrotation results but is not a live API/peer credential; API use stops with\nnon-terminal ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DPOP_ACCESS_TOKEN_EXPIRED"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Lifecycle:"
        }), " both transports use FIFO mutations; refresh sharing stops at\nintervening mutations. Cookie peers use same-origin locks and a 180 ms token\nwait. Superseded/disposed operations cannot restore old auth or clear newer\nlogin; ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DPOP_OPERATION_SUPERSEDED"
        }), " / ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DPOP_SESSION_DISPOSED"
        }), " are non-terminal."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Cleanup:"
        }), " ", (0,jsx_runtime.jsx)(_components.code, {
          children: "clear"
        }), " invalidates local auth/owned HTTP and keeps the key;\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "dispose"
        }), " closes the context and preserves committed reload state; ", (0,jsx_runtime.jsx)(_components.code, {
          children: "resetKey"
        }), "\ndeletes only scoped key/metadata without backend work. Await clear/reset before\nteardown when persistence must finish. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "logout"
        }), " requests server revocation.\nA corrupt key needs explicit reset-then-login; no implicit replacement occurs.\nOld sessions/JWTs remain until revocation/expiry and other users of that key\nneed fresh login. The historical ", (0,jsx_runtime.jsx)(_components.code, {
          children: "oidc-vault-dpop-example-v1"
        }), " DB is retained."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "HTTP:"
        }), " vault attempts default to 15,000 ms through headers/body/JSON and\n1 MiB of streamed bytes. Queue/storage/crypto/recognition/other locks are outside\nthat deadline; timers cannot preempt synchronous work or suspended tabs.\nAPI/proof signals stop waits, not already-started crypto or shared refresh.\nAPI bodies remain caller-owned. Abort is not rollback of server mutation or\nSet-Cookie; a lost rotation response can require login. No network/timeout retry."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Nonces:"
        }), " learn valid success/final/single-attempt headers into a 64-tuple\noldest-remembered cache, with no inferred TTL. A later explicit mutation may\nuse that nonce. Vaults retry once then throw ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DPOP_NONCE_RETRY_EXHAUSTED"
        }), ";\nretry-enabled APIs allow one nonce retry and one ", (0,jsx_runtime.jsx)(_components.code, {
          children: "invalid_token"
        }), " refresh budget.\nEvery attempt needs a fresh proof/JTI; mutations remain single-attempt unless\nthe server operation has an explicit idempotency contract. Final API responses\nbelong to the caller."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Errors:"
        }), " ", (0,jsx_runtime.jsx)(_components.code, {
          children: "requiresLogin"
        }), " identifies terminal session/key/browser-binding/\nenrolled recognition errors, not every 401. Proof/nonce/transient failures keep\nauth; unknown server codes become fixed ", (0,jsx_runtime.jsx)(_components.code, {
          children: "OIDC_REQUEST_FAILED"
        }), ". Recognition is\noptional change detection, never proof of possession or an API sender constraint."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Same-origin browser coordination is not a distributed refresh lease. Recorded\nChromium/Firefox evidence uses same-site loopback; Safari/WebKit and arbitrary\ncross-site HTTPS/third-party-cookie policy need deployment-specific checks.\nSee the shipped ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/main/packages/oidc-vault-dpop-client/README.md#upgrade-notes",
        children: "upgrade notes"
      }), "\nand runnable ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/main/apps/oidc-vault-dpop-example/README.md",
        children: "TypeScript SPA"
      }), "\nfor full contracts and commands."]
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