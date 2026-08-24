import JsonRouter from '@web-ts-toolkit/express-json-router';
import type mongoose from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import type { MessageUser } from './types/message';
import type { PaymentProvider } from './providers/payment';
import {
  ActionConflictError,
  ActionNotificationPendingError,
  ActionNotAllowedError,
  ActionNotFoundError,
  ActionRetryableError,
  InvalidMessageUserError,
  ClientRequestFailedError,
  ClientRequestPendingError,
  MessageArchivedError,
  InvalidClientRequestIdError,
  MessageNotFoundError,
  MessageService,
  TemplateNotFoundError,
} from './message-service';
import type { MessageServiceOptions } from './message-service';
import { TemplateRegistry } from './template-registry';

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

function requireUser(user: MessageUser | undefined): MessageUser {
  if (!user || user._id === undefined || user._id === null || String(user._id).trim().length === 0) {
    throw new JsonRouter.clientErrors.UnauthorizedError('authentication required');
  }

  return user;
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
  if (error instanceof ClientRequestPendingError || error instanceof ClientRequestFailedError) {
    throw new JsonRouter.clientErrors.ConflictError(error.message);
  }
  if (isMongooseCastError(error)) {
    throw new JsonRouter.clientErrors.BadRequestError('id must be a valid ObjectId');
  }
  throw error;
}

// ---------------------------------------------------------------------------
// createMessageRoutes
// ---------------------------------------------------------------------------

export interface MessageRoutesOptions {
  /** Mongoose model getter */
  getModel: (name: string) => mongoose.Model<unknown>;

  /** Payment provider (optional — enables payment session handling) */
  paymentProvider?: PaymentProvider | null;

  /** Optional hook called when expiring an uncommitted payment session fails. */
  onPaymentCompensationFailure?: MessageServiceOptions['onPaymentCompensationFailure'];

  /** Admin roles that receive messages when no toUser/toRoles specified */
  adminRoles?: string[];

  /**
   * Custom template registry. Use this to isolate templates per app or test
   * instead of relying on the global `defaultRegistry`. Pass the same registry
   * instance to `MessageService` if you also construct one directly.
   */
  registry?: TemplateRegistry;

  /** Custom auth middleware applied to all routes */
  authMiddleware?: ((req: Request, res: Response, next: NextFunction) => void)[];

  /**
   * Extract user from request (default: req._user || req.user). All routes
   * require this extractor to return a user with a non-empty `_id` before any
   * service, template, payment, model, or action side effect runs.
   */
  getUser?: (req: Request) => MessageUser | undefined;

  /** Extract permissions from request (default: req._permissions || {}) */
  getPermissions?: (req: Request) => Record<string, boolean>;

  /** Extract identity from request (default: req._identity || {}) */
  getIdentity?: (req: Request) => Record<string, unknown>;

  /**
   * Permission key that, when truthy, makes `getActions` return an empty
   * action list (read-only view). Defaults to `'is.admin'`.
   */
  adminPermissionKey?: string;
}

/**
 * Create a JsonRouter with the message template routes.
 * Mount via `router.original` and apply your own auth/permission middleware.
 *
 * Routes:
 *   POST /new/:templateCd        — create message from template
 *   GET  /:id/actions/:usertype  — get available actions for a message
 *   POST /:id/action/:actionCd   — execute an action (POST)
 *
 * All routes require a resolved user with a non-empty `_id`. Route parameters
 * are validated before service/model/template lookup, and mutating actions are
 * intentionally POST-only.
 */
export function createMessageRoutes(options: MessageRoutesOptions): {
  router: JsonRouter;
  service: MessageService;
} {
  const {
    getModel,
    paymentProvider = null,
    onPaymentCompensationFailure,
    adminRoles,
    registry,
    authMiddleware = [],
    getUser = defaultGetUser,
    getPermissions = defaultGetPermissions,
    getIdentity = defaultGetIdentity,
    adminPermissionKey = 'is.admin',
  } = options;

  const service = new MessageService({ getModel, paymentProvider, onPaymentCompensationFailure, adminRoles, registry });
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
    const isAdmin = !!permissions[adminPermissionKey];

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
