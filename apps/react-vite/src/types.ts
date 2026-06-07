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

export interface MessageContent {
  title: string;
  long: string;
  short: string;
}

export interface MessageUserRef {
  _id: string;
  email: string;
  displayName: string;
}

export interface Message {
  _id: string;
  templateCd: string;
  type: string;
  fromUser: MessageUserRef | string | null;
  toUser: MessageUserRef | string | null;
  toRoles: string[];
  senderContent: MessageContent;
  receiverContent: MessageContent;
  documents: string[];
  paymentSession: string | null;
  paymentCd: string;
  payload: Record<string, unknown>;
  display: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MessageAction {
  actionCd: string;
  isDefault?: boolean;
  name: string;
  variant: string;
  confirmation?: {
    title: string;
    message: string;
    notesLabel?: string;
    requireNotes?: boolean;
  };
  payload?: Record<string, unknown>;
}

export interface MessageActionsResponse {
  uiTemplate: string;
  actions: MessageAction[];
}
