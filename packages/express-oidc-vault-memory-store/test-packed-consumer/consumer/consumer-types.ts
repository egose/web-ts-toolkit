import { type OidcVaultStoreProvider } from '@web-ts-toolkit/express-oidc-vault';
import {
  type MemoryOidcVaultStoreOptions,
  createMemoryOidcVaultStore,
} from '@web-ts-toolkit/express-oidc-vault-memory-store';

const defaultProvider = createMemoryOidcVaultStore();
defaultProvider satisfies OidcVaultStoreProvider;

const options: MemoryOidcVaultStoreOptions = {
  now: () => 1_700_000_000_000,
};

const configuredProvider: OidcVaultStoreProvider = createMemoryOidcVaultStore(options);

await configuredProvider.createSession({
  sessionId: 'session-id',
  subject: 'subject',
  refreshToken: 'refresh-token',
  idToken: 'id-token',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// @ts-expect-error now must return epoch milliseconds as a number.
createMemoryOidcVaultStore({ now: () => 'not-a-number' });
