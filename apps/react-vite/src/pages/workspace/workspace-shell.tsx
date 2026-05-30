import { type ReactNode, useEffect } from 'react';
import SidebarLayout, { setLayoutHeader, type ISidebarData } from '@egose/shadcn-theme/layouts/sidebar1';
import { TooltipProvider } from '@egose/shadcn-theme/components/ui/tooltip';
import {
  IconBell,
  IconBriefcase,
  IconBuildingEstate,
  IconLayoutGrid,
  IconSettings,
  IconSparkles,
  IconUserCircle,
  IconUsers,
} from '@tabler/icons-react';
import { Link, useLocation } from 'react-router';
import type { SessionData } from '../../types';

const contextPalette = [
  'bg-violet-500 text-white',
  'bg-cyan-500 text-white',
  'bg-emerald-500 text-white',
  'bg-amber-400 text-black',
  'bg-rose-500 text-white',
  'bg-fuchsia-500 text-white',
];

function hashIsActive(currentHash: string, targetHash: string) {
  return (currentHash || '#overview') === targetHash;
}

function hashMatches(currentHash: string, targets: string[]) {
  const hash = currentHash || '#overview';
  return targets.includes(hash);
}

function getSectionMeta(hash: string) {
  switch (hash || '#overview') {
    case '#organization-settings':
    case '#organization':
      return { group: 'Organization', title: 'Settings' };
    case '#organization-invite':
      return { group: 'Organization', title: 'Invite Member' };
    case '#hierarchy':
      return { group: 'Team', title: 'Hierarchy' };
    case '#templates':
      return { group: 'Team', title: 'Role Templates' };
    case '#people':
      return { group: 'Team', title: 'People' };
    default:
      return { group: 'Workspace', title: 'Overview' };
  }
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function avatarDataUri(label: string) {
  const initials = initialsFromName(label);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#fb7185"/><stop offset="100%" stop-color="#ef4444"/></linearGradient></defs><rect width="64" height="64" rx="20" fill="#120c0d"/><circle cx="29" cy="32" r="18" fill="url(#g)"/><circle cx="44.5" cy="16.5" r="4.5" fill="#fff7ed"/><text x="29" y="34" dominant-baseline="middle" text-anchor="middle" fill="#fff7ed" font-family="Arial, sans-serif" font-size="21" font-weight="700">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function WorkspaceLayoutHeader({
  organizationName,
  sectionGroup,
  sectionTitle,
}: {
  organizationName: string;
  sectionGroup: string;
  sectionTitle: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid min-w-0 gap-0.5">
        <span className="truncate text-[0.68rem] font-medium uppercase tracking-[0.18em] text-slate-500">
          Org Access Example
        </span>
        <div className="app-text-soft flex min-w-0 items-center gap-2 text-sm">
          <span className="app-text truncate font-medium">{organizationName}</span>
          <span className="text-slate-600">/</span>
          <span className="app-text-muted truncate">{sectionGroup}</span>
          <span className="text-slate-600">/</span>
          <span className="app-text-strong truncate">{sectionTitle}</span>
        </div>
      </div>
    </div>
  );
}

interface WorkspaceShellProps {
  children: ReactNode;
  currentRole?: string;
  onNavigateToOrganization(organizationId: string): void;
  onSignOut(): void;
  selectedOrganizationId: string | null;
  session: SessionData;
}

