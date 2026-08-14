import { createHash } from 'node:crypto';

import type { OidcVaultSession } from '@web-ts-toolkit/express-oidc-vault';

import type { RedisOidcVaultStoreKeys } from './keys.js';
import { serialize } from './records.js';

export const NON_EXPIRING_INDEX_SCORE = Number.MAX_SAFE_INTEGER;

export const toIndexScore = (expiresAt?: number): number => expiresAt ?? NON_EXPIRING_INDEX_SCORE;

const serializeExpiresAt = (expiresAt?: number): string => (typeof expiresAt === 'number' ? String(expiresAt) : '');

const evalCommand = (script: string, keys: string[], args: string[]): string[] => [
  'EVAL',
  script,
  String(keys.length),
  ...keys,
  ...args,
];

/**
 * Computes the SHA1 hex digest of a Lua script body using the same algorithm
 * Redis itself uses for script-cache keys. This lets the runner issue
 * `EVALSHA` without first round-tripping a `SCRIPT LOAD` for every script.
 */
const scriptSha1 = (script: string): string => createHash('sha1').update(script).digest('hex');

/**
 * A small error name Redis returns when an `EVALSHA` references a script that
 * has not been loaded on the current node (for example after `SCRIPT FLUSH`,
 * a fresh connection, or a failover to a replica that has not seen the load).
 */
const NOSCRIPT_ERROR_PREFIX = 'NOSCRIPT';

const isNoScriptError = (error: unknown): boolean => {
  if (error instanceof Error) {
    return error.message.startsWith(NOSCRIPT_ERROR_PREFIX);
  }

  if (typeof error === 'string') {
    return error.startsWith(NOSCRIPT_ERROR_PREFIX);
  }

  return false;
};

/**
 * Minimal client shape {@link RedisScriptRunner} relies on. It mirrors the
 * `sendCommand(args)` half of {@link OidcVaultRedisClient} so the runner does
 * not depend on the full store client contract.
 */
export interface RedisScriptRunnerClient {
  sendCommand(args: string[]): Promise<unknown>;
}

/**
 * Caches Lua script bodies on the connected Redis node and executes their SHA1
 * hashes via `EVALSHA` instead of retransmitting the full script body on every
 * mutation. State is held per instance (per store, per client), so caches never
 * leak across clients and tests cannot become order-dependent through shared
 * global state.
 *
 * On `NOSCRIPT` (transparent on cold start, after `SCRIPT FLUSH`, or after a
 * reconnect/failover to a node that has not seen the load) the runner reloads
 * the script with `SCRIPT LOAD`, updates its digest, and retries the
 * `EVALSHA` once. The {@link RedisOidcVaultStore} retains ownership of the
 * client lifecycle, so it can reset the runner on a deliberate reconnect.
 */
export class RedisScriptRunner {
  private readonly client: RedisScriptRunnerClient;
  private readonly digests = new Map<string, string>();

  constructor(client: RedisScriptRunnerClient) {
    this.client = client;
  }

  /**
   * Drops every cached script digest. Call after a reconnection or failover
   * that the store owner knows invalidates the node's script cache. The next
   * mutation will lazily reload via `SCRIPT LOAD` on the new node.
   */
  reset(): void {
    this.digests.clear();
  }

  /**
   * Executes an `EVAL`-form command (`['EVAL', scriptBody, keyCount, ...keys,
   * ...args]`) against the cached script. The leading `EVAL` and script body
   * are replaced with `EVALSHA` and the script digest so steady-state
   * mutations do not transmit full script bodies across the wire. The
   * remaining positional layout (key count, keys, args) is preserved exactly.
   */
  async run(command: string[]): Promise<unknown> {
    if (command[0] !== 'EVAL' || typeof command[1] !== 'string' || typeof command[2] !== 'string') {
      throw new Error('RedisScriptRunner.run expects an EVAL-form command.');
    }

    const script = command[1];
    const tail = command.slice(2);

    return this.runDigest(script, tail);
  }

  private async runDigest(script: string, tail: string[]): Promise<unknown> {
    let digest = this.digests.get(script);

    if (!digest) {
      digest = scriptSha1(script);
      this.digests.set(script, digest);
    }

    try {
      return await this.client.sendCommand(['EVALSHA', digest, ...tail]);
    } catch (error) {
      if (!isNoScriptError(error)) {
        throw error;
      }

      const loaded = await this.client.sendCommand(['SCRIPT', 'LOAD', script]);

      if (typeof loaded === 'string' && loaded.length > 0) {
        digest = loaded;
        this.digests.set(script, digest);
      }

      return this.client.sendCommand(['EVALSHA', digest, ...tail]);
    }
  }

