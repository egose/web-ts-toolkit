import { isArray, isPlainObject } from '@web-ts-toolkit/utils';
import { openApiResponses } from './responses';
import { toOpenApiSchema } from './schemas';
import type {
  OpenApiDocumentOptions,
  OpenApiParameter,
  OpenApiRouteDescriptor,
  OpenApiSchema,
  OpenApiResponses,
} from './types';

type OpenApiOperation = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: OpenApiSchema }>;
  };
  responses: OpenApiResponses;
  [key: `x-${string}`]: unknown;
};

type OpenApiDocument = {
  openapi: string;
  info: Omit<OpenApiDocumentOptions, 'servers'>;
  servers?: OpenApiDocumentOptions['servers'];
  paths: Record<string, Record<string, OpenApiOperation>>;
};

const openApiMediaType = 'application/json';

const normalizePath = (path: string) => {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
};

const toOpenApiPath = (path: string) => normalizePath(path).replace(/:([A-Za-z0-9_]+)/g, '{$1}');

const schemaToQueryParameters = (schema: unknown): OpenApiParameter[] => {
  const jsonSchema = toOpenApiSchema(schema);
  if (!jsonSchema || jsonSchema.type !== 'object') return [];

  const properties = isPlainObject(jsonSchema.properties) ? jsonSchema.properties : {};
  const required = new Set(
    isArray(jsonSchema.required) ? jsonSchema.required.filter((item) => typeof item === 'string') : [],
  );

  return Object.entries(properties).map(([name, value]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: value as OpenApiSchema,
  }));
};

const schemaToPathParameters = (path: string, pathParams?: Record<string, unknown>) => {
  const names = [...toOpenApiPath(path).matchAll(/\{([^}]+)\}/g)].map((item) => item[1]);

  return names.map((name) => ({
    name,
    in: 'path' as const,
    required: true,
    schema: (pathParams && name in pathParams ? toOpenApiSchema(pathParams[name]) : undefined) ?? { type: 'string' },
  }));
};

const getDefaultResponses = (route: OpenApiRouteDescriptor): OpenApiResponses => {
  if (route.operationId === 'root.query') return openApiResponses.batch();
  if (route.method === 'delete') return openApiResponses.delete();
  if (route.operationId?.toLowerCase().includes('create')) return openApiResponses.create();
  if (route.operationId?.toLowerCase().includes('list')) return openApiResponses.list();
  if (route.operationId?.toLowerCase().includes('distinct')) return openApiResponses.list();
  return openApiResponses.single();
};

const buildOperation = (route: OpenApiRouteDescriptor): OpenApiOperation => {
  const queryParameters = schemaToQueryParameters(route.query);
  const pathParameters = schemaToPathParameters(route.path, route.pathParams);

  const bodySchema = toOpenApiSchema(route.body);
  const responses = route.responses ?? getDefaultResponses(route);

  const operation: OpenApiOperation = {
    operationId: route.operationId,
    summary: route.summary,
    description: route.description,
    tags: route.tags,
    deprecated: route.deprecated,
    responses,
  };

  const parameters = [...pathParameters, ...queryParameters];
  if (parameters.length) {
    operation.parameters = parameters;
  }

  if (bodySchema) {
    operation.requestBody = {
      required: true,
      content: {
        [openApiMediaType]: {
          schema: bodySchema,
        },
      },
    };
  }

  if (route.acl) {
    operation['x-access-router-acl'] = route.acl;
  }

  return operation;
};

export function buildOpenApiSpec(routes: OpenApiRouteDescriptor[], options: OpenApiDocumentOptions): OpenApiDocument {
  const paths: OpenApiDocument['paths'] = {};
  const { servers, ...info } = options;

  for (const route of routes) {
    const path = toOpenApiPath(route.path);
    if (!paths[path]) {
      paths[path] = {};
    }

    paths[path][route.method] = buildOperation(route);
  }

  return {
    openapi: '3.1.0',
    info,
    servers,
    paths,
  };
}
