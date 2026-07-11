import { describe, expect, it } from 'vitest';
import { buildHierarchy, filterMembersBySearch } from '../src/hierarchy';

const members = [
  {
    _id: 'lead',
    organizationId: 'org-1',
    userId: 'u-1',
    email: 'lead@example.com',
    fullName: 'Lead',
    title: 'Lead',
    invitedByUserId: 'u-1',
  },
  {
    _id: 'engineer',
    organizationId: 'org-1',
    userId: 'u-2',
    email: 'eng@example.com',
    fullName: 'Engineer',
    managerMembershipId: 'lead',
    title: 'Engineer',
    invitedByUserId: 'u-1',
  },
];

describe('buildHierarchy', () => {
  it('keeps the management chain visible when filtering hierarchy results', () => {
    const nodes = buildHierarchy(members, 'engineer');

    expect(nodes).toHaveLength(1);
    expect(nodes[0].member.fullName).toBe('Lead');
    expect(nodes[0].children).toHaveLength(1);
    expect(nodes[0].children[0].member.fullName).toBe('Engineer');
  });

  it('uses the same matching rules for member-card filtering', () => {
    expect(filterMembersBySearch(members, 'engineer').map((member) => member.fullName)).toEqual(['Engineer']);
  });
});