  /** Exposed for tests: the SHA1 digest the runner would currently send. */
  digestFor(script: string): string | undefined {
    return this.digests.get(script) ?? scriptSha1(script);
  }
}

export const WRITE_SESSION_SCRIPT = `
local value = ARGV[1]
local expiresAt = ARGV[2]
local sessionId = ARGV[3]
local score = tonumber(ARGV[4])
local providerIndexKey = ARGV[5]
local aliasIndexKeyPrefix = ARGV[6]

local function assertStringOrMissing(key)
  local keyType = redis.call('TYPE', key)['ok']

  if keyType ~= 'none' and keyType ~= 'string' then
    error('OIDC vault Redis store key has unexpected type')
  end
end

local function assertZsetOrMissing(key)
  local keyType = redis.call('TYPE', key)['ok']

  if keyType ~= 'none' and keyType ~= 'zset' then
    error('OIDC vault Redis store key has unexpected type')
  end
end

assertStringOrMissing(KEYS[1])
assertStringOrMissing(KEYS[4])
assertZsetOrMissing(KEYS[2])
assertZsetOrMissing(KEYS[3])

if providerIndexKey ~= '' then
  assertZsetOrMissing(providerIndexKey)
end

local staleAliasLogicalSessionId = nil
local staleAliasValue = redis.call('GET', KEYS[4])

if staleAliasValue ~= false then
  local decodedAliasOk, decodedAlias = pcall(cjson.decode, staleAliasValue)

  if decodedAliasOk and type(decodedAlias) == 'string' then
    staleAliasLogicalSessionId = decodedAlias
    assertZsetOrMissing(aliasIndexKeyPrefix .. staleAliasLogicalSessionId)
  end
end

if expiresAt ~= '' then
  if redis.call('SET', KEYS[1], value, 'PXAT', expiresAt, 'NX') == false then
    return 0
  end
else
  if redis.call('SET', KEYS[1], value, 'NX') == false then
    return 0
  end
end

redis.call('ZADD', KEYS[2], score, sessionId)
redis.call('ZADD', KEYS[3], score, sessionId)

if providerIndexKey ~= '' then
  redis.call('ZADD', providerIndexKey, score, sessionId)
end

if staleAliasValue ~= false then
  redis.call('DEL', KEYS[4])

  if staleAliasLogicalSessionId ~= nil then
    redis.call('ZREM', aliasIndexKeyPrefix .. staleAliasLogicalSessionId, sessionId)
  end
end

return 1
`;

export const DELETE_SESSION_SCRIPT = `
local expected = cjson.decode(ARGV[1])
local scopeKind = ARGV[2]
local scopeValue = ARGV[3]
local issuer = ARGV[4]
local clientId = ARGV[5]
local sessionKeyPrefix = ARGV[6]
local subjectIndexKeyPrefix = ARGV[7]
local logicalIndexKeyPrefix = ARGV[8]
local providerIndexKeyPrefix = ARGV[9]
local aliasIndexKeyPrefix = ARGV[10]
local aliasKeyPrefix = ARGV[11]
local expectedLogicalSessionId = expected['logicalSessionId'] or expected['sessionId']

local function assertZsetOrMissing(key)
  local keyType = redis.call('TYPE', key)['ok']

  if keyType ~= 'none' and keyType ~= 'zset' then
    error('OIDC vault Redis store key has unexpected type')
  end
end

local function logicalSessionIdFor(session)
  return session['logicalSessionId'] or session['sessionId']
end

local function matchesProviderScope(session)
  local provider = session['provider']

  if issuer ~= '' and (provider == nil or provider['issuer'] ~= issuer) then
    return false
  end

  if clientId ~= '' and (provider == nil or provider['clientId'] ~= clientId) then
    return false
  end

  return true
end

local function matchesScope(session, allowLogicalSuccessor)
  if allowLogicalSuccessor and logicalSessionIdFor(session) ~= expectedLogicalSessionId then
    return false
  end

  if scopeKind == 'single' then
    if allowLogicalSuccessor then
      return true
    end

    return session['sessionId'] == expected['sessionId']
  end

  if scopeKind == 'logical' then
    return logicalSessionIdFor(session) == scopeValue
  end

  if scopeKind == 'subject' then
    return session['subject'] == scopeValue and matchesProviderScope(session)
  end

  if scopeKind == 'provider-session' then
    return session['providerSessionId'] == scopeValue and matchesProviderScope(session)
  end

  return false
end

local function deleteRecord(sessionKey, session)
  local sessionId = session['sessionId']
  local logicalSessionId = logicalSessionIdFor(session)
  local aliasIndexKey = aliasIndexKeyPrefix .. logicalSessionId
  assertZsetOrMissing(subjectIndexKeyPrefix .. session['subject'])
  assertZsetOrMissing(logicalIndexKeyPrefix .. logicalSessionId)
  assertZsetOrMissing(aliasIndexKey)

  if session['providerSessionId'] ~= nil then
    assertZsetOrMissing(providerIndexKeyPrefix .. session['providerSessionId'])
  end

  local aliasSessionIds = redis.call('ZRANGE', aliasIndexKey, 0, -1)

  if redis.call('DEL', sessionKey) == 0 then
    return 0
  end

  redis.call('ZREM', subjectIndexKeyPrefix .. session['subject'], sessionId)
  redis.call('ZREM', logicalIndexKeyPrefix .. logicalSessionId, sessionId)

  if session['providerSessionId'] ~= nil then
    redis.call('ZREM', providerIndexKeyPrefix .. session['providerSessionId'], sessionId)
  end

  for _, aliasSessionId in ipairs(aliasSessionIds) do
    redis.call('DEL', aliasKeyPrefix .. aliasSessionId)
  end

  redis.call('DEL', aliasIndexKey)

  return 1
end

local currentValue = redis.call('GET', KEYS[1])

if currentValue ~= false then
  local current = cjson.decode(currentValue)

  if matchesScope(current, false) then
    return deleteRecord(KEYS[1], current)
  end

  return 0
end

local deleted = 0
local logicalIndexKey = logicalIndexKeyPrefix .. expectedLogicalSessionId
local sessionIds = redis.call('ZRANGE', logicalIndexKey, 0, -1)

for _, sessionId in ipairs(sessionIds) do
  local sessionKey = sessionKeyPrefix .. sessionId
  local value = redis.call('GET', sessionKey)

  if value ~= false then
    local session = cjson.decode(value)

    if matchesScope(session, true) then
      deleted = deleted + deleteRecord(sessionKey, session)
    end
  else
    redis.call('ZREM', logicalIndexKey, sessionId)
  end
end

return deleted
`;

