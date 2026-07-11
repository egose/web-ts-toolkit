import crypto from 'node:crypto';
import type { HydratedDocument } from 'mongoose';
import mongoose from 'mongoose';
import { defaultRegistry, MessageService, MESSAGE_MODEL_NAME, type MessageUser } from '@web-ts-toolkit/message-service';
import { demoOrganizations, demoUserSeeds } from './domain';
import { AppError } from './errors';
import {
  MembershipModel,
  type AppRequest,
  type MembershipRecord,
  OrganizationModel,
  type OrganizationRecord,
  type SessionPayload,
  UserModel,
  type UserRecord,
} from './models';
import { displayNameFromEmail, normalizeEmail, slugify } from './utils';

const sessionStore = new Map<string, string>();

export async function findOrCreateUser(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const existing = await UserModel.findOne({ email: normalizedEmail });
  if (existing) return existing;

  return UserModel.create({
    email: normalizedEmail,
    displayName: displayNameFromEmail(normalizedEmail),
  });
}

export async function seedDemoData() {
  const existingOrganizations = await OrganizationModel.countDocuments();
  if (existingOrganizations > 0) return;

  const userMap = new Map<string, HydratedDocument<UserRecord>>();

  for (let index = 0; index < demoUserSeeds.length; index += 1) {
    const seed = demoUserSeeds[index];
    const user = await findOrCreateUser(seed.email);

    if (user.displayName !== seed.displayName) {
      user.displayName = seed.displayName;
      await user.save();
    }

    userMap.set(seed.email, user);
  }

  for (let index = 0; index < demoOrganizations.length; index += 1) {
    const organizationSeed = demoOrganizations[index];
    const createdByUser = userMap.get(organizationSeed.createdByEmail);
    if (!createdByUser) continue;

    const organization = await OrganizationModel.create({
      createdByUserId: createdByUser._id,
      name: organizationSeed.name,
      slug: slugify(organizationSeed.name),
    });

    const membershipMap = new Map<string, HydratedDocument<MembershipRecord>>();

    for (let memberIndex = 0; memberIndex < organizationSeed.members.length; memberIndex += 1) {
      const memberSeed = organizationSeed.members[memberIndex];
      if (memberSeed.reportsTo) continue;

      const user = userMap.get(memberSeed.email);
      if (!user) continue;

      const membership = await MembershipModel.create({
        department: memberSeed.department,
        email: user.email,
        fullName: memberSeed.fullName,
        invitedByUserId: createdByUser._id,
        managerMembershipId: null,
        organizationId: organization._id,
        title: memberSeed.title,
        userId: user._id,
      });

      membershipMap.set(memberSeed.email, membership);
    }

    for (let memberIndex = 0; memberIndex < organizationSeed.members.length; memberIndex += 1) {
      const memberSeed = organizationSeed.members[memberIndex];
      if (!memberSeed.reportsTo) continue;

      const user = userMap.get(memberSeed.email);
      const managerMembership = membershipMap.get(memberSeed.reportsTo);
      if (!user || !managerMembership) continue;

      const membership = await MembershipModel.create({
        department: memberSeed.department,
        email: user.email,
        fullName: memberSeed.fullName,
        invitedByUserId: createdByUser._id,
        managerMembershipId: managerMembership._id,
        organizationId: organization._id,
        title: memberSeed.title,
        userId: user._id,
      });

      membershipMap.set(memberSeed.email, membership);
    }
  }
}

export async function resolveSession(request: AppRequest) {
  const headerToken = request.header('x-session-token') ?? request.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (!headerToken) return null;

  const userId = sessionStore.get(headerToken);
  if (!userId) return null;

  const user = await UserModel.findById(userId);
  if (!user) {
    sessionStore.delete(headerToken);
    return null;
  }

  const memberships = await MembershipModel.find({ userId: user._id }).select('organizationId');
  return {
    token: headerToken,
    user,
    organizationIds: memberships.map((membership) => String(membership.organizationId)),
  };
}

export async function buildSessionPayload(
  user: HydratedDocument<UserRecord>,
  token: string | null,
): Promise<SessionPayload> {
  const memberships = await MembershipModel.find({ userId: user._id })
    .populate('organizationId', 'name slug')
    .sort({ createdAt: 1 });

  return {
    token,
    user: {
      id: String(user._id),
      email: user.email,
      displayName: user.displayName,
    },
    organizations: memberships.flatMap((membership) => {
      const organization = membership.organizationId as unknown as HydratedDocument<OrganizationRecord> | null;
      if (!organization) return [];

      return [
        {
          membershipId: String(membership._id),
          organizationId: String(organization._id),
          name: organization.name,
          slug: organization.slug,
          title: membership.title,
        },
      ];
    }),
  };
}

export function requireCurrentUserId(request: AppRequest) {
  if (!request.currentUserId) {
    throw new AppError('Authentication required.', 401);
  }

  return request.currentUserId;
}

export function createSession(userId: string) {
  const token = crypto.randomUUID();
  sessionStore.set(token, userId);
  return token;
}

export function clearSession(token?: string | null) {
  if (token) {
    sessionStore.delete(token);
  }
}

// ---------------------------------------------------------------------------
// Seed Messages
// ---------------------------------------------------------------------------

export async function seedDemoMessages() {
  const Message = mongoose.model(MESSAGE_MODEL_NAME);
  const existingMessages = await Message.countDocuments();
  if (existingMessages > 0) return;

  const alice = await UserModel.findOne({ email: 'alice@example.com' });
  const bob = await UserModel.findOne({ email: 'bob@example.com' });
  const carol = await UserModel.findOne({ email: 'carol@example.com' });
  const dave = await UserModel.findOne({ email: 'dave@example.com' });
  const eve = await UserModel.findOne({ email: 'eve@example.com' });

  if (!alice || !bob || !carol || !dave || !eve) return;

  const buildUser = (u: HydratedDocument<UserRecord>): MessageUser => ({
    _id: u._id,
    displayName: u.displayName,
    roles: ['authenticated'],
  });

  type MessageServiceModel = import('mongoose').Model<unknown>;
  const getModel = (name: string) => mongoose.model(name) as unknown as MessageServiceModel;
  const service = new MessageService({ getModel, registry: defaultRegistry });

  await service.createMessage({
    templateCd: 'team-invitation',
    user: buildUser(alice),
    payload: { inviteeEmail: bob.email, organizationName: 'Northwind Labs' },
  });

  await service.createMessage({
    templateCd: 'task-assignment',
    user: buildUser(carol),
    payload: {
      toUserEmail: dave.email,
      taskTitle: 'Review Q3 report',
      taskDescription: 'Please review the Q3 financial report and provide feedback.',
      dueDate: '2026-06-30',
    },
  });

  await service.createMessage({
    templateCd: 'approval-request',
    user: buildUser(dave),
    payload: {
      toUserEmail: eve.email,
      requestTitle: 'Budget increase for Q4',
      requestDetails: 'Requesting 15% budget increase for Q4 marketing campaigns.',
      amount: 50000,
    },
  });

  await service.createMessage({
    templateCd: 'direct-message',
    user: buildUser(bob),
    payload: {
      toUserEmail: carol.email,
      subject: 'Sprint planning sync',
      body: 'Hey Carol, can we sync on the sprint planning tomorrow? I have a few items to discuss.',
    },
  });

  await service.createMessage({
    templateCd: 'system-announcement',
    user: buildUser(alice),
    payload: {
      title: 'Office closed Friday',
      body: 'The office will be closed this Friday for building maintenance. Please work remotely.',
      priority: 'high',
    },
  });
}
