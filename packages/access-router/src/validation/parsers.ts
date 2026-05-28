import JsonRouter from '@web-ts-toolkit/express-json-router';
import { z } from 'zod';
import { stringOrStringArray } from './common';
import type {
  AjvErrorObjectLike,
  AjvValidatorLike,
  ArkTypeErrorsLike,
  ArkTypeLike,
  IoTsDecodeErrorLike,
  IoTsDecoderLike,
  JoiSchemaLike,
  JoiValidationErrorDetailLike,
  RequestSchemaFailure,
  RequestSchemaIssue,
  RequestSchemaLike,
  RequestSchemaResult,
  RequestSchemaValidator,
  StandardSchemaIssue,
  StandardSchemaPathSegment,
  StandardSchemaResult,
  StandardSchemaV1,
  StandardSchemaInferOutput,
  SuperstructFailureLike,
  SuperstructValidateLike,
  ValidationError,
  ValibotIssueLike,
  ValibotSafeParseLike,
  VineValidationErrorLike,
  VineValidationMessageLike,
  VineValidatorLike,
  YupSchemaLike,
  YupValidationErrorLike,
} from './types';

const clientErrors = JsonRouter.clientErrors;

export function parsePathParam(value: string | string[] | undefined, parameter: string) {
  const result = stringOrStringArray.safeParse(value);
  if (!result.success) {
    throwValidationError(normalizeIssues(result.error.issues), parameter, 'parameter');
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
    throwValidationError(normalizeIssues(result.error.issues), undefined, 'parameter');
  }

  return result.data;
}

export function parseBody<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    throwValidationError(normalizeIssues(result.error.issues), undefined, 'pointer');
  }

  return result.data;
}

export function parseBodyWithSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
  userSchema?: RequestSchemaLike,
): Promise<z.output<TSchema>> {
  const body = parseBody(schema, value);
  return isRequestSchema(userSchema)
    ? (parseUserSchema(userSchema, body) as Promise<z.output<TSchema>>)
    : Promise.resolve(body);
}

export async function parseNestedBodyWithSchema(
  schema: z.ZodTypeAny,
  value: unknown,
  nestedKey: string,
  userSchema?: RequestSchemaLike,
): Promise<Record<string, unknown>> {
  const body = parseBody(schema, value) as Record<string, unknown>;
  if (!isRequestSchema(userSchema)) return body;

  return {
    ...body,
    [nestedKey]: await parseUserSchema(userSchema, body?.[nestedKey], [nestedKey]),
  };
}

function throwValidationError(
  issues: RequestSchemaIssue[],
  key?: string,
  location: 'pointer' | 'parameter' = 'pointer',
): never {
  const errors = issues.map((issue) => formatIssue(issue, key, location));
  throw new clientErrors.BadRequestError('Bad Request', { errors });
}

async function parseUserSchema(schema: RequestSchemaLike, value: unknown, prefix: string[] = []) {
  const validator = toRequestSchemaValidator(schema);
  const result = await validator(value);
  if (!isRequestSchemaFailure(result)) {
    return result.data;
  }

  const issues = result.issues.map((issue) => ({
    ...issue,
    path: prefix.concat((issue.path ?? []).map(String)),
  }));

  throwValidationError(issues, undefined, 'pointer');
}

function isZodSchema(schema: unknown): schema is z.ZodTypeAny {
  return (
    typeof schema === 'object' && schema !== null && 'safeParse' in schema && typeof schema.safeParse === 'function'
  );
}

function isRequestSchema(schema: unknown): schema is RequestSchemaLike {
  return (
    isZodSchema(schema) ||
    isStandardSchema(schema) ||
    isRequestSchemaValidator(schema) ||
    isRequestSchemaAdapter(schema)
  );
}

function isRequestSchemaValidator(schema: unknown): schema is RequestSchemaValidator {
  return typeof schema === 'function';
}

function isRequestSchemaAdapter(schema: unknown): schema is { validate: RequestSchemaValidator } {
  return typeof schema === 'object' && schema !== null && 'validate' in schema && typeof schema.validate === 'function';
}

function isStandardSchema(schema: unknown): schema is StandardSchemaV1 {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    '~standard' in schema &&
    typeof schema['~standard'] === 'object' &&
    schema['~standard'] !== null &&
    'validate' in schema['~standard'] &&
    typeof schema['~standard'].validate === 'function'
  );
}

function isRequestSchemaFailure(result: RequestSchemaResult): result is RequestSchemaFailure {
  return result.success === false;
}

function toRequestSchemaValidator(schema: RequestSchemaLike): RequestSchemaValidator {
  if (isZodSchema(schema)) return fromZod(schema);
  if (isStandardSchema(schema)) return fromStandardSchema(schema);
  if (isRequestSchemaValidator(schema)) return schema;
  return schema.validate;
}

