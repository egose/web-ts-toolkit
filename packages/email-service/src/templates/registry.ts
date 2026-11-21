import {
  CALL_BUDGETS,
  DEFAULT_EXPIRY_MS,
  EMAIL_FORMAT_VERSION,
  MESSAGE_LIMITS,
  PRIORITY,
  TEMPLATE_CACHE_ENTRIES,
  TEMPLATE_MAX_PENDING,
} from '../constants';
import type { CallOptions, EmailEnvelope, EmailSnapshot, JsonObject, PreparedEmailCommand } from '../contracts/message';
import type {
  EmailCommand,
  EmailTemplateRegistry,
  LocalSource,
  LocalTemplate,
  PrepareContext,
  SendGridTemplate,
  TemplateDefinitions,
  TemplateMap,
  TemplateRegistryOptions,
} from '../contracts/template';
import {
  createBudget,
  createChildBudget,
  readCallOptions,
  readClock,
  syncStage,
  type OperationBudget,
} from '../internal/budget';
import { CallbackSlot, requireCallback, runHostCallback, runSyncCallback } from '../internal/callbacks';
import { copyJsonObject } from '../internal/canonical-json';
import { parseCommandIdentity, type ParsedEmailCommand } from '../internal/command-codecs';
import {
  hashSnapshot,
  sendGridTemplateId,
  validateAttachmentRefs,
  validateCorrelation,
  validateEnvelope,
  validateExpiry,
  validateMailbox,
} from '../internal/message-codecs';
import { assertSmtpAttachmentTypes } from '../internal/smtp-attachments';
import {
  assertCapacityProvider,
  capacityTag,
  readCapacityOption,
  type CapacityContext,
} from '../internal/smtp-capacity';
import { boundedOption, identifier, invalid, ownData, plainKeys, readRecord, unixMs } from '../internal/validation';
import { createLocalRenderer } from './local-renderer';
import { readSourceConfig } from './local-sources';

/** Type a local template. Input and data are inferred from the parsers; the registry validates the configuration. */
export function defineLocalTemplate<I, D extends JsonObject>(definition: LocalTemplate<I, D>): LocalTemplate<I, D> {
  return definition;
}

/** Type a SendGrid template from its input/data parsers. Does not register or pin a remote template version. */
export function defineSendGridTemplate<I, D extends JsonObject>(
  definition: SendGridTemplate<I, D>,
): SendGridTemplate<I, D> {
  return definition;
}

type Definition = Readonly<{
  revision: string;
  defaults: Pick<Partial<EmailEnvelope>, 'from' | 'replyTo'>;
  parseInput: (value: unknown) => unknown;
  parseData: (value: unknown) => unknown;
  prepare: (input: unknown, context: PrepareContext) => unknown;
}> &
  (
    | Readonly<{ kind: 'handlebars'; subject: LocalSource; html?: LocalSource; text?: LocalSource }>
    | Readonly<{ kind: 'sendgrid'; templateId: string }>
  );

function readDefinition(value: unknown): Definition {
  const code = 'invalid_config';
  const raw = readRecord(
    value,
    ['kind', 'revision', 'parseInput', 'parseData', 'prepare'],
    ['defaults', 'subject', 'html', 'text', 'templateId'],
    code,
  );
  const defaults = readRecord(raw.defaults === undefined ? {} : raw.defaults, [], ['from', 'replyTo'], code);
  const base = {
    revision: identifier(raw.revision, code),
    defaults: Object.freeze({
      ...(defaults.from === undefined ? {} : { from: validateMailbox(defaults.from, code) }),
      ...(defaults.replyTo === undefined ? {} : { replyTo: validateMailbox(defaults.replyTo, code) }),
    }),
    parseInput: requireCallback(raw.parseInput) as Definition['parseInput'],
    parseData: requireCallback(raw.parseData) as Definition['parseData'],
    // Dispatch always pairs this callback with the input parser of this same definition.
    prepare: requireCallback(raw.prepare) as Definition['prepare'],
  };
  if (raw.kind === 'sendgrid' && !['subject', 'html', 'text'].some((key) => Object.hasOwn(raw, key))) {
    return Object.freeze({ ...base, kind: raw.kind, templateId: sendGridTemplateId(raw.templateId, code) });
  }
  if (raw.kind === 'handlebars' && !Object.hasOwn(raw, 'templateId')) {
    const subject = readSourceConfig(raw.subject);
    const html = raw.html === undefined ? undefined : readSourceConfig(raw.html);
    const text = raw.text === undefined ? undefined : readSourceConfig(raw.text);
    if (!html && !text) invalid(code);
    return Object.freeze({ ...base, kind: raw.kind, subject, ...(html ? { html } : {}), ...(text ? { text } : {}) });
  }
  return invalid(code);
}

