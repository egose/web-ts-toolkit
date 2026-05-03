import { ServerError } from './base';
import type { HttpErrorOptions } from './types';

export class InternalServerError extends ServerError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(500, message, options);
  }
}

export class NotImplementedError extends ServerError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(501, message, options);
  }
}

export class BadGatewayError extends ServerError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(502, message, options);
  }
}

export class ServiceUnavailableError extends ServerError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(503, message, options);
  }
}

export class GatewayTimeoutError extends ServerError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(504, message, options);
  }
}

export class HttpVersionNotSupportedError extends ServerError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(505, message, options);
  }
}

export class VariantAlsoNegotiatesError extends ServerError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(506, message, options);
  }
}

export class InsufficientStorageError extends ServerError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(507, message, options);
  }
}

export class LoopDetectedError extends ServerError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(508, message, options);
  }
}

export class NotExtendedError extends ServerError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(510, message, options);
  }
}

export class NetworkAuthenticationRequiredError extends ServerError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(511, message, options);
  }
}
