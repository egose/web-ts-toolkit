"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[498],{

/***/ 9146
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_create_access_router_mongo_starter_md_6bc_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-create-access-router-mongo-starter-md-6bc.json
const site_docs_packages_create_access_router_mongo_starter_md_6bc_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/create-access-router-mongo-starter","title":"create-access-router-mongo-starter","description":"Starter CLI for scaffolding a MongoDB-backed access-router + React application.","source":"@site/docs/packages/create-access-router-mongo-starter.md","sourceDirName":"packages","slug":"/packages/create-access-router-mongo-starter","permalink":"/docs/packages/create-access-router-mongo-starter","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":19,"frontMatter":{"sidebar_label":"Create Access Router Starter","sidebar_position":19},"sidebar":"packagesSidebar","previous":{"title":"PDF Reader","permalink":"/docs/packages/pdf-reader"},"next":{"title":"JSON Frame","permalink":"/docs/packages/json-frame"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(7008);
;// ./docs/packages/create-access-router-mongo-starter.md


const frontMatter = {
	sidebar_label: 'Create Access Router Starter',
	sidebar_position: 19
};
const contentTitle = 'create-access-router-mongo-starter';

const assets = {

};



const toc = [{
  "value": "What It Exposes",
  "id": "what-it-exposes",
  "level": 2
}, {
  "value": "Quick Start",
  "id": "quick-start",
  "level": 2
}, {
  "value": "Dry run",
  "id": "dry-run",
  "level": 3
}, {
  "value": "Overwrite an existing target",
  "id": "overwrite-an-existing-target",
  "level": 3
}, {
  "value": "Published Binaries",
  "id": "published-binaries",
  "level": 2
}, {
  "value": "Options",
  "id": "options",
  "level": 2
}, {
  "value": "What It Does",
  "id": "what-it-does",
  "level": 2
}, {
  "value": "Starter Shape",
  "id": "starter-shape",
  "level": 2
}, {
  "value": "Template layout",
  "id": "template-layout",
  "level": 3
}, {
  "value": "Typical Flow",
  "id": "typical-flow",
  "level": 2
}, {
  "value": "Deployment Helpers",
  "id": "deployment-helpers",
  "level": 2
}, {
  "value": "Netlify CLI prerequisite",
  "id": "netlify-cli-prerequisite",
  "level": 3
}, {
  "value": "Credential and child-process boundary",
  "id": "credential-and-child-process-boundary",
  "level": 3
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
    blockquote: "blockquote",
    code: "code",
    h1: "h1",
    h2: "h2",
    h3: "h3",
    header: "header",
    li: "li",
    ol: "ol",
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
        id: "create-access-router-mongo-starter",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "create-access-router-mongo-starter"
        })
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Starter CLI for scaffolding a MongoDB-backed ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), " + React application."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.blockquote, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.p, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Public demo boundary:"
        }), " generated apps intentionally allow anonymous Todo\nand Category reads and writes. They are not production-safe authentication\nskeletons. Production Netlify deploys require\n", (0,jsx_runtime.jsx)(_components.code, {
          children: "--acknowledge-public-demo"
        }), "; this acknowledgement is a warning gate, not an\nabuse control. Configure host rate limits/WAF and bot controls, function and\nspend limits, monitoring/alerts, and MongoDB resource limits before sharing a\ndemo publicly."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Unlike the library packages in this workspace, this one is a create-style CLI. It copies a bundled template into a target directory, rewrites app placeholders, and prints the next steps for local development and deployment."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-exposes",
      children: "What It Exposes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "create-access-router-mongo-starter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "create-access-router-mongo-starter-deploy-netlify"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "create-access-router-mongo-starter-deploy-shared"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The main binary scaffolds the starter app. The deploy-helper binaries support the packaged deployment flow used by the generated starter."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "# npx downloads and runs the published package automatically\nnpx create-access-router-mongo-starter ./apps/my-app --name my-app\n\n# npm 7+ shorthand\nnpm create access-router-mongo-starter ./apps/my-app --name my-app\n\n# pnpm shorthand\npnpm create access-router-mongo-starter ./apps/my-app --name my-app\n\n# interactive mode\nnpx create-access-router-mongo-starter -i\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "dry-run",
      children: "Dry run"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "npx create-access-router-mongo-starter ./apps/my-app --name my-app --dry-run\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use this to inspect the planned file operations and placeholder substitutions before writing anything."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "overwrite-an-existing-target",
      children: "Overwrite an existing target"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "npx create-access-router-mongo-starter ./apps/my-app --name my-app --force\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "published-binaries",
      children: "Published Binaries"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "create-access-router-mongo-starter"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "create-access-router-mongo-starter-deploy-netlify"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "create-access-router-mongo-starter-deploy-shared"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The main binary scaffolds the app. The deploy-helper binaries are emitted as part of the published package so workspace-level deployment flows can reuse the same packaged scripts."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "options",
      children: "Options"
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Flag"
          }), (0,jsx_runtime.jsx)(_components.th, {
            children: "Description"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "<target-dir>"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Where to scaffold the app"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "--name <name>"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Lowercase npm package name (scopes allowed)"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "--title <title>"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Free-form display title"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "--db-name <name>"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "MongoDB database name"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "--force"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Overwrite the target directory if it exists"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "--dry-run"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Print actions without writing files"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "-i, --interactive"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Prompt for missing values"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "-h, --help"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            children: "Show help"
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-does",
      children: "What It Does"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ol, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Copies the bundled starter template into the target directory."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Rewrites an explicit operational-file manifest with JSON, TypeScript/JSX,\nHTML, Markdown, and URI-aware serialization; all other files are copied as\nbytes."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Leaves you with a ready-to-install app skeleton for local development."
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "Prints next steps, including the exact pinned dev install needed for deployment helpers."
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The published package stages the template into ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dist/template/"
      }), ", so the CLI works after install without depending on the source workspace layout."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The scaffold step skips workspace-only output such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "node_modules"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dist"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".env"
      }), " files. It preserves a release-generated ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pnpm-lock.yaml"
      }), " synchronized with the staged manifest, including the direct ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/access-router-runtime"
      }), " dependency."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Generated projects declare Node ", (0,jsx_runtime.jsx)(_components.code, {
        children: ">=22.12.0"
      }), " and pnpm ", (0,jsx_runtime.jsx)(_components.code, {
        children: "11.18.0"
      }), ". Install with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pnpm install --frozen-lockfile"
      }), "; this detects manifest/lock drift instead of silently resolving a different dependency set. The source template has no committed lockfile because its internal dependency versions are placeholders; release staging stamps the release version and generates the lockfile included in the package."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Package names must satisfy npm's lowercase scoped or unscoped naming contract\nand be at most 214 characters. Database names must be 1-63 UTF-8 bytes and\nexclude MongoDB's forbidden punctuation, spaces, and control characters. A\nscoped package defaults to its unscoped segment for the database name, with\ndots changed to hyphens. Unicode display titles are supported and escaped for\neach output syntax. The CLI rejects unresolved release versions and operational\ntokens before replacing the destination; literal examples in maintainer docs\nare intentionally preserved."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "starter-shape",
      children: "Starter Shape"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The template includes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["an Express + ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access-router"
        }), " + Mongoose backend"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "a Vite + React frontend"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "test files and starter package metadata"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "deployment-oriented helper flows for shared and Netlify packaging"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The generated backend shares browser-safe Zod entity schemas between request\nDTOs, form validation, and authoritative server validation. String inputs are\ntrimmed and bounded, colors require six-digit hex notation, and IDs require the\nMongoDB ObjectId shape before model operations run. The basic route surface\nincludes ordinary CRUD only: root batches are not mounted and advanced\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "__mutation"
      }), " writes are blocked with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "404"
      }), ". The generated README explains that\nadvanced opt-in requires the same entity schemas on every write path plus\nexplicit bulk and concurrency bounds; public root writes must not be enabled\nwith an unconditional guard."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Ordinary lists are capped at 100 records and use deterministic default sorts.\nAdvanced lists accept only documented exact-match filters backed by Category,\nTodo category, and Todo completion indexes; caller-provided sorts are rejected.\nCategory names are trim-normalized and exact case-sensitive unique. Todo writes\nrequire the referenced Category to exist, and deleting a referenced Category\nreturns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "409"
      }), ". Transaction-scoped category locks preserve that policy under\nracing requests, so the MongoDB service must support transactions through a\nreplica set or sharded deployment."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The generated runtime requires a valid nonblank ", (0,jsx_runtime.jsx)(_components.code, {
        children: "MONGODB_URI"
      }), " before local\nlisten or serverless handling. Its access-router response boundary maps request\nvalidation and Mongoose cast/validation failures to stable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "400"
      }), " responses,\nduplicate-key conflicts to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "409"
      }), ", and unknown failures to a generic ", (0,jsx_runtime.jsx)(_components.code, {
        children: "500"
      }), "\nwithout exposing persistence details. Server diagnostics are structured and\nexclude credentials, rejected request bodies, and stack traces."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["This package is a good fit when you want a copyable baseline instead of manually wiring ", (0,jsx_runtime.jsx)(_components.code, {
        children: "access-router"
      }), ", runtime configuration, and frontend setup from scratch."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "template-layout",
      children: "Template layout"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-text",
        children: "create-access-router-mongo-starter/\n  src/\n    cli.ts\n  scripts/\n    stage-template.ts\n    deploy-shared.ts\n    deploy-netlify.ts\n  template/\n    api/\n    src/\n    tests/\n    package.json\n  dist/\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["At publish time, the template is staged into ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dist/template/"
      }), " so installed consumers can scaffold without access to the source repo layout."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "typical-flow",
      children: "Typical Flow"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "npx create-access-router-mongo-starter ./apps/acme-admin --name acme-admin --db-name acme_admin\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Then move into the generated app, run ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pnpm install --frozen-lockfile"
      }), ", configure environment variables, and start local development using the generated package scripts."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you want the CLI to prompt for any missing values instead of passing everything on the command line, use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "-i"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "--interactive"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "deployment-helpers",
      children: "Deployment Helpers"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The package also ships helper binaries used by the starter's deployment workflow:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "create-access-router-mongo-starter-deploy-shared"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "create-access-router-mongo-starter-deploy-netlify"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Those are mainly for the generated starter's deployment flow rather than day-one scaffolding, but they are packaged so a generated app can install the exact generator version as a dev dependency and run the same released deploy helpers."
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "netlify-cli-prerequisite",
      children: "Netlify CLI prerequisite"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "create-access-router-mongo-starter-deploy-netlify"
      }), " shells out to the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "netlify"
      }), " CLI to perform the actual deploy. The ", (0,jsx_runtime.jsx)(_components.code, {
        children: "netlify-cli"
      }), " package is ", (0,jsx_runtime.jsx)(_components.strong, {
        children: "not"
      }), " bundled as a runtime dependency (it pulled a ~30k-file transitive tree that bloated the published artifact). Instead the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "netlify"
      }), " binary must be resolvable on ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PATH"
      }), " when you run the deploy helper:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "npm install -g netlify-cli\n# or, per project: pnpm add -D netlify-cli   (the binary lands in node_modules/.bin)\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Verify with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "netlify --version"
      }), " before running the deploy bin. The deploy helper bails with a clear error if ", (0,jsx_runtime.jsx)(_components.code, {
        children: "netlify"
      }), " is missing."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "credential-and-child-process-boundary",
      children: "Credential and child-process boundary"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Set ", (0,jsx_runtime.jsx)(_components.code, {
        children: "NETLIFY_AUTH_TOKEN"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "MONGODB_URI"
      }), " through a secure prompt or CI secret\nmanager, then invoke the deploy helper without credential arguments:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-bash",
        children: "pnpm add -D create-access-router-mongo-starter@<generator-version> netlify-cli\n\nexport NETLIFY_AUTH_TOKEN\nexport MONGODB_URI\npnpm exec create-access-router-mongo-starter-deploy-netlify --site <name-or-id> --prod --paid-tier --acknowledge-public-demo\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The Netlify CLI receives authentication through ", (0,jsx_runtime.jsx)(_components.code, {
        children: "NETLIFY_AUTH_TOKEN"
      }), ", never an\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "--auth"
      }), " argument. The frontend build and deploy process receive no Mongo URI;\nonly the backend build receives ", (0,jsx_runtime.jsx)(_components.code, {
        children: "MONGODB_URI"
      }), ". Each child starts from a small\nallowlist of platform essentials (", (0,jsx_runtime.jsx)(_components.code, {
        children: "PATH"
      }), ", Windows system paths, home/temp\npaths, locale/timezone, terminal/color, and CI indicators), not the complete\nparent environment."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "API_BASE_URL"
      }), " is one path-only prefix shared by the frontend, Vite proxy,\nbackend routes, Netlify redirects, and serverless runtime. It must begin with\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "/"
      }), "; schemes, authorities, queries, fragments, backslashes, empty segments, and\ndot segments are rejected. Deploys provide the selected value directly to the\nVite process, so it takes precedence over a conflicting project ", (0,jsx_runtime.jsx)(_components.code, {
        children: ".env"
      }), " file.\nGenerated local scripts bind the frontend to port 3000, backend to 8000, and\nserverless emulator to 9000; they do not expose ", (0,jsx_runtime.jsx)(_components.code, {
        children: "PORT"
      }), " or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "HOST"
      }), " environment\noverrides."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "MONGODB_URI"
      }), " is required for preview, branch, and production deploys because\nthe generated artifact always contains the serverless backend."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The helper classifies ", (0,jsx_runtime.jsx)(_components.code, {
        children: "MONGODB_URI"
      }), " as secret and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "API_BASE_URL"
      }), " as non-secret.\nFree-tier writes use Netlify's all-scope default because granular scopes are a\npaid feature. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "--paid-tier"
      }), " narrows variables to Functions scope. Existing\nreadable context values and metadata are reconciled together. If Netlify hides\nvalues required by its replace-all update endpoint, the command stops and\nprovides precise UI migration instructions rather than risking context-value\nloss or leaving broad metadata silently."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "when-to-use-it",
      children: "When To Use It"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use this starter when you want:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["a scaffolded full-stack starting point around ", (0,jsx_runtime.jsx)(_components.code, {
          children: "access-router"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "MongoDB persistence already wired into the starter app"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "a packaged CLI instead of copying example directories by hand"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "If you only want the runtime pieces and plan to build the app structure yourself, use the lower-level packages directly instead."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "related-packages",
      children: "Related Packages"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./access-router-runtime",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/access-router-runtime"
          })
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./access-router",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/access-router"
          })
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./express-runtime",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/express-runtime"
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