export const ROTATE_SESSION_SCRIPT = `
local newValue = ARGV[1]
local newExpiresAt = ARGV[2]
local oldSessionId = ARGV[3]
local newSessionId = ARGV[4]
local newScore = tonumber(ARGV[5])
local oldProviderIndexKey = ARGV[6]
local newProviderIndexKey = ARGV[7]
local oldLogicalIndexKey = ARGV[8]
local newLogicalIndexKey = ARGV[9]
local oldAliasValue = ARGV[10]
local oldAliasExpiresAt = ARGV[11]
local aliasIndexKey = ARGV[12]
local aliasIndexKeyPrefix = ARGV[13]

local function assertStringOrMissing(key)
  local keyType = redis.call('TYPE', key)['ok']

  if keyType ~= 'none' and keyType ~= 'string' then
    error('OIDC vault Redis store key has unexpected type')
  end
end

local function assertZsetOrMissing(key)
  local keyType = redis.call('TYPE', key)['ok']

  if keyType ~= 'none' and keyType ~= 'zset' then
    error('OIDC vault Redis store key has unexpected type')
  end
end

assertStringOrMissing(KEYS[1])
assertStringOrMissing(KEYS[2])
assertStringOrMissing(KEYS[5])
assertStringOrMissing(KEYS[6])
assertZsetOrMissing(KEYS[3])
assertZsetOrMissing(KEYS[4])

if oldProviderIndexKey ~= '' then
  assertZsetOrMissing(oldProviderIndexKey)
end

if newProviderIndexKey ~= '' then
  assertZsetOrMissing(newProviderIndexKey)
end

if oldLogicalIndexKey ~= '' then
  assertZsetOrMissing(oldLogicalIndexKey)
end

if newLogicalIndexKey ~= '' then
  assertZsetOrMissing(newLogicalIndexKey)
end

assertZsetOrMissing(aliasIndexKey)

local staleTargetAliasLogicalSessionId = nil
local staleTargetAliasValue = redis.call('GET', KEYS[6])

if staleTargetAliasValue ~= false then
  local decodedAliasOk, decodedAlias = pcall(cjson.decode, staleTargetAliasValue)

  if decodedAliasOk and type(decodedAlias) == 'string' then
    staleTargetAliasLogicalSessionId = decodedAlias
    assertZsetOrMissing(aliasIndexKeyPrefix .. staleTargetAliasLogicalSessionId)
  end
end

if redis.call('EXISTS', KEYS[1]) == 0 then
  return 0
end

if oldSessionId == newSessionId then
  return 2
end

if redis.call('EXISTS', KEYS[2]) == 1 then
  return 2
end

if newExpiresAt ~= '' then
  redis.call('SET', KEYS[2], newValue, 'PXAT', newExpiresAt)
else
  redis.call('SET', KEYS[2], newValue)
end

redis.call('DEL', KEYS[1])
redis.call('ZREM', KEYS[3], oldSessionId)
redis.call('ZADD', KEYS[4], newScore, newSessionId)

if oldProviderIndexKey ~= '' then
  redis.call('ZREM', oldProviderIndexKey, oldSessionId)
end

if newProviderIndexKey ~= '' then
  redis.call('ZADD', newProviderIndexKey, newScore, newSessionId)
end

if oldLogicalIndexKey ~= '' then
  redis.call('ZREM', oldLogicalIndexKey, oldSessionId)
end

if newLogicalIndexKey ~= '' then
  redis.call('ZADD', newLogicalIndexKey, newScore, newSessionId)
end

if staleTargetAliasValue ~= false then
  redis.call('DEL', KEYS[6])

  if staleTargetAliasLogicalSessionId ~= nil then
    redis.call('ZREM', aliasIndexKeyPrefix .. staleTargetAliasLogicalSessionId, newSessionId)
  end
end

if oldAliasExpiresAt ~= '' then
  redis.call('SET', KEYS[5], oldAliasValue, 'PXAT', oldAliasExpiresAt)
else
  redis.call('SET', KEYS[5], oldAliasValue)
end

redis.call('ZADD', aliasIndexKey, newScore, oldSessionId)

return 1
`;

