import type { Collection, Db } from 'mongodb';

export const isTransactionCapableHelloResponse = (value: Record<string, unknown>): boolean =>
  typeof value.setName === 'string' || value.msg === 'isdbgrid';

export const assertTransactionSupport = async (db: Db): Promise<void> => {
  const hello = (await db.admin().command({ hello: 1 })) as Record<string, unknown>;

  if (!isTransactionCapableHelloResponse(hello)) {
    throw new Error(
      'OIDC vault MongoDB session rotation requires a transaction-capable MongoDB deployment. Use a replica set or sharded cluster.',
    );
  }
};

type IndexableCollection = Pick<Collection, 'createIndex'>;

const createTtlIndex = async (collection: IndexableCollection): Promise<string> =>
  collection.createIndex(
    { expiresAt: 1 },
    {
      expireAfterSeconds: 0,
      name: 'expiresAt_ttl',
    },
  );

export const ensureStoreIndexes = async (collections: {
  authorizationTransactions: IndexableCollection;
  exchangeCodes: IndexableCollection;
  sessions: IndexableCollection;
  backchannelLogoutTokenJtis: IndexableCollection;
  rotatedSessionAliases: IndexableCollection;
  dpopProofs: IndexableCollection;
  dpopReplayCapacity: IndexableCollection;
}): Promise<void> => {
  await Promise.all([
    createTtlIndex(collections.authorizationTransactions),
    createTtlIndex(collections.exchangeCodes),
    createTtlIndex(collections.sessions),
    createTtlIndex(collections.backchannelLogoutTokenJtis),
    createTtlIndex(collections.rotatedSessionAliases),
    createTtlIndex(collections.dpopProofs),
    // Accounting outlives physical proof TTL deletion until a serialized
    // bounded cleanup decrements capacity. Never TTL-delete these entries.
    collections.dpopReplayCapacity.createIndex({ kind: 1, expiresAt: 1 }, { name: 'dpop_expiry_accounting_idx' }),
    collections.rotatedSessionAliases.createIndex({ logicalSessionId: 1 }, { name: 'logical_session_idx' }),
    collections.sessions.createIndex(
      { subject: 1, 'provider.issuer': 1, 'provider.clientId': 1 },
      { name: 'subject_scope_idx' },
    ),
    collections.sessions.createIndex(
      { providerSessionId: 1, 'provider.issuer': 1, 'provider.clientId': 1 },
      { name: 'provider_session_scope_idx' },
    ),
    collections.sessions.createIndex({ logicalSessionId: 1 }, { name: 'logical_session_idx' }),
  ]);
};
