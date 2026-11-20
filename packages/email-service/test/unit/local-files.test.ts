import { Buffer } from 'node:buffer';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmailTemplateRegistry } from '../../src';
import { MESSAGE_LIMITS as L } from '../../src/constants';
import { command, deferred, local, ManualClock, SCOPE } from './template-fixtures';

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof fs>();
  return { ...actual, open: vi.fn(actual.open) };
});

const open = vi.mocked(fs.open);
const actual = await vi.importActual<typeof fs>('node:fs/promises');
let dir: string;
let path: string;

beforeEach(async () => {
  open.mockReset();
  dir = await fs.mkdtemp(join(tmpdir(), 'email-service-files-'));
  path = join(dir, 'body.hbs');
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function fileRegistry(path: string, clock = new ManualClock()) {
  const next = vi.fn(() => 'plain');
  const registry = createEmailTemplateRegistry(
    { local: { ...local, html: { kind: 'file', path }, text: { kind: 'async', load: next } } },
    { clock, maxPending: 1 },
  );
  return { registry, next };
}

describe('explicit local template files', () => {
  it('renders opened regular UTF-8 files and reloads file contents only after invalidation', async () => {
    await fs.writeFile(path, '<p>{{title}}</p>\n');
    const { registry } = fileRegistry(path);
    const result = () => registry.prepare(SCOPE, command);
    await expect(result()).resolves.toHaveProperty('snapshot.html', '<p>&lt;a&gt;&amp;&quot;</p>\n');
    await fs.writeFile(path, '<b>révisé</b>');
    await expect(result()).resolves.toHaveProperty('snapshot.html', '<p>&lt;a&gt;&amp;&quot;</p>\n');
    expect(open).toHaveBeenCalledTimes(1);
    registry.invalidate('local');
    await expect(result()).resolves.toHaveProperty('snapshot.html', '<b>révisé</b>');
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('fails on missing, non-regular, malformed UTF-8 and oversized files without further loading', async () => {
    const { registry, next } = fileRegistry(path);
    const failed = (registry: ReturnType<typeof fileRegistry>['registry']) =>
      expect(registry.prepare(SCOPE, command)).rejects.toMatchObject({
        code: 'template_source',
        message: 'Email template source could not be loaded.',
      });
    await failed(registry);
    await failed(fileRegistry(dir).registry);
    await fs.writeFile(path, Uint8Array.of(0xc0, 0x80));
    await failed(registry);
    await fs.writeFile(path, Buffer.alloc(L.templateSourceBytes + 1, 'x'));
    await failed(registry);
    expect(next).not.toHaveBeenCalled();
    await fs.writeFile(path, Buffer.alloc(L.templateSourceBytes, 'x'));
    await expect(registry.prepare(SCOPE, command)).resolves.toHaveProperty(
      'snapshot.html.length',
      L.templateSourceBytes,
    );
  });

  it('detects growth after stat using at most the byte limit plus one and closes the descriptor', async () => {
    await fs.writeFile(path, 'x');
    const handle = await actual.open(path, 'r');
    const stat = async () => {
      const info = await handle.stat();
      await fs.writeFile(path, Buffer.alloc(L.templateSourceBytes + 5, 'x'));
      return info;
    };
    const read = vi.fn((buffer: Buffer, offset: number, length: number, position: number | null) =>
      handle.read(buffer, offset, length, position),
    );
    open.mockResolvedValueOnce({ stat, read, close: () => handle.close() } as unknown as fs.FileHandle);
    try {
      const { registry } = fileRegistry(path);
      await expect(registry.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'template_source' });
      expect(read.mock.calls.reduce((sum, call) => sum + call[2], 0)).toBe(L.templateSourceBytes + 1);
      expect(handle.fd).toBe(-1);
    } finally {
      await handle.close();
    }
  });

  it('closes a descriptor returned by an open that completed after cancellation, before returning', async () => {
    await fs.writeFile(path, 'body');
    const handle = await actual.open(path, 'r');
    const entered = deferred<void>();
    const gate = deferred<fs.FileHandle>();
    open.mockImplementationOnce(() => {
      entered.resolve();
      return gate.promise;
    });
    const controller = new AbortController();
    const { registry, next } = fileRegistry(path);
    try {
      const pending = registry.prepare(SCOPE, command, { signal: controller.signal });
      const failure = expect(pending).rejects.toMatchObject({ code: 'aborted' });
      await entered.promise;
      controller.abort();
      await expect(registry.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'busy' });
      gate.resolve(handle);
      await failure;
      expect(handle.fd).toBe(-1);
      expect(next).not.toHaveBeenCalled();
      await expect(registry.prepare(SCOPE, command)).resolves.toHaveProperty('snapshot.html', 'body');
    } finally {
      gate.resolve(handle);
      await handle.close();
    }
  });

  it('does not start another read or loader on timeout; waits for the in-progress read and close', async () => {
    await fs.writeFile(path, 'body');
    const handle = await actual.open(path, 'r');
    const entered = deferred<void>();
    const gate = deferred<void>();
    const closed = deferred<void>();
    const read = vi.fn(async (buffer: Buffer, offset: number, length: number, position: number | null) => {
      const result = await handle.read(buffer, offset, Math.min(length, 1), position);
      entered.resolve();
      await gate.promise;
      return result;
    });
    const close = vi.fn(async () => {
      await handle.close();
      closed.resolve();
    });
    open.mockResolvedValueOnce({ stat: () => handle.stat(), read, close } as unknown as fs.FileHandle);
    const clock = new ManualClock();
    const { registry, next } = fileRegistry(path, clock);
    try {
      const pending = registry.prepare(SCOPE, command, { timeoutMs: 50 });
      const failure = expect(pending).rejects.toMatchObject({ code: 'deadline' });
      await entered.promise;
      clock.advance(50);
      await closed.promise;
      expect(handle.fd).toBe(-1);
      await expect(registry.prepare(SCOPE, command)).rejects.toMatchObject({ code: 'busy' });
      gate.resolve();
      await failure;
      expect(handle.fd).toBe(-1);
      expect(read).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
      expect(clock.timers.size).toBe(0);
    } finally {
      gate.resolve();
      await handle.close();
    }
  });
});
