import type { HierarchyNode } from '../../hierarchy';
import type { OrganizationMember, RoleTemplate } from '../../types';
import { Button } from '@egose/shadcn-theme/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@egose/shadcn-theme/components/ui/card';
import { Input } from '@egose/shadcn-theme/components/ui/input';
import { HierarchyTree } from './hierarchy-tree';
import { MemberCard } from './member-card';
import { RoleTemplates } from './role-templates';
import type { MemberDraft } from './types';

const mutedClass = 'app-text-muted';

const workspaceGridClass = 'grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]';
const headingClass = 'app-text-strong m-0 text-xl font-semibold tracking-tight';
const searchGroupClass = 'flex flex-wrap items-center gap-3';
const metaGridClass = 'flex flex-wrap gap-2';
const metaChipClass = 'app-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.82rem]';
const compactHeaderClass = 'mb-2';
const sectionHeaderClass = 'mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between';

interface MembersSectionProps {
  filteredHierarchy: HierarchyNode[];
  filteredMembers: OrganizationMember[];
  isDeletingMember: boolean;
  isSavingMember: boolean;
  members: OrganizationMember[];
  onDeleteMember(member: OrganizationMember): Promise<void>;
  onMemberSearchChange(value: string): void;
  onSaveMember(memberId: string, draft: MemberDraft): Promise<void>;
  roleTemplates: RoleTemplate[];
  search: string;
  sessionEmail: string;
}

export function MembersSection({
  filteredHierarchy,
  filteredMembers,
  isDeletingMember,
  isSavingMember,
  members,
  onDeleteMember,
  onMemberSearchChange,
  onSaveMember,
  roleTemplates,
  search,
  sessionEmail,
}: MembersSectionProps) {
  const membersById = new Map<string, OrganizationMember>();
  const directReportCounts = new Map<string, number>();

  members.forEach((member) => {
    if (member._id) {
      membersById.set(member._id, member);
    }

    if (member.managerMembershipId) {
      directReportCounts.set(member.managerMembershipId, (directReportCounts.get(member.managerMembershipId) ?? 0) + 1);
    }
  });

  return (
    <div className={workspaceGridClass}>
      <Card className="app-surface rounded-2xl p-5 shadow-none" id="people">
        <CardHeader className="px-0 pt-0">
          <div className={sectionHeaderClass}>
            <div>
              <CardTitle className={headingClass}>People, roles, and hierarchy</CardTitle>
              <CardDescription className={mutedClass}>
                Everyone in the organization can update titles and reporting lines.
              </CardDescription>
            </div>
            <div className={searchGroupClass}>
              <Input
                placeholder="Filter people, titles, or departments"
                value={search}
                onChange={(event) => onMemberSearchChange(event.target.value)}
              />
              {search && (
                <Button variant="ghost" type="button" onClick={() => onMemberSearchChange('')}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-0">
          <div className={metaGridClass}>
            <span className={metaChipClass}>
              Showing {filteredMembers.length} of {members.length} members
            </span>
            <span className={metaChipClass}>Updates save directly to the organization graph</span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {filteredMembers.map((member) => (
              <MemberCard
                canDelete={members.length > 1}
                directReportCount={member._id ? (directReportCounts.get(member._id) ?? 0) : 0}
                isCurrentUser={member.email === sessionEmail}
                isDeleting={isDeletingMember}
                isSaving={isSavingMember}
                key={member._id}
                managerLabel={
                  member.managerMembershipId
                    ? `Reports to ${membersById.get(member.managerMembershipId)?.fullName ?? 'Unknown manager'}`
                    : 'Top-level role'
                }
                managers={members.filter((candidate) => candidate._id !== member._id)}
                member={member}
                onDelete={onDeleteMember}
                onSave={onSaveMember}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div>
        <Card className="app-surface grid gap-4 rounded-2xl p-5 shadow-none" id="hierarchy">
          <CardHeader className="px-0 pt-0">
            <div className={compactHeaderClass}>
              <div>
                <CardTitle className={headingClass}>Hierarchy view</CardTitle>
                <CardDescription className={mutedClass}>
                  Direct managers are expressed through membership-to-membership relationships inside the organization.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className={metaGridClass}>
              <span className={metaChipClass}>
                {filteredHierarchy.length} visible root node{filteredHierarchy.length === 1 ? '' : 's'}
              </span>
              <span className={metaChipClass}>Search filters both cards and hierarchy</span>
            </div>
            <HierarchyTree nodes={filteredHierarchy} />
          </CardContent>
        </Card>

        <Card className="app-surface rounded-2xl p-5 shadow-none" id="templates" style={{ marginTop: '1rem' }}>
          <CardHeader className="px-0 pt-0">
            <CardTitle className={headingClass}>Suggested role templates</CardTitle>
            <CardDescription className={mutedClass}>
              Served from an `access-router` data router through `access-router-client`.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <RoleTemplates roleTemplates={roleTemplates} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
