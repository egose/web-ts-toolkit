# BDECO-09 Evidence Report: Scoped Property Enforcement And Inherited Remapping

Parent task: `docs/tasks/20260907-121236-access-router-deco-boundary-review.md` (Task BDECO-09, investigation).
Status of BDECO-09: investigation complete, implementation deferred to follow-up BDECO-09-F01 (pending maintainer approval).
No source semantics were changed by this investigation. BDECO-06 and BDECO-08 work is preserved (no edits to `src/factory.ts` argument assembly, `src/interfaces.ts`, or `src/decorators/class.decorators.ts`).

## 1. Bounded Scope

Only these property APIs were examined:

- `src/decorators/property.decorators.ts:9-19` (`OptionMetadata`, no scope field), `:37-68` (`createOptionDecorator`, same-prototype replace by property OR option key).
- `src/metadata.ts:50-68` (`getOwnMetadataListFromPrototypeChain`, dedupe by `optionKey` only).
- `src/factory.ts` property registration (`registerPropertyOptions`, `bootstrapEgose`, `bootstrapModelRouter`, `setDefaultModelRouterOptions`, `setModelRouterOptions`): every stored entry is applied unconditionally via the class-role setter; the decorator used is not recorded or checked.
- `test/strict-consumer-types.test.ts:68-73`, `:109-116` (explicit-key scope negatives) and `test/inheritance-symbol.test.ts:447-481` (same-key replacement baseline).

## 2. Evidence (all reproduced against fresh V1 build, retained as passing tests)

Retained experiments (assert CURRENT behavior; names `BDECO-09/E1`–`E10` in `test/inheritance-symbol.test.ts`, plus compiling bypass fixtures in `test/strict-consumer-types.test.ts`):

| #   | Case                                                                                         | Observed (current) behavior                                                                                                                                        | Enforceable today?      |
| --- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| E1  | Wrong-role: `GlobalOption('requestPermissionField')` on a default `@RouterOptions` provider  | Value lands in **default model options** (`getDefaultModelOption` returns `'MY_FIELD'`); global stays at default                                                   | No (silent misroute)    |
| E2  | Wrong-role: `ModelOption('basePath')` on a `@Module` class                                   | Value lands in **global options**; model keeps default                                                                                                             | No (silent misroute)    |
| E3  | Wrong-role: `DefaultModelOption('idParam')` on a model `@Router` class                       | Value lands in **model options**; default untouched                                                                                                                | No (silent misroute)    |
| E4  | Inferred-key / typo: `Option()` with property `operationAcess`; `Option('operationAcess')`   | Stored verbatim as `optionKey: 'operationAcess'`; runtime stores unknown key `true` without error                                                                  | No                      |
| E5  | Wrong-value: `@ModelOption('listHardLimit') limit = 'not-a-number'`                          | Stored verbatim; `getModelOption` returns `'not-a-number'`                                                                                                         | No                      |
| E6  | Inheritance same-property/different-key: base `myProp -> keyA`, child `myProp -> keyB`       | **Both** mappings survive; both resolve to the child's value                                                                                                       | No (stale base mapping) |
| E7  | Inheritance same-key/different-property: base `oldProp -> shared`, child `newProp -> shared` | Child replaces base (length 1)                                                                                                                                     | Yes (keep)              |
| E8  | Symbols + three-level inheritance                                                            | Symbol keys replace like strings; distinct keys accumulate base-to-derived                                                                                         | Yes (keep)              |
| E9  | Same-prototype redecoration                                                                  | Replaces by property OR option key (single entry)                                                                                                                  | Yes (keep)              |
| E10 | Stored metadata shape                                                                        | `{ optionKey, propertyKey }` only; **no scope discriminator** (`'scope' in entry === false`) for any of `Option`/`GlobalOption`/`ModelOption`/`DefaultModelOption` | Fact                    |

Type-system limitations (proven by fixtures that compile under `strict` + `skipLibCheck: false`):

- Explicit-key cross-scope misuse IS rejected (`ModelOption('requestPermissionField')`, `DefaultModelOption('basePath')`, `GlobalOption('listHardLimit')` all `@ts-expect-error`, pre-existing).
- Inferred keys bypass everything: `@GlobalOption()` on `operationAcess`, `@ModelOption()` on `notARealKey`, `@DefaultModelOption()` on `whatever` all compile.
- Property value types are unchecked by decorators: `@ModelOption('listHardLimit') limit = 'not-a-number'` and `@GlobalOption('requestPermissionField') field = 12345` compile.
- Decorators cannot know the class role (`@Module` vs `@Router` vs `@RouterOptions`); wrong-role placement (E1–E3) is invisible to the type system.
- Legacy `Option(optionKey?: string)` accepts any string, including typos, by design.

