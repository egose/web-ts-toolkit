import JsonRouter from '@web-ts-toolkit/express-json-router';
import type mongoose from 'mongoose';
import type { Request, Response, NextFunction } from 'express';
import type { MessageUser, PermissionSchema } from './types/message';
import type { PaymentProvider } from './providers/payment';
import { MessageService } from './message-service';
import { MESSAGE_MODEL_NAME, MESSAGE_ARCHIVE_MODEL_NAME } from './schemas/base';

// ---------------------------------------------------------------------------
// Default permission schema — all fields readable, only paymentCd writable
// ---------------------------------------------------------------------------

export const DEFAULT_PERMISSION_SCHEMA: PermissionSchema = {
  templateCd: { list: true, read: true, update: false, create: false },
  type: { list: true, read: true, update: false, create: false },
  fromUser: { list: true, read: true, update: false, create: false },
  toUser: { list: true, read: true, update: false, create: false },
  toRoles: { list: true, read: true, update: false, create: false },
  senderContent: { list: true, read: true, update: false, create: false },
  receiverContent: { list: true, read: true, update: false, create: false },
  documents: { list: true, read: true, update: false, create: false },
  paymentSession: { list: true, read: true, update: false, create: false },
  paymentCd: { list: true, read: true, update: false, create: false },
  payload: { list: true, read: true, update: false, create: false },
  display: { list: true, read: true, update: false, create: false },
  createdAt: { list: true, read: true, update: false, create: false },
  updatedAt: { list: true, read: true, update: false, create: false },
};

// ---------------------------------------------------------------------------
// Archive permission schema
// ---------------------------------------------------------------------------

export const ARCHIVE_PERMISSION_SCHEMA: PermissionSchema = {
  ...DEFAULT_PERMISSION_SCHEMA,
  actionCd: { list: true, read: true, update: false, create: false },
  archivedBy: { list: true, read: true, update: false, create: false },
};

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

  /** Custom auth middleware applied to all routes */
  authMiddleware?: ((req: Request, res: Response, next: NextFunction) => void)[];

  /** Extract user from request (default: req._user || req.user) */
  getUser?: (req: Request) => MessageUser | undefined;

  /** Extract permissions from request (default: req._permissions || {}) */
  getPermissions?: (req: Request) => Record<string, boolean>;

  /** Extract identity from request (default: req._identity || {}) */
  getIdentity?: (req: Request) => Record<string, unknown>;
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
    authMiddleware = [],
    getUser = defaultGetUser,
    getPermissions = defaultGetPermissions,
    getIdentity = defaultGetIdentity,
  } = options;

  const service = new MessageService({ getModel, paymentProvider, adminRoles });
  const router = new JsonRouter('', authMiddleware);

  // Create message from template
  router.post('/new/:templateCd', async (req) => {
    const templateCd = req.params.templateCd as string;
    const user = getUser(req) || { _id: '' };
    const roles = user.roles || [];
    const identity = getIdentity(req);
    const permissions = getPermissions(req);

    return service.createMessage({
      templateCd,
      user,
      roles,
      identity,
      permissions,
      payload: req.body,
      payerUser: user,
      req,
    });
  });

  // Get available actions for a message
  router.get('/:id/actions/:usertype', async (req) => {
    const id = req.params.id as string;
    const usertype = req.params.usertype as string;

    if (usertype !== 'sender' && usertype !== 'receiver') {
      throw new JsonRouter.clientErrors.BadRequestError('usertype must be "sender" or "receiver"');
    }

    const permissions = getPermissions(req);
    const isAdmin = !!permissions['is.admin'];

    const result = await service.getActions(id, usertype, { permissions, isAdmin });

    if (!result) {
      throw new JsonRouter.clientErrors.NotFoundError('message not found');
    }

    return result;
  });

  // Execute an action (GET and POST variants)
  async function handleAction(req: Request) {
    const id = req.params.id as string;
    const actionCd = req.params.actionCd as string;
    const Message = getModel(MESSAGE_MODEL_NAME);
    const MessageArchive = getModel(MESSAGE_ARCHIVE_MODEL_NAME);
    let message = await Message.findById(id) as { templateCd: string } | null;

    if (!message) {
      message = await MessageArchive.findById(id) as { templateCd: string } | null;
    }

    if (!message) {
      throw new JsonRouter.clientErrors.NotFoundError('message not found');
    }

    const user = getUser(req) || { _id: '' };
    const permissions = getPermissions(req);
    return service.handleAction(message.templateCd, actionCd, { message: message as any, user, permissions, req });
  }

  router.get('/:id/action/:actionCd', handleAction);
  router.post('/:id/action/:actionCd', handleAction);

  return { router, service };
}

// ---------------------------------------------------------------------------
// Default extractors (backwards-compatible with access-router conventions)
// ---------------------------------------------------------------------------

function defaultGetUser(req: Request): MessageUser | undefined {
  const raw = (req as any)._user || (req as any).user;
  return raw as MessageUser | undefined;
}

function defaultGetPermissions(req: Request): Record<string, boolean> {
  return (req as any)._permissions || {};
}

function defaultGetIdentity(req: Request): Record<string, unknown> {
  return (req as any)._identity || {};
}
