import { ClientError } from './base';
import type { HttpErrorOptions } from './types';

export class BadRequestError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(400, message, options);
  }
}

export class UnauthorizedError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(401, message, options);
  }
}

export class ForbiddenError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(403, message, options);
  }
}

export class NotFoundError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(404, message, options);
  }
}

export class MethodNotAllowedError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(405, message, options);
  }
}

export class NotAcceptableError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(406, message, options);
  }
}

export class ProxyAuthRequiredError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(407, message, options);
  }
}

export class RequestTimeoutError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(408, message, options);
  }
}

export class ConflictError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(409, message, options);
  }
}

export class GoneError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(410, message, options);
  }
}

export class LengthRequiredError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(411, message, options);
  }
}

export class PreconditionFailedError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(412, message, options);
  }
}

export class PayloadTooLargeError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(413, message, options);
  }
}

export class UriTooLongError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(414, message, options);
  }
}

export class UnsupportedMediaTypeError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(415, message, options);
  }
}

export class RequestedRangeNotSatisfiableError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(416, message, options);
  }
}

export class ExpectationFailedError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(417, message, options);
  }
}

export class TeapotError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(418, message, options);
  }
}

export class MisdirectedRequestError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(421, message, options);
  }
}

export class UnprocessableEntityError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(422, message, options);
  }
}

export class LockedError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(423, message, options);
  }
}

export class FailedDependencyError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(424, message, options);
  }
}

export class UpgradeRequiredError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(426, message, options);
  }
}

export class PreconditionRequiredError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(428, message, options);
  }
}

export class TooManyRequestsError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(429, message, options);
  }
}

export class RequestHeaderFieldsTooLargeError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(431, message, options);
  }
}

export class UnavailableForLegalReasonsError extends ClientError {
  constructor(message?: string, options: HttpErrorOptions = {}) {
    super(451, message, options);
  }
}
