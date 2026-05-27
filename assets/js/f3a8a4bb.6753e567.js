"use strict";
(globalThis["webpackChunkwebsite"] = globalThis["webpackChunkwebsite"] || []).push([[994],{

/***/ 2592
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_access_router_client_model_mdx_f3a_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-access-router-client-model-mdx-f3a.json
const site_docs_packages_access_router_client_model_mdx_f3a_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/access-router-client/model","title":"Model","description":"Model reads and writes return Model instances.","source":"@site/docs/packages/access-router-client/model.mdx","sourceDirName":"packages/access-router-client","slug":"/packages/access-router-client/model","permalink":"/docs/packages/access-router-client/model","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":4,"frontMatter":{"sidebar_label":"Model","sidebar_position":4},"sidebar":"packagesSidebar","previous":{"title":"Services","permalink":"/docs/packages/access-router-client/services"},"next":{"title":"TypeScript And Errors","permalink":"/docs/packages/access-router-client/typescript-and-errors"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.6/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1325);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.14_react@19.2.6/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(1982);
;// ./docs/packages/access-router-client/model.mdx


const frontMatter = {
	sidebar_label: 'Model',
	sidebar_position: 4
};
const contentTitle = 'Model';

const assets = {

};



const toc = [{
  "value": "Why <code>Model&lt;T&gt;</code> Exists",
  "id": "why-modelt-exists",
  "level": 2
}, {
  "value": "Basic Usage",
  "id": "basic-usage",
  "level": 2
}, {
  "value": "Property Access",
  "id": "property-access",
  "level": 2
}, {
  "value": "Dirty Tracking",
  "id": "dirty-tracking",
  "level": 2
}, {
  "value": "<code>save()</code>",
  "id": "save",
  "level": 2
}, {
  "value": "<code>reset()</code>",
  "id": "reset",
  "level": 2
}, {
  "value": "<code>assign(...)</code>, <code>toObject()</code>, and <code>toJSON()</code>",
  "id": "assign-toobject-and-tojson",
  "level": 2
}, {
  "value": "Field Name Collisions",
  "id": "field-name-collisions",
  "level": 2
}, {
  "value": "Practical Guidance",
  "id": "practical-guidance",
  "level": 2
}];
function _createMdxContent(props) {
  const _components = {
    code: "code",
    h1: "h1",
    h2: "h2",
    header: "header",
    li: "li",
    ol: "ol",
    p: "p",
    pre: "pre",
    ul: "ul",
    ...(0,lib/* useMDXComponents */.R)(),
    ...props.components
  };
  return (0,jsx_runtime.jsxs)(jsx_runtime.Fragment, {
    children: [(0,jsx_runtime.jsx)(_components.header, {
      children: (0,jsx_runtime.jsx)(_components.h1, {
        id: "model",
        children: "Model"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Model reads and writes return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Model<T>"
      }), " instances."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "Model<T>"
      }), " is a mutable client-side wrapper around a document snapshot plus the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ModelService<T>"
      }), " that loaded it."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h2, {
      id: "why-modelt-exists",
      children: ["Why ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Model<T>"
      }), " Exists"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "It solves three common client problems:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "mutate a loaded document locally without immediately sending a request"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "track which top-level fields changed"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["persist the changes back to the same service through ", (0,jsx_runtime.jsx)(_components.code, {
          children: "save()"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "basic-usage",
      children: "Basic Usage"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const read = await userService.read('user-id-1');\n\nread.data.name = 'new-name';\nread.data.role = 'owner';\n\nif (read.data.isDirty()) {\n  await read.data.save();\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "You can also construct a model directly when you want a client-side draft before calling the server:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { Model } from '@web-ts-toolkit/access-router-client';\n\nconst draft = new Model(\n  {\n    name: 'draft-user',\n    role: 'author',\n    public: true,\n  },\n  userService,\n);\n\nawait draft.save();\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "property-access",
      children: "Property Access"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The model exposes document keys directly when they do not collide with model methods."
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "read.data.name;\nread.data.role = 'owner';\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For paths and collision-safe access, use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "get(...)"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "set(...)"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "read.data.get('statusHistory.0.label');\nread.data.set('statusHistory.0.label', 'approved');\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "dirty-tracking",
      children: "Dirty Tracking"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "Model<T>"
      }), " tracks modified top-level paths."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Available helpers:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "isDirty()"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "isDirty(path)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "markModified(path)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "assign(partial)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "set(path, value)"
        })
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Behavior notes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "unchanged writes do not mark a field dirty"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "nested path tracking is normalized to the top-level field"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["direct mutation of deeply nested objects is not automatically tracked unless it passes through ", (0,jsx_runtime.jsx)(_components.code, {
          children: "set(...)"
        }), " or ", (0,jsx_runtime.jsx)(_components.code, {
          children: "markModified(...)"
        })]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This top-level normalization is intentional. The client ultimately sends modified top-level fields back to the server, not path-by-path Mongo update operators."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "read.data.statusHistory[0].label = 'approved';\n\nread.data.isDirty('statusHistory');\n// false\n\nread.data.set('statusHistory.0.label', 'approved');\n\nread.data.isDirty('statusHistory');\n// true\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "save",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "save()"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "save()"
      }), " persists only the tracked modified top-level fields."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Behavior:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["if ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        }), " exists, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "save()"
        }), " calls ", (0,jsx_runtime.jsx)(_components.code, {
          children: "service.update(...)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["if ", (0,jsx_runtime.jsx)(_components.code, {
          children: "_id"
        }), " is missing, ", (0,jsx_runtime.jsx)(_components.code, {
          children: "save()"
        }), " calls ", (0,jsx_runtime.jsx)(_components.code, {
          children: "service.create(...)"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "on success, the model snapshot is replaced with the latest persisted state and the dirty set is cleared"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "on failure, the model remains dirty so you can correct and retry"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "save()"
      }), " returns the normalized service response shape, not just the raw document. That means you can inspect ", (0,jsx_runtime.jsx)(_components.code, {
        children: "success"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "status"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "message"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "raw"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "data"
      }), " just like other client calls."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const draft = await userService.new();\n\ndraft.data.assign({\n  name: 'draft-user',\n  role: 'author',\n  public: true,\n});\n\nconst saved = await draft.data.save();\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "reset",
      children: (0,jsx_runtime.jsx)(_components.code, {
        children: "reset()"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "reset()"
      }), " restores the last loaded or successfully saved snapshot."]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const user = await userService.read('user-id-1');\n\nuser.data.role = 'owner';\nuser.data.reset();\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["After ", (0,jsx_runtime.jsx)(_components.code, {
        children: "reset()"
      }), ":"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "current mutable data is restored from the snapshot"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "deleted keys are restored if they existed in the snapshot"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "extra keys added after load are removed"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "dirty tracking is cleared"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.h2, {
      id: "assign-toobject-and-tojson",
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "assign(...)"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toObject()"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toJSON()"
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "assign(...)"
      }), " mutates the live model in place:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "user.data.assign({ role: 'admin', public: true });\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "toObject()"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "toJSON()"
      }), " return deep-cloned plain data."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That is useful when:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "you need to serialize safely"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "you want to compare snapshots"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "you do not want accidental mutation to change the live model state"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "toJSON()"
      }), " makes ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JSON.stringify(model)"
      }), " behave like ", (0,jsx_runtime.jsx)(_components.code, {
        children: "JSON.stringify(model.toObject())"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "field-name-collisions",
      children: "Field Name Collisions"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Some document keys can collide with model methods such as ", (0,jsx_runtime.jsx)(_components.code, {
        children: "save"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "set"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "reset"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The model avoids defining direct properties for keys that already exist on the instance or its prototype."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "That means this is safe:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "const doc = await weirdService.read('1');\n\ntypeof doc.data.save;\n// 'function'\n\ndoc.data.get('save');\ndoc.data.set('save', 'field-value');\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If a document field collides with a method name, access it with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "get(...)"
      }), " and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "set(...)"
      }), " instead of direct property syntax."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "practical-guidance",
      children: "Practical Guidance"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Use direct property syntax for simple top-level fields."
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "set(...)"
      }), " when:"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "the path is nested"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "the field name collides with a method"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "you want dirty tracking to reflect the change immediately"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Use ", (0,jsx_runtime.jsx)(_components.code, {
        children: "markModified(...)"
      }), " when you mutate nested data outside ", (0,jsx_runtime.jsx)(_components.code, {
        children: "set(...)"
      }), " and still want ", (0,jsx_runtime.jsx)(_components.code, {
        children: "save()"
      }), " to include the top-level field."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Recommended editing pattern:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ol, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "read the model"
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "use direct property writes for simple top-level fields"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["use ", (0,jsx_runtime.jsx)(_components.code, {
          children: "set(...)"
        }), " for nested fields"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["check ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isDirty()"
        }), " before saving if you want to skip no-op writes"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["call ", (0,jsx_runtime.jsx)(_components.code, {
          children: "reset()"
        }), " when the user cancels local edits"]
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