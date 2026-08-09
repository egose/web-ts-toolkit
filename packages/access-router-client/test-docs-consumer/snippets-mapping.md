# ARC-20 Documentation Example — Snippets Mapping

This file is the explicit catalog required by ARC-20 implementation requirement #4
("Extract and semantically compile complete TypeScript examples against the
packed artifact; provide explicit fixtures for intentionally partial snippets").

It records, for every TypeScript code block in the _installed_ README/`llms.txt`
and the _website_ docs under `website/docs/packages/access-router-client/`,
which extracted fixture compiles it. Blocks that are intentionally partial
(one-line concept snippets that cannot compile on their own) are listed as
partial and are exercised through a larger embedded fixture so the names and
option keys they reference still fail the compile if the public contract
drifts.

## Compiled fixtures

The fixtures live in `examples/` and are semantically compiled by
`access-router-client.docs.compile.test.ts` against the packed npm tarball
(the same artifact exercised by ARC-18's packed-consumer test).

| Fixture                | Source block(s)                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `readme-quickstart.ts` | README.md "Quick Start"; index.md "Quick Start"                                                                               |
| `adapter-setup.ts`     | adapter.mdx "Basic Setup", "Adapter Options", "Matching Server Paths"; README.md "Contract"                                   |
| `services-model.ts`    | services.mdx "ModelService" "Advanced query", "Service Defaults"                                                              |
| `services-subdocs.ts`  | services.mdx "Subqueries", "Subdocument Helpers" + the create/update/bulk/edit example block                                  |
| `services-data.ts`     | services.mdx "DataService" "Advanced read options", "Example"                                                                 |
| `model-basics.ts`      | model.mdx "Basic Usage", "Dirty Tracking" + Revert, "`save()`", "`reset()`", "Field Collisions", `new Model`                  |
| `model-nested.ts`      | model.mdx "Nested-edit contract"                                                                                              |
| `types-filters.ts`     | typescript-and-errors.mdx "Selected Field Inference", "Filter Query Types", "Escape hatches", "Overriding The Inferred Shape" |
| `types-responses.ts`   | typescript-and-errors.mdx "Important Response Types"; index.md "Response shape"                                               |
| `types-errors.ts`      | typescript-and-errors.mdx "Error Handling Modes", "`ServiceError`", "One Practical Rule"                                      |
| `group-wrapper.ts`     | adapter.mdx "Wrapped Endpoints", "Adapter-Level vs Service-Level", "Dynamic path segment encoding"                            |

## Intentionally partial snippets (embedded into the fixtures above)

These blocks demonstrate a single expression and are not standalone
programs. They are intentionally not extracted into their own `.ts` files;
their referenced names and option keys are exercised by being embedded in the
larger fixture listed alongside them so a rename or removal still fails the
compile test.

| Source partial block                                                                         | Embedded inside                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| model.mdx `read.data.name;` (one line)                                                       | `model-basics.ts`                                                                                                                                                                                                                                    |
| model.mdx `user.data.get('statusHistory.0.label');`                                          | `model-basics.ts`                                                                                                                                                                                                                                    |
| model.mdx collision snippet `doc.data.set('save', 'field-value');`                           | `model-basics.ts`                                                                                                                                                                                                                                    |
| model.mdx dirty revert `user.data.role = baseline;`                                          | `model-basics.ts`                                                                                                                                                                                                                                    |
| typescript-and-errors.mdx `user.raw; // Pick<User, 'name' \| 'role'>`                        | `types-filters.ts`                                                                                                                                                                                                                                   |
| adapter.mdx `adapter.wrapGet('reports/{{id}}');` one-liner                                   | `group-wrapper.ts`                                                                                                                                                                                                                                   |
| adapter.mdx `userService.wrapPost('chairman');` one-liner                                    | `group-wrapper.ts`                                                                                                                                                                                                                                   |
| typescript-and-errors.mdx negative `await adapter.group(user, count);` "This does not" block | not compiled — the deliberate-invalid await is intentionally NOT extracted into a `.ts` file because there is no `@ts-expect-error` to anchor it (it does not fail at compile time, only at runtime). Documented in the "Negative" subsection below. |
| service subquery `sq` snippet alone                                                          | `services-subdocs.ts`                                                                                                                                                                                                                                |

## Negative snippets

The website's "This does not" group example (`await adapter.group(awaited, awaited)`)
is a runtime guard, not a compile guard — `adapter.group(...)` accepts
`LazyRequest<unknown>[]` and an already-awaited value is just an
unbatchable resolved promise at runtime. It compiles fine, so it is not
extracted as a `@ts-expect-error` fixture. The runtime failure path is
covered by the package's runtime unit tests; the documentation compile
test stays strictly about compile-time drift in the documented public
contract.
