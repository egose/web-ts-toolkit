export type HttpErrorCategory = 'client' | 'server';

type HttpErrorStatusDefinition = {
  readonly statusCode: number;
  readonly category: HttpErrorCategory;
  readonly message: string;
};

export const httpErrorStatusDefinitions = {
  BadRequestError: {
    statusCode: 400,
    category: 'client',
    message: 'The server cannot process the request due to a client error',
  },
  UnauthorizedError: {
    statusCode: 401,
    category: 'client',
    message: 'The user is not authorized',
  },
  ForbiddenError: {
    statusCode: 403,
    category: 'client',
    message: 'The server refused to authorize the request',
  },
  NotFoundError: {
    statusCode: 404,
    category: 'client',
    message: 'The server did not find a current representation for the target resource',
  },
  MethodNotAllowedError: {
    statusCode: 405,
    category: 'client',
    message: 'The method received is not allowed',
  },
  NotAcceptableError: {
    statusCode: 406,
    category: 'client',
    message: 'The request is not acceptable to the user agent',
  },
  ProxyAuthRequiredError: {
    statusCode: 407,
    category: 'client',
    message: 'The client needs to authenticate itself in order to use a proxy',
  },
  RequestTimeoutError: {
    statusCode: 408,
    category: 'client',
    message: 'The request was not completed in the expected time',
  },
  ConflictError: {
    statusCode: 409,
    category: 'client',
    message: 'The request was not completed due to a conflict with the target resource',
  },
  GoneError: {
    statusCode: 410,
    category: 'client',
    message: 'The target resource is no longer available at the origin server',
  },
  LengthRequiredError: {
    statusCode: 411,
    category: 'client',
    message: 'The server refuses to accept the request without a defined Content-Length',
  },
  PreconditionFailedError: {
    statusCode: 412,
    category: 'client',
    message: 'One or more conditions given in the request header fields evaluated to false',
  },
  PayloadTooLargeError: {
    statusCode: 413,
    category: 'client',
    message: 'The request payload is too large',
  },
  UriTooLongError: {
    statusCode: 414,
    category: 'client',
    message: 'The request target is too long',
  },
  UnsupportedMediaTypeError: {
    statusCode: 415,
    category: 'client',
    message: 'The payload is in a format not supported',
  },
  RequestedRangeNotSatisfiableError: {
    statusCode: 416,
    category: 'client',
    message:
      "None of the ranges in the request's Range header field overlap the current extent of the selected resource",
  },
  ExpectationFailedError: {
    statusCode: 417,
    category: 'client',
    message: "The expectation given in the request's Expect header field could not be met",
  },
  TeapotError: {
    statusCode: 418,
    category: 'client',
    message: "I'm a teapot",
  },
  MisdirectedRequestError: {
    statusCode: 421,
    category: 'client',
    message: 'The request was directed at a server that is not able to produce a response',
  },
  UnprocessableEntityError: {
    statusCode: 422,
    category: 'client',
    message: 'The server is unable to process the request',
  },
  LockedError: {
    statusCode: 423,
    category: 'client',
    message: 'The source or destination resource of a method is locked',
  },
  FailedDependencyError: {
    statusCode: 424,
    category: 'client',
    message: 'The requested action depended on another action',
  },
  UpgradeRequiredError: {
    statusCode: 426,
    category: 'client',
    message: 'This service requires use of a different protocol',
  },
  PreconditionRequiredError: {
    statusCode: 428,
    category: 'client',
    message: 'This request is required to be conditional',
  },
  TooManyRequestsError: {
    statusCode: 429,
    category: 'client',
    message: 'The user has sent too many requests in a given amount of time',
  },
  RequestHeaderFieldsTooLargeError: {
    statusCode: 431,
    category: 'client',
    message: 'Request header fields too large',
  },
  UnavailableForLegalReasonsError: {
    statusCode: 451,
    category: 'client',
    message: 'Denied access due to a consequence of a legal demand',
  },
  InternalServerError: {
    statusCode: 500,
    category: 'server',
    message: 'The server encountered an unexpected condition',
  },
  NotImplementedError: {
    statusCode: 501,
    category: 'server',
    message: 'The server does not support the functionality required to fulfill the request',
  },
  BadGatewayError: {
    statusCode: 502,
    category: 'server',
    message: 'The server received an invalid response from an upstream server',
  },
  ServiceUnavailableError: {
    statusCode: 503,
    category: 'server',
    message: 'The server is temporarily unable to handle the request',
  },
  GatewayTimeoutError: {
    statusCode: 504,
    category: 'server',
    message: 'The server did not receive a timely response from an upstream server',
  },
  HttpVersionNotSupportedError: {
    statusCode: 505,
    category: 'server',
    message: 'The server does not support the HTTP protocol version used in the request',
  },
  VariantAlsoNegotiatesError: {
    statusCode: 506,
    category: 'server',
    message: 'The server has an internal configuration error',
  },
  InsufficientStorageError: {
    statusCode: 507,
    category: 'server',
    message: 'The server is unable to store the representation needed to complete the request',
  },
  LoopDetectedError: {
    statusCode: 508,
    category: 'server',
    message: 'The server detected an infinite loop while processing the request',
  },
  NotExtendedError: {
    statusCode: 510,
    category: 'server',
    message: 'Further extensions to the request are required for the server to fulfill it',
  },
  NetworkAuthenticationRequiredError: {
    statusCode: 511,
    category: 'server',
    message: 'The client needs to authenticate to gain network access',
  },
} as const satisfies Record<string, HttpErrorStatusDefinition>;

export type HttpErrorClassName = keyof typeof httpErrorStatusDefinitions;
export type DefinedHttpErrorStatusCode = (typeof httpErrorStatusDefinitions)[HttpErrorClassName]['statusCode'];
