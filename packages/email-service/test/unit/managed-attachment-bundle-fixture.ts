import { createManagedAttachmentStore } from '../../src/attachments/store';
import { MANAGED_BINDING, MemoryAttachmentBacking } from '../conformance/managed-attachment-fixture';

export { EmailError } from '../../src/errors';

// Deliberately bundled as a separate adapter entry, not imported by the public checker.
export function createFixtureWriter() {
  return createManagedAttachmentStore(MANAGED_BINDING, new MemoryAttachmentBacking());
}
