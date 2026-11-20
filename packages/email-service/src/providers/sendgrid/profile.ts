import { SENDGRID_DEFAULT_MODE, SENDGRID_REQUEST_MAX_BYTES } from '../../constants';
import type { Mailbox } from '../../contracts/message';
import type {
  EmailProvider,
  PreparedEmailSubmission,
  ProviderSubmission,
  SendGridSnapshot,
} from '../../contracts/provider';
import { readProviderResult } from '../../internal/attempt-codecs';
import { readProviderCall, readProviderSubmission } from '../../internal/provider-preparation';
import { headerString, identifier, invalid, readRecord } from '../../internal/validation';
import { submitSendGrid, type SendGridIo } from './submit';

function mailbox({ address, name }: Mailbox) {
  return { email: address, ...(name === undefined ? {} : { name }) };
}

function encode({ snapshot, attachments }: ProviderSubmission<SendGridSnapshot>): Buffer {
  const { envelope, templateId, data, provider } = snapshot;
  const { from, replyTo, to, cc, bcc } = envelope;
  const payload = JSON.stringify({
    personalizations: [
      {
        to: to.map(mailbox),
        ...(cc.length ? { cc: cc.map(mailbox) } : {}),
        ...(bcc.length ? { bcc: bcc.map(mailbox) } : {}),
        dynamic_template_data: data,
      },
    ],
    from: mailbox(from),
    ...(replyTo ? { reply_to: mailbox(replyTo) } : {}),
    template_id: templateId,
    ...(provider.mode === 'sandbox' ? { mail_settings: { sandbox_mode: { enable: true } } } : {}),
    ...(attachments.length
      ? {
          attachments: attachments.map(({ ref, bytes }) => ({
            content: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64'),
            filename: ref.filename,
            type: ref.contentType,
            disposition: 'attachment',
          })),
        }
      : {}),
  });
  // The shared preflight bounds the inputs. Independently bound the actual UTF-8 JSON before handoff.
  if (Buffer.byteLength(payload) > SENDGRID_REQUEST_MAX_BYTES) invalid('invalid_snapshot');
  return Buffer.from(payload);
}

/** Internal transport injection only. The public factory never accepts it. */
export function createSendGridProfile(options: unknown, io?: SendGridIo): EmailProvider<SendGridSnapshot> {
  const code = 'invalid_config';
  const raw = readRecord(options, ['key', 'apiKey'], ['mode'], code);
  const mode = Object.hasOwn(raw, 'mode') ? raw.mode : SENDGRID_DEFAULT_MODE;
  if (mode !== 'live' && mode !== 'sandbox') invalid(code);
  const key = identifier(raw.key, code);
  const apiKey = headerString(raw.apiKey, 1_024, code);
  if (!/^[A-Za-z0-9._~+/-]+=*$/.test(apiKey)) invalid(code);
  const ref = Object.freeze({ kind: 'sendgrid', key, mode } as const);
  const provider: EmailProvider<SendGridSnapshot> = {
    ref,
    prepare(input) {
      const prepared = readProviderSubmission(input, ref);
      const {
        attemptId,
        snapshot: { envelope },
      } = prepared;
      let body: Buffer | undefined = encode(prepared);
      return Object.freeze({
        async submit(context) {
          if (!body) invalid('closed');
          const call = readProviderCall(context);
          const payload = body;
          body = undefined;
          const result = await submitSendGrid(mode, apiKey, payload, call, io);
          return readProviderResult(result, ref, attemptId, envelope);
        },
      } satisfies PreparedEmailSubmission);
    },
  };
  return Object.freeze(provider);
}