function captureFields(
  raw: unknown,
  definition: Definition,
  context: PrepareContext,
  scheduleAt: number | null,
  budget: OperationBudget,
  slot: CallbackSlot,
  capacity?: CapacityContext,
) {
  const code = 'invalid_snapshot';
  const fields = readRecord(
    raw,
    ['values'],
    ['from', 'replyTo', 'to', 'cc', 'bcc', 'expiresAt', 'priority', 'attachments', 'correlation'],
    code,
  );
  const from = fields.from === undefined ? definition.defaults.from : fields.from;
  const replyTo = fields.replyTo === undefined ? definition.defaults.replyTo : fields.replyTo;
  const envelope = validateEnvelope(
    {
      from,
      to: fields.to === undefined ? [] : fields.to,
      cc: fields.cc === undefined ? [] : fields.cc,
      bcc: fields.bcc === undefined ? [] : fields.bcc,
      ...(replyTo === undefined ? {} : { replyTo }),
    },
    context.provider.kind,
    code,
    capacity,
  );
  const expiresAt = validateExpiry(
    fields.expiresAt === undefined ? context.now + DEFAULT_EXPIRY_MS : fields.expiresAt,
    context.now,
    scheduleAt,
  );
  const priority = boundedOption(fields.priority, PRIORITY, code);
  const attachments = validateAttachmentRefs(fields.attachments === undefined ? [] : fields.attachments);
  if (context.provider.kind === 'smtp') assertSmtpAttachmentTypes(attachments);
  const correlation = validateCorrelation(fields.correlation === undefined ? {} : fields.correlation);
  const values = copyJsonObject(fields.values, MESSAGE_LIMITS.dataBytes, 'invalid_data');
  const { parseData } = definition;
  const parsed = runSyncCallback(budget, slot, 'invalid_data', () => parseData(values));
  const data = parsed === values ? values : copyJsonObject(parsed, MESSAGE_LIMITS.dataBytes, 'invalid_data');
  budget.check();
  return { envelope, expiresAt, priority, attachments, correlation, data };
}

type RegistryPreparation = (parsed: ParsedEmailCommand, parent: OperationBudget) => Promise<PreparedEmailCommand>;
const registryPreparations = new WeakMap<object, RegistryPreparation>();

/** Local factory products can reuse their original callback slots, even when shared by multiple services. */
export function findRegistryPreparation(registry: object): RegistryPreparation | undefined {
  return registryPreparations.get(registry);
}

