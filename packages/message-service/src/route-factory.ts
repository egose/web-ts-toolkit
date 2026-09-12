import JsonRouter from '@web-ts-toolkit/express-json-router';
import type { Request, Response, NextFunction } from 'express';
import type { MessageUser } from './types/message';
import {
  ActionConflictError,
  ActionNotificationPendingError,
  ActionNotAllowedError,
  ActionNotFoundError,
  ActionRetryableError,
  InvalidMessageServiceOptionError,
  InvalidMessageUserError,
  ClientRequestFailedError,
  ClientRequestPendingError,
  MessageArchivedError,
  InvalidClientRequestIdError,
  MessageNotFoundError,
  MessageService,
  TemplateNotFoundError,
  requireMessageUserId,
} from './message-service';
import type { MessageServiceOptions } from './message-service';
import { hasExplicitPermissionGrant } from './template-engine';

// ---------------------------------------------------------------------------
// Action code validation
// ---------------------------------------------------------------------------

const ACTION_CD_PATTERN = /^[a-zA-Z0-9_-]+$/;
const ROUTE_CODE_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const OBJECT_ID_PATTERN = /^[a-fA-F0-9]{24}$/;
const MAX_ROUTE_CODE_LENGTH = 128;
const MAX_CLIENT_REQUEST_ID_LENGTH = 128;

function assertRouteCode(value: unknown, name: 'templateCd' | 'actionCd'): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_ROUTE_CODE_LENGTH ||
    !ROUTE_CODE_PATTERN.test(value)
  ) {
    throw new JsonRouter.clientErrors.BadRequestError(
      `${name} must be a non-empty string of at most ${MAX_ROUTE_CODE_LENGTH} letters, digits, dots, underscores, and hyphens`,
    );
  }
}

function assertValidActionCd(actionCd: unknown): asserts actionCd is string {
  if (
    typeof actionCd !== 'string' ||
    actionCd.length === 0 ||
    actionCd.length > MAX_ROUTE_CODE_LENGTH ||
    !ACTION_CD_PATTERN.test(actionCd)
  ) {
    throw new JsonRouter.clientErrors.BadRequestError(
      `actionCd must be a non-empty string of at most ${MAX_ROUTE_CODE_LENGTH} letters, digits, underscores, and hyphens`,
    );
  }
}

function assertValidMessageId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !OBJECT_ID_PATTERN.test(id)) {
    throw new JsonRouter.clientErrors.BadRequestError('id must be a 24-character hex ObjectId');
  }
}

function assertValidClientRequestId(clientRequestId: unknown): asserts clientRequestId is string | undefined {
  if (clientRequestId === undefined) {
    return;
  }

  if (typeof clientRequestId !== 'string') {
    throw new JsonRouter.clientErrors.BadRequestError('clientRequestId must be a string when provided');
  }

  const trimmed = clientRequestId.trim();
  if (trimmed.length === 0) {
    throw new JsonRouter.clientErrors.BadRequestError(
      'clientRequestId must be a non-empty string after trimming whitespace',
    );
  }

  if (trimmed.length > MAX_CLIENT_REQUEST_ID_LENGTH) {
    throw new JsonRouter.clientErrors.BadRequestError(
      `clientRequestId must be at most ${MAX_CLIENT_REQUEST_ID_LENGTH} characters`,
    );
  }
}

function assertValidUsertype(usertype: unknown): asserts usertype is 'sender' | 'receiver' {
  if (usertype !== 'sender' && usertype !== 'receiver') {
    throw new JsonRouter.clientErrors.BadRequestError('usertype must be "sender" or "receiver"');
  }
}

function assertValidBody(body: unknown): asserts body is Record<string, unknown> {
  if (body === undefined || body === null) {
    return;
  }

  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new JsonRouter.clientErrors.BadRequestError('body must be a JSON object');
  }
}

function requireUser(user: unknown): MessageUser {
  try {
    requireMessageUserId(user);
  } catch {
    throw new JsonRouter.clientErrors.UnauthorizedError('authentication required');
  }

  return user as MessageUser;
}

function isMongooseCastError(error: unknown): boolean {
  return !!error && typeof error === 'object' && (error as { name?: unknown }).name === 'CastError';
}

