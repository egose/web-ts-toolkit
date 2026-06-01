import { z } from 'zod';
import { isPlainObject } from '@web-ts-toolkit/utils';
import type { OpenApiSchema, OpenApiSchemaPatch, OpenApiSchemaResolver, OpenApiSchemaSource } from './types';

const fallbackObjectSchema: OpenApiSchema = { type: 'object', additionalProperties: true };

export function patchOpenApiObjectSchema(
  source: OpenApiSchemaSource,
  properties: Record<string, OpenApiSchemaSource>,
): OpenApiSchemaPatch {
  return {
    kind: 'objectProperties',
    source,
    properties,
  };
}

export function defineOpenApiSchemaResolver(resolve: () => unknown): OpenApiSchemaResolver {
  return {
    kind: 'schemaResolver',
    resolve,
  };
}

export function getNestedOpenApiSchemaDataSource(source: unknown): OpenApiSchemaSource | undefined {
  return isPlainObject(source) && 'data' in source ? source.data : undefined;
}

export function unwrapNestedOpenApiSchemaSource(source: unknown, fallback: OpenApiSchemaSource): OpenApiSchemaSource {
  if (isPlainObject(source) && ('default' in source || 'data' in source)) {
    return source.default ?? fallback;
  }

  return source ?? fallback;
}

function isOpenApiSchemaPatch(source: unknown): source is OpenApiSchemaPatch {
  return isPlainObject(source) && source.kind === 'objectProperties';
}

function isOpenApiSchemaResolver(source: unknown): source is OpenApiSchemaResolver {
  return isPlainObject(source) && source.kind === 'schemaResolver' && typeof source.resolve === 'function';
}

function isJsonSchemaLike(source: unknown): source is OpenApiSchema {
  return isPlainObject(source) && ('type' in source || 'properties' in source || '$ref' in source || 'anyOf' in source);
}

export function toOpenApiSchema(source: OpenApiSchemaSource | undefined): OpenApiSchema | undefined {
  if (!source) return undefined;

  const resolvedSource = isOpenApiSchemaResolver(source) ? source.resolve() : source;
  if (!resolvedSource) return undefined;

  if (isOpenApiSchemaPatch(resolvedSource)) {
    const schema = toOpenApiSchema(resolvedSource.source) ?? { ...fallbackObjectSchema };
    const properties = isPlainObject(schema.properties) ? { ...schema.properties } : {};

    for (const [key, value] of Object.entries(resolvedSource.properties)) {
      properties[key] = toOpenApiSchema(value) ?? fallbackObjectSchema;
    }

    return {
      ...schema,
      type: schema.type ?? 'object',
      properties,
    };
  }

  if (isJsonSchemaLike(resolvedSource)) {
    return resolvedSource;
  }

  try {
    return z.toJSONSchema(resolvedSource as never) as OpenApiSchema;
  } catch {
    return fallbackObjectSchema;
  }
}
