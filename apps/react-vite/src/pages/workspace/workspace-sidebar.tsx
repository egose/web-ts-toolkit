import { NavLink } from 'react-router';
import { Button } from '@egose/shadcn-theme/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@egose/shadcn-theme/components/ui/card';
import { Input } from '@egose/shadcn-theme/components/ui/input';
import { Label } from '@egose/shadcn-theme/components/ui/label';
import type { SessionData } from '../../types';

const pillClass =
  'inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-700/10 px-3 py-1 text-[0.82rem] tracking-[0.02em] text-cyan-200';
const mutedClass = 'text-slate-400';
const sidebarClass = 'flex flex-col gap-4 border-b border-slate-400/12 bg-slate-950/72 p-4 lg:border-b-0 lg:border-r';
const sidebarNavClass = 'grid gap-3';
const orgLinkBaseClass =
  'grid gap-1 rounded-[18px] border border-slate-400/14 bg-slate-800/60 p-4 transition hover:-translate-y-px hover:border-sky-400/40 hover:bg-slate-700/90';
const orgNameClass = 'font-semibold text-slate-50';
const orgRoleClass = 'text-sm text-sky-300';
const sidebarFooterClass = 'mt-auto';
const formGridClass = 'grid gap-4';
const labelClass = 'text-sm text-slate-300';

interface WorkspaceSidebarProps {
  isCreating: boolean;
  newOrganizationName: string;
  onCreate(): void;
  onNewOrganizationNameChange(value: string): void;
  session: SessionData;
}

export function WorkspaceSidebar({
  isCreating,
  newOrganizationName,
  onCreate,
  onNewOrganizationNameChange,
  session,
}: WorkspaceSidebarProps) {
  return (
    <aside className={sidebarClass}>
      <div>
        <span className={pillClass}>Signed in as</span>
        <h2 className="m-0 mt-2 text-2xl font-semibold tracking-tight text-slate-50">{session.user.displayName}</h2>
        <div className={`${mutedClass} font-mono`}>{session.user.email}</div>
      </div>

      <section>
        <div className="mb-4 flex flex-col gap-3">
          <div>
            <h3 className="m-0 text-lg font-semibold text-slate-50">Organizations</h3>
            <div className={mutedClass}>People can belong to as many organizations as needed.</div>
          </div>
        </div>

        <nav className={sidebarNavClass}>
          {session.organizations.map((organization) => (
            <NavLink
              className={({ isActive }) => `${orgLinkBaseClass} ${isActive ? 'border-sky-400/40 bg-slate-700/90' : ''}`}
              key={organization.membershipId}
              to={`/organizations/${organization.organizationId}`}
            >
              <span className={orgNameClass}>{organization.name}</span>
              <span className={orgRoleClass}>{organization.title}</span>
              <span className={`${mutedClass} font-mono`}>{organization.slug}</span>
            </NavLink>
          ))}
        </nav>
      </section>

      <Card className={sidebarFooterClass}>
        <CardHeader>
          <CardTitle className="m-0 text-lg font-semibold text-slate-50">Create organization</CardTitle>
          <CardDescription className={mutedClass}>
            Creating an organization also adds you as its initial lead.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <form
            className={formGridClass}
            onSubmit={(event) => {
              event.preventDefault();
              onCreate();
            }}
          >
            <Label className={labelClass} htmlFor="organization-name">
              Organization name
            </Label>
            <Input
              id="organization-name"
              placeholder="Northwind Labs"
              value={newOrganizationName}
              onChange={(event) => onNewOrganizationNameChange(event.target.value)}
              required
            />
            <Button variant="link" type="submit" disabled={isCreating}>
              {isCreating ? 'Creating...' : 'Create organization'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </aside>
  );
}
