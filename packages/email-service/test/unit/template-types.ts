// Compile-only public API checks. This file is included by the package typecheck, not Vitest.
import { expectTypeOf } from 'vitest';
import {
  createEmailBatchService,
  createEmailTemplateRegistry,
  createEmailService,
  createMemoryEmailStore,
  defineLocalTemplate,
  defineSendGridTemplate,
  type EmailCommand,
  type AdmissionResult,
  type EmailBatchItem,
  type EmailBatchResult,
  type EmailRunReport,
  type EmailWorker,
  type LocalTemplateConfig,
  type PrepareContext,
  type PreparedEmailCommand,
  type TemplateCommand,
  type TemplateDefinitions,
} from '../../src';

const to = [{ address: 'recipient@example.invalid' }];
const definitions = {
  welcome: defineLocalTemplate({
    kind: 'handlebars',
    revision: 'v1',
    subject: { kind: 'inline', content: '{{name}}' },
    text: { kind: 'inline', content: 'Hello {{name}}' },
    parseInput: (input) => ({ userId: String(input) }),
    parseData: (data) => ({ name: String(data) }),
    prepare(input, context) {
      expectTypeOf(input).toEqualTypeOf<{ userId: string }>();
      expectTypeOf(context).toEqualTypeOf<PrepareContext>();
      return { to, values: { name: input.userId } };
    },
  }),
  receipt: defineSendGridTemplate({
    kind: 'sendgrid',
    revision: 'v2',
    templateId: `d-${'a'.repeat(32)}`,
    parseInput: (input) => Number(input),
    parseData: (data) => ({ cents: Number(data) }),
    async prepare(input) {
      expectTypeOf(input).toEqualTypeOf<number>();
      return { to, values: { cents: input } };
    },
  }),
};

expectTypeOf<ReturnType<typeof definitions.welcome.parseData>>().toEqualTypeOf<{ name: string }>();
expectTypeOf<ReturnType<typeof definitions.receipt.parseData>>().toEqualTypeOf<{ cents: number }>();
const checked: TemplateDefinitions<typeof definitions> = definitions;
const registry = createEmailTemplateRegistry(checked);
const welcome = {
  templateKey: 'welcome',
  provider: { kind: 'smtp', key: 'smtp-profile', mode: 'live' },
  intent: { userId: '1' },
  input: { userId: '1' },
} satisfies TemplateCommand<typeof definitions>;
const receipt = {
  templateKey: 'receipt',
  provider: { kind: 'sendgrid', key: 'sendgrid-profile', mode: 'sandbox' },
  intent: 200,
  input: 200,
} satisfies TemplateCommand<typeof definitions>;
const key = { kind: 'single', idempotencyKey: 'command1' } as const;

export function verifyCommandDiscriminant(cmd: EmailCommand<typeof definitions>) {
  if (cmd.templateKey === 'receipt') {
    expectTypeOf(cmd.input).toEqualTypeOf<number>();
    expectTypeOf(cmd.provider.kind).toEqualTypeOf<'sendgrid'>();
  } else {
    expectTypeOf(cmd.input).toEqualTypeOf<{ userId: string }>();
    expectTypeOf(cmd.provider.kind).toEqualTypeOf<'smtp'>();
  }
}

export function verifyPreparation() {
  expectTypeOf(registry.prepare('scope', { ...welcome, key })).toEqualTypeOf<Promise<PreparedEmailCommand>>();
  void registry.prepare('scope', { ...receipt, key });
  // @ts-expect-error A receipt's input cannot be used with the local template key.
  void registry.prepare('scope', { ...welcome, key, input: receipt.input });
  // @ts-expect-error A SendGrid profile cannot be used for a local template.
  void registry.prepare('scope', { ...welcome, key, provider: receipt.provider });
  // @ts-expect-error SendGrid requires the SendGrid discriminant, not SMTP.
  void registry.prepare('scope', { ...receipt, key, provider: welcome.provider });
  // @ts-expect-error The template key must exist in this registry.
  registry.invalidate('unknown-template');
}

