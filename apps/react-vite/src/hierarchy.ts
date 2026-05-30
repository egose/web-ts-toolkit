import type { OrganizationMember } from './types';

export interface HierarchyNode {
  member: OrganizationMember;
  children: HierarchyNode[];
}

const normalizeSearch = (value: string) => value.trim().toLowerCase();

const matchesSearch = (member: OrganizationMember, search: string) => {
  if (!search) return true;

  const haystack = [member.fullName, member.title, member.department ?? '', member.email].join(' ').toLowerCase();
  return haystack.includes(search);
};

export function buildHierarchy(members: OrganizationMember[], search = ''): HierarchyNode[] {
  const normalizedSearch = normalizeSearch(search);
  const filteredMembers = normalizedSearch
    ? members.filter((member) => matchesSearch(member, normalizedSearch))
    : members;
  const nodeMap = new Map<string, HierarchyNode>();

  filteredMembers.forEach((member) => {
    if (member._id) {
      nodeMap.set(member._id, { member, children: [] });
    }
  });

  const roots: HierarchyNode[] = [];

  filteredMembers.forEach((member) => {
    const memberId = member._id;
    if (!memberId) {
      roots.push({ member, children: [] });
      return;
    }

    const node = nodeMap.get(memberId);
    if (!node) return;

    const managerId = member.managerMembershipId ?? null;
    if (!managerId || !nodeMap.has(managerId)) {
      roots.push(node);
      return;
    }

    nodeMap.get(managerId)?.children.push(node);
  });

  const sortNodes = (nodes: HierarchyNode[]) => {
    nodes.sort((left, right) => left.member.fullName.localeCompare(right.member.fullName));
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);
  return roots;
}
