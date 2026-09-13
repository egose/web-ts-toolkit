"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[985],{

/***/ 8552
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_processors_mdx_95e_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-processors-mdx-95e.json
const site_docs_packages_access_router_processors_mdx_95e_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router/processors","title":"Processors","description":"@web-ts-toolkit/access-router/processors exposes hardened, path-based","source":"@site/docs/packages/access-router/processors.mdx","sourceDirName":"packages/access-router","slug":"/packages/access-router/processors","permalink":"/docs/packages/access-router/processors","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":9,"frontMatter":{"sidebar_label":"Processors","sidebar_position":9},"sidebar":"packagesSidebar","previous":{"title":"Advanced","permalink":"/docs/packages/access-router/advanced"},"next":{"title":"Overview","permalink":"/docs/packages/access-router-client/"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(7008);
;// ./docs/packages/access-router/processors.mdx


const frontMatter = {
	sidebar_label: 'Processors',
	sidebar_position: 9
};
const contentTitle = 'Processors';

const assets = {

};



const toc = [{
  "value": "<code>copyAndDepopulate</code>",
  "id": "copyanddepopulate",
  "level": 2
}, {
  "value": "<code>copyPaths</code> (<code>COPY</code>)",
  "id": "copypaths-copy",
  "level": 2
}, {
  "value": "<code>movePaths</code> (<code>MOVE</code>)",
  "id": "movepaths-move",
  "level": 2
}, {
  "value": "<code>sliceArrays</code> (<code>SLICE</code>)",
  "id": "slicearrays-slice",
  "level": 2
}, {
  "value": "<code>countPaths</code> (<code>COUNT</code>)",
  "id": "countpaths-count",
  "level": 2
}, {
  "value": "<code>maskPaths</code> (<code>MASK</code>)",
  "id": "maskpaths-mask",
  "level": 2
}, {
  "value": "<code>copyAndDepopulate</code>",
  "id": "copyanddepopulate-1",
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
        id: "processors",
        children: "Processors"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/access-router/processors"
      }), " exposes hardened, path-based\ndocument transforms. Each one is also available as a declarative request\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "tasks"
      }), " entry (", (0,jsx_runtime.jsx)(_components.code, {
        children: "COPY_AND_DEPOPULATE"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "COPY"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "MOVE"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "SLICE"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "COUNT"
      }), ",\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "MASK"
      }), ") that runs per document after authorization and decoration."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "copyanddepopulate",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "copyAndDepopulate"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Copies selected nested values to new destinations and replaces the source value with IDs."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { copyAndDepopulate } from '@web-ts-toolkit/access-router/processors';\n\nconst result = copyAndDepopulate(doc, [{ src: 'author', dest: 'authorSnapshot' }]);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "mutable"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "true"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "idField"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h2, {
      id: "copypaths-copy",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "copyPaths"
      }), " (", (0,jsx_runtime.jsx)(_components.code, {
        children: "COPY"
      }), ")"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Copies ", (0,jsx_runtime.jsx)(_components.code, {
        children: "src"
      }), " to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dest"
      }), " without modifying ", (0,jsx_runtime.jsx)(_components.code, {
        children: "src"
      }), ". The value is deep-cloned so\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "dest"
      }), " never aliases ", (0,jsx_runtime.jsx)(_components.code, {
        children: "src"
      }), "."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h2, {
      id: "movepaths-move",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "movePaths"
      }), " (", (0,jsx_runtime.jsx)(_components.code, {
        children: "MOVE"
      }), ")"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Moves ", (0,jsx_runtime.jsx)(_components.code, {
        children: "src"
      }), " to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dest"
      }), " and deletes ", (0,jsx_runtime.jsx)(_components.code, {
        children: "src"
      }), ". A ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dest"
      }), " nested under ", (0,jsx_runtime.jsx)(_components.code, {
        children: "src"
      }), "\ncopies without deleting so the new value survives."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h2, {
      id: "slicearrays-slice",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "sliceArrays"
      }), " (", (0,jsx_runtime.jsx)(_components.code, {
        children: "SLICE"
      }), ")"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Slices the array at ", (0,jsx_runtime.jsx)(_components.code, {
        children: "src"
      }), " to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "[skip, skip + limit)"
      }), " and writes the window to\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "dest"
      }), " (default: in place). An omitted ", (0,jsx_runtime.jsx)(_components.code, {
        children: "limit"
      }), " keeps the tail; a present\n", (0,jsx_runtime.jsx)(_components.code, {
        children: "limit"
      }), " is clamped to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "maxSlice"
      }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "1000"
      }), ", matching ", (0,jsx_runtime.jsx)(_components.code, {
        children: "listHardLimit"
      }), ")."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h2, {
      id: "countpaths-count",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "countPaths"
      }), " (", (0,jsx_runtime.jsx)(_components.code, {
        children: "COUNT"
      }), ")"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Writes the size of ", (0,jsx_runtime.jsx)(_components.code, {
        children: "src"
      }), " to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "dest"
      }), ": array length, object key count, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "1"
      }), " for\nother present values, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "0"
      }), " for null/undefined. Missing paths are no-ops."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h2, {
      id: "maskpaths-mask",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "maskPaths"
      }), " (", (0,jsx_runtime.jsx)(_components.code, {
        children: "MASK"
      }), ")"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Replaces ", (0,jsx_runtime.jsx)(_components.code, {
        children: "src"
      }), " with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "replacement"
      }), " (default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "'***'"
      }), "). Only existing leaves\nare redacted; missing paths are no-ops."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["All processors share the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "copyAndDepopulate"
      }), " safety contract: intermediate\nsegments fan out across arrays, missing/null/scalar intermediates are safe\nno-ops, and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "__proto__"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "prototype"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "constructor"
      }), " segments throw."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "copyanddepopulate-1",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "copyAndDepopulate"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Copies selected nested values to new destinations and replaces the source value with IDs."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { copyAndDepopulate } from '@web-ts-toolkit/access-router/processors';\n\nconst result = copyAndDepopulate(doc, [{ src: 'author', dest: 'authorSnapshot' }]);\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Options:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "mutable"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "true"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "idField"
        }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        })]
      }), "\n"]
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
          href: "./advanced",
          children: "Advanced"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./services",
          children: "Services"
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