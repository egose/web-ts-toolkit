import {
  Accepted,
  AlreadyReported,
  Created,
  IMUsed,
  MultiStatus,
  NoContent,
  NonAuthoritativeInfo,
  OK,
  PartialContent,
  ResetContent,
} from './responses/success';
import { CSVResponse } from './responses/csv';
import {
  BadRequestError,
  ConflictError,
  ExpectationFailedError,
  FailedDependencyError,
  ForbiddenError,
  GoneError,
  LengthRequiredError,
  LockedError,
  MethodNotAllowedError,
  MisdirectedRequestError,
  NotAcceptableError,
  NotFoundError,
  PayloadTooLargeError,
  PreconditionFailedError,
  PreconditionRequiredError,
  ProxyAuthRequiredError,
  RequestHeaderFieldsTooLargeError,
  RequestedRangeNotSatisfiableError,
  RequestTimeoutError,
  TeapotError,
  TooManyRequestsError,
  UnauthorizedError,
  UnavailableForLegalReasonsError,
  UnprocessableEntityError,
  UnsupportedMediaTypeError,
  UpgradeRequiredError,
  UriTooLongError,
} from '@web-ts-toolkit/http-errors';

export const HttpResponse = {
  ok: <T>(data: T) => new OK<T>(data),
  created: <T>(data: T) => new Created<T>(data),
  accepted: <T>(data: T) => new Accepted<T>(data),
  nonAuthoritativeInfo: <T>(data: T) => new NonAuthoritativeInfo<T>(data),
  noContent: (...args: ConstructorParameters<typeof NoContent>) => new NoContent(...args),
  resetContent: <T>(data: T) => new ResetContent<T>(data),
  partialContent: <T>(data: T) => new PartialContent<T>(data),
  multiStatus: <T>(data: T) => new MultiStatus<T>(data),
  alreadyReported: <T>(data: T) => new AlreadyReported<T>(data),
  imUsed: <T>(data: T) => new IMUsed<T>(data),
  badRequest: (...args: ConstructorParameters<typeof BadRequestError>) => new BadRequestError(...args),
  unauthorized: (...args: ConstructorParameters<typeof UnauthorizedError>) => new UnauthorizedError(...args),
  forbidden: (...args: ConstructorParameters<typeof ForbiddenError>) => new ForbiddenError(...args),
  notFound: (...args: ConstructorParameters<typeof NotFoundError>) => new NotFoundError(...args),
  methodNotAllowed: (...args: ConstructorParameters<typeof MethodNotAllowedError>) =>
    new MethodNotAllowedError(...args),
  notAcceptable: (...args: ConstructorParameters<typeof NotAcceptableError>) => new NotAcceptableError(...args),
  proxyAuthRequired: (...args: ConstructorParameters<typeof ProxyAuthRequiredError>) =>
    new ProxyAuthRequiredError(...args),
  requestTimeout: (...args: ConstructorParameters<typeof RequestTimeoutError>) => new RequestTimeoutError(...args),
  conflict: (...args: ConstructorParameters<typeof ConflictError>) => new ConflictError(...args),
  gone: (...args: ConstructorParameters<typeof GoneError>) => new GoneError(...args),
  lengthRequired: (...args: ConstructorParameters<typeof LengthRequiredError>) => new LengthRequiredError(...args),
  preconditionFailed: (...args: ConstructorParameters<typeof PreconditionFailedError>) =>
    new PreconditionFailedError(...args),
  payloadTooLarge: (...args: ConstructorParameters<typeof PayloadTooLargeError>) => new PayloadTooLargeError(...args),
  uriTooLong: (...args: ConstructorParameters<typeof UriTooLongError>) => new UriTooLongError(...args),
  unsupportedMediaType: (...args: ConstructorParameters<typeof UnsupportedMediaTypeError>) =>
    new UnsupportedMediaTypeError(...args),
  requestedRangeNotSatisfiable: (...args: ConstructorParameters<typeof RequestedRangeNotSatisfiableError>) =>
    new RequestedRangeNotSatisfiableError(...args),
  expectationFailed: (...args: ConstructorParameters<typeof ExpectationFailedError>) =>
    new ExpectationFailedError(...args),
  teapot: (...args: ConstructorParameters<typeof TeapotError>) => new TeapotError(...args),
  misdirectedRequest: (...args: ConstructorParameters<typeof MisdirectedRequestError>) =>
    new MisdirectedRequestError(...args),
  unprocessableEntity: (...args: ConstructorParameters<typeof UnprocessableEntityError>) =>
    new UnprocessableEntityError(...args),
  locked: (...args: ConstructorParameters<typeof LockedError>) => new LockedError(...args),
  failedDependency: (...args: ConstructorParameters<typeof FailedDependencyError>) =>
    new FailedDependencyError(...args),
  upgradeRequired: (...args: ConstructorParameters<typeof UpgradeRequiredError>) => new UpgradeRequiredError(...args),
  preconditionRequired: (...args: ConstructorParameters<typeof PreconditionRequiredError>) =>
    new PreconditionRequiredError(...args),
  tooManyRequests: (...args: ConstructorParameters<typeof TooManyRequestsError>) => new TooManyRequestsError(...args),
  requestHeaderFieldsTooLarge: (...args: ConstructorParameters<typeof RequestHeaderFieldsTooLargeError>) =>
    new RequestHeaderFieldsTooLargeError(...args),
  unavailableForLegalReasons: (...args: ConstructorParameters<typeof UnavailableForLegalReasonsError>) =>
    new UnavailableForLegalReasonsError(...args),
  json: <T>(data: T) => new OK<T>(data),
  csv: (...args: ConstructorParameters<typeof CSVResponse>) => new CSVResponse(...args),
};

export type HttpResponseHelpers = typeof HttpResponse;
