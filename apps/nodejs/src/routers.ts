import mongoose, { type HydratedDocument } from 'mongoose';
import { createAccessRuntime, type ModelRouterOptions } from '@web-ts-toolkit/access-router';
import { AppError } from './errors';
import {
  membershipCreateSchema,
  membershipUpdateSchema,
  organizationCreateSchema,
  organizationUpdateSchema,
  roleTemplates,
} from './domain';
import {
  type AppRequest,
  type MembershipRecord,
  MembershipModel,
  type OrganizationRecord,
  OrganizationModel,
  UserModel,
} from './models';
import { findOrCreateUser, requireCurrentUserId } from './session';
import { normalizeEmail, normalizeOptionalId, normalizeOptionalString, slugify } from './utils';
import type {
  MembershipCreateInput,
  MembershipUpdateInput,
  OrganizationCreateInput,
  OrganizationUpdateInput,
} from './domain';

const organizationRequestSchemas = {
  create: organizationCreateSchema,
  update: organizationUpdateSchema,
} as unknown as NonNullable<ModelRouterOptions<OrganizationRecord>['requestSchemas']>;

const membershipRequestSchemas = {
  create: membershipCreateSchema,
  update: membershipUpdateSchema,
} as unknown as NonNullable<ModelRouterOptions<MembershipRecord>['requestSchemas']>;

function organizationAccessFilter(request: AppRequest) {
  const ids = request.currentOrganizationIds ?? [];
  return ids.length > 0 ? { _id: { $in: ids } } : { _id: null };
}

function membershipAccessFilter(request: AppRequest) {
  const ids = request.currentOrganizationIds ?? [];
  return ids.length > 0 ? { organizationId: { $in: ids } } : { _id: null };
}

async function validateManager(organizationId: string, managerMembershipId: string | null, memberId?: string) {
  if (!managerMembershipId) return [];
  if (!mongoose.Types.ObjectId.isValid(managerMembershipId)) {
    return ['Manager must be a valid organization member.'];
  }

  if (memberId && managerMembershipId === memberId) {
    return ['A person cannot report to themselves.'];
  }

  const manager = await MembershipModel.findById(managerMembershipId);
  if (!manager || String(manager.organizationId) !== organizationId) {
    return ['Manager must belong to the same organization.'];
  }

  return [];
}

async function reassignManagedMemberships(membership: HydratedDocument<MembershipRecord>) {
  await MembershipModel.updateMany(
    {
      managerMembershipId: membership._id,
      organizationId: membership.organizationId,
    },
    {
      $set: {
        managerMembershipId: membership.managerMembershipId ?? null,
      },
    },
  );
}

function createOrganizationRouter(runtime: ReturnType<typeof createAccessRuntime>) {
  return runtime.createRouter(OrganizationModel, {
    basePath: '/api/organizations',
    operationAccess: {
      new: 'authenticated',
      list: 'authenticated',
      read: 'authenticated',
      create: 'authenticated',
      update: 'authenticated',
      delete: 'authenticated',
    },
    permissionSchema: {
      name: { list: true, read: true, create: true, update: true },
      slug: { list: true, read: true },
      createdByUserId: { list: true, read: true },
    },
    baseFilter: {
      list(this: AppRequest) {
        return organizationAccessFilter(this);
      },
      read(this: AppRequest) {
        return organizationAccessFilter(this);
      },
      update(this: AppRequest) {
        return organizationAccessFilter(this);
      },
      delete(this: AppRequest) {
        return organizationAccessFilter(this);
      },
    },
    requestSchemas: organizationRequestSchemas,
    prepare: {
      create(this: AppRequest, data: OrganizationCreateInput) {
        return {
          ...data,
          name: String(data.name).trim(),
          slug: slugify(String(data.name)),
          createdByUserId: requireCurrentUserId(this),
        };
      },
      update(data: OrganizationUpdateInput) {
        if (typeof data.name !== 'string') return data;

        const name = data.name.trim();
        return {
          ...data,
          name,
          slug: slugify(name),
        };
      },
    },
    afterPersist: {
      async create(this: AppRequest, organization: HydratedDocument<OrganizationRecord>) {
        const userId = requireCurrentUserId(this);
        const user = await UserModel.findById(userId);
        if (!user) return organization;

        const existingMembership = await MembershipModel.findOne({
          organizationId: organization._id,
          userId: user._id,
        });

        if (!existingMembership) {
          await MembershipModel.create({
            organizationId: organization._id,
            userId: user._id,
            email: user.email,
            fullName: user.displayName,
            title: 'Organization Lead',
            department: 'Leadership',
            invitedByUserId: user._id,
          });
        }

        return organization;
      },
    },
  } as unknown as ModelRouterOptions<OrganizationRecord>);
}

