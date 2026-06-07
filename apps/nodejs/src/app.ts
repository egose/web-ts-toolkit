import express, { type NextFunction, type Request, type Response } from 'express';
import { combineRoutes, createAccessRuntime } from '@web-ts-toolkit/access-router';
import { AppError } from './errors';
import { loginSchema } from './domain';
import type { AppRequest } from './models';
import { UserModel } from './models';
import { createRouters } from './routers';
import { buildSessionPayload, clearSession, createSession, findOrCreateUser, resolveSession } from './session';
import { createMessageRouteGroup } from './messages';

export function createApp() {
  const runtime = createAccessRuntime();
  runtime.setGlobalOptions({
    requestPermissionField: '_permissions',
    globalPermissions(req) {
      return req.currentUserId ? ['authenticated'] : [];
    },
  });

  const { membershipRouter, organizationRouter, roleTemplateRouter, rootRouter } = createRouters(runtime);
  const messageRouteGroup = createMessageRouteGroup();

  const app = express();
  app.use(express.json());

  app.use(async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const request = req as AppRequest;
      const session = await resolveSession(request);

      if (session) {
        request.currentUserId = String(session.user._id);
        request.currentUserEmail = session.user.email;
        request.currentOrganizationIds = session.organizationIds;
        request.sessionToken = session.token;
      } else {
        request.currentOrganizationIds = [];
      }

      next();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api', (_req, res) => {
    res.json({
      name: 'org-access-example-api',
      description: 'Multi-tenant organization and role hierarchy demo built with access-router.',
      endpoints: {
        login: 'POST /api/auth/login',
        session: 'GET /api/auth/session',
        logout: 'POST /api/auth/logout',
        organizations: '/api/organizations',
        memberships: '/api/memberships',
        roleTemplates: '/api/role-templates',
        messages: '/api/messages',
        batch: 'POST /api/root',
      },
      notes: [
        'Users log in with email only.',
        'Adding a member by email creates the user automatically if needed.',
        "Anyone who belongs to an organization can edit that organization's roles and hierarchy.",
        'Messages support team invitations, task assignments, approval requests, direct messages, and system announcements.',
        'Data is stored in mongodb-memory-server for this example.',
      ],
    });
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'A valid email is required.',
        errors: parsed.error.issues,
      });
    }

    const user = await findOrCreateUser(parsed.data.email);
    const token = createSession(String(user._id));

    return res.status(200).json({
      success: true,
      data: await buildSessionPayload(user, token),
    });
  });

  app.get('/api/auth/session', async (req: Request, res: Response) => {
    const request = req as AppRequest;
    if (!request.currentUserId) {
      return res.status(200).json({ success: true, data: null });
    }

    const user = await UserModel.findById(request.currentUserId);
    if (!user) {
      return res.status(200).json({ success: true, data: null });
    }

    return res.status(200).json({
      success: true,
      data: await buildSessionPayload(user, request.sessionToken ?? null),
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const request = req as AppRequest;
    clearSession(request.sessionToken);
    return res.status(200).json({ success: true, data: { loggedOut: true } });
  });

  app.use('/api/messages', messageRouteGroup.router);
  app.use(combineRoutes(organizationRouter, membershipRouter, roleTemplateRouter, rootRouter));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express error handler requires 4 params
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);

    if (error instanceof AppError) {
      res.status(error.statusCode).json({ success: false, message: error.message });
      return;
    }

    res.status(500).json({ success: false, message: 'Unexpected server error.' });
  });

  return app;
}
