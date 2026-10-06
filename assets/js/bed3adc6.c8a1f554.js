"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[79],{

/***/ 9490
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_express_oidc_vault_mongodb_store_md_bed_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-express-oidc-vault-mongodb-store-md-bed.json
const site_docs_packages_express_oidc_vault_mongodb_store_md_bed_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/express-oidc-vault-mongodb-store","title":"@web-ts-toolkit/express-oidc-vault-mongodb-store","description":"MongoDB-backed store provider for @web-ts-toolkit/express-oidc-vault.","source":"@site/docs/packages/express-oidc-vault-mongodb-store.md","sourceDirName":"packages","slug":"/packages/express-oidc-vault-mongodb-store","permalink":"/docs/packages/express-oidc-vault-mongodb-store","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":9,"frontMatter":{"sidebar_label":"OIDC Vault MongoDB Store","sidebar_position":9},"sidebar":"packagesSidebar","previous":{"title":"OIDC Vault Redis Store","permalink":"/docs/packages/express-oidc-vault-redis-store"},"next":{"title":"Overview","permalink":"/docs/packages/access-router/"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.3.0_react@19.3.0/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(3191);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(5430);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.3.0_clean-css@5.3.3_cssnano@6.1.2_post_c44c21a2aff2f66b8f5ad01a9453139c/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(2608);
;// ./docs/packages/express-oidc-vault-mongodb-store.md


