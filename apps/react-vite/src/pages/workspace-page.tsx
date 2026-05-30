import { useDeferredValue, useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@egose/shadcn-theme/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@egose/shadcn-theme/components/ui/card';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router';
import { loadWorkspace, logout, membershipService, organizationService } from '../api';
import { buildHierarchy } from '../hierarchy';
import type { OrganizationMember, SessionData } from '../types';
import { CreateOrganizationCard } from './workspace/create-organization-card';
import { MembersSection } from './workspace/members-section';
import { OrganizationPanels } from './workspace/organization-panels';
import { WorkspaceShell } from './workspace/workspace-shell';
import type { MemberDraft } from './workspace/types';
import { WorkspaceHeader } from './workspace/workspace-header';

const panelClass = 'rounded-3xl p-4';
const emptyCardClass = 'rounded-[22px] p-4';
const loadingCardClass = emptyCardClass;
const errorBannerClass = 'rounded-2xl border border-red-400/35 bg-red-950/25 px-4 py-3 text-red-200';
const statCardClass = 'app-surface rounded-2xl p-5 shadow-none';

interface WorkspacePageProps {
  onRefreshSession(): Promise<void>;
  onSignedOut(): Promise<void>;
  session: SessionData;
}

export function WorkspacePage({ onRefreshSession, onSignedOut, session }: WorkspacePageProps) {
  const navigate = useNavigate();
  const { organizationId } = useParams();
  const queryClient = useQueryClient();

  const selectedOrganizationId = organizationId ?? session.organizations[0]?.organizationId ?? null;
  const [organizationName, setOrganizationName] = useState('');
  const [newOrganizationName, setNewOrganizationName] = useState('');
  const [search, setSearch] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteTitle, setInviteTitle] = useState('');
  const [inviteDepartment, setInviteDepartment] = useState('');
  const [inviteManagerMembershipId, setInviteManagerMembershipId] = useState('');

  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!organizationId && session.organizations[0]?.organizationId) {
      navigate(`/organizations/${session.organizations[0].organizationId}`, { replace: true });
    }
  }, [navigate, organizationId, session.organizations]);

  useEffect(() => {
    if (!organizationId) return;

    if (session.organizations.length === 0) {
      navigate('/organizations', { replace: true });
      return;
    }

    const stillVisible = session.organizations.some((organization) => organization.organizationId === organizationId);
    if (!stillVisible) {
      navigate(`/organizations/${session.organizations[0].organizationId}`, { replace: true });
    }
  }, [navigate, organizationId, session.organizations]);

  const workspaceQuery = useQuery({
    enabled: Boolean(selectedOrganizationId),
    queryFn: () => loadWorkspace(selectedOrganizationId!),
    queryKey: ['workspace', selectedOrganizationId],
  });

  useEffect(() => {
    setOrganizationName(workspaceQuery.data?.organization.name ?? '');
  }, [workspaceQuery.data?.organization.name]);

  const createOrganizationMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await organizationService.create({ name });
      if (!response.success) {
        throw new Error(response.message || 'Unable to create organization.');
      }

      return response.raw;
    },
    onSuccess: async (organization) => {
      setNewOrganizationName('');
      await onRefreshSession();
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
      if (organization._id) {
        navigate(`/organizations/${organization._id}`);
      }
    },
  });

  const renameOrganizationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrganizationId) {
        throw new Error('Select an organization first.');
      }

      const response = await organizationService.update(selectedOrganizationId, { name: organizationName });
      if (!response.success) {
        throw new Error(response.message || 'Unable to rename organization.');
      }

      return response.raw;
    },
    onSuccess: async () => {
      await onRefreshSession();
      await queryClient.invalidateQueries({ queryKey: ['workspace', selectedOrganizationId] });
    },
  });

  const inviteMemberMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrganizationId) {
        throw new Error('Select an organization first.');
      }

      const response = await membershipService.create({
        department: inviteDepartment,
        email: inviteEmail,
        fullName: inviteFullName,
        managerMembershipId: inviteManagerMembershipId || undefined,
        organizationId: selectedOrganizationId,
        title: inviteTitle,
      });

      if (!response.success) {
        throw new Error(response.message || 'Unable to add this person.');
      }

      return response.raw;
    },
    onSuccess: async () => {
      setInviteDepartment('');
      setInviteEmail('');
      setInviteFullName('');
      setInviteManagerMembershipId('');
      setInviteTitle('');
      await queryClient.invalidateQueries({ queryKey: ['workspace', selectedOrganizationId] });
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: async ({ draft, memberId }: { draft: MemberDraft; memberId: string }) => {
      const response = await membershipService.update(memberId, {
        department: draft.department,
        fullName: draft.fullName,
        managerMembershipId: draft.managerMembershipId || undefined,
        title: draft.title,
      });

      if (!response.success) {
        throw new Error(response.message || 'Unable to save member changes.');
      }

      return response.raw;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspace', selectedOrganizationId] });
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (member: OrganizationMember) => {
      const memberId = member._id;
      if (!memberId) {
        throw new Error('Missing member id.');
      }

      const response = await membershipService.delete(memberId);
      if (!response.success) {
        throw new Error(response.message || 'Unable to remove member.');
      }

      return member;
    },
    onSuccess: async () => {
      await onRefreshSession();
      await queryClient.invalidateQueries({ queryKey: ['workspace', selectedOrganizationId] });
    },
  });

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await logout();
      await onSignedOut();
    },
  });

  const members = workspaceQuery.data?.members ?? [];
  const currentOrganizationMembership = session.organizations.find(
    (organization) => organization.organizationId === selectedOrganizationId,
  );
  const filteredMembers = members.filter((member) => {
    if (!deferredSearch.trim()) {
      return true;
    }

    const haystack = [member.fullName, member.title, member.department ?? '', member.email].join(' ').toLowerCase();
    return haystack.includes(deferredSearch.trim().toLowerCase());
  });
  const filteredHierarchy = buildHierarchy(members, deferredSearch);

  const activeError =
    workspaceQuery.error ??
    createOrganizationMutation.error ??
    renameOrganizationMutation.error ??
    inviteMemberMutation.error ??
    updateMemberMutation.error ??
    deleteMemberMutation.error;

  return (
    <WorkspaceShell
      currentRole={currentOrganizationMembership?.title}
      onNavigateToOrganization={(nextOrganizationId) => {
        navigate(`/organizations/${nextOrganizationId}`);
      }}
      onSignOut={() => signOutMutation.mutate()}
      selectedOrganizationId={selectedOrganizationId}
      session={session}
    >
      <div className="mx-auto grid w-full max-w-[1380px] gap-6 pb-10 pt-2">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]" id="overview">
          <div className="app-surface rounded-2xl p-6 shadow-none">
            <WorkspaceHeader
              currentRole={currentOrganizationMembership?.title}
              memberCount={members.length}
              organizationName={workspaceQuery.data?.organization.name}
              organizationSlug={workspaceQuery.data?.organization.slug}
            />
          </div>
          <CreateOrganizationCard
            isCreating={createOrganizationMutation.isPending}
            newOrganizationName={newOrganizationName}
            onCreate={() => {
              void createOrganizationMutation.mutateAsync(newOrganizationName);
            }}
            onNewOrganizationNameChange={setNewOrganizationName}
          />
        </section>

        {activeError instanceof Error && (
          <Alert variant="danger" className={errorBannerClass}>
            <AlertDescription>{activeError.message}</AlertDescription>
          </Alert>
        )}

        {!selectedOrganizationId && (
          <Card className={`${emptyCardClass} ${panelClass} app-surface shadow-none`}>
            <CardHeader className="px-0 pt-0">
              <CardTitle className="app-text-strong m-0 text-2xl font-semibold tracking-tight">
                No organization selected yet
              </CardTitle>
              <CardDescription className="app-text-muted">
                Create one from the panel above or sign in with an email that another member already invited.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {selectedOrganizationId && workspaceQuery.isPending && (
          <Card className={`${loadingCardClass} ${panelClass} app-surface shadow-none`}>
            <CardHeader className="px-0 pt-0">
              <CardTitle className="app-text-strong m-0 text-2xl font-semibold tracking-tight">
                Loading workspace...
              </CardTitle>
            </CardHeader>
          </Card>
        )}

        {selectedOrganizationId && workspaceQuery.data && (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className={statCardClass}>
                <CardHeader className="px-0 pt-0">
                  <CardDescription className="app-text-muted">Members</CardDescription>
                  <CardTitle className="app-text-strong block text-[1.6rem] font-bold">{members.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card className={statCardClass}>
                <CardHeader className="px-0 pt-0">
                  <CardDescription className="app-text-muted">Role templates</CardDescription>
                  <CardTitle className="app-text-strong block text-[1.6rem] font-bold">
                    {workspaceQuery.data.roleTemplates.length}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className={statCardClass}>
                <CardHeader className="px-0 pt-0">
                  <CardDescription className="app-text-muted">Organizations you belong to</CardDescription>
                  <CardTitle className="app-text-strong block text-[1.6rem] font-bold">
                    {session.organizations.length}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            <section className="scroll-mt-20" id="organization">
              <OrganizationPanels
                currentRole={currentOrganizationMembership?.title}
                inviteDepartment={inviteDepartment}
                inviteEmail={inviteEmail}
                inviteFullName={inviteFullName}
                inviteManagerMembershipId={inviteManagerMembershipId}
                inviteTitle={inviteTitle}
                isAddingMember={inviteMemberMutation.isPending}
                isRenamingOrganization={renameOrganizationMutation.isPending}
                mappedDepartmentCount={new Set(members.map((member) => member.department).filter(Boolean)).size}
                members={members}
                onInviteDepartmentChange={setInviteDepartment}
                onInviteEmailChange={setInviteEmail}
                onInviteFullNameChange={setInviteFullName}
                onInviteManagerMembershipIdChange={setInviteManagerMembershipId}
                onInviteMember={() => {
                  void inviteMemberMutation.mutateAsync();
                }}
                onInviteTitleChange={setInviteTitle}
                onOrganizationNameChange={setOrganizationName}
                onRenameOrganization={() => {
                  void renameOrganizationMutation.mutateAsync();
                }}
                organizationName={organizationName}
                organizationSlug={workspaceQuery.data.organization.slug}
                topLevelLeaderCount={members.filter((member) => !member.managerMembershipId).length}
              />
            </section>

            <section className="scroll-mt-20">
              <MembersSection
                filteredHierarchy={filteredHierarchy}
                filteredMembers={filteredMembers}
                isDeletingMember={deleteMemberMutation.isPending}
                isSavingMember={updateMemberMutation.isPending}
                members={members}
                onDeleteMember={async (targetMember) => deleteMemberMutation.mutateAsync(targetMember)}
                onMemberSearchChange={setSearch}
                onSaveMember={async (memberId, draft) => updateMemberMutation.mutateAsync({ draft, memberId })}
                roleTemplates={workspaceQuery.data.roleTemplates}
                search={search}
                sessionEmail={session.user.email}
              />
            </section>
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
