import { readDocumentStage } from '../acl/document-stage';
import { requestOutputFieldPaths } from '../acl/output-field-filter';
import type { OutputPublication } from '../acl/output-publication';
import type { AuthorizationBinding, readServiceOutputMetadata } from '../acl/service-authorization';
import {
  defineTrustedOutputValue,
  setTrustedOutputPath,
  unsetTrustedOutputPath,
  visitTrustedOutput,
  type TrustedOutputBudget,
} from '../acl/trusted-output-materialization';
import type { FinalizeModelOutputArgs } from '../output/finalize-model-output';
import { getIncludeSource, restoreIncludeOutput } from '../output/include-output';
import { attachPermissionsAlias, removeGeneratedPermissionsAlias } from '../output/permissions-alias';

interface ModelOutputMetadataInput {
  doc: unknown;
  includePermissions?: boolean;
  includeFieldPermissions?: boolean;
  privateAssociationField?: string;
  budget: TrustedOutputBudget;
  publication: OutputPublication;
}

interface FieldPermissionAccess {
  readIds?: Set<string>;
  updateIds?: Set<string>;
}

/** Capture references only; completion reads the row and live field access at its existing boundary. */
export function createModelOutputMetadataCompletion(
  args: ModelOutputMetadataInput,
  binding: AuthorizationBinding,
  configuration: ReturnType<typeof readServiceOutputMetadata>,
  readFieldPermissionAccess: () => FieldPermissionAccess | undefined,
  queryFieldPermissionAccess: (ids: unknown[], publication: OutputPublication) => Promise<FieldPermissionAccess>,
): NonNullable<FinalizeModelOutputArgs['completeOutput']> {
  return async (output, stage, construction) => {
    const { grants } = readDocumentStage(stage, binding);
    // Private field-row bookkeeping remains outside every callback diagnostic.
    const source = getIncludeSource(args.doc) as Record<string, unknown>;
    if (args.privateAssociationField) unsetTrustedOutputPath(output, args.privateAssociationField, args.budget);
    restoreIncludeOutput(args.doc, output, construction);
    const field = (configuration.documentPermissionField as string) ?? '_permissions';
    unsetTrustedOutputPath(output, field, args.budget);
    removeGeneratedPermissionsAlias(output);
    if (configuration.stripPermissionsField) return;
    const exposed = configuration.exposedDocPermissionKeys as readonly string[] | undefined;
    const metadata: Record<string, unknown> = {};
    const metadataDepth = construction.depth + field.split('.').length;
    // Admit the metadata root/path before callbacks build its contents. It is
    // still private: any later failure discards the entire publication.
    setTrustedOutputPath(output, field, metadata, args.budget, construction.depth);
    if (args.includePermissions || args.includeFieldPermissions) {
      for (const key of Object.keys(grants)) {
        visitTrustedOutput(args.budget, metadataDepth + 1);
        if (!exposed || exposed.includes(key)) defineTrustedOutputValue(metadata, key, grants[key]);
      }
    }
    if (args.includeFieldPermissions && !configuration.disableFieldPermissions) {
      const rowAccess =
        readFieldPermissionAccess() ?? (await queryFieldPermissionAccess([source._id], args.publication));
      const id = String(source._id);
      const map = async (access: 'read' | 'update', allowed: boolean) => {
        visitTrustedOutput(args.budget, metadataDepth + 1);
        const paths = allowed
          ? await requestOutputFieldPaths(stage, binding, access, {
              budget: args.budget,
              depth: metadataDepth + 1,
            })
          : [];
        if (!paths.length) visitTrustedOutput(args.budget, metadataDepth + 2);
        return paths.length ? Object.fromEntries(paths.map((path) => [path, true])) : { $: '_' };
      };
      defineTrustedOutputValue(metadata, '_view', await map('read', rowAccess.readIds?.has(id) ?? false));
      defineTrustedOutputValue(metadata, '_edit', await map('update', rowAccess.updateIds?.has(id) ?? false));
    } else if (!args.includePermissions && !configuration.disableFieldPermissions) {
      visitTrustedOutput(args.budget, metadataDepth + 1, 2);
      visitTrustedOutput(args.budget, metadataDepth + 2, 2);
      defineTrustedOutputValue(metadata, '_view', { $: '_' });
      defineTrustedOutputValue(metadata, '_edit', { $: '_' });
    }
    attachPermissionsAlias(output, field);
  };
}
