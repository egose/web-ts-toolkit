import {
  createAssetCatalogSync, inlineCss, inlineHtml, inlineFiles, inlineFilesSync,
  normalizePolicy, DEFAULT_POLICY, DEFAULT_MAX_SYNTAX_DEPTH, MAX_REASONABLE_MAX_SYNTAX_DEPTH,
  ResourceLimitError,
  type AssetResolverSync, type ResolverInput, type InlineOptions, type InlineFilesOptions,
  type AssetInlinerPolicy, type DiagnosticCode, type InlineResult, type InlineFileResult,
} from '@web-ts-toolkit/asset-inliner';

const resolver: AssetResolverSync = (input: ResolverInput, catalog) => {
  const base: string | undefined = input.resolutionBaseDir;
  const document: string | undefined = input.documentPath;
  const relative: string = input.decodedPath;
  void [base, document, relative];
  // @ts-expect-error hook context is a readonly public snapshot
  input.resolutionBaseDir = '/other';
  return catalog.getByBasename(input.basename);
};
const catalog = createAssetCatalogSync([{ data: new Uint8Array([1]), filename: 'a.png' }]);
const options = { catalog, resolver, maxSyntaxDepth: 512, inlineEmbeddedCss: true } satisfies InlineOptions;
const pure: InlineResult[] = [inlineCss('', options), inlineHtml('', options)];
const fileOptions = { catalog, targets: [], resolver, maxSyntaxDepth: 256, maxDepth: 32 } satisfies InlineFilesOptions;
const asyncFiles: Promise<readonly InlineFileResult[]> = inlineFiles(fileOptions);
const syncFiles: readonly InlineFileResult[] = inlineFilesSync(fileOptions);
const policy: AssetInlinerPolicy = normalizePolicy({ maxSyntaxDepth: 512 });
const optionalThreshold: number | undefined = policy.maxInlineBytes;
const code: DiagnosticCode = 'HTML_BASE_UNMAPPABLE';
const defaultDepth: 256 = DEFAULT_MAX_SYNTAX_DEPTH;
const maximumDepth: 512 = MAX_REASONABLE_MAX_SYNTAX_DEPTH;
const resourceCode: 'RESOURCE_LIMIT' = new ResourceLimitError('limit', { limit: 1, actual: 2 }).code;
// @ts-expect-error transforms require synchronous resolvers
const asyncResolver: AssetResolverSync = async () => undefined;
// @ts-expect-error syntax depth is numeric
const badOptions: InlineOptions = { catalog, maxSyntaxDepth: '512' };
// @ts-expect-error no default import is advertised
import inliner from '@web-ts-toolkit/asset-inliner';
// @ts-expect-error internal helpers are not public root exports
import { assembleSourcePatches } from '@web-ts-toolkit/asset-inliner';
void [pure, asyncFiles, syncFiles, DEFAULT_POLICY, optionalThreshold, code, defaultDepth, maximumDepth,
  resourceCode, asyncResolver, badOptions, inliner, assembleSourcePatches];
