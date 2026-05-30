import { useEffect, useState } from 'react';
import { Button } from '@egose/shadcn-theme/components/ui/button';
import { Card } from '@egose/shadcn-theme/components/ui/card';
import { Input } from '@egose/shadcn-theme/components/ui/input';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@egose/shadcn-theme/components/ui/dialog';
import { NativeSelect } from '@egose/shadcn-theme/components/ui/native-select';
import type { OrganizationMember } from '../../types';
import type { MemberDraft } from './types';

const mutedClass = 'app-text-muted';
const pillClass =
  'app-chip inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-[0.82rem] tracking-[0.02em]';
const memberCardClass = 'app-surface-soft grid gap-4 rounded-xl p-4 shadow-none';
const memberHeaderClass = 'mb-3 flex items-start justify-between gap-4 max-[720px]:flex-col max-[720px]:items-stretch';
const memberBadgeRowClass = 'flex flex-wrap justify-end gap-2 max-[720px]:justify-start';
const metaGridClass = 'flex flex-wrap gap-2';
const metaChipClass = 'app-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.82rem]';
const formGridClass = 'grid gap-4';
const labelClass = 'app-text-soft text-sm';

interface MemberCardProps {
  canDelete: boolean;
  directReportCount: number;
  isCurrentUser: boolean;
  isDeleting: boolean;
  isSaving: boolean;
  managerLabel: string;
  managers: OrganizationMember[];
  member: OrganizationMember;
  onDelete(member: OrganizationMember): Promise<void>;
  onSave(memberId: string, draft: MemberDraft): Promise<void>;
}

export function MemberCard({
  canDelete,
  directReportCount,
  isCurrentUser,
  isDeleting,
  isSaving,
  managerLabel,
  managers,
  member,
  onDelete,
  onSave,
}: MemberCardProps) {
  const [draft, setDraft] = useState<MemberDraft>({
    department: member.department ?? '',
    fullName: member.fullName,
    managerMembershipId: member.managerMembershipId ?? '',
    title: member.title,
  });
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setDraft({
      department: member.department ?? '',
      fullName: member.fullName,
      managerMembershipId: member.managerMembershipId ?? '',
      title: member.title,
    });
  }, [member]);

  const memberId = member._id;
  if (!memberId) {
    return null;
  }

  const hasChanges =
    draft.fullName !== member.fullName ||
    draft.title !== member.title ||
    draft.department !== (member.department ?? '') ||
    draft.managerMembershipId !== (member.managerMembershipId ?? '');

  return (
    <Card className={memberCardClass}>
      <header className={memberHeaderClass}>
        <div>
          <h3 className="app-text-strong m-0 text-lg font-semibold">{member.fullName}</h3>
          <div className={mutedClass}>{member.email}</div>
        </div>
        <div className={memberBadgeRowClass}>
          {isCurrentUser && <span className={pillClass}>You</span>}
          <span className={pillClass}>Editable</span>
        </div>
      </header>

      <div className={metaGridClass}>
        <span className={metaChipClass}>{member.department || 'Unassigned department'}</span>
        <span className={metaChipClass}>
          {directReportCount} direct report{directReportCount === 1 ? '' : 's'}
        </span>
        <span className={metaChipClass}>{managerLabel}</span>
      </div>

      <div className={formGridClass}>
        <label className={`${labelClass} grid gap-2`}>
          Full name
          <Input
            value={draft.fullName}
            onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))}
          />
        </label>
        <label className={`${labelClass} grid gap-2`}>
          Role title
          <Input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          />
        </label>
        <label className={`${labelClass} grid gap-2`}>
          Department
          <Input
            value={draft.department}
            onChange={(event) => setDraft((current) => ({ ...current, department: event.target.value }))}
          />
        </label>
        <label className={`${labelClass} grid gap-2`}>
          Reports to
          <NativeSelect
            value={draft.managerMembershipId}
            onChange={(event) => setDraft((current) => ({ ...current, managerMembershipId: event.target.value }))}
          >
            <option value="">No manager</option>
            {managers.map((manager) => (
              <option key={manager._id} value={manager._id}>
                {manager.fullName} · {manager.title}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          type="button"
          disabled={isSaving || !hasChanges}
          onClick={() => onSave(memberId, draft)}
        >
          {isSaving ? 'Saving...' : hasChanges ? 'Save role & hierarchy' : 'Saved'}
        </Button>
        <Button
          variant="danger"
          type="button"
          disabled={!canDelete || isDeleting}
          onClick={() => setIsDeleteDialogOpen(true)}
        >
          {isDeleting ? 'Removing...' : 'Remove member'}
        </Button>
      </div>

      <div className="app-text-muted text-sm">
        {!canDelete
          ? 'At least one member must remain in the organization.'
          : 'Deleting a manager reassigns direct reports upward.'}
      </div>
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {member.fullName}?</DialogTitle>
            <DialogDescription>
              This removes the member from the organization and reassigns direct reports upward.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              type="button"
              disabled={isDeleting}
              onClick={async () => {
                setIsDeleteDialogOpen(false);
                await onDelete(member);
              }}
            >
              {isDeleting ? 'Removing...' : 'Remove member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
