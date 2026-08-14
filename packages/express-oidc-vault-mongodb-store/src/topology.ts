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

const createTtlIndex = async <T extends { _id: string }>(collection: Collection<T>): Promise<string> =>
  collection.createIndex(
    { expiresAt: 1 },
    {
      expireAfterSeconds: 0,
      name: 'expiresAt_ttl',
    },
  );

export const ensureStoreIndexes = async (collections: {
  authorizationTransactions: Collection<{ _id: string }>;
  exchangeCodes: Collection<{ _id: string }>;
  sessions: Collection<{ _id: string }>;
  backchannelLogoutTokenJtis: Collection<{ _id: string }>;
  rotatedSessionAliases: Collection<{ _id: string }>;
}): Promise<void> => {
  await Promise.all([
    createTtlIndex(collections.authorizationTransactions),
    createTtlIndex(collections.exchangeCodes),
    createTtlIndex(collections.sessions),
    createTtlIndex(collections.backchannelLogoutTokenJtis),
    createTtlIndex(collections.rotatedSessionAliases),
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
