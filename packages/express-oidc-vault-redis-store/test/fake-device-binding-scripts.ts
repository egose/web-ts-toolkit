import {
  CONSUME_GUARDED_RECORD_SCRIPT,
  RESERVE_DPOP_PROOF_SCRIPT,
  SESSION_REVOCATION_CONTEXT_SCRIPT,
} from '../src/scripts';
import { validateAuthorizationTransaction, validateExchangeCodeRecord } from '../src/records';

/** Deterministic server-clock emulator only; real Lua/independent connections are covered in dpop-live.test.ts. */
export const emulateDeviceBindingScript = (
  script: string,
  keys: string[],
  args: string[],
  state: {
    records: Map<string, { value: string; expiresAt?: number }>;
    sortedIndexes: Map<string, Map<string, number>>;
    now: number;
  },
): { result: unknown } | undefined => {
  const get = (key: string) => {
    const row = state.records.get(key);
    if (row?.expiresAt !== undefined && row.expiresAt <= state.now) state.records.delete(key);
    return state.records.get(key)?.value;
  };
  if (script === CONSUME_GUARDED_RECORD_SCRIPT) {
    const raw = get(keys[0]!);
    if (raw === undefined) return { result: null };
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      state.records.delete(keys[0]!);
      return { result: null };
    }
    const valid =
      args[0] === 'transaction'
        ? validateAuthorizationTransaction(record, args[1]!)
        : validateExchangeCodeRecord(record, args[1]!);
    if (!valid || (args[2] !== 'legacy' && record.expiresAt <= state.now)) {
      state.records.delete(keys[0]!);
      return { result: null };
    }
    const match = args[2] === 'legacy' ? { deviceBinding: null, browserBindingHash: null } : JSON.parse(args[3]!);
    if (
      (match.deviceBinding === null
        ? record.deviceBinding !== undefined
        : record.deviceBinding?.jkt !== match.deviceBinding?.jkt) ||
      (match.browserBindingHash === null
        ? record.browserBindingHash !== undefined
        : record.browserBindingHash !== match.browserBindingHash) ||
      (args[0] === 'exchange' && args[2] !== 'legacy' && record.sessionId !== args[4])
    )
      return { result: null };
    state.records.delete(keys[0]!);
    return { result: raw };
  }
  if (script === RESERVE_DPOP_PROOF_SCRIPT) {
    const expiresAt = Number(args[1]);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= state.now || expiresAt - state.now > 360_000)
      return { result: 0 };
    const index = state.sortedIndexes.get(keys[0]!) ?? new Map<string, number>();
    const existing = index.get(args[0]!);
    if (existing !== undefined && existing > state.now) return { result: 0 };
    const expired = [...index]
      .filter(([, expiry]) => expiry <= state.now)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 64);
    for (const [id] of expired) index.delete(id);
    if (existing !== undefined) index.delete(args[0]!);
    if (index.size >= Number(args[2])) return { result: 2 };
    index.set(args[0]!, expiresAt);
    state.sortedIndexes.set(keys[0]!, index);
    return { result: 1 };
  }
  if (script === SESSION_REVOCATION_CONTEXT_SCRIPT) {
    const raw = get(keys[0]!);
    const primary = raw === undefined ? undefined : JSON.parse(raw);
    const alias = get(keys[1]!);
    const logicalId =
      primary && (primary.expiresAt === undefined || primary.expiresAt > state.now)
        ? (primary.logicalSessionId ?? primary.sessionId)
        : alias === undefined
          ? undefined
          : JSON.parse(alias);
    if (logicalId === undefined) return { result: null };
    const members = state.sortedIndexes.get(`${args[2]}${logicalId}`) ?? new Map();
    let source = primary && (primary.expiresAt === undefined || primary.expiresAt > state.now) ? primary : undefined;
    for (const id of members.keys()) {
      const raw = get(`${args[1]}${id}`);
      if (raw === undefined) continue;
      const row = JSON.parse(raw);
      if (
        (row.logicalSessionId ?? row.sessionId) !== logicalId ||
        (row.expiresAt !== undefined && row.expiresAt <= state.now)
      )
        continue;
      if (
        source &&
        (source.deviceBinding?.jkt !== row.deviceBinding?.jkt ||
          source.subject !== row.subject ||
          source.provider?.issuer !== row.provider?.issuer ||
          source.provider?.clientId !== row.provider?.clientId)
      ) {
        throw new Error('OIDC vault Redis lineage has inconsistent device binding or provider identity');
      }
      source ??= row;
    }
    return {
      result:
        source === undefined
          ? null
          : JSON.stringify({
              logicalSessionId: logicalId,
              ...(source.deviceBinding === undefined ? {} : { deviceBinding: source.deviceBinding }),
              ...(source.provider === undefined
                ? {}
                : { provider: { issuer: source.provider.issuer, clientId: source.provider.clientId } }),
            }),
    };
  }
  return undefined;
};
