"use strict";
(globalThis["webpackChunkwebsite"] ||= []).push([[743],{

/***/ 290
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  assets: () => (/* binding */ assets),
  contentTitle: () => (/* binding */ contentTitle),
  "default": () => (/* binding */ MDXContent),
  frontMatter: () => (/* binding */ frontMatter),
  metadata: () => (/* reexport */ site_docs_packages_moo_md_b16_namespaceObject),
  toc: () => (/* binding */ toc)
});

;// ./.docusaurus/docusaurus-plugin-content-docs/default/site-docs-packages-moo-md-b16.json
const site_docs_packages_moo_md_b16_namespaceObject = /*#__PURE__*/JSON.parse('{"id":"packages/moo","title":"@web-ts-toolkit/moo","description":"Helpers for common Mongoose patterns.","source":"@site/docs/packages/moo.md","sourceDirName":"packages","slug":"/packages/moo","permalink":"/docs/packages/moo","draft":false,"unlisted":false,"tags":[],"version":"current","sidebarPosition":16,"frontMatter":{"sidebar_label":"Moo","sidebar_position":16},"sidebar":"packagesSidebar","previous":{"title":"Message Service","permalink":"/docs/packages/message-service"},"next":{"title":"Mongoose-RxDB","permalink":"/docs/packages/mongoose-rxdb"}}');
// EXTERNAL MODULE: ./node_modules/.pnpm/react@19.2.8/node_modules/react/jsx-runtime.js
var jsx_runtime = __webpack_require__(1987);
// EXTERNAL MODULE: ./node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.18_react@19.2.8/node_modules/@mdx-js/react/lib/index.js
var lib = __webpack_require__(7008);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/Tabs/index.js + 1 modules
var Tabs = __webpack_require__(362);
// EXTERNAL MODULE: ./node_modules/.pnpm/@docusaurus+theme-classic@3.10.2_@types+react@19.2.18_clean-css@5.3.3_cssnano@6.1.2_pos_a99ada86901ab04f139167b245219288/node_modules/@docusaurus/theme-classic/lib/theme/TabItem/index.js + 1 modules
var TabItem = __webpack_require__(4340);
;// ./docs/packages/moo.md


const frontMatter = {
	sidebar_label: 'Moo',
	sidebar_position: 16
};
const contentTitle = '@web-ts-toolkit/moo';

const assets = {

};





const toc = [{
  "value": "Installation",
  "id": "installation",
  "level": 2
}, {
  "value": "What It Exposes",
  "id": "what-it-exposes",
  "level": 2
}, {
  "value": "Published Entry Points",
  "id": "published-entry-points",
  "level": 3
}, {
  "value": "Quick Start",
  "id": "quick-start",
  "level": 2
}, {
  "value": "Schema helpers",
  "id": "schema-helpers",
  "level": 3
}, {
  "value": "ObjectId checks",
  "id": "objectid-checks",
  "level": 3
}, {
  "value": "Utilities subpath",
  "id": "utilities-subpath",
  "level": 3
}, {
  "value": "Model function plugin",
  "id": "model-function-plugin",
  "level": 3
}, {
  "value": "New document plugin",
  "id": "new-document-plugin",
  "level": 3
}, {
  "value": "Cascade delete plugin",
  "id": "cascade-delete-plugin",
  "level": 3
}, {
  "value": "Keycloak user sync",
  "id": "keycloak-user-sync",
  "level": 3
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
    ul: "ul",
    ...(0,lib/* useMDXComponents */.R)(),
    ...props.components
  };
  return (0,jsx_runtime.jsxs)(jsx_runtime.Fragment, {
    children: [(0,jsx_runtime.jsx)(_components.header, {
      children: (0,jsx_runtime.jsx)(_components.h1, {
        id: "web-ts-toolkitmoo",
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/moo"
        })
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Helpers for common Mongoose patterns."
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "This package includes:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "partial-index helpers for nullable or empty string fields"
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["an ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isObjectId(...)"
        }), " guard for strict ObjectId checks"]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "document plugins for model-bound helper functions, new-document callbacks, cascade deletes, and Keycloak user sync"
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
            children: "npm install mongoose @web-ts-toolkit/moo\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add mongoose @web-ts-toolkit/moo\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add mongoose @web-ts-toolkit/moo\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add mongoose @web-ts-toolkit/moo\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Install ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@egose/keycloak-fluent"
      }), " only when using the Keycloak user-sync subpath:"]
    }), "\n", (0,jsx_runtime.jsxs)(Tabs/* default */.A, {
      groupId: "npm2yarn",
      children: [(0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "npm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "npm install @egose/keycloak-fluent\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "yarn",
        label: "Yarn",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "yarn add @egose/keycloak-fluent\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "pnpm",
        label: "pnpm",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "pnpm add @egose/keycloak-fluent\n"
          })
        })
      }), (0,jsx_runtime.jsx)(TabItem/* default */.A, {
        value: "bun",
        label: "Bun",
        children: (0,jsx_runtime.jsx)(_components.pre, {
          children: (0,jsx_runtime.jsx)(_components.code, {
            className: "language-bash",
            children: "bun add @egose/keycloak-fluent\n"
          })
        })
      })]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Supported peer versions:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "mongoose >= 8"
        }), " (tested with Mongoose 8.24.x and 9.x)"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@egose/keycloak-fluent >=0.12.1 <0.15.0"
        }), " for the Keycloak user-sync subpath (tested floor ", (0,jsx_runtime.jsx)(_components.code, {
          children: "0.12.1"
        }), ", current ", (0,jsx_runtime.jsx)(_components.code, {
          children: "0.14.x"
        }), ")"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "what-it-exposes",
      children: "What It Exposes"
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "published-entry-points",
      children: "Published Entry Points"
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Root entrypoint:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: ["schema helpers such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "uniqueNullableString(...)"
        })]
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.code, {
          children: "isObjectId(...)"
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: "non-Keycloak document plugins"
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Published subpaths:"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/moo/schema"
        }), " for schema field helpers"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/moo/is"
        }), " for type guards such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isObjectId(...)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/moo/utils"
        }), " for schema and reference helpers such as ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isSchema(...)"
        }), ", ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isObjectIdType(...)"
        }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
          children: "isReference(...)"
        })]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/moo/plugins"
        }), " for the shared plugin entrypoint"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/moo/plugins/cascade-delete"
        }), " for the cascade-delete plugin"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/moo/plugins/model-function"
        }), " for the model-function plugin"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/moo/plugins/new-document"
        }), " for the new-document plugin"]
      }), "\n", (0,jsx_runtime.jsxs)(_components.li, {
        children: [(0,jsx_runtime.jsx)(_components.code, {
          children: "@web-ts-toolkit/moo/plugins/keycloak-user-sync"
        }), " for the Keycloak user-sync plugin"]
      }), "\n"]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The Keycloak plugin is intentionally available only from ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/moo/plugins/keycloak-user-sync"
      }), ". The root and grouped ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@web-ts-toolkit/moo/plugins"
      }), " entrypoints do not require the optional Keycloak peer."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Example subpath imports:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { isObjectId } from '@web-ts-toolkit/moo/is';\nimport { cascadeDeletePlugin } from '@web-ts-toolkit/moo/plugins/cascade-delete';\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "quick-start",
      children: "Quick Start"
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "schema-helpers",
      children: "Schema helpers"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { Schema } from 'mongoose';\nimport { uniqueEmptiableString, uniqueNullableString } from '@web-ts-toolkit/moo';\n\nconst userSchema = new Schema({\n  email: uniqueNullableString('email'),\n  username: uniqueEmptiableString('username'),\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "The dedicated schema subpath is also available when you want the import to point directly at field helpers:"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { uniqueNullableString } from '@web-ts-toolkit/moo/schema';\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: [(0,jsx_runtime.jsx)(_components.code, {
        children: "uniqueNullableString"
      }), " allows repeating ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), "/missing values while rejecting duplicate strings (partial index on ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ $type: 'string' }"
      }), "); ", (0,jsx_runtime.jsx)(_components.code, {
        children: "uniqueEmptiableString"
      }), " additionally ignores ", (0,jsx_runtime.jsx)(_components.code, {
        children: "''"
      }), " (partial index on ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ $type: 'string', $gt: '' }"
      }), "). Extra overrides are spread over the defaults and reflected in the inferred return type. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "isObjectId"
      }), " is a strict canonical guard: only 24-character lowercase hex strings and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "mongoose.Types.ObjectId"
      }), " instances pass."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "objectid-checks",
      children: "ObjectId checks"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { isObjectId } from '@web-ts-toolkit/moo';\n\nif (!isObjectId(value)) {\n  throw new Error('expected a valid MongoDB ObjectId');\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "utilities-subpath",
      children: "Utilities subpath"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { Schema } from 'mongoose';\nimport { isReference, isSchema } from '@web-ts-toolkit/moo/utils';\n\nconst userSchema = new Schema({\n  manager: { type: Schema.Types.ObjectId, ref: 'User' },\n});\n\nisSchema(userSchema);\nisReference({ type: Schema.Types.ObjectId, ref: 'User' }, 'User');\n"
      })
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "model-function-plugin",
      children: "Model function plugin"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import mongoose, { type Model } from 'mongoose';\nimport {\n  type ModelDocument,\n  type ModelFunctionInstanceMethods,\n  type ModelFunctionStaticMethods,\n  modelFunctionPlugin,\n} from '@web-ts-toolkit/moo';\n\ntype Cart = {\n  name: string;\n  price: number;\n};\n\n// Keep result types free of the CartDocument alias (plain values, not the\n// document) so the aliases never circularly reference each other.\ntype CartMethods = ModelFunctionInstanceMethods<'applyDiscount', [suffix: string, priceChange: number], number> &\n  ModelFunctionInstanceMethods<'applyDiscountAsync', [suffix: string, priceChange: number], Promise<number>>;\n\ntype CartDocument = ModelDocument<Cart, CartMethods>;\n\ntype CartModel = Model<Cart, {}, CartMethods> &\n  ModelFunctionStaticMethods<'applyDiscount', CartDocument, [suffix: string, priceChange: number], number> &\n  ModelFunctionStaticMethods<\n    'applyDiscountAsync',\n    CartDocument,\n    [suffix: string, priceChange: number],\n    Promise<number>\n  >;\n\nconst cartSchema = new mongoose.Schema<Cart, CartModel, CartMethods>({\n  name: { type: String, required: true },\n  price: { type: Number, required: true },\n});\n\n// No explicit plugin generics: the method name, argument tuple, and result\n// are inferred from the options.\ncartSchema.plugin(modelFunctionPlugin, {\n  fnName: 'applyDiscount',\n  fn: (cart: CartDocument, suffix: string, priceChange: number) => {\n    cart.price += priceChange;\n    return cart.price;\n  },\n});\n\ncartSchema.plugin(modelFunctionPlugin, {\n  fnName: 'applyDiscountAsync',\n  fn: async (cart: CartDocument, suffix: string, priceChange: number) => {\n    cart.price += priceChange;\n    return cart.price;\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Each registration adds an instance method, a static taking the document first, and a ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ById"
      }), " static that returns ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " when no document matches. Wrong argument types fail compilation; representative examples plus negative cases are compiler-checked from the packed package by ", (0,jsx_runtime.jsx)(_components.code, {
        children: "test/moo.typed-consumer.test.ts"
      }), "."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "new-document-plugin",
      children: "New document plugin"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { newDocumentPlugin } from '@web-ts-toolkit/moo/plugins/new-document';\n\nuserSchema.plugin(newDocumentPlugin, {\n  async fn(user) {\n    await sendWelcomeEmail(user.email);\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The plugin stores ", (0,jsx_runtime.jsx)(_components.code, {
        children: "isNew"
      }), " before Mongoose saves the document, then runs ", (0,jsx_runtime.jsx)(_components.code, {
        children: "fn"
      }), " after the first successful ", (0,jsx_runtime.jsx)(_components.code, {
        children: "save()"
      }), ". Later saves of the same document do not trigger the callback. Only document ", (0,jsx_runtime.jsx)(_components.code, {
        children: "save()"
      }), " is observed; query inserts, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "insertMany()"
      }), " fast paths that skip document middleware, and updates to existing documents never trigger it. This is a post-save notification, not durable delivery: the callback runs after MongoDB persistence, cannot roll back the write, and carries no outbox, retry, or exactly-once guarantee across transaction retries. Applications needing transactional delivery should record their own outbox intent inside the transaction and process it after commit."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "cascade-delete-plugin",
      children: "Cascade delete plugin"
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import mongoose, { type Model, type Types } from 'mongoose';\nimport {\n  type CascadeDeleteDependencyMap,\n  type CascadeDeleteDocumentMethods,\n  type CascadeDeleteModelStatics,\n  cascadeDeletePlugin,\n} from '@web-ts-toolkit/moo/plugins';\n\nconst referenceModelName = 'Reference';\n\ntype Reference = {\n  name: string;\n};\n\ntype File = {\n  refs: Types.ObjectId[];\n};\n\ntype FileMethods = CascadeDeleteDocumentMethods<typeof referenceModelName, Reference>;\n\ntype FileModel = Model<File, {}, FileMethods> & CascadeDeleteModelStatics<typeof referenceModelName, Reference>;\n\ntype FileDependents = Partial<CascadeDeleteDependencyMap<typeof referenceModelName, Reference>> &\n  Record<string, unknown[]>;\n\nconst fileSchema = new mongoose.Schema<File, FileModel, FileMethods>({\n  refs: [{ type: mongoose.Schema.Types.ObjectId, ref: referenceModelName }],\n});\n\nfileSchema.plugin(cascadeDeletePlugin, {\n  model: referenceModelName,\n  localField: 'refs',\n  foreignField: '_id',\n});\n\nconst File = mongoose.model<File, FileModel>('File', fileSchema);\n\nasync function example(file: mongoose.HydratedDocument<File, FileMethods>) {\n  const dependents: FileDependents = await file.findDependents();\n  const references = await file.findDependents(referenceModelName);\n  const orphans = await File.findOrphans(referenceModelName);\n\n  dependents.Reference;\n  references?.[0]?.name;\n  orphans?.[0]?.name;\n}\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["If you prefer importing the plugin from its dedicated published entrypoint instead of the grouped ", (0,jsx_runtime.jsx)(_components.code, {
        children: "plugins"
      }), " subpath, use:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { cascadeDeletePlugin } from '@web-ts-toolkit/moo/plugins/cascade-delete';\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Relationship mode (", (0,jsx_runtime.jsx)(_components.code, {
        children: "localField"
      }), " + ", (0,jsx_runtime.jsx)(_components.code, {
        children: "foreignField"
      }), ") is fail-closed: missing/", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), "/empty-string local keys and empty reference arrays resolve to zero dependents and delete nothing, so unrelated records with a missing/", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " foreign key survive. A local field omitted by a projection is distinguished from an intentionally empty relation — when the path is provably deselected the lookup throws instead of silently reporting zero dependents. Supplemental ", (0,jsx_runtime.jsx)(_components.code, {
        children: "extraForeignFilter"
      }), " constraints are composed conjunctively (", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ $and: [relationship, extra] }"
      }), "), so an extra filter on the relationship field (including ", (0,jsx_runtime.jsx)(_components.code, {
        children: "$or"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "$and"
      }), " payloads) can only narrow, never replace or widen, the deletion set. Explicit full-filter mode (", (0,jsx_runtime.jsx)(_components.code, {
        children: "foreignFilter"
      }), ") is a separate contract: the resolved filter is used as-is and any ", (0,jsx_runtime.jsx)(_components.code, {
        children: "extraForeignFilter"
      }), " is ignored; resolvers returning ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), "/non-objects resolve to zero dependents. Empty full filters (", (0,jsx_runtime.jsx)(_components.code, {
        children: "{}"
      }), ") are rejected by default at registration and at runtime because they would match the whole dependent collection; there is currently no broad-delete opt-in. Invalid ", (0,jsx_runtime.jsx)(_components.code, {
        children: "model"
      }), "/field combinations and non-object static filters throw at ", (0,jsx_runtime.jsx)(_components.code, {
        children: "schema.plugin(...)"
      }), " time."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Deletion always removes fully hydrated dependent documents through their own document ", (0,jsx_runtime.jsx)(_components.code, {
        children: "deleteOne()"
      }), " (never bulk writes), so nested cascades and custom document hooks observe required fields across multi-level custom-", (0,jsx_runtime.jsx)(_components.code, {
        children: "localField"
      }), " chains. Internal deletion traversal pages dependent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), "s (", (0,jsx_runtime.jsx)(_components.code, {
        children: "batchSize"
      }), ", default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "100"
      }), ") and bounds in-flight deletes (", (0,jsx_runtime.jsx)(_components.code, {
        children: "maxConcurrency"
      }), ", default ", (0,jsx_runtime.jsx)(_components.code, {
        children: "8"
      }), "; forced to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "1"
      }), " inside an active transaction), instead of materializing and deleting the whole set at once. Public ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findDependents()"
      }), " still returns an array. A dependent-hook failure rejects the parent ", (0,jsx_runtime.jsx)(_components.code, {
        children: "deleteOne()"
      }), " after the parent is already removed (fail-fast, remaining batches skipped; abort the transaction to restore everything when in one); already-deleted rows are skipped. Repeated references delete once per level; diamonds/cycles terminate with at-least-once hook delivery."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Only document ", (0,jsx_runtime.jsx)(_components.code, {
        children: "deleteOne()"
      }), " is intercepted (", (0,jsx_runtime.jsx)(_components.code, {
        children: "pre"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "post('deleteOne', { document: true, query: false })"
      }), "); query deletes and query updates bypass the cascade. The ", (0,jsx_runtime.jsx)(_components.code, {
        children: "pre"
      }), " hook validates the execution context before the parent is removed, while the ", (0,jsx_runtime.jsx)(_components.code, {
        children: "post"
      }), " hook runs after the parent is already removed. Typed filters accept per-field MongoDB operators (", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ price: { $gt: 5 } }"
      }), ") forwarded to Mongoose unchanged, and the no-argument ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findDependents()"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOrphans()"
      }), " overloads return ", (0,jsx_runtime.jsx)(_components.code, {
        children: "Partial"
      }), " maps with unsupported entries omitted. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "findOrphans()"
      }), " supports scalar ", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " relations and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "[{ type: ObjectId, ref }]"
      }), " arrays; dotted paths, ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ type: [ObjectId], ref }"
      }), " syntax, dynamic ", (0,jsx_runtime.jsx)(_components.code, {
        children: "refPath"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "foreignFilter"
      }), "-only relationships, and non-", (0,jsx_runtime.jsx)(_components.code, {
        children: "_id"
      }), " local keys resolve to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), " (see ", (0,jsx_runtime.jsx)(_components.code, {
        children: "docs/tasks/20260912-130000-moo-07-orphan-query-evidence.md"
      }), ")."]
    }), "\n", (0,jsx_runtime.jsx)(_components.h3, {
      id: "keycloak-user-sync",
      children: "Keycloak user sync"
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Install ", (0,jsx_runtime.jsx)(_components.code, {
        children: "@egose/keycloak-fluent"
      }), ", create a managed service-account client, and attach it to the user schema through the direct Keycloak subpath:"]
    }), "\n", (0,jsx_runtime.jsx)(_components.pre, {
      children: (0,jsx_runtime.jsx)(_components.code, {
        className: "language-ts",
        children: "import { createManagedKeycloakClient, keycloakUserSyncPlugin } from '@web-ts-toolkit/moo/plugins/keycloak-user-sync';\n\nconst keycloak = createManagedKeycloakClient({ baseUrl, authRealm: 'master', clientId, clientSecret });\n\n// Mapped attribute paths must exist in the schema. pendingPassword is a\n// virtual below and is never persisted to MongoDB.\nconst userSchema = new Schema({\n  providerId: String,\n  username: String,\n  email: String,\n  roles: [String],\n  tier: String,\n  tenantId: String,\n  subscription: { plan: String },\n});\n\nuserSchema\n  .virtual('pendingPassword') // pragma: allowlist secret\n  .get(function (this: { $locals: Record<string, unknown> }) {\n    return this.$locals.pendingPassword as string | undefined;\n  })\n  .set(function (this: { $locals: Record<string, unknown> }, value: string | undefined) {\n    this.$locals.pendingPassword = value;\n  });\n\nuserSchema.plugin(keycloakUserSyncPlugin, {\n  client: keycloak,\n  realm: 'application',\n  identifyBy: ['providerId', 'username', 'email'],\n  managedRoles: ['admin', 'editor', 'viewer'],\n  managedAttributes: ['tenantId', 'plan'],\n  paths: { password: 'pendingPassword' }, // pragma: allowlist secret\n  syncFields: { email: true, firstName: true, lastName: true, roles: true, attributes: true, password: true },\n  passwordTemporary: true,\n  mapPassword(document) {\n    return document.get('pendingPassword') as string | undefined;\n  },\n  attributePaths: ['tenantId', 'subscription.plan'],\n  rolePaths: ['tier'],\n  passwordPaths: ['pendingPassword'],\n  mapRoles(_roles, document) {\n    return document.get('tier') === 'pro' ? ['editor'] : [];\n  },\n  mapAttributes(document) {\n    return {\n      tenantId: document.get('tenantId'),\n      plan: document.get('subscription.plan'),\n    };\n  },\n  onError(error, context) {\n    reportKeycloakSyncError(error, context);\n  },\n});\n"
      })
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The managed client authenticates lazily with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "client_credentials"
      }), ", checks token expiration when a request arrives, and shares one authentication attempt across concurrent requests. It uses no background timer, which makes it suitable for long-running processes and serverless functions. Declare it outside a serverless handler to let warm invocations reuse the current token. A ", (0,jsx_runtime.jsx)(_components.code, {
        children: "clientSecret"
      }), " resolver can load a rotated secret when authentication is required. Applications using custom grants can construct and authenticate ", (0,jsx_runtime.jsx)(_components.code, {
        children: "KeycloakAdminClientFluent"
      }), " directly instead."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The plugin syncs document saves and document ", (0,jsx_runtime.jsx)(_components.code, {
        children: "deleteOne()"
      }), " calls. It handles changed emails, verification emails, realm-role reconciliation, dynamic user attributes, opt-in password updates, custom field paths, per-field enablement, duplicate-email safety, redacted structured logging, and custom error handling. Email comparison is case-insensitive. Initial linking to an existing Keycloak user with the same email preserves the remote ", (0,jsx_runtime.jsx)(_components.code, {
        children: "emailVerified"
      }), " value and sends no verification email. Persisted local email changes and detected remote email drift reset ", (0,jsx_runtime.jsx)(_components.code, {
        children: "emailVerified"
      }), " and send VERIFY_EMAIL by default; set ", (0,jsx_runtime.jsx)(_components.code, {
        children: "sendVerificationEmailOnChange: false"
      }), " to skip the email action, or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "syncFields.emailVerified: false"
      }), " to disable all email-verification writes. Attribute values are normalized to Keycloak string arrays. Existing unmanaged Keycloak attributes are preserved; set ", (0,jsx_runtime.jsx)(_components.code, {
        children: "managedAttributes"
      }), " for keys the plugin may replace or remove. Password sync is disabled by default; enable ", (0,jsx_runtime.jsx)(_components.code, {
        children: "syncFields.password"
      }), " only for a short-lived, non-persisted pending-password virtual such as the example above — never an ordinary stored plaintext path or a stored hash. Passwords are not sent in create or profile-update payloads; created and existing users are updated through Keycloak's reset-password endpoint using ", (0,jsx_runtime.jsx)(_components.code, {
        children: "passwordTemporary"
      }), ", and a partially provisioned account stays disabled until its required credentials succeed. A newly resolved Keycloak ID is stored before optional password, role, and verification-email work so retries can target the same remote user. The application owns that plaintext input's lifecycle and should keep it short-lived, non-persisted, and out of logs, traces, or error reporters. Mapper dependencies are explicit (", (0,jsx_runtime.jsx)(_components.code, {
        children: "attributePaths"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "rolePaths"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "passwordPaths"
      }), ", honored only while the corresponding ", (0,jsx_runtime.jsx)(_components.code, {
        children: "syncFields"
      }), " entry is enabled), and the password mapper runs lazily — for creation or an actual password-sync intent only. Error loggers receive only the allowlisted ", (0,jsx_runtime.jsx)(_components.code, {
        children: "{ operation, localDocumentId, error: { name, code?, status? } }"
      }), " summary, never the message, stack, cause, or transport data, while ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onError"
      }), " keeps the original error. Set ", (0,jsx_runtime.jsx)(_components.code, {
        children: "includeDocumentInErrorContext: true"
      }), " only for private error handlers that can receive the full sensitive Mongoose document. Logger and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "onError"
      }), " failures do not replace the original sync error; with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "throwOnError: false"
      }), ", they are swallowed as best-effort observer failures. Query updates and deletes bypass document middleware. Post-save Keycloak errors cannot roll back the MongoDB save, so use an outbox when atomic delivery is required."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["For existing Keycloak users, synced string profile fields (", (0,jsx_runtime.jsx)(_components.code, {
        children: "username"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "email"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "firstName"
      }), ", and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "lastName"
      }), ") are cleared when the local value is ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), ", an empty string, or a whitespace-only string. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), " values and disabled ", (0,jsx_runtime.jsx)(_components.code, {
        children: "syncFields"
      }), " preserve unmanaged remote profile data. New-user creation omits clearing values. Existing unmanaged Keycloak attributes are preserved, including after email-based resolution. Managed attributes are removed when omitted, mapped to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "null"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "undefined"
      }), ", mapped to an empty array, or mapped to unsupported object values. Attribute keys named ", (0,jsx_runtime.jsx)(_components.code, {
        children: "__proto__"
      }), ", ", (0,jsx_runtime.jsx)(_components.code, {
        children: "prototype"
      }), ", or ", (0,jsx_runtime.jsx)(_components.code, {
        children: "constructor"
      }), " are rejected."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["The selected delivery contract is direct, non-atomic hooks. Keycloak work is not part of the MongoDB commit, and the plugin rejects documents saved or deleted with a Mongoose session or transaction. Applications that need transactional delivery should write their own outbox intent in the MongoDB transaction and process it after commit. Save failures after MongoDB persistence are observable through thrown errors/logging/callbacks but require an application-owned retry. Delete failures block the local deletion even when ", (0,jsx_runtime.jsx)(_components.code, {
        children: "throwOnError: false"
      }), ", so the same provider ID remains available for retry."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Configuration is validated during ", (0,jsx_runtime.jsx)(_components.code, {
        children: "schema.plugin(...)"
      }), ": ", (0,jsx_runtime.jsx)(_components.code, {
        children: "realm"
      }), ", configured paths, managed names, and attribute/role/password trigger paths must be non-empty; ", (0,jsx_runtime.jsx)(_components.code, {
        children: "identifyBy"
      }), " must be a supported non-empty identity list; and built-in synced field paths must exist in the schema. Mapper-driven ", (0,jsx_runtime.jsx)(_components.code, {
        children: "attributePaths"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "rolePaths"
      }), "/", (0,jsx_runtime.jsx)(_components.code, {
        children: "passwordPaths"
      }), " name the additional Mongoose paths the mapper reads (as in the example above). Options are snapshotted at registration, duplicate registration on the same schema is rejected, and ", (0,jsx_runtime.jsx)(_components.code, {
        children: "providerId"
      }), " is immutable after persistence so document updates cannot redirect synchronization to another Keycloak user."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Saves and deletes share one persisted-identity boundary. New local documents perform explicitly authorized initial linking through their current identity values. Existing documents resolve only through their persisted snapshot: a stored ", (0,jsx_runtime.jsx)(_components.code, {
        children: "providerId"
      }), " is authoritative, and a changed username or email that resolves to a different remote user fails closed instead of relinking — the conflicting update, credential reset, role change, or delete is never sent to that other account. A stale persisted ", (0,jsx_runtime.jsx)(_components.code, {
        children: "providerId"
      }), ", a missing persisted local row, or a delete of a never-persisted document is likewise rejected before any destructive remote call. Identity protection applies independently of ", (0,jsx_runtime.jsx)(_components.code, {
        children: "throwOnError"
      }), ": with ", (0,jsx_runtime.jsx)(_components.code, {
        children: "throwOnError: false"
      }), " a conflicting save still succeeds locally while leaving the other account untouched, and a conflicting delete always blocks local deletion so the verified binding remains retryable. Migration implication: rows whose stored ", (0,jsx_runtime.jsx)(_components.code, {
        children: "providerId"
      }), " no longer exists remotely fail closed on sync; clear or re-link the stored binding explicitly rather than changing a profile field and expecting a silent relink."]
    }), "\n", (0,jsx_runtime.jsxs)(_components.p, {
      children: ["Role sync is additive-only by default: desired local roles are assigned, but unrelated existing Keycloak realm roles are preserved. Set ", (0,jsx_runtime.jsx)(_components.code, {
        children: "managedRoles"
      }), " to the exact role names this plugin owns; only those roles may be removed when omitted from an explicit local roles array. An absent or non-array roles value is treated as no role-sync intent, while an empty array removes assigned managed roles and preserves unmanaged roles. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "ensureRoles"
      }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "true"
      }), ", so desired missing roles are created before assignment; set it to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "false"
      }), " if typos or insufficient administrative privileges should fail instead. ", (0,jsx_runtime.jsx)(_components.code, {
        children: "maxRolesPerSync"
      }), " defaults to ", (0,jsx_runtime.jsx)(_components.code, {
        children: "100"
      }), " and rejects larger desired role arrays before role lookup or mapping requests."]
    }), "\n", (0,jsx_runtime.jsx)(_components.p, {
      children: "Remote work is field-specific after identity resolution. A single owned profile or attribute change resolves the user and performs one update, without password reset or role reconciliation. A new user with no role-sync intent skips role mapping calls. Role reconciliation is sequential and deterministic; it performs one ensure/get pair per desired owned role plus one mapping list and optional add/remove calls. Realm metadata is fetched for each sync instead of cached, so duplicate-email policy changes are observed without an invalidation API."
    }), "\n", (0,jsx_runtime.jsx)(_components.h2, {
      id: "related-packages",
      children: "Related Packages"
    }), "\n", (0,jsx_runtime.jsxs)(_components.ul, {
      children: ["\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./access-router",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/access-router"
          })
        })
      }), "\n", (0,jsx_runtime.jsx)(_components.li, {
        children: (0,jsx_runtime.jsx)(_components.a, {
          href: "./access-router-runtime",
          children: (0,jsx_runtime.jsx)(_components.code, {
            children: "@web-ts-toolkit/access-router-runtime"
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