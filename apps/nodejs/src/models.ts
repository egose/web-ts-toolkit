import type { Request } from 'express';
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { MEMBERSHIP_MODEL_NAME, ORGANIZATION_MODEL_NAME, USER_MODEL_NAME } from './domain';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    displayName: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    createdByUserId: { type: Schema.Types.ObjectId, ref: USER_MODEL_NAME, required: true },
  },
  { timestamps: true },
);

const membershipSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: ORGANIZATION_MODEL_NAME, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: USER_MODEL_NAME, required: true, index: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    fullName: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    department: { type: String, default: '', trim: true },
    managerMembershipId: { type: Schema.Types.ObjectId, ref: MEMBERSHIP_MODEL_NAME, default: null },
    invitedByUserId: { type: Schema.Types.ObjectId, ref: USER_MODEL_NAME, required: true },
  },
  { timestamps: true },
);

membershipSchema.index({ organizationId: 1, userId: 1 }, { unique: true });

export type UserRecord = InferSchemaType<typeof userSchema>;
export type OrganizationRecord = InferSchemaType<typeof organizationSchema>;
export type MembershipRecord = InferSchemaType<typeof membershipSchema>;

export type AppRequest = Request & {
  currentOrganizationIds?: string[];
  currentUserEmail?: string;
  currentUserId?: string;
  sessionToken?: string;
};

export type SessionPayload = {
  token: string | null;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  organizations: Array<{
    membershipId: string;
    organizationId: string;
    name: string;
    slug: string;
    title: string;
  }>;
};

export const UserModel =
  (mongoose.models[USER_MODEL_NAME] as Model<UserRecord>) || mongoose.model<UserRecord>(USER_MODEL_NAME, userSchema);

export const OrganizationModel =
  (mongoose.models[ORGANIZATION_MODEL_NAME] as Model<OrganizationRecord>) ||
  mongoose.model<OrganizationRecord>(ORGANIZATION_MODEL_NAME, organizationSchema);

export const MembershipModel =
  (mongoose.models[MEMBERSHIP_MODEL_NAME] as Model<MembershipRecord>) ||
  mongoose.model<MembershipRecord>(MEMBERSHIP_MODEL_NAME, membershipSchema);
