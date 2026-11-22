/** Safe, stable diagnostics; no application data or transport-response text. */
export type EmailErrorCode =
  | 'invalid_config'
  | 'invalid_command'
  | 'invalid_input'
  | 'invalid_data'
  | 'invalid_snapshot'
  | 'preparation_failed'
  | 'template_not_found'
  | 'template_source'
  | 'template_render'
  | 'provider_mismatch'
  | 'expired'
  | 'attachment_conflict'
  | 'attachment_retention'
  | 'idempotency_conflict'
  | 'not_found'
  | 'resolution_conflict'
  | 'store_capacity'
  | 'store_unavailable'
  | 'store_incompatible'
  | 'write_unconfirmed'
  | 'invalid_cursor'
  | 'aborted'
  | 'deadline'
  | 'busy'
  | 'closed';

const messages = Object.freeze({
  invalid_config: 'Invalid email service configuration.',
  invalid_command: 'Invalid email command.',
  invalid_input: 'Invalid template input.',
  invalid_data: 'Invalid prepared template data.',
  invalid_snapshot: 'Invalid prepared email snapshot.',
  preparation_failed: 'Email preparation failed.',
  template_not_found: 'Email template not found.',
  template_source: 'Email template source could not be loaded.',
  template_render: 'Email template could not be rendered.',
  provider_mismatch: 'Email provider does not match the template or snapshot.',
  expired: 'Email has expired.',
  attachment_conflict: 'Managed email attachment identity is already used with different content.',
  attachment_retention: 'Managed email attachment retention could not be certified.',
  idempotency_conflict: 'Email admission key was used with different intent.',
  not_found: 'Email job not found.',
  resolution_conflict: 'Unknown attempt cannot be resolved with this action.',
  store_capacity: 'Email store is at capacity.',
  store_unavailable: 'Email store is unavailable.',
  store_incompatible: 'Email store does not meet the required guarantees.',
  write_unconfirmed: 'Email store write not confirmed; it may have committed.',
  invalid_cursor: 'Invalid email activity cursor.',
  aborted: 'Email operation was aborted.',
  deadline: 'Email operation deadline elapsed.',
  busy: 'Email service has no available capacity for this operation.',
  closed: 'Email service is closed.',
} satisfies Record<EmailErrorCode, string>);

/**
 * Narrow a caught `unknown` to a known `.code`, not class identity. Independently bundled
 * entrypoints can throw different classes even within one format (all ESM or all CommonJS).
 */
export class EmailError extends Error {
  /** `write_unconfirmed` does not mean that a dispatched mutation failed to commit. */
  readonly code: EmailErrorCode;

  constructor(code: EmailErrorCode) {
    // JS callers can bypass the union; never coerce or include an unknown value.
    const safeCode = typeof code === 'string' && Object.hasOwn(messages, code) ? code : 'invalid_config';
    super(messages[safeCode]);
    this.name = 'EmailError';
    this.code = safeCode;
  }
}
