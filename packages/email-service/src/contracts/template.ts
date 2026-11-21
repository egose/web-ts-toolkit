import type {
  AttachmentRef,
  Awaitable,
  CallOptions,
  Correlation,
  EmailAdmissionKey,
  EmailClock,
  EmailEnvelope,
  EmailScope,
  JsonObject,
  JsonValue,
  PreparedEmailCommand,
  ProviderRef,
  SmtpCapacity,
  UnixMs,
} from './message';

export type PrepareContext = {
  readonly scope: EmailScope;
  readonly key: EmailAdmissionKey;
  readonly templateKey: string;
  readonly provider: ProviderRef;
  readonly now: UnixMs;
  readonly signal: AbortSignal;
};

/** Host-generated fields. Only From and Reply-To can come from template defaults. */
export type PreparedFields<D extends JsonObject> = Partial<EmailEnvelope> & {
  values: D;
  expiresAt?: UnixMs;
  priority?: number;
  attachments?: readonly AttachmentRef[];
  correlation?: Correlation;
};

/** Trusted, explicitly configured content. Do not derive file paths from command input. */
export type LocalSource =
  | { kind: 'inline'; content: string }
  | { kind: 'file'; path: string }
  | { kind: 'async'; load: (context: { signal: AbortSignal }) => Awaitable<string> };

export type TemplateDefinition<I, D extends JsonObject> = {
  revision: string;
  defaults?: Pick<Partial<EmailEnvelope>, 'from' | 'replyTo'>;
  /** Synchronously validate the host's opaque business input. */
  parseInput: (input: unknown) => I;
  /** Synchronously validate or normalize a detached JSON object. Return a new object to change it. */
  parseData: (data: unknown) => D;
  /** May run again after a crash or overlapping admission misses; keep side effects idempotent. */
  prepare: (input: NoInfer<I>, context: PrepareContext) => Awaitable<PreparedFields<NoInfer<D>>>;
};

export type LocalTemplateConfig = {
  kind: 'handlebars';
  subject: LocalSource;
} & ({ html: LocalSource; text?: LocalSource } | { html?: LocalSource; text: LocalSource });

export type SendGridTemplateConfig = { kind: 'sendgrid'; templateId: string };
export type LocalTemplate<I, D extends JsonObject> = TemplateDefinition<I, D> & LocalTemplateConfig;
export type SendGridTemplate<I, D extends JsonObject> = TemplateDefinition<I, D> & SendGridTemplateConfig;

// `never` lets each concrete preparer accept its own parsed input. It is not the public command input.
export type TemplateMap = Readonly<
  Record<
    string,
    Omit<TemplateDefinition<never, JsonObject>, 'parseInput'> & {
      parseInput: (input: unknown) => unknown;
    } & (LocalTemplateConfig | SendGridTemplateConfig)
  >
>;

export type TemplateDefinitions<T extends TemplateMap> = T & {
  [K in keyof T]: TemplateDefinition<ReturnType<T[K]['parseInput']>, ReturnType<T[K]['parseData']>>;
};

/** The key determines the input and provider kind. `intent` describes stable business meaning, not rendered data. */
export type TemplateCommand<T extends TemplateMap> = {
  [K in keyof T & string]: {
    templateKey: K;
    input: ReturnType<T[K]['parseInput']>;
    provider: Extract<ProviderRef, { kind: T[K]['kind'] extends 'handlebars' ? 'smtp' : 'sendgrid' }>;
    intent: JsonValue;
    scheduleAt?: UnixMs;
  };
}[keyof T & string];

/** A typed command with scoped idempotency. Keep its `key` and `intent` stable when retrying admission. */
export type EmailCommand<T extends TemplateMap> = TemplateCommand<T> & { key: EmailAdmissionKey };

export type TemplateRegistryOptions = {
  /** Prepare only local SMTP messages under this binding. Use the same tuple for their admission. */
  smtpCapacity?: SmtpCapacity;
  clock?: EmailClock;
  cacheEntries?: number;
  maxPending?: number;
  /** Trusted synchronous Handlebars helpers registered only in this registry. */
  helpers?: Readonly<Record<string, (...args: unknown[]) => unknown>>;
};

export interface EmailTemplateRegistry<T extends TemplateMap> {
  readonly smtpCapacity?: SmtpCapacity;
  /** Prepare a detached snapshot without using a queue or contacting a provider. */
  prepare(scope: EmailScope, command: EmailCommand<T>, options?: CallOptions): Promise<PreparedEmailCommand>;
  /** Evict one or all compilation cache entries and fence their prior in-flight loads. */
  invalidate(templateKey?: keyof T & string): void;
}
