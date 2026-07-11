import type { OrganizationMember } from './types';

export interface HierarchyNode {
  member: OrganizationMember;
  children: HierarchyNode[];
}

const normalizeSearch = (value: string) => value.trim().toLowerCase();

function matchesSearch(member: OrganizationMember, search: string) {
  if (!search) return true;

  const haystack = [member.fullName, member.title, member.department ?? '', member.email].join(' ').toLowerCase();
  return haystack.includes(search);
}

function buildTree(members: OrganizationMember[]) {
  const nodeMap = new Map<string, HierarchyNode>();

  members.forEach((member) => {
    if (member._id) {
      nodeMap.set(member._id, { member, children: [] });
    }
  });

  const roots: HierarchyNode[] = [];

  members.forEach((member) => {
    const memberId = member._id;
    if (!memberId) {
      roots.push({ member, children: [] });
      return;
    }

    const node = nodeMap.get(memberId);
    if (!node) {
      return;
    }

    const managerId = member.managerMembershipId ?? null;
    if (!managerId || !nodeMap.has(managerId)) {
      roots.push(node);
      return;
    }

    nodeMap.get(managerId)?.children.push(node);
  });

  const reachableNodeIds = new Set<string>();

  const markReachable = (nodes: HierarchyNode[], path = new Set<string>()) => {
    nodes.forEach((node) => {
      const memberId = node.member._id;
      if (!memberId || path.has(memberId)) {
        return;
      }

      reachableNodeIds.add(memberId);
      markReachable(node.children, new Set(path).add(memberId));
    });
  };

  markReachable(roots);

  nodeMap.forEach((node, memberId) => {
    if (reachableNodeIds.has(memberId)) {
      return;
    }

    roots.push(node);
    markReachable([node]);
  });

  const sortNodes = (nodes: HierarchyNode[], path = new Set<string>()) => {
    nodes.sort((left, right) => left.member.fullName.localeCompare(right.member.fullName));

    nodes.forEach((node) => {
      const memberId = node.member._id;
      if (!memberId) {
        sortNodes(node.children, path);
        return;
      }

      if (path.has(memberId)) {
        node.children = [];
        return;
      }

      sortNodes(node.children, new Set(path).add(memberId));
    });
  };

  sortNodes(roots);
  return roots;
}

function filterTree(nodes: HierarchyNode[], search: string): HierarchyNode[] {
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, search);
    if (matchesSearch(node.member, search) || children.length > 0) {
      return [{ member: node.member, children }];
    }

    return [];
  });
}

export function filterMembersBySearch(members: OrganizationMember[], search = ''): OrganizationMember[] {
  const normalizedSearch = normalizeSearch(search);
  if (!normalizedSearch) {
    return members;
  }

  return members.filter((member) => matchesSearch(member, normalizedSearch));
}

export function buildHierarchy(members: OrganizationMember[], search = ''): HierarchyNode[] {
  const normalizedSearch = normalizeSearch(search);
  const hierarchy = buildTree(members);
  return normalizedSearch ? filterTree(hierarchy, normalizedSearch) : hierarchy;
}
