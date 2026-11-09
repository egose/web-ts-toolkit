import type {
  DocumentAuthorization,
  ModelOutputContext,
  ModelRouterOptions,
  OutputFieldOptions,
  ServiceOutputContext,
} from '@web-ts-toolkit/access-router';
import type { DocumentAuthorization as AdvancedHandle } from '@web-ts-toolkit/access-router/advanced';
import type { DocumentStage } from '@web-ts-toolkit/access-router';
import type { DocumentStage as AdvancedStage } from '@web-ts-toolkit/access-router/advanced';
import type { DocumentAuthorization as ProcessorHandle } from '@web-ts-toolkit/access-router/processors';

export const legacy: ModelRouterOptions = { unsafeUseReadAuthorizationFastPath: false };
export const invalidMode: ModelRouterOptions = { readAuthorizationMode: true };
export const oldHelper: OutputFieldOptions = { documentAuthorization: {} };

export function invalidOutput(context: ServiceOutputContext, diagnostic: ModelOutputContext) {
  context.documentAuthorization;
  context.getDocumentAuthorization({});
  diagnostic.mongooseModel;
  diagnostic.originalDocumentSnapshot;
  diagnostic.currentDocument;
  diagnostic.resolvedQuery?.filter;
  diagnostic.scopePath.push('forged');
  diagnostic.docPermissions.owner = true;
}
export type RemovedHandle = DocumentAuthorization | AdvancedHandle;
export type RemovedPrivateStage = DocumentStage | AdvancedStage | ProcessorHandle;
