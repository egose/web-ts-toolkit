# ARPC-07 — keep/remove ledger

Related [report](arpc-07-report.md), [verification](arpc-07-verification.json).
Source references identify symbols, not permanent line numbers. Reviewed baseline:
`6c3ceee`; all production source bytes matched that revision before cleanup.

## Reachability proof before removal

1. Dedicated repository-wide content searches covered current source, tests,
   scripts, documentation and entrypoint references, including existing untracked
   task work. Private caller bodies, not just signatures, were inspected.
2. A Python `os.walk(..., followlinks=False)` whole-checkout text scan covered
   **4,480 UTF-8 text files**, including hidden historical work and ignored generated
   distributions/declarations. Only `.git`, `node_modules`, `_tmp*` directories,
   symlinks and binary/non-UTF-8 contents were excluded. Historical seals and
   third-party dependency trees are not current package reachability roots.
3. Inspected all declared entrypoints and packaging: `package.json`,
   `tsup.config.ts`, `src/index.ts`, `src/advanced.ts`, `src/processors.ts`, their
   interface/barrel boundary and the eight current generated declarations.
   Public subpaths are only `.`, `./advanced`, `./processors`; `src` is not shipped.
4. Extra static-chain hits outside the two current source modules were task text,
   historical frozen/release bundles/profiles, and negative packed export/type
   assertions. The latter explicitly assert these names are **absent**, not invoke
   them. None imports a current static-chain function for execution.
5. A post-edit scan of current tracked/nonignored-untracked `packages/` and
   `scripts/`, plus every current access-router `dist` file, found **zero** hits for
   all six removed names. Public declaration bytes remained identical and the
   package's export/packed checks passed.

`rg` was not installed; its two failed invocations supplied no evidence. The
dedicated search and explicit Python scanner above were the successful fallback.
Historical trees were read only; no historical probe/profile was rerun or edited.

## Removed

| Candidate | Baseline source/caller evidence | Disposition |
| --- | --- | --- |
| `prepareStaticOutputPaths` | `acl/output-field-policy.ts`: one definition, no current caller in any source/test/script or entrypoint; absent from generated exports/declarations | Remove the unused private entry and body |
| `staticFieldPolicy` | Same file: definition and sole call from `prepareStaticOutputPaths` | Remove with dead chain |
| `StaticOutputPath` | Same file: interface and sole return-type use by `prepareStaticOutputPaths` | Remove private type, not a published API |
| `booleanRuleLookup` | Same file: definition, recursion and sole external-to-function call from `prepareStaticOutputPaths` | Remove with dead chain |
| `ordinaryContainer` | Same file: definition and three calls, all within `booleanRuleLookup` | Remove with dead chain; remove now-unused `node:util.types` import |
| `canPrepareStaticOutputPolicy` | `acl/service-authorization.ts`: definition; only import/use is dead `staticFieldPolicy` | Remove eligibility function; active readers and binding checks stay |
| `isCatalogOutputPath` import in policy module | Used there only by dead `prepareStaticOutputPaths`; the field-catalog function has other live consumers | Remove this import only, not the live catalog helper |
| `FinalizeModelOutputArgs.snapshot` | `output/finalize-model-output.ts`: never read; real finalizer policy comes from authenticated `args.plan.authorization` via `readServiceFinalizerConfiguration` | Remove argument/type member and source caller properties; no replacement config API |
| Source snapshot plumbing | `Service.finalizeDirectOutput`, `Service.finalizeSinglePopulateTarget`, `finalizeSubdocumentRows` supplied the unused property | Delete those properties and subdocument-only type import; retain metadata configuration where consumed |
| Test snapshot plumbing | `owned-stage-test-fixture`, `service-authorization-finalizer`, `owned-authorization-boundaries`, `owned-authorization-stage`, `virtuals-populate-dependencies` traversal/integration | Remove finalizer-only properties/import and two traversal captures used solely for those properties; preserve assertions and all actual authorization configuration captures |
| `finalizeDirectOutput.sharedGate` | `services/service.ts`: signature plus three object properties; no body read | Remove this slot/properties; retain the same gates used by populate and finalizer internals |
| Private prepared workers' `decorate` | `findPrepared`, `createPrepared`, `updateOnePrepared`: no body use; constructor executor closures only forwarded their unused slot | Remove these three optional slots and constructor forwarding |
| Private executor decoration types | `acl/service-execution.ts`: `ServiceExecutors.find/create/updateOne` declared three unused optional slots; live `prepared-query.ts` dispatch never supplied them | Remove slots, local alias and now-unused type import; preserve the executor methods |

