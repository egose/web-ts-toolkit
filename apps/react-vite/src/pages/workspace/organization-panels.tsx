import type { OrganizationMember } from '../../types';
import { Button } from '@egose/shadcn-theme/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@egose/shadcn-theme/components/ui/card';
import { Input } from '@egose/shadcn-theme/components/ui/input';
import { Label } from '@egose/shadcn-theme/components/ui/label';
import { NativeSelect } from '@egose/shadcn-theme/components/ui/native-select';

const mutedClass = 'app-text-muted';

const headingClass = 'app-text-strong m-0 text-xl font-semibold tracking-tight';
const formGridClass = 'grid gap-4';
const formRowClass = 'grid gap-4 lg:grid-cols-2';
const formActionsClass = 'flex flex-wrap items-center gap-3';
const labelClass = 'app-text-soft text-sm';
const sectionHeaderClass = 'mb-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between';
const snapshotGridClass = 'grid gap-4 lg:grid-cols-3';
const summaryCardClass = 'app-surface-soft grid gap-1.5 rounded-xl p-4';

interface OrganizationPanelsProps {
  currentRole?: string;
  inviteDepartment: string;
  inviteEmail: string;
  inviteFullName: string;
  inviteManagerMembershipId: string;
  inviteTitle: string;
  isAddingMember: boolean;
  isRenamingOrganization: boolean;
  mappedDepartmentCount: number;
  members: OrganizationMember[];
  onInviteDepartmentChange(value: string): void;
  onInviteEmailChange(value: string): void;
  onInviteFullNameChange(value: string): void;
  onInviteManagerMembershipIdChange(value: string): void;
  onInviteMember(): void;
  onInviteTitleChange(value: string): void;
  onOrganizationNameChange(value: string): void;
  onRenameOrganization(): void;
  organizationName: string;
  organizationSlug?: string;
  topLevelLeaderCount: number;
}

export function OrganizationPanels({
  currentRole,
  inviteDepartment,
  inviteEmail,
  inviteFullName,
  inviteManagerMembershipId,
  inviteTitle,
  isAddingMember,
  isRenamingOrganization,
  mappedDepartmentCount,
  members,
  onInviteDepartmentChange,
  onInviteEmailChange,
  onInviteFullNameChange,
  onInviteManagerMembershipIdChange,
  onInviteMember,
  onInviteTitleChange,
  onOrganizationNameChange,
  onRenameOrganization,
  organizationName,
  organizationSlug,
  topLevelLeaderCount,
}: OrganizationPanelsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="app-surface rounded-2xl p-5 shadow-none" id="organization-settings">
        <CardHeader className="px-0 pt-0">
          <CardTitle className={headingClass}>Organization settings</CardTitle>
          <CardDescription className={mutedClass}>
            Rename the organization and keep its public slug aligned automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <form
            className={formGridClass}
            onSubmit={(event) => {
              event.preventDefault();
              onRenameOrganization();
            }}
          >
            <Label className={labelClass} htmlFor="rename-organization">
              Organization name
            </Label>
            <Input
              id="rename-organization"
              value={organizationName}
              onChange={(event) => onOrganizationNameChange(event.target.value)}
              required
            />
            <div className={formActionsClass}>
              <Button variant="primary" type="submit" disabled={isRenamingOrganization}>
                {isRenamingOrganization ? 'Saving...' : 'Save organization'}
              </Button>
              <span className={`${mutedClass} font-mono`}>/{organizationSlug}</span>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="app-surface rounded-2xl p-5 shadow-none" id="organization-invite">
        <CardHeader className="px-0 pt-0">
          <CardTitle className={headingClass}>Workspace snapshot</CardTitle>
          <CardDescription className={mutedClass}>
            A quick read on role distribution and reporting structure.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className={snapshotGridClass}>
            <div className={summaryCardClass}>
              <span className={mutedClass}>Current role</span>
              <strong className="app-text-strong">{currentRole ?? 'Member'}</strong>
            </div>
            <div className={summaryCardClass}>
              <span className={mutedClass}>Top-level leaders</span>
              <strong className="app-text-strong">{topLevelLeaderCount}</strong>
            </div>
            <div className={summaryCardClass}>
              <span className={mutedClass}>Mapped departments</span>
              <strong className="app-text-strong">{mappedDepartmentCount}</strong>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="app-surface rounded-2xl p-5 shadow-none">
        <CardHeader className="px-0 pt-0">
          <CardTitle className={headingClass}>Add person by email</CardTitle>
          <CardDescription className={mutedClass}>
            If the email does not exist yet, the backend creates that user automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <form
            className={formGridClass}
            onSubmit={(event) => {
              event.preventDefault();
              onInviteMember();
            }}
          >
            <div className={formRowClass}>
              <Label className={`${labelClass} grid gap-2`}>
                Full name
                <Input
                  value={inviteFullName}
                  onChange={(event) => onInviteFullNameChange(event.target.value)}
                  required
                />
              </Label>
              <Label className={`${labelClass} grid gap-2`}>
                Email
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => onInviteEmailChange(event.target.value)}
                  required
                />
              </Label>
            </div>
            <div className={formRowClass}>
              <Label className={`${labelClass} grid gap-2`}>
                Role title
                <Input value={inviteTitle} onChange={(event) => onInviteTitleChange(event.target.value)} required />
              </Label>
              <Label className={`${labelClass} grid gap-2`}>
                Department
                <Input value={inviteDepartment} onChange={(event) => onInviteDepartmentChange(event.target.value)} />
              </Label>
            </div>
            <Label className={`${labelClass} grid gap-2`}>
              Reports to
              <NativeSelect
                value={inviteManagerMembershipId}
                onChange={(event) => onInviteManagerMembershipIdChange(event.target.value)}
              >
                <option value="">No manager</option>
                {members.map((member) => (
                  <option key={member._id} value={member._id}>
                    {member.fullName} · {member.title}
                  </option>
                ))}
              </NativeSelect>
            </Label>
            <Button variant="primary" type="submit" disabled={isAddingMember}>
              {isAddingMember ? 'Adding...' : 'Add person'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
