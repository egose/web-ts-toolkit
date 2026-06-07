import JsonRouter from '@web-ts-toolkit/express-json-router';
import type mongoose from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import type { MessageUser } from './types/message';
import type { PaymentProvider } from './providers/payment';
import {
  ActionNotAllowedError,
  ActionNotFoundError,
  MessageArchivedError,
  MessageNotFoundError,
  MessageService,
  TemplateNotFoundError,
} from './message-service';
import { TemplateRegistry } from './template-registry';

// ---------------------------------------------------------------------------
// Action code validation
// ---------------------------------------------------------------------------

const ACTION_CD_PATTERN = /^[a-zA-Z0-9_-]+$/;

function assertValidActionCd(actionCd: unknown): asserts actionCd is string {
  if (typeof actionCd !== 'string' || !ACTION_CD_PATTERN.test(actionCd)) {
    throw new JsonRouter.clientErrors.BadRequestError(
      'actionCd must be a string of letters, digits, underscores, and hyphens',
    );
  }
}

function assertValidUsertype(usertype: unknown): asserts usertype is 'sender' | 'receiver' {
  if (usertype !== 'sender' && usertype !== 'receiver') {
    throw new JsonRouter.clientErrors.BadRequestError('usertype must be "sender" or "receiver"');
  }
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
  if (error instanceof MessageArchivedError) {
    throw new JsonRouter.clientErrors.GoneError(error.message);
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

  /** Extract user from request (default: req._user || req.user) */
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
 *   GET  /:id/action/:actionCd   — execute an action (GET)
 *   POST /:id/action/:actionCd   — execute an action (POST)
 */
export function createMessageRoutes(options: MessageRoutesOptions): {
  router: JsonRouter;
  service: MessageService;
} {
  const {
    getModel,
    paymentProvider = null,
    adminRoles,
    registry,
    authMiddleware = [],
    getUser = defaultGetUser,
    getPermissions = defaultGetPermissions,
    getIdentity = defaultGetIdentity,
    adminPermissionKey = 'is.admin',
  } = options;

  const service = new MessageService({ getModel, paymentProvider, adminRoles, registry });
  const router = new JsonRouter('', authMiddleware);

  router.post('/new/:templateCd', async (req) => {
    const templateCd = req.params.templateCd as string;
    const user = getUser(req) || { _id: '' };
    const roles = user.roles || [];
    const identity = getIdentity(req);
    const permissions = getPermissions(req);

    const body = (req.body || {}) as Record<string, unknown>;
    const { clientRequestId, ...payload } = body;
    const clientRequestIdStr = typeof clientRequestId === 'string' ? clientRequestId : undefined;

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
        clientRequestId: clientRequestIdStr,
      });
    } catch (error) {
      mapServiceError(error);
    }
  });

  router.get('/:id/actions/:usertype', async (req) => {
    const id = req.params.id as string;
    const usertype = req.params.usertype;
    assertValidUsertype(usertype);

    const permissions = getPermissions(req);
    const isAdmin = !!permissions[adminPermissionKey];

    const user = getUser(req) || { _id: '' };
    const result = await service.getActions(id, usertype, { permissions, user, isAdmin });
    if (!result) {
      throw new JsonRouter.clientErrors.NotFoundError('message not found');
    }
    return result;
  });

  async function handleAction(req: Request) {
    const id = req.params.id as string;
    const actionCd = req.params.actionCd;
    assertValidActionCd(actionCd);

    let message;
    try {
      message = await service.findMessageOrThrow(id);
    } catch (error) {
      mapServiceError(error);
    }

    const user = getUser(req) || { _id: '' };
    const permissions = getPermissions(req);
    try {
      return await service.handleAction(message.templateCd, actionCd, { message, user, permissions, req });
    } catch (error) {
      mapServiceError(error);
    }
  }

  router.get('/:id/action/:actionCd', handleAction);
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
