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
  virtualNames = [],
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
  /** VIRT-02: registered virtual leaves for this scope; stripped, never granted. */
  virtualNames?: string[] | Set<string>;
}) {
  const virtualSet = virtualNames instanceof Set ? virtualNames : new Set(virtualNames ?? []);
  // Strip virtual names from every projection input up front, including
  // `alwaysSelectFields` and trusted overrides, without granting auth.
  const strippedAlways = stripVirtuals(alwaysSelectFields ?? [], virtualSet);
  let normalizedSelect = stripVirtuals(normalizeSelect(targetFields), virtualSet);
  // Persisted-field policy must never see virtual keys, even when the
  // permissionSchema widened to carry virtual output rules (VIRT-01).
  const persistedSchema = stripVirtualKeysFromPermissionSchema(permissionSchema, virtualSet);
  if (!persistedSchema) return strippedAlways;

  let fields = await collectSchemaFields({
    req,
    permissionSchema: persistedSchema,
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

    return fields.concat(strippedAlways);
  }

  return intersection(normalizedSelect, fields);
}

/**
 * VIRT-02: strip registered virtual leaves from projection inputs.
 * Both `name` and `-name` forms are removed; `.sub` definition paths are
 * never DB paths and are removed as well. Forced fetching never grants
 * virtual authorization.
 */
export function stripVirtuals(fields: string[], virtualNames: Set<string> | string[]): string[] {
  const set = virtualNames instanceof Set ? virtualNames : new Set(virtualNames ?? []);
  return (fields ?? []).filter((token) => {
    const base = token.startsWith('-') ? token.slice(1) : token;
    if (base.includes('.sub.')) return false;
    return !set.has(base);
  });
}

/** VIRT-02: drop virtual keys from a permissionSchema copy (persisted only). */
export function stripVirtualKeysFromPermissionSchema(
  permissionSchema: Record<string, unknown> | null | undefined,
  virtualNames: Set<string> | string[],
): Record<string, unknown> | null | undefined {
  if (!permissionSchema) return permissionSchema;
  const set = virtualNames instanceof Set ? virtualNames : new Set(virtualNames ?? []);
  if (set.size === 0) return permissionSchema;
  let stripped: Record<string, unknown> | null = null;
  for (const key of Object.keys(permissionSchema)) {
    if (set.has(key)) {
      if (!stripped) stripped = { ...permissionSchema };
      delete stripped[key];
    }
  }
  return stripped ?? permissionSchema;
}