function mapServiceError(error: unknown): never {
  if (error instanceof MessageNotFoundError) {
    throw new JsonRouter.clientErrors.NotFoundError('message not found');
  }
  if (error instanceof TemplateNotFoundError) {
    throw new JsonRouter.clientErrors.NotFoundError(error.message);
  }
  if (error instanceof ActionNotFoundError) {
    throw new JsonRouter.clientErrors.NotFoundError(error.message);
  }
  if (error instanceof ActionNotAllowedError) {
    throw new JsonRouter.clientErrors.ForbiddenError(error.message);
  }
  if (error instanceof ActionConflictError) {
    throw new JsonRouter.clientErrors.ConflictError(error.message);
  }
  if (error instanceof ActionRetryableError) {
    throw new JsonRouter.clientErrors.ConflictError(error.message);
  }
  if (error instanceof MessageArchivedError) {
    throw new JsonRouter.clientErrors.GoneError(error.message);
  }
  if (error instanceof InvalidClientRequestIdError) {
    throw new JsonRouter.clientErrors.BadRequestError(error.message);
  }
  if (error instanceof InvalidMessageUserError) {
    throw new JsonRouter.clientErrors.UnauthorizedError('authentication required');
  }
  if (error instanceof ClientRequestPendingError) {
    throw new JsonRouter.clientErrors.ConflictError(error.message);
  }
  if (error instanceof ClientRequestFailedError) {
    // Stable public failure without the recorded cause text. The persisted
    // `failureMessage` stays in the request record and on
    // `error.failureReason`/`cause` for internal observers; HTTP only carries
    // the caller-supplied scoped id plus an actionable outcome. Never forward
    // `error.message` verbatim here: older records/errors may interpolate the
    // cause, and future edits must not reintroduce that crossing.
    // Audit (MSGF-09): other mapped lifecycle errors forward only
    // caller-supplied/authorized identifiers — pending/conflict carry
    // request/message/attempt ids, archived outcomes are gated by the service
    // relationship policy before any attempt id is disclosed, and
    // template/action-not-found carry only route-supplied codes. Retryable and
    // pending-notification causes stay on `error.cause`, which the HTTP
    // serializers do not emit.
    throw new JsonRouter.clientErrors.ConflictError(
      `clientRequestId "${error.clientRequestId}" previously failed; retry with a new clientRequestId`,
    );
  }
  if (isMongooseCastError(error)) {
    throw new JsonRouter.clientErrors.BadRequestError('id must be a valid ObjectId');
  }
  throw error;
}

// ---------------------------------------------------------------------------
// createMessageRoutes
// ---------------------------------------------------------------------------

/**
 * Route-only behavior options shared by both composition paths.
 *
 * These never configure the underlying `MessageService`: auth middleware,
 * request extractors, and the admin read-only permission key. They apply
 * identically whether routes construct a service or reuse an injected one.
 */
export interface MessageRoutesBehaviorOptions {
  /** Custom auth middleware applied to all routes */
  authMiddleware?: ((req: Request, res: Response, next: NextFunction) => void)[];

  /**
   * Extract user from request (default: req._user || req.user). All routes
   * require this extractor to return a user with a valid `_id` (non-empty
   * string or ObjectId; numbers, arrays, and plain objects are rejected)
   * before any service, template, payment, model, or action side effect runs.
   * Shares the service's principal-validation contract.
   */
  getUser?: (req: Request) => MessageUser | undefined;

  /**
   * Extract permissions from request (default: req._permissions || {}).
   * Permission grants throughout the package (UI filtering, action
   * execution, admin read-only) require an own property strictly equal to
   * `true`; custom extractors must return plain own-boolean maps. Inherited
   * properties and truthy non-booleans are denied.
   */
  getPermissions?: (req: Request) => Record<string, boolean>;

  /** Extract identity from request (default: req._identity || {}) */
  getIdentity?: (req: Request) => Record<string, unknown>;

  /**
   * Permission key that, when granted as an own boolean `true`, makes
   * `getActions` return an empty action list (read-only view). Defaults to
   * `'is.admin'`. Uses the same explicit-grant predicate as UI filtering and
   * action execution, so inheritance (e.g. `constructor`) or truthy
   * non-booleans cannot enable admin read-only mode.
   */
  adminPermissionKey?: string;
}

/**
 * Convenience-construction path: routes build and own a `MessageService`
 * from the full service option set. `service` must be absent; every other
 * service knob (`getModel`, `connection`, `modelNames`, payment, `registry`,
 * list limits, and `clientRequest*` timing/test hooks) is forwarded verbatim
 * to `new MessageService(...)` so the route service never drifts behind the
 * direct-service configuration surface.
 */