export function WorkspaceShell({
  children,
  currentRole,
  onNavigateToOrganization,
  onSignOut,
  selectedOrganizationId,
  session,
}: WorkspaceShellProps) {
  const location = useLocation();
  const basePath = selectedOrganizationId ? `/organizations/${selectedOrganizationId}` : '/organizations';
  const sectionMeta = getSectionMeta(location.hash);
  const activeOrganizationName =
    session.organizations.find((organization) => organization.organizationId === selectedOrganizationId)?.name ??
    'Workspace';
  const contextItems =
    session.organizations.length > 0
      ? session.organizations.map((organization, index) => ({
          active: organization.organizationId === selectedOrganizationId,
          className: contextPalette[index % contextPalette.length],
          logo: IconSparkles,
          name: organization.name,
          text: `${organization.title} · /${organization.slug}`,
        }))
      : [
          {
            active: true,
            className: 'bg-slate-700 text-white',
            logo: IconSparkles,
            name: 'No organization yet',
            text: 'Create one to get started',
          },
        ];

  const data: ISidebarData = {
    user: {
      name: session.user.displayName,
      email: session.user.email,
      avatar: avatarDataUri(session.user.displayName),
    },
    context: {
      title: 'Organizations',
      canAdd: false,
      items: contextItems,
    },
    menus: [
      {
        title: 'Workspace',
        items: [
          {
            title: 'Overview',
            url: `${basePath}#overview`,
            icon: IconLayoutGrid,
            isActive: hashIsActive(location.hash, '#overview'),
          },
        ],
      },
      {
        title: 'Manage',
        hideTitle: true,
        items: [
          {
            title: 'Organization',
            icon: IconBuildingEstate,
            isActive: hashMatches(location.hash, ['#organization', '#organization-settings', '#organization-invite']),
            subItems: [
              {
                title: 'Settings',
                url: `${basePath}#organization-settings`,
                isActive:
                  hashIsActive(location.hash, '#organization-settings') || hashIsActive(location.hash, '#organization'),
              },
              {
                title: 'Invite member',
                url: `${basePath}#organization-invite`,
                isActive: hashIsActive(location.hash, '#organization-invite'),
              },
            ],
          },
          {
            title: 'Team',
            icon: IconUsers,
            isActive: hashMatches(location.hash, ['#people', '#hierarchy', '#templates']),
            subItems: [
              {
                title: 'People',
                url: `${basePath}#people`,
                isActive: hashIsActive(location.hash, '#people'),
              },
              {
                title: 'Hierarchy',
                url: `${basePath}#hierarchy`,
                isActive: hashIsActive(location.hash, '#hierarchy'),
              },
              {
                title: 'Role templates',
                url: `${basePath}#templates`,
                isActive: hashIsActive(location.hash, '#templates'),
              },
            ],
          },
        ],
      },
    ],
    userMenus: [
      {
        title: 'Account',
        icon: IconUserCircle,
        url: `${basePath}#overview`,
      },
      {
        title: currentRole || 'Organization member',
        icon: IconBriefcase,
        url: `${basePath}#organization`,
      },
      {
        title: 'Organization settings',
        icon: IconSettings,
        url: `${basePath}#organization-settings`,
      },
      {
        title: 'Team updates',
        icon: IconBell,
        url: `${basePath}#people`,
      },
    ],
    events: {
      contextSelect: (context) => {
        const organization = session.organizations.find(
          (candidate) => candidate.name === context.name && `${candidate.title} · /${candidate.slug}` === context.text,
        );
        if (organization) {
          onNavigateToOrganization(organization.organizationId);
        }
      },
      logout: () => {
        onSignOut();
      },
    },
  };

  useEffect(() => {
    setLayoutHeader(
      <WorkspaceLayoutHeader
        organizationName={activeOrganizationName}
        sectionGroup={sectionMeta.group}
        sectionTitle={sectionMeta.title}
      />,
    );

    return () => {
      setLayoutHeader(null);
    };
  }, [activeOrganizationName, sectionMeta.group, sectionMeta.title]);

  useEffect(() => {
    document.body.classList.add('org-workspace-shell-active');

    const root = document.documentElement;
    const previousClassName = root.className;
    root.classList.remove('light');
    root.classList.add('dark');

    return () => {
      document.body.classList.remove('org-workspace-shell-active');
      root.className = previousClassName;
    };
  }, []);

  return (
    <TooltipProvider>
      <SidebarLayout
        aslink={Link}
        data={data}
        classNames={{
          header: 'h-16 border-b border-white/6 bg-black',
          inset: 'bg-black text-slate-100',
          main: 'pb-8 pt-4',
          sidebar: 'org-workspace-sidebar border-r border-white/6 bg-[#0d0e10] text-slate-100',
        }}
      >
        {children}
      </SidebarLayout>
    </TooltipProvider>
  );
}
