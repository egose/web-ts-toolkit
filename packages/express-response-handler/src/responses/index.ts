export const responseBrand = Symbol.for('@web-ts-toolkit/express-response-handler.response');

export const validateHttpStatusCode = (statusCode: unknown): number => {
  if (
    typeof statusCode !== 'number' ||
    !Number.isFinite(statusCode) ||
    !Number.isInteger(statusCode) ||
    statusCode < 100 ||
    statusCode > 599
  ) {
    throw new TypeError('statusCode must be an integer HTTP status code between 100 and 599');
  }

  return statusCode;
};

export const isResponse = (value: unknown): value is Response<unknown> => {
  if (value instanceof Response) {
    return true;
  }

  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Response<unknown> & Record<typeof responseBrand, unknown>;

  return candidate[responseBrand] === true && typeof candidate.statusCode === 'number' && 'data' in candidate;
};

export class Response<T = unknown> {
  readonly [responseBrand] = true;
  readonly statusCode: number;
  readonly data: T;

  constructor(statusCode = 200, data: T) {
    this.statusCode = validateHttpStatusCode(statusCode);
    this.data = data;
  }
}
