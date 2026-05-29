import crypto from 'node:crypto';
import type { HydratedDocument } from 'mongoose';
import { demoOrganizations, demoUserSeeds } from './domain';
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
    throw new Error('Authenticated request expected currentUserId to exist');
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
