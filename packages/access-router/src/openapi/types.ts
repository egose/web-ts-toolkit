export type OpenApiMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type OpenApiSchema = Record<string, unknown>;

export type OpenApiSchemaResolver = {
  kind: 'schemaResolver';
  resolve: () => unknown;
};

export type OpenApiSchemaSource = unknown;

export type OpenApiSchemaPatch = {
  kind: 'objectProperties';
  source: OpenApiSchemaSource;
  properties: Record<string, OpenApiSchemaSource>;
};

export type OpenApiParameter = {
  name: string;
  in: 'path' | 'query';
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
};

export type OpenApiResponse = {
  description: string;
  content?: Record<string, { schema: OpenApiSchema }>;
};

export type OpenApiResponses = Record<string, OpenApiResponse>;

export type OpenApiRouteDescriptor = {
  method: OpenApiMethod;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  acl?: string;
  deprecated?: boolean;
  query?: OpenApiSchemaSource;
  body?: OpenApiSchemaSource;
  pathParams?: Record<string, OpenApiSchemaSource>;
  responses?: OpenApiResponses;
};

export type OpenApiDocumentOptions = {
  title: string;
  version: string;
  description?: string;
  servers?: Array<{ url: string; description?: string }>;
};

export type OpenApiRouterOptions = Partial<OpenApiDocumentOptions> & {
  jsonPath?: string;
  docsPath?: string;
};
