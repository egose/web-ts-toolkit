/// <reference types="node" />

import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredSessionToken, setStoredSessionToken } from '@/storage';
import type { Organization, OrganizationMember, RoleTemplate, SessionData } from '@/types';

const organizationId = '111111111111111111111111';
const memberId = '222222222222222222222222';
const managerId = '333333333333333333333333';
const organization: Organization = {
  _id: organizationId,
  name: 'Contract Labs',
  slug: 'contract-labs',
  createdByUserId: '444444444444444444444444',
};
const member: OrganizationMember = {
  _id: memberId,
  organizationId,
  userId: '555555555555555555555555',
  email: 'member@example.test',
  fullName: 'Morgan Member',
  title: 'Engineer',
  department: 'Engineering',
  managerMembershipId: managerId,
  invitedByUserId: organization.createdByUserId,
};
const manager: OrganizationMember = {
  ...member,
  _id: managerId,
  userId: organization.createdByUserId,
  email: 'lead@example.test',
  fullName: 'Lee Lead',
  title: 'Organization Lead',
  managerMembershipId: null,
};
const roleTemplates: RoleTemplate[] = [
  { key: 'engineer', title: 'Engineer', summary: 'Build the product.', track: 'Engineering', level: 3 },
];
const session: SessionData = {
  token: 'workspace-contract-token',
  user: { id: manager.userId, email: manager.email, displayName: manager.fullName },
  organizations: [
    { membershipId: managerId, organizationId, name: organization.name, slug: organization.slug, title: manager.title },
  ],
};

interface CapturedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

// Real installed client/hooks and Axios transport, using the host's root batch
// envelope and bare CRUD response bodies. No API, service, or hook mocks.
const responses = new Map<string, Array<{ status: number; body: unknown }>>();
const requests: CapturedRequest[] = [];
const unexpectedRequests: string[] = [];
const queryClients: QueryClient[] = [];
let server: Server;
let api: typeof import('../src/api');
let WorkspacePage: typeof import('../src/pages/workspace-page').WorkspacePage;

function respond(method: string, path: string, body: unknown, status = 200) {
  const key = `${method} /api${path}`;
  const queue = responses.get(key) ?? [];
  queue.push({ status, body });
  responses.set(key, queue);
}

function respondWorkspace(members: unknown = [member, manager], nextOrganization = organization) {
  respond('POST', '/root', [
    { statusCode: 200, message: '', result: { success: true, kind: 'single', data: nextOrganization } },
    { statusCode: 200, message: '', result: { success: true, kind: 'list', data: members } },
    { statusCode: 200, message: '', result: { success: true, kind: 'list', data: roleTemplates } },
  ]);
}

function Location() {
  return <output aria-label="Location">{useLocation().pathname}</output>;
}

function WorkspaceRoute({
  initialSession,
  onRefreshSession,
}: {
  initialSession: SessionData;
  onRefreshSession(): Promise<void>;
}) {
  const [activeSession, setActiveSession] = useState(initialSession);
  return (
    <WorkspacePage
      session={activeSession}
      onSignedOut={vi.fn()}
      onRefreshSession={async () => {
        await onRefreshSession();
        setActiveSession(session);
      }}
    />
  );
}

function renderWorkspace(currentSession = session) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  queryClients.push(client);
  const onRefreshSession = vi.fn<() => Promise<void>>().mockResolvedValue();
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[currentSession.organizations.length ? `/organizations/${organizationId}` : '/organizations']}
      >
        <Location />
        <Routes>
          <Route
            path="/organizations/:organizationId?"
            element={<WorkspaceRoute initialSession={currentSession} onRefreshSession={onRefreshSession} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, onRefreshSession };
}

function memberCard() {
  return within(screen.getByRole('heading', { name: member.fullName, level: 3 }).closest('header')!.parentElement!);
}

