import { createAdapter } from '@web-ts-toolkit/access-router-client';
import { z } from 'zod';
import type {
  Organization,
  OrganizationMember,
  RoleTemplate,
  SessionData,
  WorkspaceData,
  Message,
  MessageActionsResponse,
} from './types';
import { getStoredSessionToken } from './storage';

const adapter = createAdapter({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
});

adapter.axios.interceptors.request.use((config) => {
  const token = getStoredSessionToken();
  if (!token) {
    return config;
  }

  config.headers = config.headers ?? {};
  config.headers['x-session-token'] = token;
  return config;
});

const loginRequest = adapter.wrapPost<{ success: boolean; data: SessionData }>('/auth/login');
const sessionRequest = adapter.wrapGet<{ success: boolean; data: SessionData | null }>('/auth/session');
const logoutRequest = adapter.wrapPost<{ success: boolean; data: { loggedOut: true } }>('/auth/logout');

export const organizationService = adapter.createModelService<Organization>({
  modelName: 'Organization',
  basePath: 'organizations',
});

export const membershipService = adapter.createModelService<OrganizationMember>({
  modelName: 'Membership',
  basePath: 'memberships',
});

export const roleTemplateService = adapter.createDataService<RoleTemplate>({
  dataName: 'role-template',
  basePath: 'role-templates',
});

export async function loginWithEmail(email: string) {
  const response = await loginRequest({ email });
  return response.data.data;
}

export async function getSession() {
  try {
    const response = await sessionRequest();
    return response.data.data;
  } catch {
    return null;
  }
}

export async function logout() {
  await logoutRequest();
}

// Advanced client results are conservatively partial, and HTTP bodies are not
// runtime-validated by the generic service. The workspace needs complete persisted
// members (including IDs); reject the whole response rather than inventing defaults.
const workspaceMembersSchema = z.array(
  z.object({
    _id: z.string().min(1),
    organizationId: z.string().min(1),
    userId: z.string().min(1),
    email: z.string().min(1),
    fullName: z.string().min(1),
    title: z.string().min(1),
    department: z.string().optional(),
    managerMembershipId: z.string().min(1).nullable().optional(),
    invitedByUserId: z.string().min(1),
  }),
);

export async function loadWorkspace(organizationId: string): Promise<WorkspaceData> {
  const [organizationResponse, membershipResponse, roleTemplateResponse] = await adapter.group(
    organizationService.read(organizationId),
    membershipService.listAdvanced({ organizationId }, { sort: { title: 1, fullName: 1 } }),
    roleTemplateService.list(),
  );

  if (!organizationResponse.success) {
    throw new Error(organizationResponse.message || 'Unable to load organization.');
  }

  if (!membershipResponse.success) {
    throw new Error(membershipResponse.message || 'Unable to load organization members.');
  }

  if (!roleTemplateResponse.success) {
    throw new Error(roleTemplateResponse.message || 'Unable to load role templates.');
  }

  const members = workspaceMembersSchema.safeParse(membershipResponse.raw);
  if (!members.success) {
    throw new Error('Organization members response is incomplete or invalid.');
  }

  return {
    organization: organizationResponse.raw,
    members: members.data,
    roleTemplates: roleTemplateResponse.raw,
  };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface ListMessagesOptions {
  limit?: number;
  skip?: number;
}

export async function listMessages(options: ListMessagesOptions = {}): Promise<Message[]> {
  const params: Record<string, number> = {};
  if (options.limit != null) params.limit = options.limit;
  if (options.skip != null) params.skip = options.skip;
  const response = await adapter.axios.get<{ success: boolean; data: Message[] }>('/messages', { params });
  return response.data.data;
}

export async function getMessageActions(
  messageId: string,
  usertype: 'sender' | 'receiver',
): Promise<MessageActionsResponse> {
  const response = await adapter.axios.get<MessageActionsResponse>(`/messages/${messageId}/actions/${usertype}`);
  return response.data;
}

export async function createMessageFromTemplate(
  templateCd: string,
  payload: Record<string, unknown>,
): Promise<Message[]> {
  const response = await adapter.axios.post<Message[]>(`/messages/new/${templateCd}`, payload);
  return response.data;
}

/**
 * Returns the bare handler result (which need not be an object). A committed
 * action with pending sender notification resolves with HTTP 202's public
 * { message, actionAttemptId } body; it is not a failed/retryable action.
 */
export async function executeMessageAction(
  messageId: string,
  actionCd: string,
  body: Record<string, unknown> = {},
): Promise<unknown> {
  const response = await adapter.axios.post<unknown>(`/messages/${messageId}/action/${actionCd}`, body);
  return response.data;
}
