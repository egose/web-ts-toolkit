import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import * as publicApi from '../src/index';
import {
  authorizationDocumentToRecord,
  authorizationTransactionToDocument,
  documentToSession,
  exchangeCodeToDocument,
  exchangeDocumentToRecord,
  isExpired,
  sessionToDocument,
  type SessionDocument,
} from '../src/documents';
import { isTransactionCapableHelloResponse } from '../src/topology';

describe('document mapping internals', () => {
  it('converts numeric expiries to BSON dates and back', () => {
    const sessionDocument = sessionToDocument({
      sessionId: 'sess_1',
      logicalSessionId: 'logical_1',
      subject: 'user_1',
      provider: { issuer: 'https://issuer.example.com', clientId: 'client_1' },
      providerSessionId: 'provider_sid_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
      accessToken: 'access_1',
      scope: 'openid email',
      expiresAt: 1234,
      createdAt: 1000,
      updatedAt: 1100,
      user: { sub: 'user_1' },
      metadata: { tenant: 'tenant_1' },
    });

    expect(sessionDocument).toMatchObject({
      _id: 'sess_1',
      logicalSessionId: 'logical_1',
      expiresAt: new Date(1234),
    });
    expect(documentToSession(sessionDocument)).toMatchObject({
      sessionId: 'sess_1',
      logicalSessionId: 'logical_1',
      expiresAt: 1234,
    });

    const authorizationDocument = authorizationTransactionToDocument({
      state: 'state_1',
      nonce: 'nonce_1',
      pkceVerifier: 'verifier_1',
      codeChallenge: 'challenge_1',
      createdAt: 1000,
      expiresAt: 2000,
      metadata: { return: 'home' },
    });
    expect(authorizationDocument.expiresAt).toEqual(new Date(2000));
    expect(authorizationDocumentToRecord(authorizationDocument).expiresAt).toBe(2000);

    const exchangeDocument = exchangeCodeToDocument({
      code: 'code_1',
      sessionId: 'sess_1',
      returnTo: '/callback',
      createdAt: 1000,
      expiresAt: 2000,
    });
    expect(exchangeDocument.expiresAt).toEqual(new Date(2000));
    expect(exchangeDocumentToRecord(exchangeDocument).expiresAt).toBe(2000);
  });

  it('preserves optional session expiry and normalizes missing logical session IDs', () => {
    const sessionDocument = sessionToDocument({
      sessionId: 'sess_1',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
      createdAt: 1000,
      updatedAt: 1000,
    });

    expect(sessionDocument.expiresAt).toBeUndefined();
    expect(sessionDocument.logicalSessionId).toBe('sess_1');
    expect(documentToSession(sessionDocument)).toMatchObject({
      sessionId: 'sess_1',
      logicalSessionId: 'sess_1',
    });
    expect(documentToSession(sessionDocument).expiresAt).toBeUndefined();

    const legacyDocument: SessionDocument = {
      _id: 'sess_legacy',
      subject: 'user_1',
      refreshToken: 'refresh_1',
      idToken: 'id_1',
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(documentToSession(legacyDocument).logicalSessionId).toBe('sess_legacy');
  });

  it('treats missing expiries as non-expiring records', () => {
    expect(isExpired({ _id: 'record_1' }, 1000)).toBe(false);
    expect(isExpired({ _id: 'record_1', expiresAt: new Date(1000) }, 1000)).toBe(true);
    expect(isExpired({ _id: 'record_1', expiresAt: new Date(1001) }, 1000)).toBe(false);
  });
});

describe('topology internals', () => {
  it('classifies replica sets and sharded clusters as transaction-capable', () => {
    expect(isTransactionCapableHelloResponse({ setName: 'rs0' })).toBe(true);
    expect(isTransactionCapableHelloResponse({ msg: 'isdbgrid' })).toBe(true);
    expect(isTransactionCapableHelloResponse({ isWritablePrimary: true })).toBe(false);
    expect(isTransactionCapableHelloResponse({ setName: 1, msg: 'not-grid' })).toBe(false);
  });
});

describe('public export boundary', () => {
  it('does not expose internal helpers at runtime', () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      'DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS',
      'createMongoOidcVaultStore',
    ]);
  });

  it('keeps declaration exports limited to the public API', async () => {
    const declarations = await readFile(new URL('../dist/index.d.ts', import.meta.url), 'utf8');

    expect(declarations).toContain('MongoOidcVaultStoreOptions');
    expect(declarations).toContain('OidcVaultMongoStoreProvider');
    expect(declarations).toContain('DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS');
    expect(declarations).toContain('createMongoOidcVaultStore');
    expect(declarations).not.toMatch(
      /SessionDocument|authorizationTransactionToDocument|isTransactionCapableHelloResponse/,
    );
  });
});