export interface MessageRoutesConstructionOptions extends MessageRoutesBehaviorOptions, MessageServiceOptions {
  /**
   * Must be absent on this path. Supplying `service` together with any
   * service construction option is a conflict (see
   * `MessageRoutesInjectionOptions`); the factory throws
   * `InvalidMessageServiceOptionError` instead of silently ignoring options.
   */
  service?: undefined;
  /** Mongoose model getter (required on this path for backwards compatibility). */
  getModel: NonNullable<MessageServiceOptions['getModel']>;
}

/**
 * Service-injection path: routes reuse the exact supplied configured
 * service (custom `modelNames`, `connection`, timing policies, providers,
 * and registry included). No second service or global registry is created.
 * Every service construction option is typed `never` here and rejected at
 * runtime; route-only behavior options remain allowed.
 */
export interface MessageRoutesInjectionOptions extends MessageRoutesBehaviorOptions {
  /** Existing configured service reused verbatim (`returned.service === supplied`). */
  service: MessageService;
  getModel?: never;
  connection?: never;
  modelNames?: never;
  paymentProvider?: never;
  onPaymentCompensationFailure?: never;
  adminRoles?: never;
  registry?: never;
  defaultListLimit?: never;
  maxListLimit?: never;
  clientRequestLeaseMs?: never;
  clientRequestWaitMs?: never;
  clientRequestPollMs?: never;
  clientRequestDelay?: never;
  clientRequestNow?: never;
}

/**
 * Supported route composition options: either construct a service from
 * service options or reuse an existing service — never both.
 *
 * - Construction: `createMessageRoutes({ getModel, registry, ... })`.
 * - Injection: `createMessageRoutes({ service, getUser, ... })`.
 *
 * Combining `service` with any service construction option throws
 * `InvalidMessageServiceOptionError` at runtime (and fails strict type
 * checking via the `never` fields on the injection branch) rather than
 * silently ignoring the conflicting options.
 */
export type MessageRoutesOptions = MessageRoutesConstructionOptions | MessageRoutesInjectionOptions;

const SERVICE_CONSTRUCTION_KEYS = [
  'getModel',
  'connection',
  'modelNames',
  'paymentProvider',
  'onPaymentCompensationFailure',
  'adminRoles',
  'registry',
  'defaultListLimit',
  'maxListLimit',
  'clientRequestLeaseMs',
  'clientRequestWaitMs',
  'clientRequestPollMs',
  'clientRequestDelay',
  'clientRequestNow',
] as const;

/**
 * Create a JsonRouter with the message template routes.
 * Mount via `router.original` and apply your own auth/permission middleware.
 *
 * Composition (MSGF-11):
 * - Convenience construction: `createMessageRoutes({ getModel, registry,
 *   clientRequestWaitMs, ... })` builds and owns a `MessageService` from the
 *   full service option set (no subsets).
 * - Service injection: `createMessageRoutes({ service })` reuses the exact
 *   supplied configured service — custom `modelNames`, `connection`, timing
 *   policies, providers, and registry included — without creating a second
 *   service or touching the global registry. Route-only behavior options
 *   (`authMiddleware`, `getUser`, `getPermissions`, `getIdentity`,
 *   `adminPermissionKey`) still apply on both paths.
 *
 * Combining `service` with any service construction option throws
 * `InvalidMessageServiceOptionError` instead of silently ignoring conflicts.
 * No per-method service callbacks are accepted; routes call the service API
 * directly so authentication/validation/error mapping stay identical on both
 * paths.
 *
 * Routes:
 *   POST /new/:templateCd        — create message from template
 *   GET  /:id/actions/:usertype  — get available actions for a message
 *   POST /:id/action/:actionCd   — execute an action (POST)
 *
 * All routes require a resolved user with a valid `_id` (non-empty string
 * or ObjectId; numbers, arrays, and plain objects are rejected with 401).
 * Route parameters
 * are validated before service/model/template lookup, and mutating actions are
 * intentionally POST-only.
 */