/** Copy trusted template configuration into an isolated registry. Preparation never contacts a provider or queue. */
export function createEmailTemplateRegistry<const T extends TemplateMap>(
  definitions: TemplateDefinitions<T>,
  options: TemplateRegistryOptions = {},
): EmailTemplateRegistry<T> {
  const code = 'invalid_config';
  const config = readRecord(options, [], ['clock', 'cacheEntries', 'maxPending', 'helpers', 'smtpCapacity'], code);
  const capacity = readCapacityOption(config);
  const clock = readClock(config.clock);
  const maxPending = boundedOption(config.maxPending, capacity?.limits.registryPending ?? TEMPLATE_MAX_PENDING);
  const renderer = createLocalRenderer(
    boundedOption(config.cacheEntries, capacity?.limits.registryCache ?? TEMPLATE_CACHE_ENTRIES),
    config.helpers,
  );
  const registered = new Map<string, Definition>();
  for (const key of plainKeys(definitions, Infinity, code)) {
    const definition = readDefinition(ownData(definitions, key, code));
    if (capacity && definition.kind !== 'handlebars') invalid(code);
    registered.set(identifier(key, code), definition);
  }
  let pending = 0;

  async function prepareParsed(
    { identity, command: safe }: ParsedEmailCommand,
    budget: OperationBudget,
  ): Promise<PreparedEmailCommand> {
    budget.check();
    const { templateKey, provider, key, scheduleAt } = identity;
    assertCapacityProvider(provider, capacity, 'provider_mismatch');
    const definition = registered.get(templateKey);
    if (!definition) invalid('template_not_found');
    if ((definition.kind === 'handlebars' ? 'smtp' : 'sendgrid') !== provider.kind) invalid('provider_mismatch');
    if (pending >= maxPending) invalid('busy');
    pending++;
    const slot = new CallbackSlot(() => pending--);
    try {
      const now = syncStage(budget, code, () => unixMs(clock.now(), code));
      const context = Object.freeze({
        scope: identity.scope,
        key,
        templateKey,
        provider,
        now,
        signal: budget.signal,
      });
      const { parseInput, prepare } = definition;
      const input = runSyncCallback(budget, slot, 'invalid_input', () => parseInput(safe.input));
      const { data, ...fields } = await runHostCallback(
        budget,
        slot,
        'preparation_failed',
        () => prepare(input, context),
        (raw) => captureFields(raw, definition, context, scheduleAt, budget, slot, capacity),
      );
      budget.check();
      const base = {
        ...fields,
        version: EMAIL_FORMAT_VERSION,
        template: Object.freeze({ key: templateKey, revision: definition.revision }),
        preparedAt: now,
      } as const;
      let snapshot: EmailSnapshot;
      if (provider.kind === 'smtp' && definition.kind === 'handlebars') {
        const content = await renderer.render(templateKey, definition, data, budget, slot);
        snapshot = Object.freeze({ ...base, kind: provider.kind, provider, ...capacityTag(capacity), ...content });
      } else if (provider.kind === 'sendgrid' && definition.kind === 'sendgrid') {
        snapshot = Object.freeze({ ...base, kind: provider.kind, provider, templateId: definition.templateId, data });
      } else {
        return invalid('provider_mismatch');
      }
      budget.check();
      const snapshotHash = hashSnapshot(snapshot, capacity);
      budget.check();
      return Object.freeze({
        version: EMAIL_FORMAT_VERSION,
        ...capacityTag(capacity),
        scope: identity.scope,
        key,
        scheduleAt,
        intentHash: identity.intentHash,
        fingerprint: identity.fingerprint,
        snapshotHash,
        snapshot,
      });
    } finally {
      slot.close();
    }
  }

  const registry: EmailTemplateRegistry<T> = Object.freeze({
    ...capacityTag(capacity),
    invalidate(key?: keyof T & string): void {
      if (key !== undefined) identifier(key, code);
      renderer.invalidate(key);
    },
    async prepare(scope: string, command: EmailCommand<T>, options: CallOptions = {}): Promise<PreparedEmailCommand> {
      const call = readCallOptions(options, CALL_BUDGETS.prepare);
      const budget = createBudget(clock, call.timeoutMs, call.signal);
      try {
        budget.check();
        return await prepareParsed(parseCommandIdentity(scope, command, capacity), budget);
      } finally {
        budget.close();
      }
    },
  });
  registryPreparations.set(registry, async (parsed, parent) => {
    const budget = createChildBudget(clock, parent, CALL_BUDGETS.prepare.default);
    try {
      return await prepareParsed(parsed, budget);
    } finally {
      budget.close();
    }
  });
  return registry;
}
