import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@egose/shadcn-theme/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@egose/shadcn-theme/components/ui/card';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createModelHooks } from '@web-ts-toolkit/access-router-react';
import { useNavigate, useParams } from 'react-router';
import { loadWorkspace, logout, membershipService, organizationService } from '../api';
import { buildHierarchy, filterMembersBySearch } from '../hierarchy';
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

const { useCreateModel: useCreateOrg, useUpdateModel: useUpdateOrg } = createModelHooks({
  modelService: organizationService,
});

const { useCreateModel: useCreateMember, useDeleteModel: useDeleteMember } = createModelHooks({
  modelService: membershipService,
});

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
  const lastSyncedOrganizationNameRef = useRef<string | null>(null);
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

  const serverName = workspaceQuery.data?.organization.name ?? '';

  useEffect(() => {
    if (!selectedOrganizationId || !serverName) {
      return;
    }

    const syncKey = `${selectedOrganizationId}:${serverName}`;
    if (syncKey === lastSyncedOrganizationNameRef.current) {
      return;
    }

    lastSyncedOrganizationNameRef.current = syncKey;
    setOrganizationName(serverName);
  }, [selectedOrganizationId, serverName]);

  // ── access-router-react hooks ──

  const createOrg = useCreateOrg({
    onSuccess: async (result) => {
      setNewOrganizationName('');
      await onRefreshSession();
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
      if (result.raw._id) {
        navigate(`/organizations/${result.raw._id}`);
      }
    },
  });

  const renameOrg = useUpdateOrg({
    onSuccess: async () => {
      await onRefreshSession();
      await queryClient.invalidateQueries({ queryKey: ['workspace', selectedOrganizationId] });
    },
  });

  const inviteMember = useCreateMember({
    onSuccess: async () => {
      setInviteDepartment('');
      setInviteEmail('');
      setInviteFullName('');
      setInviteManagerMembershipId('');
      setInviteTitle('');
      await queryClient.invalidateQueries({ queryKey: ['workspace', selectedOrganizationId] });
    },
  });

  const deleteMember = useDeleteMember({
    onSuccess: async () => {
      await onRefreshSession();
      await queryClient.invalidateQueries({ queryKey: ['workspace', selectedOrganizationId] });
    },
  });

  // ── still on react-query (session lifecycle + sign-out) ──

  const signOutMutation = useMutation({
    mutationFn: async () => {
      await logout();
      await onSignedOut();
    },
  });

  // ── active record: update member via Model.save() ──

  const [isSavingMember, setIsSavingMember] = useState(false);
  const [saveMemberError, setSaveMemberError] = useState<Error | null>(null);

  const handleSaveMember = async (memberId: string, draft: MemberDraft) => {
    const member = workspaceQuery.data?.members.find((m) => m._id === memberId);
    if (!member) return;

    setIsSavingMember(true);
    setSaveMemberError(null);
    try {
      member.fullName = draft.fullName;
      member.title = draft.title;
      member.department = draft.department;
      member.managerMembershipId = draft.managerMembershipId || undefined;
      const res = await member.save();
      if (!res.success) {
        throw new Error(res.message || 'Unable to save member changes.');
      }
      await queryClient.invalidateQueries({ queryKey: ['workspace', selectedOrganizationId] });
    } catch (err) {
      setSaveMemberError(err as Error);
    } finally {
      setIsSavingMember(false);
    }
  };

  // ── derived state ──

  const members = workspaceQuery.data?.members ?? [];
  const currentOrganizationMembership = session.organizations.find(
    (organization) => organization.organizationId === selectedOrganizationId,
  );
  const filteredMembers = filterMembersBySearch(members, deferredSearch);
  const filteredHierarchy = buildHierarchy(members, deferredSearch);
  const mappedDepartmentCount = new Set(members.map((member) => member.department).filter(Boolean)).size;
  const topLevelLeaderCount = members.filter((member) => !member.managerMembershipId).length;

  const activeError =
    workspaceQuery.error ??
    createOrg.error ??
    renameOrg.error ??
    inviteMember.error ??
    deleteMember.error ??
    saveMemberError;

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
            isCreating={createOrg.isPending}
            newOrganizationName={newOrganizationName}
            onCreate={() => {
              void createOrg.createModel({ name: newOrganizationName });
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
                isAddingMember={inviteMember.isPending}
                isRenamingOrganization={renameOrg.isPending}
                mappedDepartmentCount={mappedDepartmentCount}
                members={members}
                onInviteDepartmentChange={setInviteDepartment}
                onInviteEmailChange={setInviteEmail}
                onInviteFullNameChange={setInviteFullName}
                onInviteManagerMembershipIdChange={setInviteManagerMembershipId}
                onInviteMember={() => {
                  void inviteMember.createModel({
                    department: inviteDepartment,
                    email: inviteEmail,
                    fullName: inviteFullName,
                    managerMembershipId: inviteManagerMembershipId || undefined,
                    organizationId: selectedOrganizationId!,
                    title: inviteTitle,
                  });
                }}
                onInviteTitleChange={setInviteTitle}
                onOrganizationNameChange={setOrganizationName}
                onRenameOrganization={() => {
                  if (!selectedOrganizationId) return;
                  void renameOrg.updateModel(selectedOrganizationId, { name: organizationName });
                }}
                organizationName={organizationName}
                organizationSlug={workspaceQuery.data.organization.slug}
                topLevelLeaderCount={topLevelLeaderCount}
              />
            </section>

            <section className="scroll-mt-20">
              <MembersSection
                filteredHierarchy={filteredHierarchy}
                filteredMembers={filteredMembers}
                isDeletingMember={deleteMember.isPending}
                isSavingMember={isSavingMember}
                members={members}
                onDeleteMember={async (targetMember) => {
                  const memberId = targetMember._id;
                  if (!memberId) throw new Error('Missing member id.');
                  await deleteMember.deleteModel(memberId);
                }}
                onMemberSearchChange={setSearch}
                onSaveMember={handleSaveMember}
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
