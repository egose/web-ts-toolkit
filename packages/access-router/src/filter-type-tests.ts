import type { Filter } from './interfaces';
import type { ModelRouterOptions } from './interfaces';
import type { PublicService } from './services';
import type { DataService } from './services';

interface FilterTypeTestModel {
  profile: {
    name: string;
    address: {
      city: string;
      zip: number;
    };
  };
  tags: string[];
  posts: Array<{
    title: string;
    stats: {
      views: number;
    };
  }>;
}

const validNestedFilter: Filter<FilterTypeTestModel> = {
  'profile.address.city': 'Berlin',
  'profile.address.zip': { $gte: 10000 },
  'posts.stats.views': { $gte: 10 },
  tags: { $all: ['featured'] },
  $or: [{ 'profile.name': { $regex: /ja/i } }],
};

void validNestedFilter;

// @ts-expect-error invalid nested path should be rejected
const invalidNestedPath: Filter<FilterTypeTestModel> = { 'profile.address.country': 'DE' };

// @ts-expect-error invalid nested value type should be rejected
const invalidNestedValue: Filter<FilterTypeTestModel> = { 'posts.stats.views': 'many' };

void invalidNestedPath;
void invalidNestedValue;

interface ResponseTypeTestModel {
  name: string;
  role: string;
  public: boolean;
  profile: {
    address: {
      city: string;
      zip: number;
    };
  };
  posts: Array<{
    title: string;
    stats: {
      views: number;
    };
  }>;
}

declare const publicService: PublicService<ResponseTypeTestModel>;
declare const dataService: DataService<ResponseTypeTestModel>;

const selectedRead = publicService._read('user-id', { select: ['name'] as const });
declare const selectedReadResult: Awaited<typeof selectedRead>;

if (selectedReadResult.success) {
  const selectedName: string = selectedReadResult.data.name;
  void selectedName;

  // @ts-expect-error role should be excluded by select-aware read typing
  selectedReadResult.data.role;
}

const selectedList = publicService._list({}, { select: { name: 1 } as const });
declare const selectedListResult: Awaited<typeof selectedList>;

if (selectedListResult.success) {
  const firstRow = selectedListResult.data[0];
  const rowName: string = firstRow.name;
  void rowName;

  // @ts-expect-error public should be excluded by select-aware list typing
  firstRow.public;
}

const selectedCreate = publicService._create({ name: 'alice' }, { select: 'name' });
declare const selectedCreateResult: Awaited<typeof selectedCreate>;

if (selectedCreateResult.success) {
  const createdRow = selectedCreateResult.data[0];
  const createdName: string = createdRow.name;
  void createdName;

  // @ts-expect-error role should be excluded by select-aware create typing
  createdRow.role;
}

const selectedUpdate = publicService._update('user-id', { name: 'bob' }, { select: ['name'] as const });
declare const selectedUpdateResult: Awaited<typeof selectedUpdate>;

if (selectedUpdateResult.success) {
  const updatedName: string = selectedUpdateResult.data.name;
  void updatedName;

  // @ts-expect-error public should be excluded by select-aware update typing
  selectedUpdateResult.data.public;
}

const nestedRead = publicService._read('user-id', { select: ['profile.address.city', 'posts.stats.views'] as const });
declare const nestedReadResult: Awaited<typeof nestedRead>;

if (nestedReadResult.success) {
  const city: string = nestedReadResult.data.profile.address.city;
  const views: number = nestedReadResult.data.posts[0].stats.views;
  void city;
  void views;

  // @ts-expect-error nested zip should be excluded by dotted select typing
  nestedReadResult.data.profile.address.zip;

  // @ts-expect-error top-level name should be excluded by dotted select typing
  nestedReadResult.data.name;
}

const populatedRead = publicService._read('user-id', {
  select: ['name'] as const,
  populate: [
    { path: 'profile', select: ['address.city'] as const },
    { path: 'posts', select: ['stats.views'] as const },
  ] as const,
});
declare const populatedReadResult: Awaited<typeof populatedRead>;

