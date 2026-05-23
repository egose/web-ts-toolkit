import JsonRouter from '@web-ts-toolkit/express-json-router';
import { z } from 'zod';
import { stringOrStringArray } from './common';
import type { ValidationError } from './types';

const clientErrors = JsonRouter.clientErrors;

export function parsePathParam(value: string | string[] | undefined, parameter: string) {
  const result = stringOrStringArray.safeParse(value);
  if (!result.success) {
    throwValidationError(result.error.issues, parameter, 'parameter');
  }

  const param = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!param) {
    throw new clientErrors.BadRequestError('Bad Request', {
      errors: [{ detail: 'Required', parameter } satisfies ValidationError],
    });
  }

  return param;
}

export function parseQuery<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throwValidationError(result.error.issues, undefined, 'parameter');
  }

  return result.data;
}

export function parseBody<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    throwValidationError(result.error.issues, undefined, 'pointer');
  }

  return result.data;
}

export function parseBodyWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  userSchema?: z.ZodTypeAny,
): z.output<TSchema> {
  const body = parseBody(schema, value);
  return isZodSchema(userSchema) ? (parseUserSchema(userSchema, body) as z.output<TSchema>) : body;
}

export function parseNestedBodyWithSchema(
  schema: z.ZodTypeAny,
  value: unknown,
  nestedKey: string,
  userSchema?: z.ZodTypeAny,
): Record<string, unknown> {
  const body = parseBody(schema, value) as Record<string, unknown>;
  if (!isZodSchema(userSchema)) return body;

  return {
    ...body,
    [nestedKey]: parseUserSchema(userSchema, body?.[nestedKey], [nestedKey]),
  };
}

function throwValidationError(
  issues: z.ZodIssue[],
  key?: string,
  location: 'pointer' | 'parameter' = 'pointer',
): never {
  const errors = issues.map((issue) => formatIssue(issue, key, location));
  throw new clientErrors.BadRequestError('Bad Request', { errors });
}

function parseUserSchema(schema: z.ZodTypeAny, value: unknown, prefix: string[] = []) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      ...issue,
      path: prefix.concat(issue.path.map(String)),
    })) as z.ZodIssue[];

    throwValidationError(issues, undefined, 'pointer');
  }

  return result.data;
}

function isZodSchema(schema: unknown): schema is z.ZodTypeAny {
  return (
    typeof schema === 'object' && schema !== null && 'safeParse' in schema && typeof schema.safeParse === 'function'
  );
}

function formatIssue(issue: z.ZodIssue, key?: string, location: 'pointer' | 'parameter' = 'pointer'): ValidationError {
  const path = issue.path.map(String);
  const joinedPath = path.join('.');

  if (location === 'parameter') {
    return {
      detail: issue.message,
      parameter: (key ?? joinedPath) || undefined,
    };
  }

  return {
    detail: issue.message,
    pointer: buildPointer(path),
  };
}

function buildPointer(path: string[]) {
  return path.length === 0 ? '#' : `#/${path.join('/')}`;
}
