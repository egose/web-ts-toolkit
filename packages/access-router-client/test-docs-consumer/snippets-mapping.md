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

## Machine-readable block inventory

The compile gate reads this tab-separated inventory. `source` plus `ordinal`
identifies a TypeScript fence in document order, and the full SHA-256 digest
makes any content change require an explicit mapping review. `derived` means
the fixture adds the declarations or surrounding context needed to compile the
documented operation. `partial` and `negative` are explicit exclusions from
standalone compilation; a fixture may still embed and compile their public API
references.

```text docs-block-map
# source	ordinal	sha256	classification	fixture-or--
packages/access-router-client/README.md	1	ea7f7dc92479cfb046e024221154724a81f43c282438921f949548bbccf1ca63	derived	readme-quickstart.ts
packages/access-router-client/README.md	2	5d8930b349e2001a9e4d170fe0b5b03b647ff09bacf8ab94bb0416aa93abe910	exact	readme-exports.ts
packages/access-router-client/llms.txt	1	6db26e108fd3e45bb6d5154b747f431943bbb914c027055514202d88e759199e	derived	readme-quickstart.ts
packages/access-router-client/llms.txt	2	0cb6d1d0b741cc903bc3f4e7a3d00136f130fd703f3ceb02275e36368e105a13	derived	services-data.ts
packages/access-router-client/llms.txt	3	5b07e991c4d49e4e151554cc017cf6d018b090d4f11acceef1daf11b3aab2f11	derived	readme-quickstart.ts
website/docs/packages/access-router-client/adapter.mdx	1	978d6eafe686d3c3cc940e6745195c5bb4e288093f9232e13c160458574b121c	derived	adapter-setup.ts
website/docs/packages/access-router-client/adapter.mdx	2	ce55cb2a7a693ea85b6dff6a4262321a2c1e216faf00bec6efd910d11fbf8532	derived	adapter-setup.ts
website/docs/packages/access-router-client/adapter.mdx	3	a6a7ce5ecc084f51a8510b2b643f6bffba059e47151c781f9209e31ac5983043	derived	services-model.ts
website/docs/packages/access-router-client/adapter.mdx	4	f7c4b56e0c8596f037b4593d22ae6b635ad3e092af2a98b1bd6a38bc12c4aee1	derived	services-data.ts
website/docs/packages/access-router-client/adapter.mdx	5	f043e7b74b90d45bc3e80be4e9caad569f3c15e9b96d6b3ae178ed9382e2ba8a	derived	services-model.ts
website/docs/packages/access-router-client/adapter.mdx	6	4d1eba814b865a714e98c2f8a2f96dcf56f37647285b020afe975e2a473f42de	derived	readme-quickstart.ts
website/docs/packages/access-router-client/adapter.mdx	7	0163fd5b071be33002cca198b604bcb035d68832289fe4d90602cb645248767f	derived	group-wrapper.ts
website/docs/packages/access-router-client/adapter.mdx	8	6240133c23b4f9aa0846f3db543b10dbe27f1cebf953c090778ef2cb323db748	partial	group-wrapper.ts
website/docs/packages/access-router-client/adapter.mdx	9	01f1153df6973011f6c5a108fbd2c69f8b8bf193e0a25e63de4ba4a569676447	partial	group-wrapper.ts
website/docs/packages/access-router-client/index.md	1	a4cc07f36b293f2635c4a9483cbc596785491f8abbc6035fad4f14afc6d21fd0	derived	readme-quickstart.ts
website/docs/packages/access-router-client/index.md	2	767a31378fc5a8402f4fe2f6bd92e8c6c37c9fee829b79ea02602782bfeb6005	derived	types-responses.ts
website/docs/packages/access-router-client/index.md	3	26574f0623cb1cf32581187499c5f6ba8f723ec534034412f97071c79cbf55cb	derived	adapter-setup.ts
website/docs/packages/access-router-client/model.mdx	1	8593879a98b8ffa877bf8c1741fa78986b6009738eebaefac1b9e0e57443be09	derived	model-basics.ts
website/docs/packages/access-router-client/model.mdx	2	50fa35b4772ea219a757e830a787762ff8f7b259dd68ca06539794e25b8bf2ad	derived	model-basics.ts
website/docs/packages/access-router-client/model.mdx	3	96918d3986f465ede565362a0b10d486abd9d51e7d643e93052c1103beebf9ee	partial	model-basics.ts
website/docs/packages/access-router-client/model.mdx	4	8d768f06b5ad09299c257571d3f23942a4f966b14188ae2af966688b3185cbec	partial	model-basics.ts
website/docs/packages/access-router-client/model.mdx	5	c26de1f0de8191169406e463c187875db82cd4603b763af766184b2824d3b569	derived	model-basics.ts
website/docs/packages/access-router-client/model.mdx	6	bbd7e9b8b21c1cdc46eb2ba6ebe90647d404e905268e53139fa702f73ed76089	derived	model-nested.ts
website/docs/packages/access-router-client/model.mdx	7	346eafa2ba0cbf785061119403ee7346d86e3dd8b04a45a8488de17d4dcfa222	derived	model-nested.ts
website/docs/packages/access-router-client/model.mdx	8	9b43a3f9a4645e1b7e979d52a7172ed30211c28a6989721fb81a305ee971bce8	derived	model-nested.ts
website/docs/packages/access-router-client/model.mdx	9	40ef3ab89138b58218aaef6f557372238871cf3d95da17251bd26fe8c856c97a	derived	model-nested.ts
website/docs/packages/access-router-client/model.mdx	10	6ce014628e4295ef699080091c9345692a133ba2f9c75a079de2dfb0e2a645c4	derived	model-basics.ts
website/docs/packages/access-router-client/model.mdx	11	ab46a48dc26f2eb44ba6f73b866ac9da16349a12014bca7acd36c66e1a8647a7	derived	model-basics.ts
website/docs/packages/access-router-client/model.mdx	12	be06d00afe55ea0c98d7164693c8f34574ec3439243e5c2130b6d9e2303258ff	derived	model-basics.ts
website/docs/packages/access-router-client/model.mdx	13	700e5203a192ea85ca5c5c0d136b43504b12cfcc896d26ab5a648ff6134a4374	derived	model-basics.ts
website/docs/packages/access-router-client/services.mdx	1	0f9ec812d078a3ce6ea472cefc90e85aecbe03a04e8df2cc6a038cb180bd9f04	derived	services-model.ts
website/docs/packages/access-router-client/services.mdx	2	d1894fd51037772667dc6e0dc1a4fa8bfcd1528871dd9a03bf9a2a610aca7fee	derived	services-subdocs.ts
website/docs/packages/access-router-client/services.mdx	3	842d9a759b6c4dd5b0ecdc4241b17a3f074f6da74949be5fe1e1be29e402af12	derived	services-subdocs.ts
website/docs/packages/access-router-client/services.mdx	4	4e31655c970519031b86dca1b9e0a1722fc36d8e97ccef66d202502065bf8098	derived	services-subdocs.ts
website/docs/packages/access-router-client/services.mdx	5	0866c9b4151eea73e93b8cae0b73d7b064c9df4514407f103c18dc1c95d1b8a3	derived	services-subdocs.ts
website/docs/packages/access-router-client/services.mdx	6	0501452003f001d2d9570fd2f92d950428162f974642b113f39f4c00bd44a741	derived	services-data.ts
website/docs/packages/access-router-client/services.mdx	7	632a7be2a21f64b2ecedcbcfaa505b077fb0d20e3a52380be6d68e1195f74a28	derived	types-errors.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	1	a6a7ce5ecc084f51a8510b2b643f6bffba059e47151c781f9209e31ac5983043	derived	services-model.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	2	057a96919d48619bce4092343555e7d2b9df738ad611b4c4c255a5be8d9ee1f1	derived	types-filters.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	3	d9fe86f2aac264aed6ed918adb206cb0d567593fb5a32b2150596701fc89bce2	derived	types-filters.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	4	a1d7bfa3ab5a31c16d69ab5b8e082532df4338b01b5c747748c775b0332ddcde	negative	-
website/docs/packages/access-router-client/typescript-and-errors.mdx	5	bb603304fbe88689a0082a2e4656e62eb129c8ec3a7805d423d0833f8c418d34	derived	types-filters.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	6	b851a82cb399bc36fdeb4908a3ee7eb3f4540cb6a280cbfee7acd378062a0df7	derived	types-filters.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	7	c04e2c3be4024f616142906734d1c3d62daede0c6979b52133e8491e89991b76	derived	types-mutation-inputs.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	8	8eb9b3195c1227b66f4b77e51f06184f8a8d55a27f7a690260d46cb02b3c47df	derived	types-mutation-inputs.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	9	bcb410da5c3114298f2324f9fd5ea597b98219c1d0dcaa0a6a1ca6d4592b79c6	derived	types-responses.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	10	011d0a5047e6a65cc9907e9508dade834753456e07d1403a35bc4c6c306a761b	derived	types-errors.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	11	1f2b2b9026b136da5914bb0db4a04be230e991e25612d47c0ae9b10c9853141a	derived	types-errors.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	12	0c46167967fb5accefceb38810a7c16625264330cf4a4a5260253dd27a9d0bc9	derived	types-errors.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	13	f8c67eb98fffca82fd445b891365e1ab6ed89b7221ed657cd8636d625a4361b4	derived	types-errors.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	14	39f63409a0102ce94652429533a07dd17ea9ef752cc14225a5f97b7e09fe0f30	derived	types-responses.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	15	eca019ec389680a6763d22d73182871d34df944e76494000c0009647d8124948	derived	group-wrapper.ts
website/docs/packages/access-router-client/typescript-and-errors.mdx	16	72fece6ae30cdd5f92b2958f495a01ca840813ecba92ff61ae5ebd05fa663aaf	negative	-
```