export function defineRequestSchema<T = unknown>(validator: RequestSchemaValidator<T>): RequestSchemaValidator<T> {
  return validator;
}

export function fromZod<TSchema extends z.ZodTypeAny>(schema: TSchema): RequestSchemaValidator<z.output<TSchema>> {
  return (value: unknown): RequestSchemaResult<z.output<TSchema>> => {
    const result = schema.safeParse(value);
    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    }

    return {
      success: false,
      issues: normalizeIssues(result.error.issues),
    };
  };
}

export function fromStandardSchema<TSchema extends StandardSchemaV1>(
  schema: TSchema,
): RequestSchemaValidator<StandardSchemaInferOutput<TSchema>> {
  return async (value: unknown): Promise<RequestSchemaResult<StandardSchemaInferOutput<TSchema>>> => {
    const result = await schema['~standard'].validate(value);
    if (!isStandardSchemaFailure(result)) {
      return {
        success: true,
        data: result.value,
      };
    }

    return {
      success: false,
      issues: normalizeIssues(result.issues),
    };
  };
}

export function fromYup<TSchema extends YupSchemaLike>(schema: TSchema): RequestSchemaValidator {
  return async (value: unknown): Promise<RequestSchemaResult> => {
    try {
      const data = await schema.validate(value, { abortEarly: false });
      return {
        success: true,
        data,
      };
    } catch (error) {
      return {
        success: false,
        issues: normalizeYupIssues(error),
      };
    }
  };
}

export function fromJoi<TSchema extends JoiSchemaLike>(schema: TSchema): RequestSchemaValidator {
  return async (value: unknown): Promise<RequestSchemaResult> => {
    const result = await schema.validate(value, { abortEarly: false });
    if (!result.error?.details?.length) {
      return {
        success: true,
        data: result.value,
      };
    }

    return {
      success: false,
      issues: normalizeJoiIssues(result.error.details),
    };
  };
}

export function fromAjv<TValue = unknown>(validator: AjvValidatorLike<TValue>): RequestSchemaValidator<TValue> {
  return async (value: unknown): Promise<RequestSchemaResult<TValue>> => {
    const valid = await validator(value);
    if (valid) {
      return {
        success: true,
        data: value as TValue,
      };
    }

    return {
      success: false,
      issues: normalizeAjvIssues(validator.errors ?? []),
    };
  };
}

export function fromValibot<TSchema, TOutput = unknown>(
  schema: TSchema,
  safeParse: ValibotSafeParseLike,
): RequestSchemaValidator<TOutput> {
  return async (value: unknown): Promise<RequestSchemaResult<TOutput>> => {
    const result = await safeParse<TSchema, TOutput>(schema, value, { abortEarly: false });
    if (result.success) {
      return {
        success: true,
        data: result.output,
      };
    }

    return {
      success: false,
      issues: normalizeValibotIssues(result.issues),
    };
  };
}

export function fromArkType<TValue = unknown>(type: ArkTypeLike<TValue>): RequestSchemaValidator<TValue> {
  return async (value: unknown): Promise<RequestSchemaResult<TValue>> => {
    const result = await type(value);
    if (!isArkTypeErrors(result)) {
      return {
        success: true,
        data: result,
      };
    }

    return {
      success: false,
      issues: normalizeArkTypeIssues(result),
    };
  };
}

export function fromIoTs<TValue = unknown>(decoder: IoTsDecoderLike<TValue>): RequestSchemaValidator<TValue> {
  return async (value: unknown): Promise<RequestSchemaResult<TValue>> => {
    const result = decoder.decode(value);
    if (result._tag === 'Right') {
      return {
        success: true,
        data: result.right,
      };
    }

    return {
      success: false,
      issues: normalizeIoTsIssues(result.left),
    };
  };
}

export function fromSuperstruct<TStruct, TOutput = unknown>(
  struct: TStruct,
  validate: SuperstructValidateLike,
): RequestSchemaValidator<TOutput> {
  return async (value: unknown): Promise<RequestSchemaResult<TOutput>> => {
    const [failure, output] = await validate<TStruct, TOutput>(value, struct);
    if (!failure) {
      return {
        success: true,
        data: output,
      };
    }

    return {
      success: false,
      issues: normalizeSuperstructFailure(failure),
    };
  };
}

export function fromVine<TValue = unknown>(validator: VineValidatorLike<TValue>): RequestSchemaValidator<TValue> {
  return async (value: unknown): Promise<RequestSchemaResult<TValue>> => {
    try {
      const output = await validator.validate(value);
      return {
        success: true,
        data: output,
      };
    } catch (error) {
      return {
        success: false,
        issues: normalizeVineError(error),
      };
    }
  };
}

