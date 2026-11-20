import { describe, expect, it, vi } from 'vitest';
import { createEmailTemplateRegistry, defineSendGridTemplate, EmailError, type PrepareContext } from '../../src';
import { DEFAULT_EXPIRY_MS, MAX_EXPIRY_MS, MESSAGE_LIMITS as L } from '../../src/constants';
import {
  ATTACHMENT,
  command,
  deferred,
  FROM,
  inline,
  local,
  ManualClock,
  NOW,
  remote,
  remoteCommand,
  SCOPE,
  SENDGRID,
  SMTP,
  TO,
} from './template-fixtures';

describe('template registry', () => {
  it('prepares both variants without submitting, preserves plain text and escapes HTML by default', async () => {
    const registry = createEmailTemplateRegistry({ local, remote }, { clock: new ManualClock() });
    const smtp = await registry.prepare(SCOPE, command);
    expect(smtp.snapshot).toEqual({
      kind: 'smtp',
      version: 1,
      provider: SMTP,
      template: { key: 'local', revision: 'rev1' },
      preparedAt: NOW,
      expiresAt: NOW + DEFAULT_EXPIRY_MS,
      envelope: { from: FROM, to: [TO], cc: [], bcc: [] },
      attachments: [],
      correlation: {},
      priority: 0,
      subject: ' Hello <a>&" ',
      html: '<p>&lt;a&gt;&amp;&quot;</p>',
      text: 'Hello <a>&"\n',
    });
    expect(smtp.scheduleAt).toBeNull();
    expect(smtp).not.toHaveProperty('input');
    expect(smtp).not.toHaveProperty('intent');
    const sg = await registry.prepare(SCOPE, remoteCommand);
    expect(sg.snapshot).toMatchObject({
      provider: SENDGRID,
      kind: 'sendgrid',
      templateId: remote.templateId,
      data: { title: command.input },
    });
    expect(sg.snapshot).not.toHaveProperty('subject');
    expect(Object.isFrozen(smtp)).toBe(true);
    expect(Object.isFrozen(sg.snapshot)).toBe(true);
    expect(Object.isFrozen(sg.snapshot.envelope.from)).toBe(true);
    expect(Object.isFrozen(sg.snapshot.envelope.to)).toBe(true);
    expect(Object.isFrozen(sg.snapshot.provider)).toBe(true);
  });

  it('rejects malformed commands, missing definitions and provider mismatches before any template callback', async () => {
    const parseInput = vi.fn(local.parseInput);
    const parseData = vi.fn(local.parseData);
    const prepare = vi.fn(local.prepare);
    const load = vi.fn(() => 'body');
    const registry = createEmailTemplateRegistry(
      { local: { ...local, parseInput, parseData, prepare, html: { kind: 'async', load } }, remote },
      { clock: new ManualClock() },
    );
    const call = (value: unknown, scope = SCOPE) =>
      registry.prepare(scope, value as Parameters<typeof registry.prepare>[1]);
    const getter = vi.fn(() => {
      throw new Error('must not run');
    });
    for (const invalid of [
      { ...command, scheduleAt: null },
      { ...command, scheduleAt: -1 },
      { ...command, scheduleAt: 1.5 },
      { ...command, provider: { ...SMTP, mode: 'sandbox' } },
      { ...command, provider: { ...SMTP, key: 'bad\n' } },
      { ...command, provider: { ...SMTP, apiKey: 'not-a-profile-ref' } },
      { ...command, provider: { ...SMTP, kind: 'unknown' } },
      { ...command, key: { ...command.key, itemId: '1' } },
      { ...command, key: { kind: 'batch', batchId: 'b1' } },
      { ...command, intent: { toJSON: getter } },
      { ...command, intent: undefined },
      {
        ...command,
        get input() {
          return getter();
        },
      },
      { ...command, extra: true },
    ])
      await expect(call(invalid)).rejects.toMatchObject({ code: 'invalid_command' });
    await expect(call(command, 'a'.repeat(65))).rejects.toMatchObject({ code: 'invalid_command' });
    await expect(call({ ...command, templateKey: 'not-registered' })).rejects.toMatchObject({
      code: 'template_not_found',
    });
    await expect(call({ ...command, provider: SENDGRID })).rejects.toMatchObject({ code: 'provider_mismatch' });
    await expect(call({ ...remoteCommand, provider: SMTP })).rejects.toMatchObject({ code: 'provider_mismatch' });
    expect(parseInput).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(parseData).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(getter).not.toHaveBeenCalled();
  });

  it('redacts host errors at the stage that failed and rejects raw or parsed non-JSON data', async () => {
    const prepare = vi.fn(local.prepare);
    const inputRegistry = createEmailTemplateRegistry({ local: { ...local, prepare } });
    await expect(inputRegistry.prepare(SCOPE, { ...command, input: '' })).rejects.toMatchObject({
      code: 'invalid_input',
      message: 'Invalid template input.',
    });
    expect(prepare).not.toHaveBeenCalled();
    const failing = createEmailTemplateRegistry({
      local: {
        ...local,
        prepare: async () => {
          throw new EmailError('aborted');
        },
      },
      remote: {
        ...remote,
        parseData: (): ReturnType<typeof remote.parseData> => {
          throw new Error('synthetic private values');
        },
      },
    });
    await expect(failing.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'preparation_failed' });
    const error = await failing.prepare(SCOPE, remoteCommand).catch((error: unknown) => error);
    expect(error).toMatchObject({ code: 'invalid_data', message: 'Invalid prepared template data.' });
    expect(error).not.toHaveProperty('cause');

    const accessor = vi.fn(() => {
      throw new Error('must remain uncalled');
    });
    const parseData = vi.fn(remote.parseData);
    const invalidRaw = createEmailTemplateRegistry({
      remote: {
        ...remote,
        parseData,
        prepare: () => ({
          to: [TO],
          values: {
            get title() {
              return accessor();
            },
          },
        }),
      },
    });
    await expect(invalidRaw.prepare(SCOPE, remoteCommand)).rejects.toMatchObject({ code: 'invalid_data' });
    expect(accessor).not.toHaveBeenCalled();
    expect(parseData).not.toHaveBeenCalled();
    for (const title of ['\ud800', '\n'.repeat(L.dataBytes / 2), '\0'.repeat(L.dataBytes / 6)]) {
      const tooLarge = createEmailTemplateRegistry({ local: { ...local, parseData: () => ({ title }) } });
      await expect(tooLarge.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'invalid_data' });
    }
    const raw = { to: [TO], values: { title: 'value' } };
    const unsafeFields = [
      Object.defineProperty({ ...raw }, 'then', { get: accessor, enumerable: true }),
      new Proxy(raw, { get: accessor, getPrototypeOf: accessor, ownKeys: accessor }),
    ];
    for (const fields of unsafeFields) {
      const registry = createEmailTemplateRegistry({ remote: { ...remote, parseData, prepare: () => fields } });
      await expect(registry.prepare(SCOPE, remoteCommand)).rejects.toMatchObject({ code: 'invalid_snapshot' });
    }
    expect(accessor).not.toHaveBeenCalled();
    expect(parseData).not.toHaveBeenCalled();
  });

  it('validates configuration and holds detached defaults, callback references and sources', async () => {
    const subject = { ...inline('Original {{title}}') };
    const from = { ...FROM };
    const definition = { ...local, subject, defaults: { from }, parseInput: vi.fn(local.parseInput) };
    const original = definition.parseInput;
    const definitions = { local: definition };
    const registry = createEmailTemplateRegistry(definitions);
    definitions.local = { ...definition, subject: inline('Replacement') };
    definition.parseInput = vi.fn(() => 'changed');
    from.address = 'fake@example.invalid';
    subject.content = 'Other {{title}}';
    const result = await registry.prepare(SCOPE, command);
    expect(result.snapshot).toMatchObject({ subject: 'Original <a>&"', envelope: { from: FROM } });
    expect(original).toHaveBeenCalledWith(command.input);
    expect(definition.parseInput).not.toHaveBeenCalled();
    const configError = expect.objectContaining({ code: 'invalid_config' });
    expect(() => createEmailTemplateRegistry({ remote: { ...remote, templateId: 'static-id' } })).toThrow(configError);
    expect(() => createEmailTemplateRegistry({ local }, { cacheEntries: 129 })).toThrow(configError);
    expect(() => createEmailTemplateRegistry({ local }, { maxPending: 0 })).toThrow(configError);
    expect(() => createEmailTemplateRegistry({ local }, { maxPending: 33 })).toThrow(configError);
    expect(() =>
      createEmailTemplateRegistry({ local: { ...local, defaults: { from: { address: 'invalid\r\n' } } } }),
    ).toThrow(configError);
  });

  it('applies only address defaults and validates overrides, grouping, timestamps and priority', async () => {
    const clock = new ManualClock();
    const sender = { address: 'override@example.invalid' };
    const replyTo = { address: 'reply@example.invalid' };
    const expiresAt = NOW + MAX_EXPIRY_MS;
    const prepare = vi.fn((title: string, ctx: PrepareContext) => {
      expect(ctx).toMatchObject({ scope: SCOPE, key: command.key, templateKey: 'local', provider: SMTP, now: NOW });
      expect(Object.isFrozen(ctx)).toBe(true);
      return {
        from: sender,
        bcc: [TO],
        priority: 9,
        expiresAt,
        attachments: [ATTACHMENT],
        correlation: { trace: 'abc-123' },
        values: { title },
      };
    });
    const registry = createEmailTemplateRegistry(
      { local: { ...local, defaults: { from: FROM, replyTo }, prepare } },
      { clock },
    );
    const staged = await registry.prepare(SCOPE, { ...command, scheduleAt: expiresAt - 1 });
    expect(staged.snapshot).toMatchObject({
      envelope: { from: sender, to: [], cc: [], bcc: [TO], replyTo },
      attachments: [ATTACHMENT],
      priority: 9,
      expiresAt,
      correlation: { trace: 'abc-123' },
    });
    expect(Object.isFrozen(staged.snapshot.attachments[0])).toBe(true);
    expect(Object.isFrozen(staged.snapshot.correlation)).toBe(true);
    await expect(registry.prepare(SCOPE, { ...command, scheduleAt: expiresAt })).rejects.toMatchObject({
      code: 'invalid_snapshot',
    });
    for (const fields of [{ expiresAt: NOW }, { expiresAt: expiresAt + 1 }, { priority: 10 }, { priority: 0.5 }]) {
      const invalid = createEmailTemplateRegistry(
        { local: { ...local, prepare: (title: string) => ({ ...fields, to: [TO], values: { title } }) } },
        { clock },
      );
      await expect(invalid.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'invalid_snapshot' });
    }
    const badEnvelope = createEmailTemplateRegistry(
      { remote: { ...remote, prepare: (title: string) => ({ bcc: [TO], values: { title } }) } },
      { clock },
    );
    await expect(badEnvelope.prepare(SCOPE, remoteCommand)).rejects.toMatchObject({ code: 'invalid_snapshot' });
  });

  it('detaches synchronous results before yielding to microtasks or async sources', async () => {
    const source = deferred<string>();
    const started = deferred<void>();
    const to = { ...TO };
    const attachment = { ...ATTACHMENT };
    const ctx = { trace: 'first' };
    const commandProvider = { ...SMTP, key: String(SMTP.key) };
    const intent = { id: 'original' };
    const values = { title: 'before' };
    const registry = createEmailTemplateRegistry({
      local: {
        ...local,
        prepare: () => {
          queueMicrotask(() => {
            values.title = 'after';
            to.address = 'other@example.invalid';
            attachment.filename = 'replacement.txt';
            ctx.trace = 'rewritten';
            commandProvider.key = 'changed';
            intent.id = 'rewritten';
          });
          return { to: [to], attachments: [attachment], correlation: ctx, values };
        },
        html: {
          kind: 'async',
          load: () => {
            started.resolve();
            return source.promise;
          },
        },
      },
    });
    const result = registry.prepare(SCOPE, { ...command, provider: commandProvider, intent });
    await started.promise;
    expect(values.title).toBe('after');
    source.resolve('<p>{{title}}</p>');
    expect((await result).snapshot).toMatchObject({
      envelope: { to: [TO] },
      provider: SMTP,
      attachments: [ATTACHMENT],
      correlation: { trace: 'first' },
      subject: ' Hello before ',
      html: '<p>before</p>',
    });
  });

  it('snapshots async results in their fulfillment observer and supports trusted method thenables', async () => {
    const result = deferred<{ to: (typeof TO)[]; values: { nested: { title: string }[] } }>();
    const parsed = vi.fn((data: unknown) => data as { nested: { title: string }[] });
    const registry = createEmailTemplateRegistry({
      remote: defineSendGridTemplate({
        ...remote,
        parseData: parsed,
        prepare: () => result.promise,
      }),
    });
    const pending = registry.prepare(SCOPE, remoteCommand);
    const values = { nested: [{ title: 'before' }] };
    result.resolve({ to: [TO], values });
    queueMicrotask(() => {
      values.nested[0]!.title = 'after';
    });
    const staged = await pending;
    expect(staged.snapshot).toMatchObject({ data: { nested: [{ title: 'before' }] } });
    if (staged.snapshot.kind !== 'sendgrid') throw new Error('expected SendGrid');
    const data = staged.snapshot.data as typeof values;
    expect(Object.isFrozen(data)).toBe(true);
    expect(Object.isFrozen(data.nested)).toBe(true);
    expect(Object.isFrozen(data.nested[0])).toBe(true);
    expect(parsed).toHaveBeenCalledOnce();

    const thenable: PromiseLike<{ values: { title: string }; to: (typeof TO)[] }> = {
      then: (...args) => Promise.resolve({ values: { title: 'resolved' }, to: [TO] }).then(...args),
    };
    const custom = createEmailTemplateRegistry({ remote: { ...remote, prepare: () => thenable } });
    await expect(custom.prepare(SCOPE, remoteCommand)).resolves.toMatchObject({
      snapshot: { data: { title: 'resolved' } },
    });

    const promise = Promise.resolve({ values: { title: 'native' }, to: [TO] });
    const getter = vi.fn(() => {
      throw new Error('must not inspect a native promise instance method');
    });
    Object.defineProperty(promise, 'then', { get: getter });
    const native = createEmailTemplateRegistry({ remote: { ...remote, prepare: () => promise } });
    await expect(native.prepare(SCOPE, remoteCommand)).resolves.toMatchObject({
      snapshot: { data: { title: 'native' } },
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it('validates the raw fulfillment of a data-method thenable without assimilating metadata', async () => {
    const fields = { to: [TO], values: { title: 'first' } };
    const accessor = vi.fn(() => (fulfill: (value: typeof fields) => void) => fulfill(fields));
    const malformed = Object.defineProperty({ ...fields }, 'then', { get: accessor, enumerable: true });
    // A method-based callback can deliver a value directly, without using a native Promise's resolver.
    const supplied = (value: typeof fields) =>
      ({
        then(fulfill: (value: typeof fields) => void) {
          fulfill(value);
          value.values = { title: 'later' };
          fulfill({ to: [TO], values: { title: 'second' } });
        },
      }) as unknown as PromiseLike<typeof fields>;
    const prepare = vi.fn<typeof remote.prepare>().mockReturnValueOnce(supplied(malformed));
    prepare.mockReturnValueOnce(supplied(fields));
    const parseData = vi.fn(remote.parseData);
    const registry = createEmailTemplateRegistry({ remote: { ...remote, prepare, parseData } }, { maxPending: 1 });

    await expect(registry.prepare(SCOPE, remoteCommand)).rejects.toMatchObject({ code: 'invalid_snapshot' });
    expect(accessor).not.toHaveBeenCalled();
    expect(parseData).not.toHaveBeenCalled();
    await expect(registry.prepare(SCOPE, remoteCommand)).resolves.toMatchObject({
      snapshot: { data: { title: 'first' } },
    });
    expect(fields.values.title).toBe('later');
    expect(parseData).toHaveBeenCalledOnce();
  });
});
