import type { EmailClock } from '../../src';
import { defineLocalTemplate, defineSendGridTemplate } from '../../src';

export const NOW = 1_700_000_000_000;
export const SCOPE = 'Tenant-1';
export const FROM = { address: 'sender@example.invalid', name: 'Synthetic sender' };
export const TO = { address: 'Receiver@xn--example.invalid' };
export const SMTP = { kind: 'smtp', key: 'smtp-profile', mode: 'live' } as const;
export const SENDGRID = { kind: 'sendgrid', key: 'sg-profile', mode: 'sandbox' } as const;
export const TEMPLATE_ID = `d-${'a1'.repeat(16)}`;
export const ATTACHMENT = {
  resolverKey: 'files',
  id: 'report.1',
  version: 'v1',
  filename: 'Résumé.pdf',
  contentType: 'application/pdf',
  byteLength: 3,
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
};

export const inline = (content: string) => ({ kind: 'inline', content }) as const;
export const parseTitle = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0) throw new Error('synthetic private title validation');
  return value;
};
export const parseValues = (data: unknown) => ({ title: parseTitle((data as { title?: unknown }).title) });

export const local = defineLocalTemplate({
  kind: 'handlebars',
  revision: 'rev1',
  defaults: { from: FROM },
  subject: inline(' Hello {{title}} '),
  html: inline('<p>{{title}}</p>'),
  text: inline('Hello {{title}}\n'),
  parseInput: parseTitle,
  parseData: parseValues,
  prepare: (title) => ({ to: [TO], values: { title } }),
});

export const remote = defineSendGridTemplate({
  kind: 'sendgrid',
  revision: 'rev1',
  defaults: { from: FROM },
  templateId: TEMPLATE_ID,
  parseInput: parseTitle,
  parseData: parseValues,
  prepare: async (title) => ({ to: [TO], values: { title } }),
});

export const command = {
  templateKey: 'local',
  key: { kind: 'single', idempotencyKey: 'command_1' },
  input: '<a>&"',
  provider: SMTP,
  intent: { id: '1', type: 'test' },
} as const;
export const remoteCommand = { ...command, templateKey: 'remote', provider: SENDGRID } as const;

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export class ManualClock implements EmailClock {
  wall = NOW;
  ticks = 0;
  readonly waits: number[] = [];
  readonly timers = new Set<{ at: number; finish: () => void }>();

  now() {
    return this.wall;
  }

  monotonicNow() {
    return this.ticks;
  }

  sleep(ms: number, signal: AbortSignal): Promise<void> {
    this.waits.push(ms);
    return new Promise((resolve, reject) => {
      const finish = () => {
        this.timers.delete(timer);
        signal.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => {
        this.timers.delete(timer);
        signal.removeEventListener('abort', abort);
        reject(signal.reason);
      };
      const timer = { at: this.ticks + ms, finish };
      if (signal.aborted) return abort();
      this.timers.add(timer);
      signal.addEventListener('abort', abort, { once: true });
    });
  }

  advance(ms: number): void {
    this.ticks += ms;
    for (const timer of this.timers) if (timer.at <= this.ticks) timer.finish();
  }
}
