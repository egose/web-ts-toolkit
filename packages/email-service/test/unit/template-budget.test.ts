import { getEventListeners } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createEmailTemplateRegistry, type PrepareContext, type PreparedFields } from '../../src';
import { command, deferred, inline, local, ManualClock, remote, remoteCommand, SCOPE, TO } from './template-fixtures';

describe('registry deadlines and bounded slots', () => {
  it('validates override limits and cleans the exact default/endpoint timers and abort listeners', async () => {
    const clock = new ManualClock();
    const parseInput = vi.fn(remote.parseInput);
    const registry = createEmailTemplateRegistry({ remote: { ...remote, parseInput } }, { clock });
    const { signal } = new AbortController();
    for (const timeoutMs of [49, 30_001, 50.1, NaN, Infinity]) {
      await expect(registry.prepare(SCOPE, remoteCommand, { signal, timeoutMs })).rejects.toMatchObject({
        code: 'invalid_config',
      });
    }
    expect(clock.waits).toEqual([]);
    expect(parseInput).not.toHaveBeenCalled();
    for (const opts of [{ signal }, { signal, timeoutMs: 50 }, { signal, timeoutMs: 30_000 }]) {
      const pending = registry.prepare(SCOPE, remoteCommand, opts);
      expect(getEventListeners(signal, 'abort')).toHaveLength(1);
      await pending;
      expect(clock.timers.size).toBe(0);
      expect(getEventListeners(signal, 'abort')).toHaveLength(0);
    }
    expect(clock.waits).toEqual([5_000, 50, 30_000]);
    const alreadyAborted = AbortSignal.abort(new Error('synthetic private reason'));
    await expect(registry.prepare(SCOPE, remoteCommand, { signal: alreadyAborted })).rejects.toMatchObject({
      code: 'aborted',
    });
    expect(parseInput).toHaveBeenCalledTimes(3);
    expect(clock.waits).toHaveLength(3);
  });

  it('holds capacity after timeout until an uncooperative preparer actually settles', async () => {
    const clock = new ManualClock();
    const gate = deferred<PreparedFields<{ title: string }>>();
    const parseData = vi.fn(local.parseData);
    const nextLoader = vi.fn(() => 'body');
    const prepare = vi.fn<typeof local.prepare>().mockReturnValueOnce(gate.promise).mockImplementation(local.prepare);
    const registry = createEmailTemplateRegistry(
      { local: { ...local, prepare, parseData, html: { kind: 'async', load: nextLoader } } },
      { clock, maxPending: 1 },
    );
    const parent = new AbortController();
    const first = registry.prepare(SCOPE, command, { timeoutMs: 50, signal: parent.signal });
    const ctx = prepare.mock.calls[0]?.[1] as PrepareContext;
    const timeout = expect(first).rejects.toMatchObject({ code: 'deadline' });
    clock.wall += 86_400_000; // Only monotonic time controls the timeout.
    clock.advance(49);
    expect(ctx.signal.aborted).toBe(false);
    await expect(registry.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'busy' });
    clock.advance(1);
    await timeout;
    expect(ctx.signal.aborted).toBe(true);
    expect(clock.timers.size).toBe(0);
    expect(getEventListeners(parent.signal, 'abort')).toHaveLength(0);
    await expect(registry.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'busy' });
    gate.resolve({ to: [TO], values: { title: 'late' } });
    await gate.promise;
    expect(parseData).not.toHaveBeenCalled();
    expect(nextLoader).not.toHaveBeenCalled();
    await expect(registry.prepare(SCOPE, command)).resolves.toMatchObject({ snapshot: { subject: ' Hello <a>&" ' } });
    expect(parseData).toHaveBeenCalledOnce();
    expect(nextLoader).toHaveBeenCalledOnce();
  });

  it('does not turn an early timer wake into a stopped call before the monotonic deadline', async () => {
    const clock = new ManualClock();
    const gate = deferred<PreparedFields<{ title: string }>>();
    const prepare = vi.fn<typeof remote.prepare>().mockReturnValue(gate.promise);
    const registry = createEmailTemplateRegistry({ remote: { ...remote, prepare } }, { clock });
    const pending = registry.prepare(SCOPE, remoteCommand, { timeoutMs: 50 });
    const failure = expect(pending).rejects.toMatchObject({ code: 'deadline' });
    clock.advance(20);
    for (const timer of clock.timers) timer.finish();
    await Promise.resolve();
    expect(clock.waits).toEqual([50, 30]);
    expect(prepare.mock.calls[0]?.[1].signal.aborted).toBe(false);
    clock.advance(30);
    await failure;
    gate.resolve({ values: { title: 'too late' }, to: [TO] });
    expect(clock.timers.size).toBe(0);
  });

  it('aborts an async loader without starting another part, rendering or using a late rejection', async () => {
    const clock = new ManualClock();
    const external = new AbortController();
    const gate = deferred<string>();
    const started = deferred<AbortSignal>();
    const subject = vi.fn(({ signal }: { signal: AbortSignal }) => {
      started.resolve(signal);
      return gate.promise;
    });
    const html = vi.fn(() => 'html');
    const registry = createEmailTemplateRegistry(
      { local: { ...local, subject: { kind: 'async', load: subject }, html: { kind: 'async', load: html } } },
      { clock, maxPending: 1 },
    );
    const pending = registry.prepare(SCOPE, command, { signal: external.signal });
    const signal = await started.promise;
    external.abort(new Error('synthetic private abort reason'));
    await expect(pending).rejects.toMatchObject({ code: 'aborted', message: 'Email operation was aborted.' });
    expect(signal.aborted).toBe(true);
    expect(clock.timers.size).toBe(0);
    await expect(registry.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'busy' });
    gate.reject(new Error('synthetic late callback failure'));
    await gate.promise.catch(() => undefined);
    expect(html).not.toHaveBeenCalled();
    const next = registry.prepare(SCOPE, command);
    await expect(next).rejects.toMatchObject({ code: 'template_source' });
    expect(subject).toHaveBeenCalledTimes(2);
    expect(html).not.toHaveBeenCalled();
  });

  it('does not start a new stage at the synchronous deadline boundary, even when the timer has not fired', async () => {
    const clock = new ManualClock();
    const prepare = vi.fn(remote.prepare);
    const registry = createEmailTemplateRegistry(
      {
        remote: {
          ...remote,
          prepare,
          parseInput: (): string => {
            clock.ticks += 50;
            throw new Error('private');
          },
        },
      },
      { clock },
    );
    await expect(registry.prepare(SCOPE, remoteCommand, { timeoutMs: 50 })).rejects.toMatchObject({ code: 'deadline' });
    expect(prepare).not.toHaveBeenCalled();
    expect(clock.timers.size).toBe(0);
    const later = vi.fn(() => 'hello');
    const withHelper = createEmailTemplateRegistry(
      { local: { ...local, subject: inline('{{blockMoment}}'), html: inline('{{later}}') } },
      {
        clock,
        helpers: {
          later,
          blockMoment: () => {
            clock.ticks += 50;
            return 'subject';
          },
        },
      },
    );
    await expect(withHelper.prepare(SCOPE, command, { timeoutMs: 50 })).rejects.toMatchObject({ code: 'deadline' });
    expect(later).not.toHaveBeenCalled();
    expect(clock.timers.size).toBe(0);
  });

  it('rejects native promises from synchronous parsers without leaking a rejection or prematurely freeing the slot', async () => {
    const gate = deferred<string>();
    const prepare = vi.fn(remote.prepare);
    // Simulate a JS caller passing an async parser despite the public signature.
    const parseInput = vi
      .fn<typeof remote.parseInput>()
      .mockReturnValueOnce(gate.promise as unknown as string)
      .mockImplementation(remote.parseInput);
    const registry = createEmailTemplateRegistry({ remote: { ...remote, parseInput, prepare } }, { maxPending: 1 });
    await expect(registry.prepare(SCOPE, remoteCommand)).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(registry.prepare(SCOPE, remoteCommand)).rejects.toMatchObject({ code: 'busy' });
    expect(prepare).not.toHaveBeenCalled();
    gate.reject(new Error('synthetic async parser failure'));
    await gate.promise.catch(() => undefined);
    await expect(registry.prepare(SCOPE, remoteCommand)).resolves.toHaveProperty('snapshot.kind', 'sendgrid');
  });

  it('rejects a misconfigured async Handlebars helper without rendering further or releasing its slot', async () => {
    const gate = deferred<string>();
    const later = vi.fn(() => 'next');
    const helper = vi.fn((): string | Promise<string> => 'ok').mockReturnValueOnce(gate.promise);
    const registry = createEmailTemplateRegistry(
      { local: { ...local, subject: inline('{{helper}} {{later}}') } },
      { helpers: { helper, later }, maxPending: 1 },
    );
    await expect(registry.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'template_render' });
    expect(later).not.toHaveBeenCalled();
    await expect(registry.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'busy' });
    gate.reject(new Error('synthetic helper error'));
    await gate.promise.catch(() => undefined);
    await expect(registry.prepare(SCOPE, command)).resolves.toHaveProperty('snapshot.subject', 'ok next');
  });
});
