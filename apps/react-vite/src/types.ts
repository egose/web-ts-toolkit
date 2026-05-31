export interface Organization {
  _id?: string;
  name: string;
  slug: string;
  createdByUserId: string;
}

export interface OrganizationMember {
  _id?: string;
  organizationId: string;
  userId: string;
  email: string;
  fullName: string;
  title: string;
  department?: string;
  managerMembershipId?: string | null;
  invitedByUserId: string;
}

export interface RoleTemplate {
  key: string;
  title: string;
  summary: string;
  track: string;
  level: number;
}

export interface SessionData {
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
}

export interface WorkspaceData {
  organization: Organization;
  members: OrganizationMember[];
  roleTemplates: RoleTemplate[];
}