Explicit correction of a possible misreading: **scoped decorators do not validate values at runtime.** E5 proves a wrong-typed value passes through to the runtime store. No such claim survives this report.

## 3. Recommended Contract (not implemented)

1. **Explicit runtime scope validation (recommended over documented key-name conveniences).** Key-name documentation alone is insufficient: typings already constrain explicit keys, yet E1–E3 misroutes persist because placement is unchecked and inferred keys bypass key checking entirely. Recommendation: store the declaring decorator's scope (`global` | `model` | `default`) in `OptionMetadata` at decoration time and validate at bootstrap against the class role, failing fast on mismatch. This is a **breaking change** for any shipped consumer relying (accidentally or deliberately) on cross-role writes, so it requires maintainer approval and a migration/release note before implementation.
2. **Legacy `Option` key/value checking (feasible only in narrowed form).** `Option` accepts arbitrary strings to support extension keys, so a closed allowlist would break legitimate use. Feasible without breaking: near-miss typo warnings for known keys (e.g. `operationAcess`) and runtime value-type checks only for known keys with unambiguous types. Even warnings change observable behavior; maintainer must approve the exact policy (throw vs warn vs silent + docs).
3. **Child remapping semantics (recommended): consistency with same-prototype replacement (E9).** Specify: inheritance merge keeps dedupe-by-`optionKey` with child-wins (E7, E8 preserved), and additionally drops a base entry when a derived prototype maps the **same propertyKey** to a **different optionKey** (fixes E6). Same-key/different-property (E7), symbol keys, and three-level chains behave identically to string keys, applied transitively base-to-derived. Rationale: E9 already establishes "one property, one mapping" on a single prototype; E6 is the same situation split across levels and should not produce two live mappings for one property. This also changes observable behavior for anyone relying on the duplicate write, so it ships under the same maintainer approval, but with lower migration risk than scope enforcement.

## 4. Decision Record

- BDECO-09 implements **no semantic change**. All findings above are recorded as evidence-descriptive, passing tests.
- The breaking halves (scope enforcement, typo/value policy, remap dedupe) move to follow-up **BDECO-09-F01**, blocked on maintainer approval.
- Approving maintainer: **TBD (unassigned)** — BDECO-12 to assign a named decision owner; until then F01 stays blocked and the residual risks below stand.

## 5. Implementation Follow-up BDECO-09-F01 (unique ID)

Scope (only after maintainer approval of §3):

- (a) Add scope discriminator to `OptionMetadata`, validate decorator scope against class role at bootstrap, fail fast with a named error; cover wrong-role cases E1–E3 in both directions plus inferred-key wrong-role variants.
- (b) Decide and implement the legacy `Option` typo/value policy (throw vs warn), covering E4–E5 shapes.
- (c) Implement propertyKey-aware inheritance dedupe (E6 fix) while preserving E7/E8/E9; cover same-key/different-property, symbols, and three-level chains.
- (d) Ship together: source JSDoc, README + website docs, emitted declaration checks, migration/release notes for the breaking contract changes.

Regression criteria:

- New negative tests fail on the pre-F01 implementation (wrong-role throws, typo policy triggers, E6 yields a single mapping); all E7/E8/E9 semantics preserved.
- Existing suites (`inheritance-symbol`, `strict-consumer-types`, `factory`, `bootstrap-*`, packed-consumer) pass unmodified except for intentionally updated expectations documenting the new contract.

Verification: V1 focused tests after a fresh serial build; then V2; then V3 (public type/metadata surface changes). Serial builds only (shared `dist/`).

Release implications: breaking — requiresminor or major bump per repo policy, migration note for consumers with cross-role property decorators or duplicate remapped mappings, and BDECO-12 review before release.

## 6. Residual Risk (accepted pending F01)

- Misplaced scoped property decorators silently write to the wrong option store (E1–E3).
- Typo keys and wrong-typed values pass through to the runtime (E4–E5).
- Child property remapping leaves a stale base mapping that also tracks the child's value (E6).
