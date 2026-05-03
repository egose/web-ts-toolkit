const messages = {
  400: 'The server cannot process the request due to a client error',
  401: 'The user is not authorized',
  403: 'The server refused to authorize the request',
  404: 'The server did not find a current representation for the target resource',
  405: 'The method received is not allowed',
  406: 'The request is not acceptable to the user agent',
  407: 'The client needs to authenticate itself in order to use a proxy',
  408: 'The request was not completed in the expected time',
  409: 'The request was not completed due to a conflict with the target resource',
  410: 'The target resource is no longer available at the origin server',
  411: 'The server refuses to accept the request without a defined Content-Length',
  412: 'One or more conditions given in the request header fields evaluated to false',
  413: 'The request payload is too large',
  414: 'The request target is too long',
  415: 'The payload is in a format not supported',
  416: "None of the ranges in the request's Range header field overlap the current extent of the selected resource",
  417: "The expectation given in the request's Expect header field could not be met",
  418: "I'm a teapot",
  421: 'The request was directed at a server that is not able to produce a response',
  422: 'The server is unable to process the request',
  423: 'The source or destination resource of a method is locked',
  424: 'The requested action depended on another action',
  426: 'This service requires use of a different protocol',
  428: 'This request is required to be conditional',
  429: 'The user has sent too many requests in a given amount of time',
  431: 'Request header fields too large',
  451: 'Denied access due to a consequence of a legal demand',
  500: 'The server encountered an unexpected condition',
  501: 'The server does not support the functionality required to fulfill the request',
  502: 'The server received an invalid response from an upstream server',
  503: 'The server is temporarily unable to handle the request',
  504: 'The server did not receive a timely response from an upstream server',
  505: 'The server does not support the HTTP protocol version used in the request',
  506: 'The server has an internal configuration error',
  507: 'The server is unable to store the representation needed to complete the request',
  508: 'The server detected an infinite loop while processing the request',
  510: 'Further extensions to the request are required for the server to fulfill it',
  511: 'The client needs to authenticate to gain network access',
} as const;

type ErrorMessageMap = typeof messages;
type ErrorStatusCode = keyof ErrorMessageMap;

type ErrorWithCaptureStackTrace = ErrorConstructor & {
  captureStackTrace?: (targetObject: object, constructorOpt?: Function) => void;
};

const ErrorCtor = Error as ErrorWithCaptureStackTrace;

export class HttpError extends Error {
  readonly statusCode: number;
  readonly date: Date;

  constructor(statusCode = 500, message?: string, ...others: unknown[]) {
    super(message || messages[statusCode as ErrorStatusCode] || messages[500], others[0] as ErrorOptions | undefined);

    if (ErrorCtor.captureStackTrace) {
      ErrorCtor.captureStackTrace(this, this.constructor);
    }

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.date = new Date();
  }
}

export class ClientError extends HttpError {
  constructor(statusCode = 400, message?: string, ...others: unknown[]) {
    super(statusCode, message, ...others);
  }
}

export class ServerError extends HttpError {
  constructor(statusCode = 500, message?: string, ...others: unknown[]) {
    super(statusCode, message, ...others);
  }
}

export class BadRequestError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(400, message, ...others);
  }
}

export class UnauthorizedError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(401, message, ...others);
  }
}

export class ForbiddenError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(403, message, ...others);
  }
}

export class NotFoundError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(404, message, ...others);
  }
}

export class MethodNotAllowedError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(405, message, ...others);
  }
}

export class NotAcceptableError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(406, message, ...others);
  }
}

export class ProxyAuthRequiredError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(407, message, ...others);
  }
}

export class RequestTimeoutError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(408, message, ...others);
  }
}

export class ConflictError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(409, message, ...others);
  }
}

export class GoneError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(410, message, ...others);
  }
}

export class LengthRequiredError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(411, message, ...others);
  }
}

export class PreconditionFailedError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(412, message, ...others);
  }
}

export class PayloadTooLargeError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(413, message, ...others);
  }
}

export class UriTooLongError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(414, message, ...others);
  }
}

export class UnsupportedMediaTypeError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(415, message, ...others);
  }
}

export class RequestedRangeNotSatisfiableError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(416, message, ...others);
  }
}

export class ExpectationFailedError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(417, message, ...others);
  }
}

export class TeapotError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(418, message, ...others);
  }
}

export class MisdirectedRequestError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(421, message, ...others);
  }
}

export class UnprocessableEntityError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(422, message, ...others);
  }
}

export class LockedError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(423, message, ...others);
  }
}

export class FailedDependencyError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(424, message, ...others);
  }
}

export class UpgradeRequiredError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(426, message, ...others);
  }
}

export class PreconditionRequiredError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(428, message, ...others);
  }
}

export class TooManyRequestsError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(429, message, ...others);
  }
}

export class RequestHeaderFieldsTooLargeError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(431, message, ...others);
  }
}

export class UnavailableForLegalReasonsError extends ClientError {
  constructor(message?: string, ...others: unknown[]) {
    super(451, message, ...others);
  }
}

export class InternalServerError extends ServerError {
  constructor(message?: string, ...others: unknown[]) {
    super(500, message, ...others);
  }
}

export class NotImplementedError extends ServerError {
  constructor(message?: string, ...others: unknown[]) {
    super(501, message, ...others);
  }
}

export class BadGatewayError extends ServerError {
  constructor(message?: string, ...others: unknown[]) {
    super(502, message, ...others);
  }
}

export class ServiceUnavailableError extends ServerError {
  constructor(message?: string, ...others: unknown[]) {
    super(503, message, ...others);
  }
}

export class GatewayTimeoutError extends ServerError {
  constructor(message?: string, ...others: unknown[]) {
    super(504, message, ...others);
  }
}

export class HttpVersionNotSupportedError extends ServerError {
  constructor(message?: string, ...others: unknown[]) {
    super(505, message, ...others);
  }
}

export class VariantAlsoNegotiatesError extends ServerError {
  constructor(message?: string, ...others: unknown[]) {
    super(506, message, ...others);
  }
}

export class InsufficientStorageError extends ServerError {
  constructor(message?: string, ...others: unknown[]) {
    super(507, message, ...others);
  }
}

export class LoopDetectedError extends ServerError {
  constructor(message?: string, ...others: unknown[]) {
    super(508, message, ...others);
  }
}

export class NotExtendedError extends ServerError {
  constructor(message?: string, ...others: unknown[]) {
    super(510, message, ...others);
  }
}

export class NetworkAuthenticationRequiredError extends ServerError {
  constructor(message?: string, ...others: unknown[]) {
    super(511, message, ...others);
  }
}