## Kept

| Candidate/boundary | Live role and reason |
| --- | --- |
| `callFieldPolicy`, `prepareOutputPath`, `requestRuleClassification`, `clearOutputFieldPolicy` | Imported/invoked by `acl/output-field-filter.ts` for active field-rule preparation, evaluation and settlement cleanup. Keep their policy shape, caches, work charges, binding checks and behavior unchanged. |
| `captureVirtualSnapshot` | Public method, live internal sort/other query consumers and admission/work tests; returned `FinalizeSnapshot` remains present in the shipped declaration graph. |
| `FinalizeSnapshot` | Live return/inspection/planning type in service/core/populate metadata. Do not remove it because the finalizer stopped accepting its unused argument. |
| `PopulateTargetMeta.snapshot` | Current package configuration tests inspect captured schema/populate policy and next-call replacement through it. Not a candidate for removal in this bounded task; construction remains unchanged. Ownership comments now distinguish this inspection snapshot from the plan's authenticated finalizer policy. |
| Public `ServiceOutputDecorator` and service/public wrapper decoration arguments | Live presentation API on `find`, `create`, `updateOne`, `updateById`, `upsert` and their wrapper paths. Public parameter types and compiled declarations are unchanged. |
| `prepared-query.ts` decoration arguments / `decorateResult` | Live shared boundary: perform/settle output work, then decorate successful single/list results using the request hook gate/scheduler. Left byte-identical. |
| Prepared worker methods themselves | Live private dispatch targets; tests also spy on `createPrepared` or assert direct-boundary rejection. Only their unused decorator slots were removed. |
| Other `sharedGate` parameters and `SharedHookGate` | Live/population-facing plumbing and existing public utility signatures; not part of `finalizeDirectOutput`'s unused object slot. No broad unused-argument sweep was attempted. |
| `snapshot` source/document-stage inputs | Live document ownership, grant resolution and projection/planning inputs; the word `snapshot` alone is not evidence of dead code. |
| Field-catalog helper, access-policy readers and materializers | Live policy enforcement/native-copy/publication/work-budget code; no rewrite or fast path was introduced. |
| ARPC-02 / ARPC-05 candidates | Remain withdrawn. This cleanup does not claim their proposed setup/logging work reduction or revive either performance design. |

## Comment corrections

- `service-authorization.ts` hydration, document-permissions, finalizer and
  field-rule readers construct private wrappers over call-owned slices; they do
  not recopy native configuration on each read.
- `authorization-snapshot.ts` now distinguishes private reuse from native copies
  needed at application exposure boundaries; frozen Date/Buffer/BSON leaves alone
  are not immutable.
- `output-field-policy.ts` no longer compares active cache eligibility to the
  removed pure-batch policy. It describes invariant preparation, not row decisions.
- `populate-target.ts` no longer calls its separate inspection snapshot finalizer
  authority. Real finalization consumes the authenticated private plan/call.

## Verification boundary

See the report and JSON for exact executed commands/results. This ledger records
maintainability reduction and preserved behavior, **not** a speedup, byte-size or
allocation measurement. The independent full package acceptance remains ARPC-08;
no root/grouped/downstream suite was used as a substitute.
