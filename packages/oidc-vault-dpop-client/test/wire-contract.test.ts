import type {
  OidcVaultExchangeResult as BackendExchange,
  OidcVaultLoginInitiationInput as BackendLoginInput,
  OidcVaultLoginInitiationResult as BackendLoginResult,
  OidcVaultLogoutResult as BackendLogout,
  OidcVaultLogoutNavigationInput as BackendNavigationInput,
  OidcVaultLogoutNavigationResult as BackendNavigationResult,
  OidcVaultSessionTransport as BackendTransport,
  OidcVaultTokenIssueResult as BackendToken,
  OidcVaultUserProfile as BackendProfile,
} from '@web-ts-toolkit/express-oidc-vault';
import { describe, expectTypeOf, it } from 'vitest';

import type {
  OidcVaultExchangeResult,
  OidcVaultLoginInitiationInput,
  OidcVaultLoginInitiationResult,
  OidcVaultLogoutResult,
  OidcVaultLogoutNavigationInput,
  OidcVaultLogoutNavigationResult,
  OidcVaultSessionTransport,
  OidcVaultTokenIssueResult,
  OidcVaultUserProfile,
} from '../src/wire';

describe('CLIENT-03 single-sourced browser DTOs vs backend root declarations', () => {
  it('matches the full credential and profile wire contracts without runtime Express imports', () => {
    expectTypeOf<OidcVaultExchangeResult>().toEqualTypeOf<BackendExchange>();
    expectTypeOf<OidcVaultTokenIssueResult>().toEqualTypeOf<BackendToken>();
    expectTypeOf<OidcVaultUserProfile>().toEqualTypeOf<BackendProfile>();
  });
  it('matches login, logout and transport contracts', () => {
    expectTypeOf<OidcVaultLoginInitiationInput>().toEqualTypeOf<BackendLoginInput>();
    expectTypeOf<OidcVaultLoginInitiationResult>().toEqualTypeOf<BackendLoginResult>();
    expectTypeOf<OidcVaultLogoutResult>().toEqualTypeOf<BackendLogout>();
    expectTypeOf<OidcVaultLogoutNavigationInput>().toEqualTypeOf<BackendNavigationInput>();
    expectTypeOf<OidcVaultLogoutNavigationResult>().toEqualTypeOf<BackendNavigationResult>();
    expectTypeOf<OidcVaultSessionTransport>().toEqualTypeOf<BackendTransport>();
  });
});
