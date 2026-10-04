import {
  OidcVaultDpopReplayCapacityError,
  type OidcVaultDeviceBindingStoreProvider,
  type OidcVaultStoreProvider,
} from '@web-ts-toolkit/express-oidc-vault';
import {
  type MemoryOidcVaultStoreOptions,
  createMemoryOidcVaultStore,
} from '@web-ts-toolkit/express-oidc-vault-memory-store';

const defaultProvider = createMemoryOidcVaultStore();
defaultProvider satisfies OidcVaultStoreProvider;
defaultProvider satisfies OidcVaultDeviceBindingStoreProvider;

const options: MemoryOidcVaultStoreOptions = {
  dpopReplayMaxEntries: 100_000,
  now: () => 1_700_000_000_000,
};
void defaultProvider.getAuthorizationTransaction('state');
void defaultProvider.getExchangeCode('code');
void defaultProvider.consumeAuthorizationTransactionIfMatches({
  state: 'state',
  match: { deviceBinding: null, browserBindingHash: null },
});
void defaultProvider.consumeExchangeCodeIfMatches({
  code: 'code',
  expectedSessionId: 'session',
  match: { deviceBinding: null, browserBindingHash: null },
});
void defaultProvider.getSessionRevocationContext('session');
void defaultProvider.reserveDpopProof({ replayKey: 'opaque', expiresAt: Date.now() + 60_000 });
new OidcVaultDpopReplayCapacityError() satisfies Error;
// @ts-expect-error Both binding match fields are mandatory.
void defaultProvider.consumeAuthorizationTransactionIfMatches({ state: 'state', match: { deviceBinding: null } });
// @ts-expect-error Capacity is numeric, not a string.
createMemoryOidcVaultStore({ dpopReplayMaxEntries: '100000' });

const configuredProvider: OidcVaultStoreProvider = createMemoryOidcVaultStore(options);

void configuredProvider.createSession({
  sessionId: 'session-id',
  subject: 'subject',
  refreshToken: 'refresh-token',
  idToken: 'id-token',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// @ts-expect-error now must return epoch milliseconds as a number.
createMemoryOidcVaultStore({ now: () => 'not-a-number' });
