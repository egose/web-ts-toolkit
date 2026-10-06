"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[279],{

/***/ 5209
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_asset_inliner_md_b2c_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-asset-inliner-md-b2c.json
const site_docs_packages_asset_inliner_md_b2c_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/asset-inliner","title":"@web-ts-toolkit/asset-inliner","description":"Generic ESM-only asset inliner for CSS and HTML — Base64 data URL encoding, CSS url() / font format() formatting, deterministic catalog and file pipeline. Node >=22, named imports only.","source":"@site/docs/packages/asset-inliner.md","sourceDirName":"packages","slug":"/packages/asset-inliner","permalink":"/docs/packages/asset-inliner","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":23,"frontMatter":{"sidebar_label":"Asset Inliner","sidebar_position":23},"sidebar":"packagesSidebar","previous":{"title":"JSON Frame","permalink":"/docs/packages/json-frame"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.3.0/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(4686);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.3.0_react@19.3.0/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(3191);
;// ./docs/packages/asset-inliner.md


const frontMatter = {
	sidebar_label: 'Asset Inliner',
	sidebar_position: 23
};
const contentTitle = '@web-ts-toolkit/asset-inliner';

const assets = {

};



const toc = [{
  "value": "Install",
  "id": "install",
  "level": 2
}, {
  "value": "Shortest examples",
  "id": "shortest-examples",
  "level": 2
}, {
  "value": "Notes",
  "id": "notes",
  "level": 2
}, {
  "value": "Policy defaults and caps",
  "id": "policy-defaults-and-caps",
  "level": 2
}, {
  "value": "Migration note",
  "id": "migration-note",
  "level": 2
}];
function _createMdxContent(props) {
  const _components = {
    blockquote: "blockquote",
    code: "code",
    h1: "h1",
    h2: "h2",
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
        id: "web-ts-toolkitasset-inliner",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/asset-inliner"
        })
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Generic ESM-only asset inliner for CSS and HTML — Base64 data URL encoding, CSS ", (0,jsx_runtime.jsx)(_components.code, {
        children: "url()"
      }), " / font ", (0,jsx_runtime.jsx)(_components.code, {
        children: "format()"
      }), " formatting, deterministic catalog and file pipeline. Node ", (0,jsx_runtime.jsx)(_components.code, {
        children: ">=22"
      }), ", named imports only."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.blockquote, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.p, {
        children: ["This page mirrors the installed package ", (0,jsx_runtime.jsx)(_components.code, {
          children: "README.md"
        }), " (the authoritative consumer guide). The shipped declarations under ", (0,jsx_runtime.jsx)(_components.code, {
          children: "dist/index.d.mts"
        }), " plus ", (0,jsx_runtime.jsx)(_components.code, {
          children: "README.md"
        }), " are the primary installed-consumer docs; website docs are secondary."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "install",
      children: "Install"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-sh",
        children: "pnpm add @web-ts-toolkit/asset-inliner\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["ESM only with import-only export map (", (0,jsx_runtime.jsx)(_components.code, {
        children: "dist/index.mjs"
      }), " + ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dist/index.d.mts"
      }), "). ", (0,jsx_runtime.jsx)(_components.code, {
        children: "require()"
      }), " is not supported. See package ", (0,jsx_runtime.jsx)(_components.code, {
        children: "README.md"
      }), " for the full quickstart, detection modes, limits, supported built-ins, custom definitions, resolver hook, and error reference."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "shortest-examples",
      children: "Shortest examples"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { encodeAsset, formatCssUrl } from '@web-ts-toolkit/asset-inliner';\nconst asset = await encodeAsset({ data: new Uint8Array([1, 2, 3]), filename: 'apple.png' });\nformatCssUrl(asset); // url(data:image/png;base64,...)\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createAssetCatalog, inlineCss } from '@web-ts-toolkit/asset-inliner';\nconst catalog = await createAssetCatalog([{ data: new Uint8Array([1, 2, 3]), filename: 'apple.png' }]);\nconst result = inlineCss('.hero { background: url(\"apple.png\") }', {\n  catalog,\n  allowBasenameMatch: true, // byte inputs have filenames, not filesystem source paths\n});\nconsole.log(result.modified, result.replacements.length); // true, 1\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "These in-memory blocks are standalone TypeScript ESM examples. Tiny bytes show\nextension-based encoding, not image validity. The shipped README includes the\nNodeNext compile/run command and a self-cleaning runnable disk example."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.strong, {
        children: "Illustrative fragment"
      }), " — supply your own asset and stylesheet directories:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { inlineFiles } from '@web-ts-toolkit/asset-inliner';\nawait inlineFiles({ assets: ['./assets'], targets: ['./styles'] }); // dry-run; add write:true to persist\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "notes",
      children: "Notes"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Registry reuse:"
        }), " pass an already-validated ", (0,jsx_runtime.jsx)(_components.code, {
          children: "AssetDefinitionRegistry"
        }), " via ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ registry }"
        }), " to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "createAssetCatalog"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "discoverAssets"
        }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "encodeAsset"
        }), " to avoid re-normalizing ", (0,jsx_runtime.jsx)(_components.code, {
          children: "definitions"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Literal unions:"
        }), " ", (0,jsx_runtime.jsx)(_components.code, {
          children: "AssetInlinerErrorCode"
        }), " (", (0,jsx_runtime.jsx)(_components.code, {
          children: "'RESOURCE_LIMIT'"
        }), " etc.) and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DiagnosticCode"
        }), " (", (0,jsx_runtime.jsx)(_components.code, {
          children: "'UNRESOLVED_REFERENCE'"
        }), " etc.) narrow in consumers; subclasses like ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ResourceLimitError"
        }), " carry ", (0,jsx_runtime.jsx)(_components.code, {
          children: "code: 'RESOURCE_LIMIT' as const"
        }), "."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "sourcePath:"
        }), " ", (0,jsx_runtime.jsx)(_components.code, {
          children: "EncodedAsset.sourcePath"
        }), " is a normalized absolute path (", (0,jsx_runtime.jsx)(_components.code, {
          children: "path.resolve"
        }), ") when input was a file path."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Definition shape:"
        }), " ", (0,jsx_runtime.jsx)(_components.code, {
          children: "AssetTypeDefinition"
        }), " is a discriminated union — ", (0,jsx_runtime.jsx)(_components.code, {
          children: "fontFormat"
        }), " only allowed when ", (0,jsx_runtime.jsx)(_components.code, {
          children: "kind === 'font'"
        }), " (checked at type and runtime)."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Changed HTML:"
        }), " ", (0,jsx_runtime.jsx)(_components.code, {
          children: "inlineHtml"
        }), " prefers source-location patches of the targeted attribute value ranges so unrelated markup stays byte-identical; if a patch is invalid/overlapping it falls back to full serialization (may normalize). Validated patches (including srcset spans) now assemble from original-source slices with one join, reducing expanded-output copying without changing bytes, locations or limits. HTML-spec recovery accepts malformed markup, but resource limits and invalid options/resolver results can still throw."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Changed syntax bound:"
        }), " pure and async/sync file transforms enforce ", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxSyntaxDepth"
        }), " (default ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "256"
        }), ", maximum ", (0,jsx_runtime.jsx)(_components.strong, {
          children: "512"
        }), "), independent of filesystem ", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxDepth"
        }), ", even without references. HTML counts parsed element ancestors including the element, implied ", (0,jsx_runtime.jsx)(_components.code, {
          children: "html"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "head"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "body"
        }), ", and template content; document/fragment roots, text and comments add zero. Iterative insertion checks protect parser recovery; completed-tree checks protect walking and fallback serialization. CSS conservatively counts simultaneously open unescaped ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "("
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "["
        }), " outside strings/comments, including blocks, functions, selectors, custom properties and malformed/unclosed groups; only matching closers reduce depth. Checks run before parsing/fast paths and before parser-tree walking/stringifying. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "a{background:url(a.png)}"
        }), " has depth 2. Opt-in embedded CSS starts at zero per chunk, including decoded attributes, raw-source fallback, missing locations and inert templates; its depth is not added to HTML depth. Disabled embedded CSS is not syntax-checked. Exact boundaries succeed; excess throws ", (0,jsx_runtime.jsx)(_components.code, {
          children: "ResourceLimitError"
        }), " in pure APIs and yields per-target ", (0,jsx_runtime.jsx)(_components.code, {
          children: "RESOURCE_LIMIT"
        }), " with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "content: ''"
        }), ", no replacements/write in file APIs, preserving original files on disk while other targets continue. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DEFAULT_MAX_SYNTAX_DEPTH"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "MAX_REASONABLE_MAX_SYNTAX_DEPTH"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "DEFAULT_POLICY"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "normalizePolicy"
        }), ", and public option JSDoc share this policy."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Changed srcset:"
        }), " ", (0,jsx_runtime.jsx)(_components.code, {
          children: "img"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "source"
        }), " candidates use complete decoded URL tokens: interior commas belong to local, remote, and data URLs alike. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "a.png,b.png"
        }), " is one URL; ", (0,jsx_runtime.jsx)(_components.code, {
          children: "a.png, b.png"
        }), " and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "a.png 1x,b.png 2x"
        }), " are two candidates. Trailing/repeated separators and valid descriptors (nonnegative finite ", (0,jsx_runtime.jsx)(_components.code, {
          children: "x"
        }), ", positive integer ", (0,jsx_runtime.jsx)(_components.code, {
          children: "w"
        }), ", future-compatible positive ", (0,jsx_runtime.jsx)(_components.code, {
          children: "h"
        }), " paired with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "w"
        }), ") are preserved. Malformed/duplicate/conflicting descriptors stay untouched without resolver calls or asset diagnostics; missing separators are not repaired. Source patches retain remote/data URLs and unrelated entity spelling, and map decoded commas/ASCII whitespace, CRLF, and named references back to original URL offsets. Full-tree fallback may normalize markup/whitespace; absent source locations report offset ", (0,jsx_runtime.jsx)(_components.code, {
          children: "-1"
        }), ". Pure and async/sync file transforms use the same rules."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Embedded CSS:"
        }), " ", (0,jsx_runtime.jsx)(_components.code, {
          children: "inlineEmbeddedCss: true"
        }), " (opt-in, default ", (0,jsx_runtime.jsx)(_components.code, {
          children: "false"
        }), ") inlines local ", (0,jsx_runtime.jsx)(_components.code, {
          children: "url(...)"
        }), " inside ", (0,jsx_runtime.jsx)(_components.code, {
          children: "<style>"
        }), " elements and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "style"
        }), " attributes using the same CSS semantics as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "inlineCss"
        }), ", with shared limits, source-offset location mapping, and a ", (0,jsx_runtime.jsx)(_components.code, {
          children: "PARSE_ERROR"
        }), " diagnostic (no corruption) for malformed chunks within resource limits. Limits remain fail-closed, including on malformed input."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Resolver URL text:"
        }), " transforms normally pass HTML-entity/CSS-escape-decoded URLs; the existing style decoder-disagreement fallback retains raw HTML entities. Standalone resolution utilities pass caller input. Source-location contracts are unchanged."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Changed HTML base contract:"
        }), " before transforming, select the first HTML-namespace ", (0,jsx_runtime.jsx)(_components.code, {
          children: "<base href>"
        }), " in parsed tree order, including one after references. Missing href and inert template/foreign-namespace bases do not participate; later bases never override it. Empty/whitespace-only, query-only, and fragment-only hrefs select the document fallback; HTML-disallowed ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data:"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "javascript:"
        }), " bases also use fallback and block later bases. Href entities decode once, with URL edge C0/space trimming and tab/newline removal. Relative bases map from the physical document directory (or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "rootDir"
        }), "/cwd); ", (0,jsx_runtime.jsx)(_components.code, {
          children: "/"
        }), " bases use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "rootDir"
        }), "/cwd. Trailing slash or final dot segments denote directories, otherwise the last segment denotes a document. Existing query/fragment stripping, single percent decoding, and slash/backslash normalization apply. Simple attributes, img/source srcset, opt-in embedded CSS, and async/sync file APIs share this behavior. Root-relative asset URLs still use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "rootDir"
        }), "/cwd under a local base."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Base limitations and resolver identity:"
        }), " remote/protocol-relative and unmappable bases (including ", (0,jsx_runtime.jsx)(_components.code, {
          children: "file:"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "blob:"
        }), ", custom schemes, malformed/NUL percent encodings) preserve local-looking references, including root-relative ones, with per-reference ", (0,jsx_runtime.jsx)(_components.code, {
          children: "HTML_BASE_UNMAPPABLE"
        }), " warnings and no catalog/basename/resolver calls. Ordinary remote/data/fragment skips are unchanged. No fetching, base rewriting, browser-origin/CSP inference, or runtime DOM handling is added. Based-HTML diagnostics retain the actual containing ", (0,jsx_runtime.jsx)(_components.code, {
          children: "documentPath"
        }), "; attempted asset paths remain in messages/replacement metadata. Hooks retain actual ", (0,jsx_runtime.jsx)(_components.code, {
          children: "documentPath"
        }), " and reference-relative ", (0,jsx_runtime.jsx)(_components.code, {
          children: "decodedPath"
        }), ", with optional ", (0,jsx_runtime.jsx)(_components.code, {
          children: "resolutionBaseDir"
        }), " exposing the effective absolute directory separately (also in embedded CSS); original URLs are parsed/entity- or CSS-escape-decoded text. No-base behavior is unchanged. The shipped README details the filesystem mapping contract."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Changed style output:"
        }), " rewritten unquoted ", (0,jsx_runtime.jsx)(_components.code, {
          children: "style"
        }), " values gain double quotes; values are escaped for their output quote context so decoded whitespace, equals signs, and quotes cannot introduce attributes or detach CSS suffixes. The raw-source decoder fallback also preserves attribute boundaries and decodes existing entities only once. Added quotes/escaping count toward ", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxOutputBytes"
        }), " in pure and async/sync file APIs, with no write on limit failure. ", (0,jsx_runtime.jsx)(_components.code, {
          children: "<style>"
        }), " elements retain raw-text semantics (no HTML-entity decoding)."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Selective inlining:"
        }), " ", (0,jsx_runtime.jsx)(_components.code, {
          children: "InlineOptions"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "InlineFilesOptions"
        }), " accept ", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxInlineBytes"
        }), " (byteLength threshold) and/or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "shouldInline(asset, url) => boolean"
        }), " to leave large or predicate-rejected assets as external references with an ", (0,jsx_runtime.jsx)(_components.code, {
          children: "INLINE_SKIPPED"
        }), " (", (0,jsx_runtime.jsx)(_components.code, {
          children: "warn"
        }), ") diagnostic; hard limits (", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxAssetBytes"
        }), "/", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxTotalBytes"
        }), ") remain fail-closed (", (0,jsx_runtime.jsx)(_components.code, {
          children: "ResourceLimitError"
        }), ") and cannot be downgraded, with deterministic order and no implicit heuristics."]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.strong, {
          children: "Changed contracts:"
        }), " ", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxFiles"
        }), " is one catalog-wide budget across roots (byte ", (0,jsx_runtime.jsx)(_components.code, {
          children: "{ data }"
        }), " inputs sit outside it); oversized targets rejected by ", (0,jsx_runtime.jsx)(_components.code, {
          children: "maxTargetBytes"
        }), " return ", (0,jsx_runtime.jsx)(_components.code, {
          children: "content: ''"
        }), " with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "written: false"
        }), " (metadata preflight only, not a strict allocation bound); resolver/catalog/formatter data URLs must match ", (0,jsx_runtime.jsx)(_components.code, {
          children: "data:<type>/<subtype>;base64,<strict-base64>"
        }), " or fail with ", (0,jsx_runtime.jsx)(_components.code, {
          children: "INVALID_OPTIONS"
        }), "; ", (0,jsx_runtime.jsx)(_components.code, {
          children: "image/x-icon"
        }), " detections normalize to canonical ", (0,jsx_runtime.jsx)(_components.code, {
          children: "image/vnd.microsoft.icon"
        }), "."]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "policy-defaults-and-caps",
      children: "Policy defaults and caps"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["All numeric overrides are positive safe integers. Defaults apply when omitted;\nvalues above the cap are rejected with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "InvalidOptionsError"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.table, {
      children: [(0,jsx_runtime.jsx)(_components.thead, {
        children: (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.th, {
            children: "Policy"
          }), (0,jsx_runtime.jsx)(_components.th, {
            style: {
              textAlign: "right"
            },
            children: "Default"
          }), (0,jsx_runtime.jsx)(_components.th, {
            style: {
              textAlign: "right"
            },
            children: "Maximum"
          })]
        })
      }), (0,jsx_runtime.jsxs)(_components.tbody, {
        children: [(0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "maxAssetBytes"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "3 MiB"
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "100 MiB"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "maxTotalBytes"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "15 MiB"
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "500 MiB"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "maxTargetBytes"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "5 MiB"
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "50 MiB"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "maxOutputBytes"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "20 MiB"
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "100 MiB"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "maxReplacements"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "1000"
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "100000"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "maxSyntaxDepth"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "256"
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "512"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "maxFiles"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "10000"
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "100000"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "maxDepth"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "32"
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "256"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "maxTargets"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "500"
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "5000"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "concurrency"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "16"
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "64"
          })]
        }), (0,jsx_runtime.jsxs)(_components.tr, {
          children: [(0,jsx_runtime.jsx)(_components.td, {
            children: (0,jsx_runtime.jsx)(_components.code, {
              children: "maxInlineBytes"
            })
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "none"
          }), (0,jsx_runtime.jsx)(_components.td, {
            style: {
              textAlign: "right"
            },
            children: "100 MiB"
          })]
        })]
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Output accounting includes quotes/escaping/font hints and checks changed output\nafter assembly/fallback serialization. See the README for depth counting,\nmetadata-read growth races, discovery/read TOCTOU, and file-write guarantees."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "migration-note",
      children: "Migration note"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Legacy ", (0,jsx_runtime.jsx)(_components.code, {
        children: "node-font2base64"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "base64-injector"
      }), " both exposed ", (0,jsx_runtime.jsx)(_components.code, {
        children: "encodeToDataSrc"
      }), " with conflicting semantics and unsafe defaults. The new package splits them into ", (0,jsx_runtime.jsx)(_components.code, {
        children: "encodeAsset"
      }), " (data URL only) + ", (0,jsx_runtime.jsx)(_components.code, {
        children: "formatCssUrl"
      }), " (generic) / ", (0,jsx_runtime.jsx)(_components.code, {
        children: "formatFontSource"
      }), " (font, requires ", (0,jsx_runtime.jsx)(_components.code, {
        children: "fontFormat"
      }), "), makes file writes opt-in, skips remote/", (0,jsx_runtime.jsx)(_components.code, {
        children: "data:"
      }), " URLs before I/O, and reports ambiguity as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "AmbiguousAssetError"
      }), " instead of picking a winner. The package ", (0,jsx_runtime.jsx)(_components.code, {
        children: "README.md"
      }), " contains the complete migration matrices for both legacies, the intentional breaking changes, CSP/caching and SVG non-sanitization caveats, and MIT provenance/license notices for dependencies (", (0,jsx_runtime.jsx)(_components.code, {
        children: "file-type"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "postcss"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "postcss-value-parser"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "parse5"
      }), ") and fixtures."]
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