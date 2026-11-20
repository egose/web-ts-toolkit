import type { Readable } from 'node:stream';
import MailComposer, { type MailComposerAlternative } from 'nodemailer/lib/mail-composer';
import { encodeWord } from 'nodemailer/lib/mime-funcs';
import type { Mailbox } from '../../contracts/message';
import type { ProviderSubmission, RecipientResult, SmtpSnapshot } from '../../contracts/provider';
import { recipientGroups, smtpMessageId } from '../../internal/attempt-codecs';
import { invalid } from '../../internal/validation';

export type SmtpMessage = Readonly<{
  from: string;
  destinations: readonly Readonly<{ address: string; group: RecipientResult['group']; index: number }>[];
  messageId: string;
  openMimeStream(): Readable;
}>;

function body(content: string | undefined): MailComposerAlternative | undefined {
  // Encode the bytes, not line-normalized text, including an explicitly empty alternative.
  if (content !== undefined) return { content: Buffer.from(content, 'utf8'), contentTransferEncoding: 'base64' };
}

function addressHeader({ address, name }: Mailbox): string {
  return name ? `${encodeWord(name, 'B', 64)} <${address}>` : address;
}

export function prepareSmtpMessage({
  snapshot,
  attemptId,
  attachments,
}: ProviderSubmission<SmtpSnapshot>): SmtpMessage {
  const { from, to, cc, replyTo } = snapshot.envelope;
  const destinations = recipientGroups.flatMap((group) =>
    snapshot.envelope[group].map(({ address }, index) => Object.freeze({ address, group, index })),
  );
  const messageId = smtpMessageId(attemptId);
  try {
    const mime = new MailComposer({
      // Give the composer its own mutable address objects. It never sees Bcc or chooses the wire envelope.
      from: { ...from },
      ...(to.length ? { to: to.map((mailbox) => ({ ...mailbox })) } : {}),
      ...(cc.length ? { cc: cc.map((mailbox) => ({ ...mailbox })) } : {}),
      replyTo: replyTo && { ...replyTo },
      subject: encodeWord(snapshot.subject, 'B', 64),
      text: body(snapshot.text),
      html: body(snapshot.html),
      date: new Date(snapshot.preparedAt),
      messageId,
      attachments: attachments.map(({ ref, bytes }) => {
        // Composite MIME types carry structure of their own, not arbitrary Base64-encoded bytes.
        if (/^(?:multipart|message)\//.test(ref.contentType)) invalid('invalid_snapshot');
        return {
          filename: ref.filename,
          contentType: ref.contentType,
          content: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
          contentDisposition: 'attachment',
          contentTransferEncoding: 'base64',
        };
      }),
      disableFileAccess: true,
      disableUrlAccess: true,
      newline: 'win',
    }).compile();
    // Preserve the already-validated ASCII addr-spec, without the composer's domain rewriting.
    // Encode display names ourselves, never allowing caller headers or a raw MIME part.
    const addresses = new Map([
      ['From', addressHeader(from)],
      ['To', to.map(addressHeader).join(', ')],
      ['Cc', cc.map(addressHeader).join(', ')],
      ...(replyTo ? [['Reply-To', addressHeader(replyTo)] as const] : []),
    ]);
    const encode = mime.encodeHeaderValue.bind(mime);
    mime.encodeHeaderValue = (key, value) => addresses.get(key) ?? encode(key, value);
    return Object.freeze({
      from: from.address,
      destinations: Object.freeze(destinations),
      messageId,
      openMimeStream: () => mime.createReadStream(),
    });
  } catch {
    return invalid('invalid_snapshot');
  }
}