## Compiled fixtures

The fixtures live in `examples/` and are semantically compiled by
`access-router-client.docs.compile.test.ts` against the packed npm tarball
(the same artifact exercised by ARC-18's packed-consumer test).

| Fixture                    | Source block(s)                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `readme-quickstart.ts`     | README.md "Quick Start"; index.md "Quick Start"                                                                                                 |
| `readme-exports.ts`        | README.md "Main Exports" (verbatim extracted block)                                                                                             |
| `adapter-setup.ts`         | adapter.mdx "Basic Setup", "Adapter Options", "Matching Server Paths"; README.md "Contract"                                                     |
| `services-model.ts`        | README.md "Unreleased Migration" model-create cardinality; services.mdx "ModelService" "Advanced query", "Service Defaults"                     |
| `services-subdocs.ts`      | services.mdx "Subqueries", "Subdocument Helpers" + the create/update/bulk/edit example block                                                    |
| `services-data.ts`         | services.mdx "DataService" "Advanced read options", "Example"                                                                                   |
| `model-basics.ts`          | model.mdx "Basic Usage", "Dirty Tracking" + Revert, "`save()`", "`reset()`", "Field Collisions", `new Model`                                    |
| `model-nested.ts`          | model.mdx "Nested-edit contract"                                                                                                                |
| `types-filters.ts`         | typescript-and-errors.mdx "Selected Field Inference", "Filter Query Types", "Escape hatches", "Overriding The Inferred Shape"                   |
| `types-mutation-inputs.ts` | typescript-and-errors.mdx "Mutation Input Types"                                                                                                |
| `types-responses.ts`       | README.md / index.md "Unreleased Migration" response narrowing; typescript-and-errors.mdx "Important Response Types"; index.md "Response shape" |
| `types-errors.ts`          | typescript-and-errors.mdx "Error Handling Modes", "`ServiceError`", "One Practical Rule"                                                        |
| `group-wrapper.ts`         | adapter.mdx "Wrapped Endpoints", "Adapter-Level vs Service-Level", "Dynamic path segment encoding"                                              |

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
