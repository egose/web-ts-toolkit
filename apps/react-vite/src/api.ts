import { createAdapter } from '@web-ts-toolkit/access-router-client';
import type { Organization, OrganizationMember, RoleTemplate, SessionData, WorkspaceData } from './types';
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

  return {
    organization: organizationResponse.raw,
    members: membershipResponse.raw,
    roleTemplates: roleTemplateResponse.raw,
  };
}
