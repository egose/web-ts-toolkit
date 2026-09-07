import JsonRouter from '@web-ts-toolkit/express-json-router';
import { z } from 'zod';
import { getGlobalOption } from '../options';
import { validateRequestComplexity } from '../request-complexity';
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
  RequestSchemaAdapter,
  RequestSchemaFailure,
  RequestSchemaIssue,
  RequestSchemaLike,
  RequestSchemaOptions,
  RequestSchemaResult,
  RequestSchemaValidator,
  StandardSchemaIssue,
  StandardSchemaPathSegment,
  StandardSchemaResult,
  StandardSchemaSuccess,
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
  const complexityErrors = validateRequestComplexity(value, getGlobalOption('requestComplexity'), 'request');
  if (complexityErrors.length > 0) {
    throw new clientErrors.BadRequestError('Bad Request', { errors: complexityErrors });
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    throwValidationError(normalizeIssues(result.error.issues), undefined, 'parameter');
  }

  return result.data;
}

export function parseBody<TSchema extends z.ZodTypeAny>(schema: TSchema, value: unknown): z.output<TSchema> {
  const complexityErrors = validateRequestComplexity(value ?? {}, getGlobalOption('requestComplexity'), 'request');
  if (complexityErrors.length > 0) {
    throw new clientErrors.BadRequestError('Bad Request', { errors: complexityErrors });
  }

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

/**
 * Wraps a request validator into a request schema adapter used by `access-router`.
 *
 * @example
 * const schema = defineRequestSchema(fromZod(z.object({ name: z.string() })));
 */
export function defineRequestSchema<T = unknown>(
  validator: RequestSchemaValidator<T>,
  options: RequestSchemaOptions = {},
): RequestSchemaAdapter<T> {
  return {
    validate: validator,
    openapi: options.openapi,
  };
}

/**
 * Adapts a Zod schema into a `RequestSchemaValidator` for `access-router`.
 *
 * Supports both synchronous schemas and schemas with async refinements or
 * transforms via `safeParseAsync` when available. Synchronous schemas keep
 * their existing output values and issue paths. Operational exceptions thrown
 * by `safeParseAsync` itself propagate unchanged.
 *
 * @example
 * const validator = fromZod(z.object({ name: z.string() }));
 */
export function fromZod<TSchema extends z.ZodTypeAny>(schema: TSchema): RequestSchemaValidator<z.output<TSchema>> {
  return async (value: unknown): Promise<RequestSchemaResult<z.output<TSchema>>> => {
    const candidate = schema as unknown as {
      safeParseAsync?: (data: unknown) => Promise<ReturnType<typeof schema.safeParse>>;
    };
    const result =
      typeof candidate.safeParseAsync === 'function'
        ? await candidate.safeParseAsync.call(schema, value)
        : schema.safeParse(value);
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
      if (!isYupValidationError(error)) {
        throw error;
      }
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

/**
 * Adapts an AJV validator into a `RequestSchemaValidator`.
 *
 * Contract: synchronous validators return a boolean and expose input-local
 * diagnostics via mutable `validator.errors`; those errors are snapshotted
 * synchronously before any suspension so concurrent same-turn validations do
 * not observe another input's diagnostics. Asynchronous AJV schemas
 * (`$async: true`) return a promise that resolves with validated data on
 * success or rejects with a `ValidationError` carrying an `errors` array on
 * failure; rejection-carried errors are normalized, while any other rejection
 * propagates unchanged as an operational exception.
 */
export function fromAjv<TValue = unknown>(validator: AjvValidatorLike<TValue>): RequestSchemaValidator<TValue> {
  return async (value: unknown): Promise<RequestSchemaResult<TValue>> => {
    const outcome = validator(value);
    if (isThenable<TValue | boolean>(outcome)) {
      try {
        const data = await outcome;
        if (data === false) {
          return {
            success: false,
            issues: normalizeAjvIssues(validator.errors ?? []),
          };
        }
        return {
          success: true,
          data: (data === true ? value : data) as TValue,
        };
      } catch (error) {
        if (!isAjvValidationError(error)) {
          throw error;
        }
        return {
          success: false,
          issues: normalizeAjvIssues(error.errors ?? []),
        };
      }
    }

    const errorsSnapshot = validator.errors ? [...validator.errors] : [];
    if (outcome) {
      return {
        success: true,
        data: value as TValue,
      };
    }

    return {
      success: false,
      issues: normalizeAjvIssues(errorsSnapshot),
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

/**
 * Adapts an ArkType type into a `RequestSchemaValidator`.
 *
 * Success/failure is discriminated via the supported ArkErrors brand key
 * (`hasArkKind(result, "errors")`, stored at runtime as `' arkKind'` with a
 * leading space; the unspaced `arkKind` alias is also accepted) or, when the
 * type exposes a Standard Schema `~standard.validate` contract, via that
 * contract. ArkType's Standard Schema `validate` returns `{ value }` on
 * success but returns raw `ArkErrors` on failure instead of `{ issues }`, so
 * both shapes are handled. Array shape and `message`/`path`-like record
 * fields are never used as discriminators, so valid empty/scalar/record/
 * nullable arrays pass through unchanged. Unexpected exceptions thrown by the
 * type propagate unchanged.
 */
export function fromArkType<TValue = unknown>(type: ArkTypeLike<TValue>): RequestSchemaValidator<TValue> {
  return async (value: unknown): Promise<RequestSchemaResult<TValue>> => {
    if (isStandardSchema(type)) {
      const result = await type['~standard'].validate(value);
      if (isArkTypeErrors(result)) {
        return {
          success: false,
          issues: normalizeArkTypeIssues(result),
        };
      }

      if (isStandardSchemaFailure(result)) {
        return {
          success: false,
          issues: normalizeArkTypeStandardIssues(result.issues),
        };
      }

      return {
        success: true,
        data: (result as StandardSchemaSuccess<TValue>).value as TValue,
      };
    }

    const result = await type(value);
    if (!isArkTypeErrors(result)) {
      return {
        success: true,
        data: result as TValue,
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
      if (!isVineValidationError(error)) {
        throw error;
      }
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

function normalizeArkTypeStandardIssues(
  issues: ReadonlyArray<StandardSchemaIssue & { problem?: string }>,
): RequestSchemaIssue[] {
  const normalized = issues.map((issue) => ({
    message: issue.message ?? issue.problem ?? 'Validation failed',
    path: issue.path?.flatMap((segment) => normalizePathSegment(segment)),
  }));

  return normalized.length ? normalized : [{ message: 'Validation failed' }];
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

function decodeAjvSegment(segment: string) {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function encodePointerSegment(segment: string) {
  return encodeURIComponent(segment.replace(/~/g, '~0').replace(/\//g, '~1'));
}

function parseAjvPath(issue: AjvErrorObjectLike) {
  const raw = issue.instancePath;
  const base: string[] =
    raw == null || raw === '' ? [] : (raw.startsWith('/') ? raw.slice(1) : raw).split('/').map(decodeAjvSegment);

  const missing = issue.params?.missingProperty;
  if (typeof missing === 'string') {
    return [...base, missing];
  }

  return base;
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
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return false;
  }

  const candidate = error as Record<string, unknown>;
  return (
    candidate.name === 'ValidationError' &&
    typeof candidate.message === 'string' &&
    Array.isArray(candidate.errors) &&
    Array.isArray(candidate.inner)
  );
}

function isArkTypeErrors(value: unknown): value is ArkTypeErrorsLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  // Real ArkErrors brands itself under the runtime `arkKind` key, which is
  // `' arkKind'` (leading space); accept the unspaced alias too for
  // cross-version/test doubles. Never Array shape or message/path fields.
  const record = value as Record<string, unknown>;
  return record.arkKind === 'errors' || record[' arkKind'] === 'errors';
}

function isThenable<T>(value: unknown): value is Promise<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as Record<string, unknown>).then === 'function'
  );
}

function isAjvValidationError(error: unknown): error is { errors?: ReadonlyArray<AjvErrorObjectLike> | null } {
  if (typeof error !== 'object' || error === null || !('errors' in error)) {
    return false;
  }

  const errors = (error as Record<string, unknown>).errors;
  return errors == null || Array.isArray(errors);
}

function isVineValidationError(error: unknown): error is VineValidationErrorLike {
  if (typeof error !== 'object' || error === null || !('messages' in error)) {
    return false;
  }

  const candidate = error as Record<string, unknown>;
  if (!Array.isArray(candidate.messages) || candidate.messages.length === 0) {
    return false;
  }

  const hasDiscriminator = candidate.code === 'E_VALIDATION_ERROR' || candidate.name === 'ValidationError';
  if (!hasDiscriminator) {
    return false;
  }

  return candidate.messages.every(
    (message) =>
      typeof message === 'object' &&
      message !== null &&
      typeof (message as Record<string, unknown>).message === 'string' &&
      typeof (message as Record<string, unknown>).field === 'string',
  );
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
  return path.length === 0 ? '#' : `#/${path.map(encodePointerSegment).join('/')}`;
}
