import { difference, intersection } from '@web-ts-toolkit/utils';
import { collectSchemaFields } from '../core-shared';
import type { AccessRouterBaseRequest, Projection } from '../interfaces';
import { pickDocFields, normalizeSelect } from '../helpers';

export async function collectAllowedFieldsForRequest({
  req,
  permissionSchema,
  access,
  baseFields = [],
  hasPermission,
  functionArgs = [],
}: {
  req: AccessRouterBaseRequest;
  permissionSchema: Record<string, unknown> | null | undefined;
  access: string;
  baseFields?: string[];
  hasPermission: (key: string) => boolean;
  functionArgs?: unknown[];
}) {
  return collectSchemaFields({
    req,
    permissionSchema,
    access,
    baseFields,
    hasPermission,
    functionArgs,
  });
}

export async function pickAllowedFieldsForRequest<TDoc>({
  req,
  doc,
  permissionSchema,
  access,
  baseFields = [],
  hasPermission,
  functionArgs = [],
}: {
  req: AccessRouterBaseRequest;
  doc: TDoc;
  permissionSchema: Record<string, unknown> | null | undefined;
  access: string;
  baseFields?: string[];
  hasPermission: (key: string) => boolean;
  functionArgs?: unknown[];
}) {
  const allowed = await collectAllowedFieldsForRequest({
    req,
    permissionSchema,
    access,
    baseFields,
    hasPermission,
    functionArgs,
  });
  return pickDocFields(doc, allowed) as TDoc;
}

export async function resolveSelectForRequest({
  req,
  permissionSchema,
  access,
  targetFields = null,
  skipChecks = true,
  hasPermission,
  functionArgs = [],
  mode,
  alwaysSelectFields = [],
}: {
  req: AccessRouterBaseRequest;
  permissionSchema: Record<string, unknown> | null | undefined;
  access: string;
  targetFields?: Projection;
  skipChecks?: boolean;
  hasPermission: (key: string) => boolean;
  functionArgs?: unknown[];
  mode: 'model' | 'data';
  alwaysSelectFields?: string[];
}) {
  let normalizedSelect = normalizeSelect(targetFields);
  if (!permissionSchema) return alwaysSelectFields;

  let fields = await collectSchemaFields({
    req,
    permissionSchema,
    access,
    hasPermission: (key) => {
      if (hasPermission(key)) {
        return true;
      }

      return !!skipChecks && mode !== 'data';
    },
    functionArgs,
  });

  if (mode === 'model') {
    if (normalizedSelect.length > 0) {
      const excludeid = normalizedSelect.includes('-_id');
      const excludeall = normalizedSelect.every((v) => v.startsWith('-'));
      if (excludeall) {
        normalizedSelect = normalizedSelect.map((v) => v.substring(1));
        fields = difference(fields, normalizedSelect);
        if (excludeid) fields.push('-_id');
      } else {
        fields = intersection(normalizedSelect, fields.concat(excludeid ? '-_id' : '_id'));
      }
    }

    return fields.concat(alwaysSelectFields);
  }

  return intersection(normalizedSelect, fields);
}