export async function verifyAdmission() {
  const service = createEmailService({ scope: 'scope', store: createMemoryEmailStore(), registry });
  expectTypeOf(service.enqueue({ ...welcome, key })).toEqualTypeOf<Promise<AdmissionResult>>();
  void service.enqueue({ ...receipt, key });
  // @ts-expect-error Admission must preserve the registry's inferred business input for each key.
  void service.enqueue({ ...welcome, key, input: receipt.input });
  // @ts-expect-error Admission must preserve the registry's provider kind for each key.
  void service.enqueue({ ...receipt, key, provider: welcome.provider });
  // @ts-expect-error Unknown key in the selected registry.
  void service.enqueue({ ...welcome, key, templateKey: 'unknown-template' });
  const prepared = await registry.prepare('scope', { ...welcome, key });
  const result = await service.enqueuePrepared(prepared);
  // @ts-expect-error The public summary is readonly.
  result.job.key.kind = 'batch';
}

export async function verifyBatch(worker: EmailWorker) {
  const service = createEmailService({ scope: 'scope', store: createMemoryEmailStore(), registry });
  const batch = createEmailBatchService({ service, worker });
  const items = [
    { itemId: 'welcome', command: welcome },
    { itemId: 'receipt', command: receipt },
  ] as const satisfies readonly EmailBatchItem<typeof definitions>[];
  expectTypeOf(batch.enqueueBatch({ batchId: 'mixed', items })).toEqualTypeOf<Promise<EmailBatchResult>>();
  expectTypeOf(batch.run()).toEqualTypeOf<Promise<EmailRunReport>>();
  void batch.enqueueBatch({
    batchId: 'wrong-input',
    // @ts-expect-error Batch preserves the inferred input for each template key.
    items: [{ itemId: 'welcome', command: { ...welcome, input: receipt.input } }],
  });
  void batch.enqueueBatch({
    batchId: 'wrong-provider',
    // @ts-expect-error Batch preserves the kind of each template's provider.
    items: [{ itemId: 'receipt', command: { ...receipt, provider: welcome.provider } }],
  });
  void batch.enqueueBatch({
    batchId: 'caller-key',
    // @ts-expect-error The caller supplies itemId, not a command admission key.
    items: [{ itemId: 'welcome', command: { ...welcome, key } }],
  });
  const result = await batch.enqueueBatch({ batchId: 'mixed', items });
  // @ts-expect-error The ordered result list is readonly.
  result.items.reverse();
  // @ts-expect-error Counts are readonly.
  result.counts.enqueued = 10;
  for (const item of result.items) {
    if (item.status === 'enqueued' || item.status === 'replayed') {
      // @ts-expect-error Summaries do not expose snapshots.
      void item.job.snapshot;
    } else if (item.status === 'not_started') {
      // @ts-expect-error Unstarted items have no diagnostic error.
      void item.code;
    }
  }
}

const localConfig = {
  kind: 'handlebars',
  subject: { kind: 'inline', content: 'Subject' },
  text: { kind: 'inline', content: 'Body' },
} satisfies LocalTemplateConfig;

export function verifyParserConsistency() {
  defineLocalTemplate({
    ...localConfig,
    revision: 'v1',
    parseInput: String,
    parseData: () => ({ count: 1 }),
    // @ts-expect-error Data comes from parseData; prepare is not another source of inference.
    prepare: () => ({ values: { count: '1' }, to }),
  });
  defineSendGridTemplate({
    kind: 'sendgrid',
    templateId: `d-${'a'.repeat(32)}`,
    revision: 'v1',
    parseInput: Number,
    parseData: () => ({ count: 1 }),
    // @ts-expect-error Input comes from parseInput; a string preparer cannot handle it.
    prepare: (input: string) => ({ values: { count: input.length }, to }),
  });
  const raw = { bad: { ...definitions.receipt, prepare: () => ({ values: { wrong: true }, to }) } };
  // @ts-expect-error The mapped registry constraint catches inconsistent raw definitions too.
  createEmailTemplateRegistry(raw);
  const rawInput = {
    bad: { ...definitions.receipt, prepare: (input: string) => ({ values: { cents: input.length }, to }) },
  };
  // @ts-expect-error The mapped registry constraint catches incorrect raw input callbacks.
  createEmailTemplateRegistry(rawInput);
}
