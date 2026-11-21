import type { AttachmentRef } from '../contracts/message';
import { invalid } from './validation';

/** Check already-validated refs for SMTP sendability, not for historical wire or store compatibility. */
export function assertSmtpAttachmentTypes(refs: readonly AttachmentRef[]): void {
  // The SMTP adapter encodes opaque bytes as leaf parts; composite MIME carries structure of its own.
  if (refs.some(({ contentType }) => /^(?:message|multipart)\//.test(contentType))) invalid('invalid_snapshot');
}
