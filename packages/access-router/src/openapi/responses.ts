import type { OpenApiResponses } from './types';

const json = (schema: Record<string, unknown>) => ({
  content: {
    'application/json': {
      schema,
    },
  },
});

const problemJson = {
  content: {
    'application/problem+json': {
      schema: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          title: { type: 'string' },
          status: { type: 'number' },
          detail: { type: 'string' },
          errors: { type: 'array', items: {} },
        },
        additionalProperties: true,
      },
    },
  },
};

const genericDataSchema = { type: 'object', additionalProperties: true };
const genericListSchema = { type: 'array', items: genericDataSchema };

export const openApiResponses = {
  single(description = 'Success'): OpenApiResponses {
    return {
      200: { description, ...json(genericDataSchema) },
      400: { description: 'Bad Request', ...problemJson },
      401: { description: 'Unauthorized', ...problemJson },
      404: { description: 'Not Found', ...problemJson },
    };
  },

  list(description = 'Success'): OpenApiResponses {
    return {
      200: { description, ...json(genericListSchema) },
      400: { description: 'Bad Request', ...problemJson },
      401: { description: 'Unauthorized', ...problemJson },
    };
  },

  create(description = 'Created'): OpenApiResponses {
    return {
      201: { description, ...json(genericDataSchema) },
      400: { description: 'Bad Request', ...problemJson },
      401: { description: 'Unauthorized', ...problemJson },
    };
  },

  delete(description = 'Deleted'): OpenApiResponses {
    return {
      200: { description, ...json(genericDataSchema) },
      400: { description: 'Bad Request', ...problemJson },
      401: { description: 'Unauthorized', ...problemJson },
      404: { description: 'Not Found', ...problemJson },
    };
  },

  batch(description = 'Success'): OpenApiResponses {
    return {
      200: { description, ...json(genericListSchema) },
      400: { description: 'Bad Request', ...problemJson },
      401: { description: 'Unauthorized', ...problemJson },
    };
  },
};
