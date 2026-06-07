import { z } from 'zod';
import type { Request } from 'express';
import mongoose from 'mongoose';
import type { MessageTemplate, MessageUser } from '@web-ts-toolkit/message-service';
import {
  createMessageRoutes,
  buildMessageSchema,
  buildMessageArchiveSchema,
  MESSAGE_MODEL_NAME,
  MESSAGE_ARCHIVE_MODEL_NAME,
  defaultRegistry,
} from '@web-ts-toolkit/message-service';
import { UserModel, type AppRequest as AppReq } from './models';

const invitePayloadSchema = z.object({
  inviteeEmail: z.string().trim().toLowerCase().email(),
  organizationName: z.string().trim().min(1).max(80),
});

const taskPayloadSchema = z.object({
  toUserEmail: z.string().trim().toLowerCase().email(),
  taskTitle: z.string().trim().min(1).max(200),
  taskDescription: z.string().trim().max(2000).optional(),
  dueDate: z.string().trim().optional(),
});

const approvalPayloadSchema = z.object({
  toUserEmail: z.string().trim().toLowerCase().email(),
  requestTitle: z.string().trim().min(1).max(200),
  requestDetails: z.string().trim().min(1).max(2000),
  amount: z.number().optional(),
});

const directMessagePayloadSchema = z.object({
  toUserEmail: z.string().trim().toLowerCase().email(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

const announcementPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  priority: z.enum(['low', 'normal', 'high']).optional(),
});

export const templatePayloadSchemas: Record<string, z.ZodTypeAny> = {
  'team-invitation': invitePayloadSchema,
  'task-assignment': taskPayloadSchema,
  'approval-request': approvalPayloadSchema,
  'direct-message': directMessagePayloadSchema,
  'system-announcement': announcementPayloadSchema,
};

export function parseTemplatePayload(templateCd: string, payload: unknown) {
  const schema = templatePayloadSchemas[templateCd];
  if (!schema) {
    return { success: false as const, error: `Unknown template: ${templateCd}` };
  }
  return schema.safeParse(payload);
}

type TemplateUser = MessageUser;
export type { TemplateUser };

function getUserFromRequest(req: Request) {
  const appReq = req as AppReq;
  if (!appReq.currentUserId) return undefined;
  return { _id: appReq.currentUserId, roles: ['authenticated'] } as MessageUser;
}

function getPermissionsFromRequest(req: Request) {
  const appReq = req as AppReq;
  if (!appReq.currentUserId) return {};
  return { authenticated: true } as Record<string, boolean>;
}

function getModel(name: string): mongoose.Model<unknown> {
  return mongoose.model(name) as mongoose.Model<unknown>;
}

function toObjectId(value: string): mongoose.Types.ObjectId | null {
  if (mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const teamInvitationTemplate: MessageTemplate = {
  templateCd: 'team-invitation',
  type: 'notification',
  description: 'Invite a user to join an organization',
  senderContent: {
    title: 'Invitation Sent',
    long: 'You invited {{inviteeEmail}} to join {{organizationName}}.',
    short: 'Invitation sent to {{inviteeEmail}}',
  },
  receiverContent: {
    title: 'Team Invitation',
    long: '{{inviterName}} invited you to join {{organizationName}}.',
    short: 'You have been invited to join {{organizationName}}',
  },
  uiTemplate: 'card',
  async prepareMessage(ctx) {
    const { payload } = ctx;
    const user = ctx.user as MessageUser;
    const inviteeEmail = String(payload.inviteeEmail || '');
    const organizationName = String(payload.organizationName || 'Workspace');

    const invitee = await UserModel.findOne({ email: inviteeEmail });
    if (!invitee) return null;

    return {
      templateData: {
        inviterName: user.displayName || user._id,
        inviteeEmail,
        organizationName,
      },
      fromUser: user._id,
      toUser: invitee._id,
    };
  },
  actions: [
    {
      actionCd: 'accept-invitation',
      name: 'Accept',
      variant: 'primary',
      sender: false,
      receiver: true,
      async runHandler(ctx) {
        return { accepted: true, organizationName: ctx.message.payload?.organizationName };
      },
      senderNotification: 'Invitation accepted',
    },
    {
      actionCd: 'decline-invitation',
      name: 'Decline',
      variant: 'danger',
      sender: false,
      receiver: true,
      confirmation: {
        title: 'Decline Invitation',
        message: 'Are you sure you want to decline this invitation?',
      },
      async runHandler() {
        return { declined: true };
      },
      senderNotification: 'Invitation declined',
    },
  ],
};

const taskAssignmentTemplate: MessageTemplate = {
  templateCd: 'task-assignment',
  type: 'notification',
  description: 'Assign a task to a team member',
  senderContent: {
    title: 'Task Assigned',
    long: 'You assigned "{{taskTitle}}" to {{assigneeName}}.',
    short: 'Task assigned to {{assigneeName}}',
  },
  receiverContent: {
    title: 'New Task Assigned',
    long: '{{assignerName}} assigned you "{{taskTitle}}".{{#if dueDate}} Due: {{dueDate}}{{/if}}',
    short: 'New task: {{taskTitle}}',
  },
  uiTemplate: 'card',
  async prepareMessage(ctx) {
    const { payload } = ctx;
    const user = ctx.user as MessageUser;
    const toUserEmail = String(payload.toUserEmail || '');
    const taskTitle = String(payload.taskTitle || 'Untitled Task');
    const taskDescription = String(payload.taskDescription || '');
    const dueDate = String(payload.dueDate || '');

    const assignee = await UserModel.findOne({ email: toUserEmail });
    if (!assignee) return null;

    return {
      templateData: {
        assignerName: user.displayName || user._id,
        assigneeName: assignee.displayName,
        taskTitle,
        taskDescription,
        dueDate,
      },
      fromUser: user._id,
      toUser: assignee._id,
      payload: { taskTitle, taskDescription, dueDate, status: 'pending' },
    };
  },
  actions: [
    {
      actionCd: 'acknowledge-task',
      name: 'Acknowledge',
      variant: 'primary',
      sender: false,
      receiver: true,
      async runHandler() {
        return { acknowledged: true };
      },
      senderNotification: 'Task acknowledged',
    },
    {
      actionCd: 'complete-task',
      name: 'Mark Complete',
      variant: 'success',
      sender: false,
      receiver: true,
      async runHandler() {
        return { completed: true };
      },
      senderNotification: 'Task completed',
    },
  ],
};

const approvalRequestTemplate: MessageTemplate = {
  templateCd: 'approval-request',
  type: 'notification',
  description: 'Request approval from a manager',
  senderContent: {
    title: 'Approval Requested',
    long: 'You requested approval for "{{requestTitle}}" from {{approverName}}.',
    short: 'Approval requested from {{approverName}}',
  },
  receiverContent: {
    title: 'Approval Request',
    long: '{{requesterName}} requests approval for "{{requestTitle}}".{{#if amount}} Amount: ${{amount}}{{/if}}\n\n{{requestDetails}}',
    short: 'Approval needed: {{requestTitle}}',
  },
  uiTemplate: 'card',
  async prepareMessage(ctx) {
    const { payload } = ctx;
    const user = ctx.user as MessageUser;
    const toUserEmail = String(payload.toUserEmail || '');
    const requestTitle = String(payload.requestTitle || 'Untitled Request');
    const requestDetails = String(payload.requestDetails || '');
    const amount = payload.amount != null ? Number(payload.amount) : undefined;

    const approver = await UserModel.findOne({ email: toUserEmail });
    if (!approver) return null;

    return {
      templateData: {
        requesterName: user.displayName || user._id,
        approverName: approver.displayName,
        requestTitle,
        requestDetails,
        amount,
      },
      fromUser: user._id,
      toUser: approver._id,
      payload: { requestTitle, requestDetails, amount, status: 'pending' },
    };
  },
  actions: [
    {
      actionCd: 'approve',
      name: 'Approve',
      variant: 'success',
      sender: false,
      receiver: true,
      async runHandler() {
        return { approved: true };
      },
      senderNotification: 'Request approved',
    },
    {
      actionCd: 'reject',
      name: 'Reject',
      variant: 'danger',
      sender: false,
      receiver: true,
      confirmation: {
        title: 'Reject Request',
        message: 'Are you sure you want to reject this request?',
        notesLabel: 'Rejection reason',
        requireNotes: true,
      },
      async runHandler() {
        return { rejected: true };
      },
      senderNotification: 'Request rejected',
    },
  ],
};

const directMessageTemplate: MessageTemplate = {
  templateCd: 'direct-message',
  type: 'notification',
  description: 'Send a direct message to someone',
  senderContent: {
    title: 'Message Sent',
    long: 'You sent "{{subject}}" to {{recipientName}}.',
    short: 'Message sent to {{recipientName}}',
  },
  receiverContent: {
    title: '{{subject}}',
    long: 'From {{senderName}}:\n\n{{body}}',
    short: '{{senderName}}: {{body}}',
  },
  uiTemplate: 'card',
  async prepareMessage(ctx) {
    const { payload } = ctx;
    const user = ctx.user as MessageUser;
    const toUserEmail = String(payload.toUserEmail || '');
    const subject = String(payload.subject || 'No subject');
    const body = String(payload.body || '');

    const recipient = await UserModel.findOne({ email: toUserEmail });
    if (!recipient) return null;

    return {
      templateData: {
        senderName: user.displayName || user._id,
        recipientName: recipient.displayName,
        subject,
        body,
      },
      fromUser: user._id,
      toUser: recipient._id,
      payload: { subject, body, read: false },
    };
  },
  actions: [
    {
      actionCd: 'mark-read',
      name: 'Mark as Read',
      variant: 'secondary',
      sender: true,
      receiver: true,
      async runHandler({ message }) {
        message.set('payload.read', true);
        await message.save();
        return { read: true };
      },
    },
  ],
};

const SYSTEM_ANNOUNCEMENT_MAX_RECIPIENTS = 100;

const systemAnnouncementTemplate: MessageTemplate = {
  templateCd: 'system-announcement',
  type: 'notification',
  description: 'Broadcast a system announcement to all users',
  senderContent: {
    title: 'Announcement Broadcast',
    long: 'Your announcement "{{title}}" has been broadcast.',
    short: 'Announcement sent',
  },
  receiverContent: {
    title: 'System Announcement: {{title}}',
    long: '{{body}}',
    short: '{{title}}',
  },
  uiTemplate: 'banner',
  async prepareMessage(ctx) {
    const { payload } = ctx;
    const user = ctx.user as MessageUser;
    const title = String(payload.title || 'Announcement');
    const body = String(payload.body || '');
    const priority = String(payload.priority || 'normal');

    const senderObjectId = toObjectId(String(user._id));
    const allUsers = await UserModel.find({}).limit(SYSTEM_ANNOUNCEMENT_MAX_RECIPIENTS);
    const otherUsers = senderObjectId ? allUsers.filter((u) => String(u._id) !== String(senderObjectId)) : allUsers;

    return otherUsers.map((targetUser) => ({
      templateData: {
        title,
        body,
        priority,
        senderName: user.displayName || user._id,
      },
      fromUser: user._id,
      toUser: targetUser._id,
      payload: { title, body, priority },
    }));
  },
  actions: [
    {
      actionCd: 'acknowledge',
      name: 'Got it',
      variant: 'primary',
      sender: false,
      receiver: true,
      async runHandler() {
        return { acknowledged: true };
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerMessageModels() {
  if (!mongoose.models[MESSAGE_MODEL_NAME]) {
    mongoose.model(MESSAGE_MODEL_NAME, buildMessageSchema({ userModelName: 'User' }));
  }

  if (!mongoose.models[MESSAGE_ARCHIVE_MODEL_NAME]) {
    mongoose.model(MESSAGE_ARCHIVE_MODEL_NAME, buildMessageArchiveSchema());
  }
}

export function registerMessageTemplates() {
  defaultRegistry.registerAll([
    teamInvitationTemplate,
    taskAssignmentTemplate,
    approvalRequestTemplate,
    directMessageTemplate,
    systemAnnouncementTemplate,
  ]);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const MESSAGE_LIST_DEFAULT_LIMIT = 50;
const MESSAGE_LIST_MAX_LIMIT = 100;

export function createMessageRouteGroup() {
  const { router, service } = createMessageRoutes({
    getModel,
    getUser: getUserFromRequest,
    getPermissions: getPermissionsFromRequest,
  });

  router.get('/', async (req: Request) => {
    const appReq = req as AppReq;
    if (!appReq.currentUserId) return { success: true, data: [] };

    const rawLimit = Number(req.query.limit ?? MESSAGE_LIST_DEFAULT_LIMIT);
    const limit = Math.min(
      Math.max(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : MESSAGE_LIST_DEFAULT_LIMIT, 1),
      MESSAGE_LIST_MAX_LIMIT,
    );
    const rawSkip = Number(req.query.skip ?? 0);
    const skip = Number.isFinite(rawSkip) && rawSkip >= 0 ? rawSkip : 0;

    const messages = await service.listMessages({
      user: { _id: appReq.currentUserId, roles: ['authenticated'] },
      limit,
      skip,
      populate: [
        { path: 'fromUser', select: 'email displayName' },
        { path: 'toUser', select: 'email displayName' },
      ],
    });

    return { success: true, data: messages };
  });

  return { router: router.original };
}
