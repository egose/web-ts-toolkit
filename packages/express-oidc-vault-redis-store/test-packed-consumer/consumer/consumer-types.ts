import {
  OidcVaultDpopReplayCapacityError,
  type OidcVaultDeviceBindingStoreProvider,
  type OidcVaultStoreProvider,
} from '@web-ts-toolkit/express-oidc-vault';
import {
  createRedisOidcVaultStore,
  OidcVaultRedisStoreRecordError,
  type OidcVaultRedisClient,
  type RedisOidcVaultStoreOptions,
} from '@web-ts-toolkit/express-oidc-vault-redis-store';

const client: OidcVaultRedisClient = {
  async set() {
    return 'OK';
  },
  async get() {
    return null;
  },
  async del() {
    return 0;
  },
  async sendCommand() {
    return null;
  },
};

const options: RedisOidcVaultStoreOptions = {
  client,
  keyPrefix: 'consumer',
  now: () => 1_700_000_000_000,
  dpopReplayMaxEntries: 100_000,
};

const provider: OidcVaultStoreProvider = createRedisOidcVaultStore(options);
void provider.createSession;
const strongerProvider: OidcVaultDeviceBindingStoreProvider = createRedisOidcVaultStore(options);
void strongerProvider.getAuthorizationTransaction('state');
void strongerProvider.getExchangeCode('code');
void strongerProvider.consumeAuthorizationTransactionIfMatches({
  state: 'state',
  match: { deviceBinding: null, browserBindingHash: null },
});
void strongerProvider.consumeExchangeCodeIfMatches({
  code: 'code',
  expectedSessionId: 'session',
  match: { deviceBinding: null, browserBindingHash: null },
});
void strongerProvider.getSessionRevocationContext('session');
void strongerProvider.reserveDpopProof({ replayKey: 'opaque', expiresAt: Date.now() + 60_000 });
new OidcVaultDpopReplayCapacityError() satisfies Error;
// @ts-expect-error Exchange consume must atomically match the preflight session ID.
void strongerProvider.consumeExchangeCodeIfMatches({
  code: 'code',
  match: { deviceBinding: null, browserBindingHash: null },
});
// @ts-expect-error Capacity must be numeric.
createRedisOidcVaultStore({ client, dpopReplayMaxEntries: '100000' });

// Re-exported record error reaches consumers by name from the root entry.
const recordError = new OidcVaultRedisStoreRecordError('session');
recordError satisfies Error;
void recordError.name;

// @ts-expect-error now must return epoch milliseconds as a number, not a string.
const badOptions: RedisOidcVaultStoreOptions = { client, now: () => 'not-a-number' };

void badOptions;

// @ts-expect-error sendCommand is required; a client that omits it is rejected by the public type.
const missingSendCommand: OidcVaultRedisClient = {
  async set() {
    return 'OK';
  },
  async get() {
    return null;
  },
  async del() {
    return 0;
  },
};

void missingSendCommand;