export type DeleteSessionScriptScope =
  | { kind: 'single' }
  | { kind: 'logical'; value: string }
  | { kind: 'subject'; value: string; issuer?: string; clientId?: string }
  | { kind: 'provider-session'; value: string; issuer?: string; clientId?: string };

export const buildWriteSessionCommand = (keys: RedisOidcVaultStoreKeys, session: OidcVaultSession): string[] =>
  evalCommand(
    WRITE_SESSION_SCRIPT,
    [
      keys.session(session.sessionId),
      keys.subjectIndex(session.subject),
      keys.logicalSessionIndex(session.logicalSessionId ?? session.sessionId),
      keys.rotatedSessionAlias(session.sessionId),
    ],
    [
      serialize(session),
      serializeExpiresAt(session.expiresAt),
      session.sessionId,
      String(toIndexScore(session.expiresAt)),
      session.providerSessionId ? keys.providerSessionIndex(session.providerSessionId) : '',
      keys.rotatedSessionAliasIndexPrefix(),
    ],
  );

export const buildDeleteSessionCommand = (
  keys: RedisOidcVaultStoreKeys,
  session: OidcVaultSession,
  scope: DeleteSessionScriptScope,
): string[] =>
  evalCommand(
    DELETE_SESSION_SCRIPT,
    [keys.session(session.sessionId)],
    [
      serialize(session),
      scope.kind,
      'value' in scope ? scope.value : '',
      'issuer' in scope ? (scope.issuer ?? '') : '',
      'clientId' in scope ? (scope.clientId ?? '') : '',
      keys.sessionPrefix(),
      keys.subjectIndexPrefix(),
      keys.logicalSessionIndexPrefix(),
      keys.providerSessionIndexPrefix(),
      keys.rotatedSessionAliasIndexPrefix(),
      keys.rotatedSessionAliasPrefix(),
    ],
  );

export const buildRotateSessionCommand = (
  keys: RedisOidcVaultStoreKeys,
  previousSession: OidcVaultSession,
  nextSession: OidcVaultSession,
): string[] =>
  evalCommand(
    ROTATE_SESSION_SCRIPT,
    [
      keys.session(previousSession.sessionId),
      keys.session(nextSession.sessionId),
      keys.subjectIndex(previousSession.subject),
      keys.subjectIndex(nextSession.subject),
      keys.rotatedSessionAlias(previousSession.sessionId),
      keys.rotatedSessionAlias(nextSession.sessionId),
    ],
    [
      serialize(nextSession),
      serializeExpiresAt(nextSession.expiresAt),
      previousSession.sessionId,
      nextSession.sessionId,
      String(toIndexScore(nextSession.expiresAt)),
      previousSession.providerSessionId ? keys.providerSessionIndex(previousSession.providerSessionId) : '',
      nextSession.providerSessionId ? keys.providerSessionIndex(nextSession.providerSessionId) : '',
      keys.logicalSessionIndex(previousSession.logicalSessionId ?? previousSession.sessionId),
      keys.logicalSessionIndex(nextSession.logicalSessionId ?? nextSession.sessionId),
      serialize(nextSession.logicalSessionId ?? nextSession.sessionId),
      serializeExpiresAt(nextSession.expiresAt),
      keys.rotatedSessionAliasIndex(nextSession.logicalSessionId ?? nextSession.sessionId),
      keys.rotatedSessionAliasIndexPrefix(),
    ],
  );