beforeAll(async () => {
  // Use jsdom browser storage rather than Node 26's file-backed global.
  const { jsdom } = globalThis as unknown as { jsdom: { window: Window } };
  vi.stubGlobal('localStorage', jsdom.window.localStorage);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  server = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', request.headers.origin ?? '*');
    response.setHeader('access-control-allow-credentials', 'true');
    if (request.method === 'OPTIONS') {
      response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      response.setHeader('access-control-allow-headers', request.headers['access-control-request-headers'] ?? '');
      response.writeHead(204).end();
      return;
    }
    let text = '';
    request.setEncoding('utf8');
    for await (const chunk of request) text += chunk;
    const method = request.method!;
    const path = request.url!;
    requests.push({ method, path, headers: request.headers, body: text ? JSON.parse(text) : undefined });
    const key = `${method} ${new URL(path, 'http://localhost').pathname}`;
    const next = responses.get(key)?.shift();
    if (!next) unexpectedRequests.push(key);
    response.setHeader('content-type', 'application/json');
    response.writeHead(next?.status ?? 500).end(JSON.stringify(next ? next.body : { message: 'Unexpected request' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  vi.stubEnv('VITE_API_BASE_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);
  api = await import('../src/api');
  ({ WorkspacePage } = await import('../src/pages/workspace-page'));
});

beforeEach(() => {
  responses.clear();
  requests.length = 0;
  unexpectedRequests.length = 0;
  setStoredSessionToken(session.token!);
});

afterEach(() => {
  cleanup();
  queryClients.splice(0).forEach((client) => client.clear());
  clearStoredSessionToken();
  expect(unexpectedRequests).toEqual([]);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe('workspace response boundary', () => {
  it('loads the host batch with complete records, optional fields, and the session header', async () => {
    const { department: _department, managerMembershipId: _manager, ...withoutOptionals } = member;
    respondWorkspace([withoutOptionals, manager]);

    expect(await api.loadWorkspace(organizationId)).toEqual({
      organization,
      members: [withoutOptionals, manager],
      roleTemplates,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: 'POST',
      path: '/api/root',
      headers: { 'x-session-token': session.token },
      body: [
        { target: 'model', name: 'Organization', op: 'read', id: organizationId },
        {
          target: 'model',
          name: 'Membership',
          op: 'list',
          filter: { organizationId },
          args: { sort: { title: 1, fullName: 1 } },
        },
        { target: 'data', name: 'role-template', op: 'list' },
      ],
    });
  });

  it('accepts an empty membership list', async () => {
    respondWorkspace([]);
    expect((await api.loadWorkspace(organizationId)).members).toEqual([]);
  });

  it.each(['_id', 'organizationId', 'userId', 'email', 'fullName', 'title', 'invitedByUserId'] as const)(
    'rejects an otherwise successful partial record missing %s',
    async (field) => {
      const { [field]: _omitted, ...partial } = member;
      respondWorkspace([manager, partial]);
      await expect(api.loadWorkspace(organizationId)).rejects.toThrow(
        'Organization members response is incomplete or invalid.',
      );
    },
  );

  it.each([
    { label: 'non-string name', members: [{ ...member, fullName: 42 }] },
    { label: 'non-string department', members: [{ ...member, department: false }] },
    { label: 'non-string manager', members: [{ ...member, managerMembershipId: { _id: managerId } }] },
    { label: 'empty persisted ID', members: [{ ...member, _id: '' }] },
    { label: 'null collection', members: null },
    { label: 'object collection', members: { member } },
  ])('rejects a $label without returning a partial workspace', async ({ members }) => {
    respondWorkspace(members);
    await expect(api.loadWorkspace(organizationId)).rejects.toThrow(
      'Organization members response is incomplete or invalid.',
    );
  });

  it('rejects a null row even when the client rejects it before application validation', async () => {
    respondWorkspace([null]);
    await expect(api.loadWorkspace(organizationId)).rejects.toThrow();
  });
});

describe('WorkspacePage through current mutation hooks and HTTP', () => {
  it('shows a failed create without refreshing the session, navigating, or clearing the draft', async () => {
    respond('POST', '/organizations', { message: 'Organization creation denied' }, 403);
    const { onRefreshSession } = renderWorkspace({ ...session, organizations: [] });
    fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: organization.name } });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    expect(await screen.findByText('Organization creation denied')).toBeInTheDocument();
    expect(onRefreshSession).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Location')).toHaveTextContent(/^\/organizations$/);
    expect(screen.getByLabelText('Organization name')).toHaveValue(organization.name);
    expect(requests).toHaveLength(1);
  });

  it('creates an organization and navigates using the returned ID after refreshing the session', async () => {
    respond('POST', '/organizations', organization);
    respondWorkspace();
    const { onRefreshSession } = renderWorkspace({ ...session, organizations: [] });
    fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: organization.name } });
    fireEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => expect(onRefreshSession).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByLabelText('Location')).toHaveTextContent(`/organizations/${organizationId}`),
    );
    await screen.findByRole('heading', { name: member.fullName, level: 3 });
    expect(requests.find((request) => request.path.startsWith('/api/organizations'))).toMatchObject({
      method: 'POST',
      body: { name: organization.name },
    });
    expect(screen.getByLabelText('Organization name', { selector: '#organization-name' })).toHaveValue('');
  });

  it('renames an organization and refetches the workspace', async () => {
    respondWorkspace();
    respond('PATCH', `/organizations/${organizationId}`, {
      ...organization,
      name: 'Renamed Labs',
      slug: 'renamed-labs',
    });
    respondWorkspace([member, manager], { ...organization, name: 'Renamed Labs', slug: 'renamed-labs' });
    const { onRefreshSession } = renderWorkspace();
    await screen.findByRole('button', { name: 'Save organization' });
    const input = screen.getByLabelText('Organization name', { selector: '#rename-organization' });
    expect(requests).toHaveLength(1);
    await waitFor(() => expect(input).toHaveValue(organization.name));
    fireEvent.change(input, { target: { value: 'Renamed Labs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save organization' }));

    expect(await within(input.closest('form')!).findByText('/renamed-labs')).toBeInTheDocument();
    expect(onRefreshSession).toHaveBeenCalledTimes(1);
    expect(requests.find((request) => request.method === 'PATCH')).toMatchObject({ body: { name: 'Renamed Labs' } });
  });

  it('invites a member with the current create hook and clears the form after refetch', async () => {
    const invited = { ...member, _id: '666666666666666666666666', email: 'new@example.test', fullName: 'New Person' };
    respondWorkspace();
    respond('POST', '/memberships', invited);
    respondWorkspace([member, manager, invited]);
    renderWorkspace();
    await screen.findByRole('heading', { name: member.fullName, level: 3 });
    const form = within(screen.getByRole('button', { name: 'Add person' }).closest('form')!);
    fireEvent.change(form.getByLabelText('Full name'), { target: { value: invited.fullName } });
    fireEvent.change(form.getByLabelText('Email'), { target: { value: invited.email } });
    fireEvent.change(form.getByLabelText('Role title'), { target: { value: invited.title } });
    fireEvent.change(form.getByLabelText('Department'), { target: { value: invited.department } });
    fireEvent.change(form.getByLabelText('Reports to'), { target: { value: managerId } });
    fireEvent.click(form.getByRole('button', { name: 'Add person' }));

    expect(await screen.findByRole('heading', { name: invited.fullName, level: 3 })).toBeInTheDocument();
    expect(form.getByLabelText('Email')).toHaveValue('');
    expect(requests.find((request) => request.path.startsWith('/api/memberships'))).toMatchObject({
      method: 'POST',
      body: {
        organizationId,
        email: invited.email,
        fullName: invited.fullName,
        title: invited.title,
        department: invited.department,
        managerMembershipId: managerId,
      },
    });
  });

  it.each([200, 403])(
    'saves a plain member using PATCH and handles HTTP %i without optimistic cache edits',
    async (status) => {
      const updated = {
        ...member,
        fullName: 'Morgan Updated',
        title: 'Team Manager',
        department: '',
        managerMembershipId: null,
      };
      respondWorkspace();
      respond(
        'PATCH',
        `/memberships/${memberId}`,
        status === 200 ? updated : { message: 'Member update denied' },
        status,
      );
      if (status === 200) respondWorkspace([updated, manager]);
      const { client } = renderWorkspace();
      await screen.findByRole('heading', { name: member.fullName, level: 3 });
      const cached = client.getQueryData(['workspace', organizationId]);
      const card = memberCard();
      fireEvent.change(card.getByLabelText('Full name'), { target: { value: updated.fullName } });
      fireEvent.change(card.getByLabelText('Role title'), { target: { value: updated.title } });
      fireEvent.change(card.getByLabelText('Department'), { target: { value: '' } });
      fireEvent.change(card.getByLabelText('Reports to'), { target: { value: '' } });
      fireEvent.click(card.getByRole('button', { name: 'Save role & hierarchy' }));

      if (status === 200) {
        expect(await screen.findByRole('heading', { name: updated.fullName, level: 3 })).toBeInTheDocument();
      } else {
        expect(await screen.findByText('Member update denied')).toBeInTheDocument();
        expect(client.getQueryData(['workspace', organizationId])).toBe(cached);
        expect(screen.getByRole('heading', { name: member.fullName, level: 3 })).toBeInTheDocument();
      }
      expect(cached).toMatchObject({ members: [member, manager] });
      expect(requests.find((request) => request.method === 'PATCH')).toMatchObject({
        path: expect.stringContaining(`/api/memberships/${memberId}`),
        body: { fullName: updated.fullName, title: updated.title, department: '', managerMembershipId: null },
      });
      expect(requests.filter((request) => request.path === '/api/root')).toHaveLength(status === 200 ? 2 : 1);
      expect(requests.filter((request) => request.path.startsWith('/api/memberships'))).toHaveLength(1);
    },
  );

  it('removes a member through the current delete hook and refreshes the session/workspace', async () => {
    respondWorkspace();
    respond('DELETE', `/memberships/${memberId}`, memberId);
    respondWorkspace([manager]);
    const { onRefreshSession } = renderWorkspace();
    await screen.findByRole('heading', { name: member.fullName, level: 3 });
    fireEvent.click(memberCard().getByRole('button', { name: 'Remove member' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove member' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: member.fullName, level: 3 })).not.toBeInTheDocument(),
    );
    expect(onRefreshSession).toHaveBeenCalledTimes(1);
    expect(requests.find((request) => request.method === 'DELETE')).toMatchObject({
      path: `/api/memberships/${memberId}`,
    });
  });

  it('shows a failed delete without removing the member or reporting a successful refresh', async () => {
    respondWorkspace();
    respond('DELETE', `/memberships/${memberId}`, { message: 'Member removal denied' }, 403);
    const { onRefreshSession } = renderWorkspace();
    await screen.findByRole('heading', { name: member.fullName, level: 3 });
    fireEvent.click(memberCard().getByRole('button', { name: 'Remove member' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove member' }));

    expect(await screen.findByText('Member removal denied')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: member.fullName, level: 3 })).toBeInTheDocument();
    expect(onRefreshSession).not.toHaveBeenCalled();
    expect(requests.filter((request) => request.path === '/api/root')).toHaveLength(1);
    expect(requests.filter((request) => request.method === 'DELETE')).toHaveLength(1);
  });
});
