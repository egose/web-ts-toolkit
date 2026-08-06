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
  /**
   * When true, replaces an existing registration with the same method/path
   * even when the descriptors differ. When false (default), conflicting
   * registrations throw at registration time so consumers can detect
   * accidental route shadowing.
   */
  allowReplace?: boolean;
  /**
   * When true, this exact descriptor is idempotent and registering the same
   * method/path with an equivalent descriptor again is silently accepted.
   * Differing re-registrations still throw unless {@link allowReplace} is set.
   */
  idempotent?: boolean;
};

export type OpenApiRegistryOptions = {
  /**
   * Throw when the same method/path is registered twice with differing
   * descriptors, instead of silently replacing. Default: true.
   */
  rejectConflicts?: boolean;
  /**
   * Throw when the same operationId is registered more than once. Default: true.
   */
  rejectDuplicateOperationIds?: boolean;
};

export type OpenApiDocumentOptions = {
  title: string;
  version: string;
  description?: string;
  servers?: Array<{ url: string; description?: string }>;
};

export type OpenApiRouterOptions = Partial<OpenApiDocumentOptions> & {
  jsonPath?: string;
  docsPath?: string | false;
  swaggerUiCssUrl?: string;
  swaggerUiBundleUrl?: string;
};