if (populatedReadResult.success) {
  const populatedName: string = populatedReadResult.data.name;
  const populatedProfile = populatedReadResult.data.profile;
  const populatedPosts = populatedReadResult.data.posts;
  void populatedName;
  void populatedProfile;
  void populatedPosts;

  // @ts-expect-error nested zip should be excluded by populate select typing
  populatedReadResult.data.profile.address.zip;

  // @ts-expect-error title should be excluded by populate select typing
  populatedReadResult.data.posts[0].title;
}

const dataSelectedRead = dataService.findById('item-id', { select: ['profile.address.city'] as const });
declare const dataSelectedReadResult: Awaited<typeof dataSelectedRead>;

if (dataSelectedReadResult.success) {
  const dataCity: string = dataSelectedReadResult.data.profile.address.city;
  void dataCity;

  // @ts-expect-error zip should be excluded by data-service dotted select typing
  dataSelectedReadResult.data.profile.address.zip;
}

const dataSelectedList = dataService.find({}, { select: { name: 1 } as const });
declare const dataSelectedListResult: Awaited<typeof dataSelectedList>;

if (dataSelectedListResult.success) {
  const dataName: string = dataSelectedListResult.data[0].name;
  void dataName;

  // @ts-expect-error role should be excluded by data-service select typing
  dataSelectedListResult.data[0].role;
}

// ---------------------------------------------------------------------------
// VIRT-01 virtual definition types + router option plumbing (VIRT-00A D3).
// Persisted User has NO fullAddress field; virtual output is optional.
// ---------------------------------------------------------------------------

interface VirtUser {
  name: string;
  address: string;
}

interface VirtUserVirtuals {
  fullAddress: string;
}

const validVirtualOptions: ModelRouterOptions<VirtUser, VirtUserVirtuals> = {
  permissionSchema: {
    name: { read: true },
    address: { read: 'canViewAddress' },
    fullAddress: { read: 'canViewAddress' },
  },
  virtuals: {
    fullAddress: {
      dependsOn: ['address'],
      read: async function (doc, _permissions, _ctx) {
        if (doc.address === undefined) return undefined;
        return `addr:${doc.address}`;
      },
    },
  },
};

void validVirtualOptions;

const validVirtualDescriptorOptions: ModelRouterOptions<VirtUser, VirtUserVirtuals> = {
  permissionSchema: {
    name: true,
    fullAddress: { read: true },
  },
  virtuals: {
    fullAddress: {
      get: async function (doc) {
        if (doc.address === undefined) return undefined;
        return `addr:${doc.address}`;
      },
      dependsOn: ['address'],
    },
  },
};

void validVirtualDescriptorOptions;

const invalidVirtualDependsOn: ModelRouterOptions<VirtUser, VirtUserVirtuals> = {
  permissionSchema: { name: true, fullAddress: true },
  virtuals: {
    // @ts-expect-error 'addres' is not a persisted field of User
    fullAddress: { dependsOn: ['addres'], read: async (doc) => String((doc as never as { addres?: string }).addres) },
  },
};

void invalidVirtualDependsOn;

declare const virtService: PublicService<VirtUser, VirtUserVirtuals>;

const virtRead = virtService._read('id1', { select: ['name', 'fullAddress'] as const });
declare const virtReadResult: Awaited<typeof virtRead>;

if (virtReadResult.success) {
  const virtName: string = virtReadResult.data.name;
  void virtName;
  const virtAddress: string | undefined = virtReadResult.data.fullAddress;
  void virtAddress;

  // @ts-expect-error address was not selected so it must be excluded
  virtReadResult.data.address;
}

// @ts-expect-error virtual fields must never widen persisted filters
const badVirtualFilter: Filter<VirtUser> = { fullAddress: 'x' };

void badVirtualFilter;

interface VirtContact {
  displayName: string;
  email: string;
}

interface VirtParent {
  name: string;
  contacts: VirtContact[];
}

const validEmbeddedVirtualOptions: ModelRouterOptions<VirtParent, Record<never, never>> = {
  permissionSchema: { name: true },
  virtuals: {
    contacts: {
      sub: {
        nick: {
          dependsOn: ['displayName'],
          read: async function (doc, _permissions, _ctx) {
            if (doc.displayName === undefined) return undefined;
            return `nick:${doc.displayName}`;
          },
        },
      },
    },
  },
};

void validEmbeddedVirtualOptions;
