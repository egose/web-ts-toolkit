import { Readable } from 'node:stream';
import type { AttachmentRef } from '../contracts/message';
import type { EmailErrorCode } from '../errors';
import { sha256 } from '../internal/canonical-json';
import { attachmentByteView, copyAttachmentBytes } from '../internal/message-codecs';
import { invalid } from '../internal/validation';
import type { ManagedAttachmentRequest } from './backing';

/** The ref (including its expected length) must have passed V1 validation before allocating. */
export async function readManagedAttachmentBody(
  body: Uint8Array | Readable,
  ref: AttachmentRef,
  transportLength: number | undefined,
  request: ManagedAttachmentRequest,
  code: EmailErrorCode,
): Promise<Uint8Array> {
  request.check();
  if (transportLength !== undefined && transportLength !== ref.byteLength) invalid(code);
  if (!(body instanceof Readable)) return copyAttachmentBytes(ref, body, code);

  const bytes = new Uint8Array(ref.byteLength);
  const iterator = body.iterator({ destroyOnReturn: false });
  let length = 0;
  let eof = false;
  try {
    for (;;) {
      request.check();
      let chunk: IteratorResult<unknown>;
      try {
        chunk = await iterator.next();
      } catch {
        request.check();
        // Interrupted transport is different from an incorrect length at a clean EOF.
        return invalid('store_unavailable');
      }
      request.check();
      if (chunk.done) {
        eof = true;
        break;
      }
      const view = attachmentByteView(chunk.value, 0, bytes.length - length, code);
      bytes.set(view, length);
      length += view.length;
    }
  } finally {
    if (!eof) {
      body.destroy();
      const returned = iterator.return?.();
      if (returned) request.hold(returned);
    }
  }
  if (length !== ref.byteLength || sha256(bytes) !== ref.sha256) invalid(code);
  return bytes;
}
