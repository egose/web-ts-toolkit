import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { createEmailTemplateRegistry } from '../../src';
import { MESSAGE_LIMITS as L } from '../../src/constants';
import { command, deferred, inline, local, ManualClock, SCOPE } from './template-fixtures';

describe('local rendering and source cache', () => {
  it('does not inherit other helpers/partials, install global extensions or log context', async () => {
    const require = createRequire(import.meta.url);
    const extensions = { ...require.extensions };
    const { default: Handlebars } = await import('handlebars/dist/cjs/handlebars.js');
    Handlebars.registerHelper('emailServiceSyntheticGlobalHelper', () => 'global helper');
    Handlebars.registerPartial('emailServiceSyntheticGlobalPartial', 'global partial');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const rawHelpers = { tag: () => 'one', emailServiceSyntheticGlobalHelper: () => 'registry helper' };
      const defs = { local: { ...local, subject: inline('{{tag}} {{emailServiceSyntheticGlobalHelper}}') } };
      const a = createEmailTemplateRegistry(defs, { helpers: rawHelpers });
      const b = createEmailTemplateRegistry(defs, { helpers: { ...rawHelpers, tag: () => 'two' } });
      rawHelpers.tag = () => 'mutated';
      await expect(a.prepare(SCOPE, command)).resolves.toHaveProperty('snapshot.subject', 'one registry helper');
      await expect(b.prepare(SCOPE, command)).resolves.toHaveProperty('snapshot.subject', 'two registry helper');
      const missing = createEmailTemplateRegistry(defs, { helpers: { tag: () => 'three' } });
      await expect(missing.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'template_render' });
      for (const html of [inline('{{> emailServiceSyntheticGlobalPartial}}'), inline('{{log title}}')]) {
        const isolated = createEmailTemplateRegistry({ local: { ...local, html } });
        await expect(isolated.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'template_render' });
      }
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(require.extensions).toEqual(extensions);
    } finally {
      Handlebars.unregisterHelper('emailServiceSyntheticGlobalHelper');
      Handlebars.unregisterPartial('emailServiceSyntheticGlobalPartial');
      log.mockRestore();
      error.mockRestore();
    }
  });

  it('enforces strict missing values, header controls and nonempty bodies with redacted render errors', async () => {
    for (const options of [
      { subject: inline('{{title}}') },
      { html: inline('{{missing}}') },
      { html: inline('{{#if title}}') },
      { html: inline(''), text: inline('') },
      { text: inline('{{oversize}}') },
    ]) {
      const registry = createEmailTemplateRegistry(
        { local: { ...local, ...options } },
        { helpers: { oversize: () => 'é'.repeat(L.textBytes / 2 + 1) } },
      );
      const input = options.subject ? 'Title\r\nBcc: missing@example.invalid' : 'title';
      await expect(registry.prepare(SCOPE, { ...command, input })).rejects.toMatchObject({
        code: 'template_render',
        message: 'Email template could not be rendered.',
      });
    }
  });

  it('does not expose prototype methods from array data', async () => {
    const arrayTemplate = {
      ...local,
      html: inline('{{#each title}}<p>{{this}}</p>{{/each}} {{#if (lookup title "push")}}BAD{{else}}safe{{/if}}'),
      subject: inline('Subject'),
      text: inline('Body'),
      parseData: (data: unknown) => data as { title: string[] },
      prepare: (title: string) => ({ to: [{ address: 'person@example.invalid' }], values: { title: [title] } }),
    };
    const registry = createEmailTemplateRegistry({ local: arrayTemplate });
    await expect(registry.prepare(SCOPE, command)).resolves.toHaveProperty(
      'snapshot.html',
      '<p>&lt;a&gt;&amp;&quot;</p> safe',
    );
  });

  it('bounds inline and async sources in strict UTF-8 and never caches an incomplete/failed compilation', async () => {
    const subject = vi.fn(() => 'Subject');
    let body: string | undefined = 'é'.repeat(L.templateSourceBytes / 2 + 1);
    const html = vi.fn(() => body as string);
    const registry = createEmailTemplateRegistry({
      local: {
        ...local,
        subject: { kind: 'async', load: subject },
        html: { kind: 'async', load: html },
      },
    });
    for (const invalid of ['é'.repeat(L.templateSourceBytes / 2 + 1), '\ud800', undefined, '{{#if title}}']) {
      body = invalid;
      await expect(registry.prepare(SCOPE, command)).rejects.toMatchObject({
        code: invalid === '{{#if title}}' ? 'template_render' : 'template_source',
      });
    }
    body = 'é'.repeat(L.templateSourceBytes / 2);
    await expect(registry.prepare(SCOPE, command)).resolves.toHaveProperty('snapshot.html', body);
    body = 'not loaded';
    await expect(registry.prepare(SCOPE, command)).resolves.toHaveProperty(
      'snapshot.html',
      'é'.repeat(L.templateSourceBytes / 2),
    );
    expect(subject).toHaveBeenCalledTimes(5);
    expect(html).toHaveBeenCalledTimes(5);
    const invalidInline = createEmailTemplateRegistry({
      local: { ...local, html: inline(`${'a'.repeat(L.templateSourceBytes)}x`) },
    });
    await expect(invalidInline.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'template_source' });
  });

  it('uses LRU including hit promotion, scoped invalidation, and disabled caching', async () => {
    const loadA = vi.fn(() => 'A {{title}}');
    const loadB = vi.fn(() => 'B {{title}}');
    const loadC = vi.fn(() => 'C {{title}}');
    const defs = {
      a: { ...local, subject: { kind: 'async', load: loadA } as const },
      b: { ...local, subject: { kind: 'async', load: loadB } as const },
      c: { ...local, subject: { kind: 'async', load: loadC } as const },
    };
    const registry = createEmailTemplateRegistry(defs, { cacheEntries: 2 });
    for (const templateKey of ['a', 'b', 'a', 'c'] as const) await registry.prepare(SCOPE, { ...command, templateKey });
    await expect(
      registry.prepare(SCOPE, { ...command, templateKey: 'a', input: 'different input' }),
    ).resolves.toHaveProperty('snapshot.subject', 'A different input');
    await registry.prepare(SCOPE, { ...command, templateKey: 'b' });
    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).toHaveBeenCalledTimes(2);
    expect(loadC).toHaveBeenCalledTimes(1);
    registry.invalidate('a');
    await registry.prepare(SCOPE, { ...command, templateKey: 'b' });
    await registry.prepare(SCOPE, { ...command, templateKey: 'a' });
    expect(loadA).toHaveBeenCalledTimes(2);
    expect(loadB).toHaveBeenCalledTimes(2);
    const disabled = createEmailTemplateRegistry(defs, { cacheEntries: 0 });
    await disabled.prepare(SCOPE, { ...command, templateKey: 'a' });
    await disabled.prepare(SCOPE, { ...command, templateKey: 'a' });
    expect(loadA).toHaveBeenCalledTimes(4);
  });

  it.each(['key', 'all'] as const)('fences a prior in-flight loader on %s invalidation', async (variant) => {
    const first = deferred<string>();
    const started = deferred<void>();
    const load = vi
      .fn((): string | Promise<string> => 'New {{title}}')
      .mockImplementationOnce(() => {
        started.resolve();
        return first.promise;
      });
    const registry = createEmailTemplateRegistry(
      { local: { ...local, subject: { kind: 'async', load } } },
      { clock: new ManualClock() },
    );
    const old = registry.prepare(SCOPE, command);
    await started.promise;
    if (variant === 'key') registry.invalidate('local');
    else registry.invalidate();
    await expect(registry.prepare(SCOPE, command)).resolves.toHaveProperty('snapshot.subject', 'New <a>&"');
    first.resolve('Old {{title}}');
    await expect(old).resolves.toHaveProperty('snapshot.subject', 'Old <a>&"');
    await expect(registry.prepare(SCOPE, command)).resolves.toHaveProperty('snapshot.subject', 'New <a>&"');
    expect(load).toHaveBeenCalledTimes(2);
  });
});