function isStandardSchemaFailure(
  result: StandardSchemaResult,
): result is { issues: ReadonlyArray<StandardSchemaIssue> } {
  return Array.isArray(result.issues);
}

function normalizeIssues(
  issues: ReadonlyArray<{ message: string; path?: readonly (PropertyKey | StandardSchemaPathSegment)[] }>,
): RequestSchemaIssue[] {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path?.flatMap((segment) => normalizePathSegment(segment)),
  }));
}

function normalizePathSegment(segment: PropertyKey | StandardSchemaPathSegment) {
  const key = isStandardSchemaPathSegment(segment) ? segment.key : segment;
  return typeof key === 'string' || typeof key === 'number' ? [key] : [];
}

function isStandardSchemaPathSegment(segment: unknown): segment is StandardSchemaPathSegment {
  return typeof segment === 'object' && segment !== null && 'key' in segment;
}

function normalizeYupIssues(error: unknown): RequestSchemaIssue[] {
  if (!isYupValidationError(error)) {
    return [{ message: 'Validation failed' }];
  }

  const issues = error.inner?.length ? error.inner : [error];
  return issues.map((issue) => ({
    message: issue.message,
    path: parsePathString(issue.path),
  }));
}

function normalizeJoiIssues(issues: ReadonlyArray<JoiValidationErrorDetailLike>): RequestSchemaIssue[] {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path ? [...issue.path] : undefined,
  }));
}

function normalizeAjvIssues(issues: ReadonlyArray<AjvErrorObjectLike>): RequestSchemaIssue[] {
  return issues.map((issue) => ({
    message: issue.message ?? 'Validation failed',
    path: parseAjvPath(issue),
  }));
}

function normalizeValibotIssues(issues: ReadonlyArray<ValibotIssueLike>): RequestSchemaIssue[] {
  return issues.map((issue) => ({
    message: issue.message,
    path: issue.path?.flatMap((item) =>
      typeof item.key === 'string' || typeof item.key === 'number' ? [item.key] : [],
    ),
  }));
}

function normalizeArkTypeIssues(issues: ArkTypeErrorsLike): RequestSchemaIssue[] {
  const normalized = issues.map((issue) => ({
    message: issue.message ?? issue.problem ?? issues.summary ?? 'Validation failed',
    path: issue.path ? [...issue.path] : undefined,
  }));

  return normalized.length ? normalized : [{ message: issues.summary ?? 'Validation failed' }];
}

function normalizeIoTsIssues(issues: ReadonlyArray<IoTsDecodeErrorLike>): RequestSchemaIssue[] {
  return issues.map((issue) => ({
    message: issue.message ?? 'Validation failed',
    path: issue.context.map((entry) => entry.key).filter(Boolean),
  }));
}

function normalizeSuperstructFailure(failure: SuperstructFailureLike): RequestSchemaIssue[] {
  const failures = failure.failures?.() ?? [failure];
  return failures.map((entry) => ({
    message: entry.message ?? 'Validation failed',
    path: normalizeSuperstructPath(entry),
  }));
}

function normalizeSuperstructPath(failure: SuperstructFailureLike) {
  if (failure.path?.length) return [...failure.path];
  if (typeof failure.key === 'string' || typeof failure.key === 'number') return [failure.key];
  return undefined;
}

function normalizeVineError(error: unknown): RequestSchemaIssue[] {
  if (!isVineValidationError(error)) {
    return [{ message: 'Validation failed' }];
  }

  return error.messages.map((message) => ({
    message: message.message,
    path: normalizeVineField(message),
  }));
}

function normalizeVineField(message: VineValidationMessageLike) {
  const path = message.field
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));

  if (typeof message.index === 'number' && path.length === 0) {
    return [message.index];
  }

  return path.length ? path : undefined;
}

function parseAjvPath(issue: AjvErrorObjectLike) {
  const path = issue.instancePath
    ?.split('/')
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));

  if (issue.params?.missingProperty) {
    return (path ?? []).concat(issue.params.missingProperty);
  }

  return path;
}

function parsePathString(path: string | undefined) {
  if (!path) return undefined;

  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

function isYupValidationError(error: unknown): error is YupValidationErrorLike {
  return typeof error === 'object' && error !== null && 'message' in error;
}

function isArkTypeErrors(value: unknown): value is ArkTypeErrorsLike {
  return Array.isArray(value);
}

function isVineValidationError(error: unknown): error is VineValidationErrorLike {
  return typeof error === 'object' && error !== null && 'messages' in error && Array.isArray(error.messages);
}

function formatIssue(
  issue: RequestSchemaIssue,
  key?: string,
  location: 'pointer' | 'parameter' = 'pointer',
): ValidationError {
  const path = (issue.path ?? []).map(String);
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
