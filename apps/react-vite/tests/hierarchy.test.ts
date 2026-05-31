import { describe, expect, it } from 'vitest';
import { buildHierarchy } from '../src/hierarchy';

describe('buildHierarchy', () => {
  it('nests members under their manager and filters search results', () => {
    const nodes = buildHierarchy(
      [
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
      ],
      'engineer',
    );

    expect(nodes).toHaveLength(1);
    expect(nodes[0].member.fullName).toBe('Engineer');
  });
});
