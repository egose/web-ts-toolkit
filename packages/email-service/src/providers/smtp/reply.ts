// RFC 5321 reply lines are at most 512 octets including CRLF. Bound the
// aggregate too: an unterminated multiline reply must not grow indefinitely.
const MAX_LINE = 512;
const MAX_REPLY = 16 * 1024;
const REPLY_LINE = /^([2-5][0-5]\d)(?:([- ])([\t\x20-\x7e\x80-\xff]*))?(?![\s\S])/;

export type SmtpReply = Readonly<{ code: number; lines: readonly string[] }>;

/** One complete reply for one outstanding command, with no pipelined or unsolicited bytes. */
export class SmtpReplyReader {
  #pending = '';
  #size = 0;
  #code: number | undefined;
  #lines: string[] = [];

  push(chunk: Buffer): SmtpReply | undefined {
    this.#size += chunk.length;
    if (this.#size > MAX_REPLY) throw new Error('Invalid SMTP reply');
    // All syntax is ASCII; latin1 also makes length limits independent of UTF-8 chunk boundaries.
    const data = this.#pending + chunk.toString('latin1');
    let start = 0;
    for (let end = data.indexOf('\n'); end !== -1; end = data.indexOf('\n', start)) {
      if (end - start + 1 > MAX_LINE || data[end - 1] !== '\r') throw new Error('Invalid SMTP reply');
      const match = REPLY_LINE.exec(data.slice(start, end - 1));
      const code = Number(match?.[1]);
      if (!match || (this.#code !== undefined && this.#code !== code)) throw new Error('Invalid SMTP reply');
      this.#code = code;
      this.#lines.push(match[3] ?? '');
      start = end + 1;
      if (match[2] !== '-') {
        if (start !== data.length) throw new Error('Unexpected SMTP bytes');
        return { code, lines: this.#lines };
      }
    }
    this.#pending = data.slice(start);
    if (this.#pending.length >= MAX_LINE) throw new Error('Invalid SMTP reply');
  }
}
