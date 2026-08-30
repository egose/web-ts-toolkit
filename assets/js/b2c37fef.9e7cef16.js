"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[279],{

/***/ 4032
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
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(7008);
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
        children: "import { encodeAsset, formatCssUrl } from '@web-ts-toolkit/asset-inliner';\nconst asset = await encodeAsset('./assets/logo.png');\nformatCssUrl(asset); // url(data:image/png;base64,...)\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createAssetCatalog, inlineCss } from '@web-ts-toolkit/asset-inliner';\nconst catalog = await createAssetCatalog(['./assets']);\nconst result = inlineCss('a { background: url(\"./assets/logo.png\") }', { catalog, documentPath: '/project/src/a.css' });\n"
      })
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
        }), " prefers source-location patches of the targeted attribute value ranges so unrelated markup stays byte-identical; if a patch is invalid/overlapping it falls back to full serialization (may normalize)."]
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
        }), " diagnostic (no corruption) for malformed chunks."]
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
      }), "\n"]
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