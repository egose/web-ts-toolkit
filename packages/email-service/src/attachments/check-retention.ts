import { types } from 'node:util';
import { MESSAGE_LIMITS } from '../constants';
import type { PreparedEmailCommand } from '../contracts/message';
import { bindMethod, readPortMember } from '../internal/callbacks';
import { validatePreparedCommand } from '../internal/command-codecs';
import { validateAttachmentRef } from '../internal/message-codecs';
import { readCapacityOption } from '../internal/smtp-capacity';
import { identifier, invalid, readArray, readRecord, scopeToken } from '../internal/validation';
import type {
  ManagedAttachmentPreparationOptions,
  ManagedAttachmentReceipt,
  ManagedAttachmentStore,
} from './contracts';
import { managedDeadline, sameAttachmentRef } from './records';

/**
 * Validate and detach a frozen staging DTO, then check each configured managed ref against its local
 * writer proof and the actual snapshot expiry. Pass trusted, exhaustive bindings. No storage access;
 * persist only the returned DTO and relay it unchanged. Queue freshness checks still apply.
 */
export function checkManagedAttachmentRetention(
  prepared: PreparedEmailCommand,
  options: ManagedAttachmentPreparationOptions,
): PreparedEmailCommand {
  const code = 'attachment_retention';
  const raw = readRecord(options, ['scope', 'stores', 'receipts'], ['smtpCapacity'], 'invalid_config');
  const scope = scopeToken(raw.scope, 'invalid_config');
  const capacity = readCapacityOption(raw);
  const bindings = new Map<string, ManagedAttachmentStore['assertReceipt']>();
  // There is no message-sized limit on the host's exhaustive binding list.
  readArray(raw.stores, Number.MAX_SAFE_INTEGER, 'invalid_config', (store) => {
    const key = identifier(readPortMember(store, 'resolverKey'), 'invalid_config');
    if (bindings.has(key)) invalid('invalid_config');
    bindings.set(key, bindMethod<ManagedAttachmentStore['assertReceipt']>(store, 'assertReceipt'));
  });

  let checked: PreparedEmailCommand;
  try {
    checked = validatePreparedCommand(scope, prepared, capacity);
  } catch {
    return invalid('invalid_snapshot');
  }
  const receipts = readArray(raw.receipts, MESSAGE_LIMITS.attachments, code, (receipt) => {
    const value = readRecord(receipt, ['ref', 'deliverBy'], [], code);
    return {
      receipt: receipt as ManagedAttachmentReceipt,
      ref: validateAttachmentRef(value.ref, code),
      deliverBy: managedDeadline(value.deliverBy, code),
      used: false,
    };
  });
  let managed = false;
  const expiresAt = checked.snapshot.expiresAt;
  for (const ref of checked.snapshot.attachments) {
    const assertReceipt = bindings.get(ref.resolverKey);
    if (!assertReceipt) continue;
    const match =
      receipts.find((entry) => !entry.used && sameAttachmentRef(entry.ref, ref)) ??
      receipts.find((entry) => sameAttachmentRef(entry.ref, ref));
    if (!match || expiresAt > match.deliverBy) invalid(code);
    try {
      const result: unknown = assertReceipt(match.receipt, scope, expiresAt);
      if (types.isPromise(result)) void Promise.prototype.then.call(result, undefined, () => {});
      if (result !== undefined) invalid(code);
    } catch {
      invalid(code);
    }
    match.used = true;
    managed = true;
  }
  if (!managed || receipts.some(({ used }) => !used)) invalid(code);
  return checked;
}