const frontMatter = {
	sidebar_label: 'OIDC Vault MongoDB Store',
	sidebar_position: 9
};
const contentTitle = '@web-ts-toolkit/express-oidc-vault-mongodb-store';

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
  "value": "Custom collection names",
  "id": "custom-collection-names",
  "level": 3
}, {
  "value": "Behavior",
  "id": "behavior",
  "level": 2
}, {
  "value": "When To Use It",
  "id": "when-to-use-it",
  "level": 2
}, {
  "value": "API",
  "id": "api",
  "level": 2
}, {
  "value": "Guarded records and DPoP replay accounting",
  "id": "guarded-records-and-dpop-replay-accounting",
  "level": 2
}, {
  "value": "Operational Notes",
  "id": "operational-notes",
  "level": 2
}, {
  "value": "Security Notes",
  "id": "security-notes",
  "level": 2
}, {
  "value": "Scoped Deletion Indexes",
  "id": "scoped-deletion-indexes",
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
    ul: "ul",
    ...(0,lib/* useMDXComponents */.R)(),
    ...props.components
  };
  return (0,jsx_runtime.jsxs)(jsx_runtime.Fragment, {
    children: [(0,jsx_runtime.jsx)(_components.header, {
      children: (0,jsx_runtime.jsx)(_components.h1, {
        id: "web-ts-toolkitexpress-oidc-vault-mongodb-store",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/express-oidc-vault-mongodb-store"
        })
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["MongoDB-backed store provider for ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/express-oidc-vault"
      }), "."]
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
            children: "npm install @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-mongodb-store express mongodb\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-mongodb-store express mongodb\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-mongodb-store express mongodb\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add @web-ts-toolkit/express-oidc-vault @web-ts-toolkit/express-oidc-vault-mongodb-store express mongodb\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import express from 'express';\nimport { MongoClient } from 'mongodb';\nimport { createOidcVaultMiddleware } from '@web-ts-toolkit/express-oidc-vault';\nimport { createMongoOidcVaultStore } from '@web-ts-toolkit/express-oidc-vault-mongodb-store';\n\nconst app = express();\nconst mongo = new MongoClient(process.env.MONGODB_URI!);\n\nawait mongo.connect();\n\nconst storeProvider = createMongoOidcVaultStore({\n  db: mongo.db('app-auth'),\n});\n\nawait storeProvider.ready();\n\napp.use(\n  createOidcVaultMiddleware({\n    basePath: '/auth/oidc',\n    backendOrigin: 'https://api.example.com',\n    config: {\n      issuer: process.env.OIDC_ISSUER,\n      clientId: process.env.OIDC_CLIENT_ID,\n      clientSecret: process.env.OIDC_CLIENT_SECRET,\n    },\n    frontendRedirectUri: 'https://frontend.example.com/callback',\n    postLogoutRedirectUri: 'https://frontend.example.com/logged-out',\n    storeProvider,\n  }),\n);\n\nconst server = app.listen(3000);\n\nprocess.once('SIGTERM', async () => {\n  await new Promise<void>((resolve, reject) => {\n    server.close((error) => (error ? reject(error) : resolve()));\n  });\n  // Also settle store work started outside HTTP requests.\n  await mongo.close();\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For a store-only snippet without Express wiring, see the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Quick Start"
      }), " section in the package README."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "custom-collection-names",
      children: "Custom collection names"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "If your deployment needs explicit collection naming, pass the collection names up front:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const storeProvider = createMongoOidcVaultStore({\n  db: mongo.db('app-auth'),\n  authorizationTransactionsCollectionName: 'auth_oidc_transactions',\n  exchangeCodesCollectionName: 'auth_oidc_exchange_codes',\n  sessionsCollectionName: 'auth_oidc_sessions',\n  backchannelLogoutTokenJtisCollectionName: 'auth_oidc_backchannel_logout_jtis',\n  rotatedSessionAliasesCollectionName: 'auth_oidc_rotated_session_aliases',\n  dpopProofsCollectionName: 'auth_dpop_proofs',\n  dpopReplayCapacityCollectionName: 'auth_dpop_capacity',\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "behavior",
      children: "Behavior"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "uses seven distinct collections for transactions, codes, sessions, backchannel JTIs, aliases, DPoP proofs and replay capacity/accounting"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "creates TTL indexes on expiring records"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "checks expiration during relevant reads or consumes for authorization transactions, exchange codes, backchannel logout token JTIs, and rotated-session aliases so behavior does not depend only on MongoDB's background TTL monitor timing"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["stores session records by ", (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionId"
        }), " and replaces them during rotation"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["creates scoped compound indexes for ", (0,jsx_runtime.jsx)(_components.code, {
          children: "subject"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "providerSessionId"
        }), ", session ", (0,jsx_runtime.jsx)(_components.code, {
          children: "logicalSessionId"
        }), ", and rotated-alias ", (0,jsx_runtime.jsx)(_components.code, {
          children: "logicalSessionId"
        }), " so logout and backchannel logout queries can efficiently remove matching sessions and aliases"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "requires transactions for rotation, coherent revocation context, replay admission/accounting and alias cleanup; standalone fails readiness, replica-set behavior is tested, sharded/distributed-failure durability remains deployment-specific"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "readiness creates required indexes, validates collection names, and verifies transaction-capable topology before traffic is accepted"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["stores rotated-session aliases with finite expiry; sessions without explicit expiry use a 5 minute alias-retention window by default, configurable with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "rotatedSessionAliasRetentionMs"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "scoped/direct deletion preserves unexpired aliases while another live member survives, including another issuer/client scope; inactive-lineage cleanup follows committed deletion in a snapshot transaction, with rotation alias writes protected by conflicts/retries"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Each alias keeps its immediate successor's deadline; later rotations do not extend it. With ", (0,jsx_runtime.jsx)(_components.code, {
        children: "A/L1 -> B/L1 -> C/L2"
      }), ", B revokes L2 and retained A still targets L1. MongoDB can retain inactive old-lineage aliases after rotation/upsert until expiry or explicit cleanup; it also retains an alias under a reused create ID. Use fresh session IDs and distinct logical IDs for unrelated login families. Memory/Redis have no alias time limit without successor expiry; MongoDB uses the finite fallback above."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Portable JSON-compatible plain inputs are captured at invocation, and returned data is detached. Native BSON/opaque objects retain backend serialization semantics without a portable mutation-isolation guarantee. Subject/provider-session objects filter each supplied issuer/client; strings and logical IDs are unscoped. Bulk counts exclude aliases but can include expired rows awaiting TTL cleanup. Scoped deletion repeats until an empty query; continuous arrivals can prolong it and later arrivals can survive. Cleanup can reject after deletion committed. Queries materialize affected IDs/survivors and can form large ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$in"
      }), " sets; there is no global logout snapshot or fixed total-work bound."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The ", (0,jsx_runtime.jsx)(_components.a, {
        href: "https://github.com/egose/web-ts-toolkit/blob/main/packages/express-oidc-vault-mongodb-store/README.md",
        children: "shipped README"
      }), " contains the complete portable/lifecycle contract and compatibility notes."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "when-to-use-it",
      children: "When To Use It"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use MongoDB when:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "your team already standardizes on MongoDB"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "you want OIDC vault data in the same operational platform as the rest of the app"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Redis is not available or not preferred in your environment"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This is a strong fit when your application already depends on MongoDB operationally and you prefer to keep auth-vault data alongside the rest of your infrastructure."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "api",
      children: "API"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "createMongoOidcVaultStore(options)"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Creates a stronger core OidcVaultDeviceBindingStoreProvider with ready(). Named root imports, Node >=22.12.0 and TypeScript @types/node/@types/express. Both ESM/CJS declaration conditions are shipped."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "OidcVaultMongoStoreProvider"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "extends OidcVaultDeviceBindingStoreProvider"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "ready(): validates all seven collection names/indexes, transaction support, shared replay capacity and proof/accounting pairing; failed readiness rejects all operations"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "MongoOidcVaultStoreOptions"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "db"
        }), ": MongoDB database handle"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "authorizationTransactionsCollectionName?"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "exchangeCodesCollectionName?"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "sessionsCollectionName?"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "backchannelLogoutTokenJtisCollectionName?"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "rotatedSessionAliasesCollectionName?"
        })
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "dpopProofsCollectionName?"
        }), ": default oidc_vault_dpop_proofs, unique proof IDs/TTL"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "dpopReplayCapacityCollectionName?"
        }), ": default oidc_vault_dpop_replay_capacity, indexed non-TTL ledger/capacity"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "dpopReplayMaxEntries?"
        }), ": positive safe integer, default 100000, identical on shared clients"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "rotatedSessionAliasRetentionMs?"
        }), ": finite positive alias retention for sessions without explicit expiry, defaulting to 5 minutes"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "now?"
        }), ": override clock source for tests"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "guarded-records-and-dpop-replay-accounting",
      children: "Guarded records and DPoP replay accounting"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["All six stronger methods are live transaction/code getters, atomic guarded transaction/code consumes, getSessionRevocationContext and reserveDpopProof; shared types/capacity error are core-root exports. Either vault opt-in checks all six; fingerprint-only reserves no proofs. Getters are detached preflight, not locks. Match has both key/hash; null is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "absence only ($exists: false)"
      }), ", not wildcard/BSON null. Legacy neither, cookie-only hash, bound hash+key are valid; canonical SHA-256 43-character hashes required. Null/malformed/extra/key-without-hash rejects. Atomic findOneAndDelete matches expiry, key/hash and exchange expectedSessionId; mismatch leaves a live record and matching clients have one winner. Old consumes refuse guarded records. Rotation inherits original binding and checks source generation; changed/removed/new binding rejects. Explicit undefined security fields are omitted before BSON. Only omitted legacy provider/expiry BSON null normalizes on genuinely unbound old rows; null binding/hash never becomes legacy."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Revocation context uses a snapshot transaction and credential-free projections, returning only current live logical ID/provider/key through handles/unexpired aliases. Mixed/malformed authority throws; empty/expired lineage returns null, aliases never authenticate refresh. Whole-lineage reads are separate from replay bounds."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Shared replay is serialized by a capacity-row revision write in a snapshot transaction: unique proof IDs + at most ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "64"
      }), " expired indexed accounting rows plus requested expired key reclaimed, then proof/ledger/capacity committed together. No per-request full count/scan. Future safe-integer expiry, remaining TTL ≤360000ms required; invalid/expired returns false without allocation. Duplicates return false before capacity/no renewal; capacity throws core OidcVaultDpopReplayCapacityError → core 503 replay-unavailable, no live eviction/fail-open. Proof TTL deletion cannot leak capacity: the separate ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "non-TTL"
      }), " expiry ledger retains reclaimable evidence, and ready rejects TTL indexes on it. Shared clients must agree on collection pairing/max; names change namespace, not migration. Retained state is bounded by max proof rows + max ledger rows + one capacity row; expired ledger rows awaiting traffic conservatively occupy capacity."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Normal admission costs seven data commands + commit; duplicate capacity-write/proof-read/commit; cleanup/contention/retries add work. The shared row is a throughput contention point. Size for unique proofs/s × window (defaults max 70s), share clocks/windows/namespaces, never release after downstream failure. Driver transactions end sessions in finally. Atomic limits are not throughput/latency/durability certification; loss of live replay data on restore/failover weakens protection until its window expires."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "operational-notes",
      children: "Operational Notes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["startup order should be: connect the MongoDB client, create the store, await ", (0,jsx_runtime.jsx)(_components.code, {
          children: "storeProvider.ready()"
        }), ", then call ", (0,jsx_runtime.jsx)(_components.code, {
          children: "app.listen()"
        }), " or otherwise accept traffic"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "drain requests and other in-flight store operations before application-owned MongoDB client shutdown; this package never closes the client and ends its explicit transaction sessions on success/failure"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "TTL index cleanup in MongoDB is asynchronous, so the package also validates expiration during reads"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "rotated-session aliases are retained to bridge in-flight refresh/logout races after a session ID rotates; if a request uses a stale rotated ID after the alias expires, that stale ID no longer revokes the active logical session"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "readiness verifies the deployment reports transaction support before any store operation can run"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "standalone MongoDB servers without transactions cannot rotate sessions with this provider; migrate to a replica set or sharded deployment before enabling refresh flows"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "security-notes",
      children: "Security Notes"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Session records contain upstream bearer-equivalent secrets and private recognition metadata. Use TLS/least-privilege/encryption/backups/logging controls and explicit retention for all seven collections. DPoP constrains browser local JWT/session presentation, not a compromised upstream-token store."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Arbitrary backend errors are not sanitized for application logs. Use fixed operation names and allowlisted categories instead of raw errors, connection URLs, whole records or credential-valued metric labels."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This package does not implement application-level field encryption or client-side field-level encryption. Configure those at the MongoDB/client layer if your deployment requires them."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "scoped-deletion-indexes",
      children: "Scoped Deletion Indexes"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The sessions collection creates these deletion indexes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "subject_scope_idx"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ subject: 1, 'provider.issuer': 1, 'provider.clientId': 1 }"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "provider_session_scope_idx"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ providerSessionId: 1, 'provider.issuer': 1, 'provider.clientId': 1 }"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "logical_session_idx"
        }), ": ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ logicalSessionId: 1 }"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Representative ", (0,jsx_runtime.jsx)(_components.code, {
        children: "explain('executionStats')"
      }), " evidence used a dataset with 2 repeated identities, 10 issuers, 10 clients, and 10 duplicate sessions per issuer/client scope. With only single-field identity indexes, scoped delete lookups examined all 1,000 matching identity documents. With the compound indexes above, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "subject/providerSessionId + issuer"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "subject/providerSessionId + clientId"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "subject/providerSessionId + issuer + clientId"
      }), " examined 100, 100, and 10 documents respectively, matching the scoped result set size in that dataset."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The package creates one compound index per public scoped identity delete path rather than one index per optional-filter permutation. The leading identity key still supports identity-only deletes, while issuer/client scoped deletes avoid broad scans in multi-tenant collections. Very large deployments should still expect deletion cost to scale with the number of sessions being revoked inside the selected issuer/client scope."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "related-packages",
      children: "Related Packages"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./express-oidc-vault",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/express-oidc-vault"
          })
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
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