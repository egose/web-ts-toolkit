import { describe, expect, it } from 'vitest';

import { createCluster, type RedisClientType, type RedisClusterType, type RedisSentinelType } from 'redis';

import { createRedisOidcVaultStore, type OidcVaultRedisClient } from '../src/index';

type AssertSupportedClient<T extends OidcVaultRedisClient> = T;

// Official standalone clients satisfy the structural contract directly.
type OfficialStandaloneClientFixture = AssertSupportedClient<RedisClientType>;

// @ts-expect-error Redis Cluster clients are intentionally excluded until the store has a hash-slot adapter.
type OfficialClusterClientFixture = AssertSupportedClient<RedisClusterType>;

// @ts-expect-error The bare `createSentinel(...)` root client does not satisfy
// the structural contract: its `sendCommand(isReadonly, args, options?)`
// requires an `isReadonly` first argument. Pass the underlying master client
// retrieved from `sentinel.acquire()` or `sentinel.use(c => c)` instead, or
// wrap the Sentinel root with an adapter conforming to `OidcVaultRedisClient`.
type OfficialSentinelClientFixture = AssertSupportedClient<RedisSentinelType>;

void (undefined as unknown as
  | OfficialStandaloneClientFixture
  | OfficialClusterClientFixture
  | OfficialSentinelClientFixture);

describe('Redis OIDC vault client topology support', () => {
  it('rejects official Redis Cluster clients with an actionable diagnostic', () => {
    const cluster = createCluster({ rootNodes: [{ url: 'redis://localhost:6379' }] });

    expect(() => createRedisOidcVaultStore({ client: cluster as unknown as OidcVaultRedisClient })).toThrow(
      'standalone Redis and Redis Sentinel clients only',
    );
  });
});
