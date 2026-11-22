import type { AttachmentRef } from '../../src';
import { managedCloudRuleId } from '../../src/attachments/cloud-records';
import { managedAttachmentBoundary, managedAttachmentKey } from '../../src/attachments/records';
import { MANAGED_BINDING } from '../conformance/managed-attachment-fixture';

export const PREFIX = 'deliveries/Invoices_v1/';
export const BOUNDARY = PREFIX + managedAttachmentBoundary(MANAGED_BINDING.namespace);
export const RULE_ID = managedCloudRuleId(MANAGED_BINDING.namespace);
export const RULE = Object.freeze({
  ID: RULE_ID,
  Filter: { Prefix: BOUNDARY },
  Status: 'Enabled',
  Expiration: { Days: 32 },
} as const);

export function objectKey(scope: string, ref: AttachmentRef): string {
  return PREFIX + managedAttachmentKey(MANAGED_BINDING.namespace, scope, ref);
}
