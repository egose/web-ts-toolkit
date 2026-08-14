import { describe, expect, it } from 'vitest';

import type { OidcVaultSession } from '@web-ts-toolkit/express-oidc-vault';

import { RedisOidcVaultStoreKeys } from '../src/keys.js';
import {
  DELETE_SESSION_SCRIPT,
  ROTATE_SESSION_SCRIPT,
  WRITE_SESSION_SCRIPT,
  buildDeleteSessionCommand,
  buildRotateSessionCommand,
  buildWriteSessionCommand,
} from '../src/scripts.js';

const session: OidcVaultSession = {
  sessionId: 'sess_1',
  logicalSessionId: 'logical_1',
  subject: 'user_1',
  providerSessionId: 'provider_sid_1',
  provider: {
    issuer: 'https://issuer.example.com',
    clientId: 'client_1',
  },
  refreshToken: 'refresh_1',
  idToken: 'id_1',
  createdAt: 100,
  updatedAt: 100,
  expiresAt: 1_000,
};

const splitEvalCommand = (command: string[]) => {
  const keyCount = Number(command[2]);
  const keys = command.slice(3, 3 + keyCount);
  const args = command.slice(3 + keyCount);

  return { keyCount, keys, args };
};

describe('Redis OIDC vault script command builders', () => {
  const keys = new RedisOidcVaultStoreKeys('test');

  it('builds the write-session script contract from one typed source', () => {
    const command = buildWriteSessionCommand(keys, session);
    const contract = splitEvalCommand(command);

    expect(command.slice(0, 3)).toEqual(['EVAL', WRITE_SESSION_SCRIPT, '4']);
    expect(contract.keys).toEqual([
      'test:session:sess_1',
      'test:subject:user_1',
      'test:logical-session:logical_1',
      'test:rotated-session-alias:sess_1',
    ]);
    expect(contract.args.slice(1)).toEqual([
      '1000',
      'sess_1',
      '1000',
      'test:provider-session:provider_sid_1',
      'test:rotated-session-alias-index:',
    ]);
    expect(JSON.parse(contract.args[0]!)).toMatchObject({ sessionId: 'sess_1', logicalSessionId: 'logical_1' });
  });

  it('builds the delete-session script contract from one typed source', () => {
    const command = buildDeleteSessionCommand(keys, session, {
      kind: 'subject',
      value: 'user_1',
      issuer: 'https://issuer.example.com',
      clientId: 'client_1',
    });
    const contract = splitEvalCommand(command);

    expect(command.slice(0, 3)).toEqual(['EVAL', DELETE_SESSION_SCRIPT, '1']);
    expect(contract.keys).toEqual(['test:session:sess_1']);
    expect(contract.args.slice(1)).toEqual([
      'subject',
      'user_1',
      'https://issuer.example.com',
      'client_1',
      'test:session:',
      'test:subject:',
      'test:logical-session:',
      'test:provider-session:',
      'test:rotated-session-alias-index:',
      'test:rotated-session-alias:',
    ]);
    expect(JSON.parse(contract.args[0]!)).toMatchObject({ sessionId: 'sess_1', subject: 'user_1' });
  });

  it('builds the rotate-session script contract from one typed source', () => {
    const nextSession: OidcVaultSession = {
      ...session,
      sessionId: 'sess_2',
      providerSessionId: 'provider_sid_2',
      refreshToken: 'refresh_2',
      updatedAt: 101,
      expiresAt: undefined,
    };
    const command = buildRotateSessionCommand(keys, session, nextSession);
    const contract = splitEvalCommand(command);

    expect(command.slice(0, 3)).toEqual(['EVAL', ROTATE_SESSION_SCRIPT, '6']);
    expect(contract.keys).toEqual([
      'test:session:sess_1',
      'test:session:sess_2',
      'test:subject:user_1',
      'test:subject:user_1',
      'test:rotated-session-alias:sess_1',
      'test:rotated-session-alias:sess_2',
    ]);
    expect(contract.args.slice(1)).toEqual([
      '',
      'sess_1',
      'sess_2',
      String(Number.MAX_SAFE_INTEGER),
      'test:provider-session:provider_sid_1',
      'test:provider-session:provider_sid_2',
      'test:logical-session:logical_1',
      'test:logical-session:logical_1',
      '"logical_1"',
      '',
      'test:rotated-session-alias-index:logical_1',
      'test:rotated-session-alias-index:',
    ]);
    expect(JSON.parse(contract.args[0]!)).toMatchObject({ sessionId: 'sess_2', refreshToken: 'refresh_2' });
  });
});
