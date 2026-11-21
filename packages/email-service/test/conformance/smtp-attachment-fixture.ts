import type { PreparedEmailCommand } from '../../src';
import { hashSnapshot } from '../../src/internal/message-codecs';
import { readCapacityOption } from '../../src/internal/smtp-capacity';

export const COMPOSITE_TYPES = ['message/rfc822', 'multipart/mixed'] as const;

/** Make a staged test value an older registry could have produced. MIME changes the snapshot hash, not the identity. */
export function stagedWithContentType(staged: PreparedEmailCommand, contentType: string): PreparedEmailCommand {
  const last = staged.snapshot.attachments.at(-1);
  if (!last) throw new Error('Expected a staged attachment');
  const snapshot = {
    ...staged.snapshot,
    attachments: [...staged.snapshot.attachments.slice(0, -1), { ...last, contentType }],
  };
  return { ...staged, snapshot, snapshotHash: hashSnapshot(snapshot, readCapacityOption(staged)) };
}
