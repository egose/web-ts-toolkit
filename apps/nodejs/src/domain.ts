import { z } from 'zod';

export const port = Number(process.env.PORT ?? 8000);
export const databaseName = 'org-access-example';

export const USER_MODEL_NAME = 'User';
export const ORGANIZATION_MODEL_NAME = 'Organization';
export const MEMBERSHIP_MODEL_NAME = 'Membership';

export const roleTemplates = [
  {
    key: 'org-lead',
    title: 'Organization Lead',
    summary: 'Owns team direction, structure, and role decisions.',
    track: 'Leadership',
    level: 5,
  },
  {
    key: 'team-manager',
    title: 'Team Manager',
    summary: 'Coordinates delivery for a team and manages reporting lines.',
    track: 'Management',
    level: 4,
  },
  {
    key: 'staff-engineer',
    title: 'Staff Engineer',
    summary: 'Leads technical direction across multiple initiatives.',
    track: 'Engineering',
    level: 4,
  },
  {
    key: 'product-manager',
    title: 'Product Manager',
    summary: 'Owns roadmap priorities and cross-functional coordination.',
    track: 'Product',
    level: 3,
  },
  {
    key: 'people-partner',
    title: 'People Partner',
    summary: 'Supports organizational design, hiring, and people operations.',
    track: 'Operations',
    level: 3,
  },
];

export interface DemoUserSeed {
  displayName: string;
  email: string;
}

export interface DemoMembershipSeed {
  department: string;
  email: string;
  fullName: string;
  reportsTo?: string;
  title: string;
}

export interface DemoOrganizationSeed {
  createdByEmail: string;
  members: DemoMembershipSeed[];
  name: string;
}

export const demoUserSeeds: DemoUserSeed[] = [
  { email: 'owner@example.com', displayName: 'Olivia Owner' },
  { email: 'ada@example.com', displayName: 'Ada Stone' },
  { email: 'maya@example.com', displayName: 'Maya Chen' },
  { email: 'sam@example.com', displayName: 'Sam Patel' },
  { email: 'nora@example.com', displayName: 'Nora Diaz' },
  { email: 'leo@example.com', displayName: 'Leo Park' },
];

export const demoOrganizations: DemoOrganizationSeed[] = [
  {
    createdByEmail: 'owner@example.com',
    members: [
      { department: 'Leadership', email: 'owner@example.com', fullName: 'Olivia Owner', title: 'Organization Lead' },
      {
        department: 'Engineering',
        email: 'ada@example.com',
        fullName: 'Ada Stone',
        title: 'Staff Engineer',
        reportsTo: 'owner@example.com',
      },
      {
        department: 'Product',
        email: 'maya@example.com',
        fullName: 'Maya Chen',
        title: 'Product Manager',
        reportsTo: 'owner@example.com',
      },
      {
        department: 'Operations',
        email: 'sam@example.com',
        fullName: 'Sam Patel',
        title: 'Team Manager',
        reportsTo: 'owner@example.com',
      },
      {
        department: 'Engineering',
        email: 'leo@example.com',
        fullName: 'Leo Park',
        title: 'Staff Engineer',
        reportsTo: 'sam@example.com',
      },
    ],
    name: 'Northwind Labs',
  },
  {
    createdByEmail: 'ada@example.com',
    members: [
      { department: 'Leadership', email: 'ada@example.com', fullName: 'Ada Stone', title: 'Organization Lead' },
      {
        department: 'People',
        email: 'sam@example.com',
        fullName: 'Sam Patel',
        title: 'People Partner',
        reportsTo: 'ada@example.com',
      },
      {
        department: 'Engineering',
        email: 'nora@example.com',
        fullName: 'Nora Diaz',
        title: 'Team Manager',
        reportsTo: 'ada@example.com',
      },
      {
        department: 'Engineering',
        email: 'owner@example.com',
        fullName: 'Olivia Owner',
        title: 'Staff Engineer',
        reportsTo: 'nora@example.com',
      },
    ],
    name: 'Blue Orbit Studio',
  },
];

export const loginSchema = z.object({
  email: z.string().trim().email(),
});

export const organizationCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const organizationUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
});

export const membershipCreateSchema = z.object({
  organizationId: z.string().trim().min(1),
  email: z.string().trim().email(),
  fullName: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(80),
  department: z.string().trim().max(80).optional().or(z.literal('')),
  managerMembershipId: z.string().trim().optional().nullable().or(z.literal('')),
});

export const membershipUpdateSchema = z.object({
  fullName: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().min(1).max(80).optional(),
  department: z.string().trim().max(80).optional().or(z.literal('')),
  managerMembershipId: z.string().trim().optional().nullable().or(z.literal('')),
});

export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;
export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
export type MembershipCreateInput = z.infer<typeof membershipCreateSchema>;
export type MembershipUpdateInput = z.infer<typeof membershipUpdateSchema>;