export function createMessageRoutes(options: MessageRoutesOptions): {
  router: JsonRouter;
  service: MessageService;
} {
  const {
    authMiddleware = [],
    getUser = defaultGetUser,
    getPermissions = defaultGetPermissions,
    getIdentity = defaultGetIdentity,
    adminPermissionKey = 'is.admin',
  } = options;

  let service: MessageService;
  if (options.service !== undefined) {
    const conflicts = SERVICE_CONSTRUCTION_KEYS.filter(
      (key) => (options as unknown as Record<string, unknown>)[key] !== undefined,
    );
    if (conflicts.length > 0) {
      throw new InvalidMessageServiceOptionError(
        `createMessageRoutes: "service" cannot be combined with service construction options: ${conflicts.join(', ')}. Pass route-only options (authMiddleware, getUser, getPermissions, getIdentity, adminPermissionKey) alongside "service", or construct without "service".`,
      );
    }
    service = options.service;
  } else {
    const construction = options as MessageRoutesConstructionOptions;
    service = new MessageService({
      getModel: construction.getModel,
      connection: construction.connection,
      modelNames: construction.modelNames,
      paymentProvider: construction.paymentProvider,
      onPaymentCompensationFailure: construction.onPaymentCompensationFailure,
      adminRoles: construction.adminRoles,
      registry: construction.registry,
      defaultListLimit: construction.defaultListLimit,
      maxListLimit: construction.maxListLimit,
      clientRequestLeaseMs: construction.clientRequestLeaseMs,
      clientRequestWaitMs: construction.clientRequestWaitMs,
      clientRequestPollMs: construction.clientRequestPollMs,
      clientRequestDelay: construction.clientRequestDelay,
      clientRequestNow: construction.clientRequestNow,
    });
  }
  const router = new JsonRouter('', authMiddleware);

  router.post('/new/:templateCd', async (req) => {
    const templateCd = req.params.templateCd as string;
    const user = requireUser(getUser(req));
    assertRouteCode(templateCd, 'templateCd');
    assertValidBody(req.body);
    const roles = user.roles || [];
    const identity = getIdentity(req);
    const permissions = getPermissions(req);

    const body = req.body || {};
    const { clientRequestId, ...payload } = body;
    const hasClientRequestId = Object.prototype.hasOwnProperty.call(body, 'clientRequestId');
    assertValidClientRequestId(hasClientRequestId ? clientRequestId : undefined);

    try {
      return await service.createMessage({
        templateCd,
        user,
        roles,
        identity,
        permissions,
        payload,
        payerUser: user,
        req,
        clientRequestId: hasClientRequestId ? clientRequestId : undefined,
      });
    } catch (error) {
      mapServiceError(error);
    }
  });

  router.get('/:id/actions/:usertype', async (req) => {
    const id = req.params.id as string;
    const usertype = req.params.usertype;
    const user = requireUser(getUser(req));
    assertValidMessageId(id);
    assertValidUsertype(usertype);

    const permissions = getPermissions(req);
    const isAdmin = hasExplicitPermissionGrant(permissions, adminPermissionKey);

    let result;
    try {
      result = await service.getActions(id, usertype, { permissions, user, isAdmin });
    } catch (error) {
      mapServiceError(error);
    }
    if (!result) {
      throw new JsonRouter.clientErrors.NotFoundError('message not found');
    }
    return result;
  });

  async function handleAction(req: Request) {
    const id = req.params.id as string;
    const actionCd = req.params.actionCd;
    const user = requireUser(getUser(req));
    assertValidMessageId(id);
    assertValidActionCd(actionCd);

    let message;
    try {
      message = await service.findMessageOrThrow(id);
    } catch (error) {
      mapServiceError(error);
    }

    const permissions = getPermissions(req);
    try {
      return await service.handleAction(message.templateCd, actionCd, { message, user, permissions, req });
    } catch (error) {
      if (error instanceof ActionNotificationPendingError) {
        return new JsonRouter.success.Accepted({ message: error.message, actionAttemptId: error.actionAttemptId });
      }
      mapServiceError(error);
    }
  }

  router.post('/:id/action/:actionCd', handleAction);

  return { router, service };
}

// ---------------------------------------------------------------------------
// Default extractors (backwards-compatible with access-router conventions)
// ---------------------------------------------------------------------------

function defaultGetUser(req: Request): MessageUser | undefined {
  const raw =
    (req as unknown as { _user?: MessageUser; user?: MessageUser })._user ||
    (req as unknown as { user?: MessageUser }).user;
  return raw;
}

function defaultGetPermissions(req: Request): Record<string, boolean> {
  return (req as unknown as { _permissions?: Record<string, boolean> })._permissions || {};
}

function defaultGetIdentity(req: Request): Record<string, unknown> {
  return (req as unknown as { _identity?: Record<string, unknown> })._identity || {};
}
