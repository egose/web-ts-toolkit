import type {
  ConsumeLogoutNavigationTicketInput,
  OidcVaultLogoutNavigationTicket,
} from '@web-ts-toolkit/express-oidc-vault';
import type { RedisOidcVaultStoreKeys } from './keys.js';
import { ticketId } from './logout-ticket-validation.js';

/** Native atomic payload/index/config boundary. Validate every touched type before the first write: Lua errors do not roll back. */
export const LOGOUT_NAVIGATION_TICKET_SCRIPT = `
local function epoch(value)
  return type(value) == 'number' and value == value and math.abs(value) <= 8640000000000000 and value == math.floor(value)
end
local function hash(value)
  return type(value) == 'string' and #value == 43 and string.match(value, '^[A-Za-z0-9_-]+$') ~= nil
    and string.match(string.sub(value, 43), '^[AEIMQUYcgkosw048]$') ~= nil
end
local function identity(member)
  return type(member) == 'string' and string.sub(member, 1, 21) == 'logout-navigation:v1:'
    and #member == 108 and string.sub(member, 65, 65) == ':'
    and hash(string.sub(member, 22, 64)) and hash(string.sub(member, 66))
end
local function keyType(key, expected)
  local kind = redis.call('TYPE', key)['ok']
  if kind ~= 'none' and kind ~= expected then error('OIDC vault Redis logout navigation key has unexpected type') end
end
local function accountingError()
  error('OIDC vault Redis logout navigation configuration/accounting is inconsistent')
end
local function record(raw, member, now)
  local ok, value = pcall(cjson.decode, raw)
  if not ok or type(value) ~= 'table' then return nil end
  local count = 0
  for key, _ in pairs(value) do
    if key ~= 'namespace' and key ~= 'ticketHash' and key ~= 'upstreamLogoutUrl' and key ~= 'createdAt' and key ~= 'expiresAt' then return nil end
    count = count + 1
  end
  if count ~= 5 or type(value['namespace']) ~= 'string' or type(value['ticketHash']) ~= 'string'
    or value['namespace'] .. ':' .. value['ticketHash'] ~= member
    or not epoch(value['createdAt']) or not epoch(value['expiresAt'])
    or value['expiresAt'] - value['createdAt'] < 1000 or value['expiresAt'] - value['createdAt'] > 120000
    or value['expiresAt'] <= now or value['expiresAt'] - now > 120000
    or type(value['upstreamLogoutUrl']) ~= 'string' or #value['upstreamLogoutUrl'] > 16384 then return nil end
  return value
end
local mode, member, prefix, max = ARGV[1], ARGV[2], ARGV[3], tonumber(ARGV[4])
if not identity(member) then error('OIDC vault Redis logout navigation identity is invalid') end
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if not epoch(now) then error('OIDC vault Redis logout navigation store clock is invalid') end
local incoming = nil
if mode == 'create' then
  incoming = record(ARGV[5], member, now)
  if incoming == nil then return -1 end
end
keyType(KEYS[1], 'string')
keyType(KEYS[2], 'zset')
keyType(KEYS[3], 'string')
local config = redis.call('GET', KEYS[3])
local count = redis.call('ZCARD', KEYS[2])
if (config ~= false and config ~= ARGV[4]) or count > max or (config == false and count > 0) then accountingError() end
local latest = redis.call('ZREVRANGE', KEYS[2], 0, 0, 'WITHSCORES')
if #latest > 0 and (not identity(latest[1]) or not epoch(tonumber(latest[2]))) then accountingError() end
local raw = redis.call('GET', KEYS[1])
local score = redis.call('ZSCORE', KEYS[2], member)
if score ~= false and not epoch(tonumber(score)) then accountingError() end
if raw ~= false and (score == false or config == false) then accountingError() end
local selected = raw ~= false and record(raw, member, now) or nil
if selected ~= nil and selected['expiresAt'] ~= tonumber(score) then accountingError() end
-- A still-live ledger protects even an early-disappeared payload from reuse.
if mode == 'create' and score ~= false and tonumber(score) > now and (raw == false or selected ~= nil) then return 2 end
local expired = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', now, 'WITHSCORES', 'LIMIT', 0, 65)
local cleanup = {}
for i = 1, #expired, 2 do
  local other, deadline = expired[i], tonumber(expired[i + 1])
  if other ~= member and #cleanup < 64 then
    if not identity(other) or not epoch(deadline) then accountingError() end
    local key = prefix .. other
    keyType(key, 'string')
    local otherRaw = redis.call('GET', key)
    if otherRaw ~= false then
      local otherRecord = record(otherRaw, other, now)
      if otherRecord ~= nil then accountingError() end
    end
    table.insert(cleanup, other)
  end
end
-- All type/config/accounting validation has completed. No unbounded work follows.
for _, other in ipairs(cleanup) do
  redis.call('DEL', prefix .. other)
  redis.call('ZREM', KEYS[2], other)
end
if score ~= false then redis.call('ZREM', KEYS[2], member) end
if raw ~= false then redis.call('DEL', KEYS[1]) end
if mode == 'create' then
  if redis.call('ZCARD', KEYS[2]) >= max then return 3 end
  if config == false then redis.call('SET', KEYS[3], ARGV[4]) end
  redis.call('SET', KEYS[1], ARGV[5], 'PXAT', string.format('%.0f', incoming['expiresAt']))
  redis.call('ZADD', KEYS[2], incoming['expiresAt'], member)
end
local last = redis.call('ZREVRANGE', KEYS[2], 0, 0, 'WITHSCORES')
if #last > 0 then
  if tonumber(last[2]) > now then redis.call('PEXPIREAT', KEYS[2], string.format('%.0f', tonumber(last[2])))
  else redis.call('PERSIST', KEYS[2]) end
end
if mode == 'create' then return 1 end
-- URL syntax is also revalidated by the caller after atomic retirement; invalid
-- payloads are burned, never restored or redirected. No read/delete gap exists.
if selected ~= nil then return raw end
return false
`;

export const buildLogoutNavigationTicketCommand = (
  keys: RedisOidcVaultStoreKeys,
  input: ConsumeLogoutNavigationTicketInput,
  maxEntries: number,
  creating?: OidcVaultLogoutNavigationTicket,
): string[] => [
  'EVAL',
  LOGOUT_NAVIGATION_TICKET_SCRIPT,
  '3',
  keys.logoutNavigationTicket(ticketId(input)),
  keys.logoutNavigationExpiries(),
  keys.logoutNavigationCapacity(),
  creating ? 'create' : 'consume',
  ticketId(input),
  keys.logoutNavigationTicketPrefix(),
  String(maxEntries),
  creating ? JSON.stringify(creating) : '',
];
