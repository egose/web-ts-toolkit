export type BodyParserError = Error & {
  status?: number;
  statusCode?: number;
  type?: string;
};

export class OidcVaultHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly clientMessage: string;

  constructor(status: number, code: string, message: string, clientMessage = message) {
    super(message);
    this.status = status;
    this.code = code;
    this.clientMessage = clientMessage;
  }
}

export const toErrorPayload = (error: unknown): { status: number; code: string; message: string } => {
  if (error instanceof OidcVaultHttpError) {
    return {
      status: error.status,
      code: error.code,
      message: error.clientMessage,
    };
  }

  return {
    status: 500,
    code: 'OIDC_VAULT_INTERNAL_ERROR',
    message: 'Unexpected OIDC vault error.',
  };
};

export const isBodyParserError = (error: unknown): error is BodyParserError => {
  if (!(error instanceof Error)) {
    return false;
  }

  const maybeParserError = error as BodyParserError;
  return typeof maybeParserError.type === 'string' || typeof maybeParserError.status === 'number';
};

export const toBodyParserErrorPayload = (error: BodyParserError): { status: number; code: string; message: string } => {
  if (error.type === 'entity.too.large') {
    return {
      status: 413,
      code: 'OIDC_VAULT_REQUEST_BODY_TOO_LARGE',
      message: 'OIDC vault request body exceeds the configured size limit.',
    };
  }

  if (error.type === 'parameters.too.many') {
    return {
      status: 413,
      code: 'OIDC_VAULT_REQUEST_BODY_PARAMETER_LIMIT_EXCEEDED',
      message: 'OIDC vault form request contains too many parameters.',
    };
  }

  if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
    return {
      status: 415,
      code: 'OIDC_VAULT_UNSUPPORTED_REQUEST_BODY_ENCODING',
      message: 'OIDC vault request body encoding is not supported.',
    };
  }

  if (error.type === 'entity.parse.failed') {
    return {
      status: 400,
      code: 'OIDC_VAULT_MALFORMED_REQUEST_BODY',
      message: 'OIDC vault request body is malformed.',
    };
  }

  const status = error.status ?? error.statusCode ?? 400;
  return {
    status: status >= 400 && status < 500 ? status : 400,
    code: 'OIDC_VAULT_INVALID_REQUEST_BODY',
    message: 'OIDC vault request body could not be parsed.',
  };
};

export const getRequiredString = (value: unknown, message: string, code: string, status = 400): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new OidcVaultHttpError(status, code, message);
  }

  return value;
};

export const getRequiredFiniteNonNegativeInteger = (
  value: unknown,
  message: string,
  code: string,
  status = 502,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new OidcVaultHttpError(status, code, message);
  }

  return value;
};
