const mutedClass = 'app-text-muted';
const pillClass =
  'app-chip inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-[0.72rem] font-medium uppercase tracking-[0.18em]';

const topbarClass = 'grid gap-3';
const metaGridClass = 'flex flex-wrap gap-2';
const metaChipClass = 'app-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.82rem]';

interface WorkspaceHeaderProps {
  currentRole?: string;
  memberCount: number;
  organizationName?: string;
  organizationSlug?: string;
}

export function WorkspaceHeader({
  currentRole,
  memberCount,
  organizationName,
  organizationSlug,
}: WorkspaceHeaderProps) {
  return (
    <div className={topbarClass}>
      <div>
        <span className={pillClass}>Organization workspace</span>
        <h1 className="app-text-strong m-0 mt-3 text-[clamp(2.2rem,4vw,3.35rem)] font-semibold leading-none tracking-[-0.04em]">
          {organizationName ?? 'Choose an organization'}
        </h1>
        <p className={mutedClass}>
          Add people by email, update role titles, and reshape the reporting hierarchy without leaving the workspace.
        </p>
        {currentRole && (
          <div className={metaGridClass}>
            <span className={metaChipClass}>Your role: {currentRole}</span>
            <span className={`${metaChipClass} font-mono`}>/{organizationSlug}</span>
            <span className={metaChipClass}>{memberCount} people in this org</span>
          </div>
        )}
      </div>
    </div>
  );
}