function createMembershipRouter(runtime: ReturnType<typeof createAccessRuntime>) {
  return runtime.createRouter(MembershipModel, {
    basePath: '/api/memberships',
    operationAccess: {
      new: 'authenticated',
      list: 'authenticated',
      read: 'authenticated',
      create: 'authenticated',
      update: 'authenticated',
      delete: 'authenticated',
    },
    permissionSchema: {
      organizationId: { list: true, read: true, create: true },
      userId: { list: true, read: true },
      email: { list: true, read: true, create: true },
      fullName: { list: true, read: true, create: true, update: true },
      title: { list: true, read: true, create: true, update: true },
      department: { list: true, read: true, create: true, update: true },
      managerMembershipId: { list: true, read: true, create: true, update: true },
      invitedByUserId: { list: true, read: true },
    },
    baseFilter: {
      list(this: AppRequest) {
        return membershipAccessFilter(this);
      },
      read(this: AppRequest) {
        return membershipAccessFilter(this);
      },
      update(this: AppRequest) {
        return membershipAccessFilter(this);
      },
      delete(this: AppRequest) {
        return membershipAccessFilter(this);
      },
    },
    requestSchemas: membershipRequestSchemas,
    validate: {
      async create(this: AppRequest, data: MembershipCreateInput) {
        const organizationId = String(data.organizationId ?? '');
        if (!(this.currentOrganizationIds ?? []).includes(organizationId)) {
          return ['You can only add people to organizations you already belong to.'];
        }

        const email = normalizeEmail(String(data.email ?? ''));
        const existingUser = await UserModel.findOne({ email });
        if (existingUser) {
          const existingMembership = await MembershipModel.findOne({
            organizationId,
            userId: existingUser._id,
          });

          if (existingMembership) {
            return ['That person already belongs to this organization.'];
          }
        }

        return validateManager(organizationId, normalizeOptionalId(data.managerMembershipId));
      },
      async update(
        this: AppRequest,
        data: MembershipUpdateInput,
        _permissions: unknown,
        context: { currentDocument?: unknown },
      ) {
        const currentDocument = context.currentDocument as HydratedDocument<MembershipRecord> | undefined;
        if (!currentDocument) {
          return ['Membership update requires a current document.'];
        }

        return validateManager(
          String(currentDocument.organizationId),
          normalizeOptionalId(data.managerMembershipId),
          String(currentDocument._id),
        );
      },
    },
    prepare: {
      async create(this: AppRequest, data: MembershipCreateInput) {
        const user = await findOrCreateUser(String(data.email));

        return {
          organizationId: String(data.organizationId),
          userId: user._id,
          email: user.email,
          fullName: normalizeOptionalString(data.fullName) || user.displayName,
          title: normalizeOptionalString(data.title),
          department: normalizeOptionalString(data.department),
          managerMembershipId: normalizeOptionalId(data.managerMembershipId),
          invitedByUserId: requireCurrentUserId(this),
        };
      },
      update(this: AppRequest, data: MembershipUpdateInput) {
        return {
          ...data,
          fullName: data.fullName === undefined ? undefined : normalizeOptionalString(data.fullName),
          title: data.title === undefined ? undefined : normalizeOptionalString(data.title),
          department: data.department === undefined ? undefined : normalizeOptionalString(data.department),
          managerMembershipId: normalizeOptionalId(data.managerMembershipId),
        };
      },
    },
    beforeDelete: async function (_membership: unknown, _permissions: unknown, context: { currentDocument?: unknown }) {
      const membership = context.currentDocument as HydratedDocument<MembershipRecord> | undefined;
      if (!membership) {
        throw new AppError('Membership delete requires a current document.');
      }

      const memberCount = await MembershipModel.countDocuments({ organizationId: membership.organizationId });
      if (memberCount <= 1) {
        throw new AppError('You cannot remove the last member from an organization.');
      }

      await reassignManagedMemberships(membership);
    },
  } as unknown as ModelRouterOptions<MembershipRecord>);
}

function createRoleTemplateRouter(runtime: ReturnType<typeof createAccessRuntime>) {
  return runtime.createDataRouter('role-template', {
    basePath: '/api/role-templates',
    idField: 'key',
    operationAccess: {
      list: 'authenticated',
      read: 'authenticated',
    },
    data: roleTemplates,
    permissionSchema: {
      key: true,
      title: true,
      summary: true,
      track: true,
      level: true,
    },
  });
}

export function createRouters(runtime: ReturnType<typeof createAccessRuntime>) {
  return {
    membershipRouter: createMembershipRouter(runtime),
    organizationRouter: createOrganizationRouter(runtime),
    roleTemplateRouter: createRoleTemplateRouter(runtime),
    rootRouter: runtime.createRouter({
      basePath: '/api/root',
      operationAccess: 'authenticated',
    }),
  };
}
