/** Real worker/parser seam characterization; no public scheduling guarantee is added. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { Core } from '../../src/core';
import { Service } from '../../src/services/service';
import { PublicService } from '../../src/services/public-service';
import { runWithRuntime } from '../../src/runtime-context';
import { deferred } from '../support/public/hook-admission-fixture';
import { quietOutput, sourceModes } from '../support/private/owned-stage-test-fixture';
import { writeOutputFixture } from '../support/private/write-output-test-fixture';

const observations: object[] = [];
const entries = ['direct', 'public'] as const;
const writes = ['create', 'update'] as const;
type Entry = (typeof entries)[number];
type Write = (typeof writes)[number];

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (!process.env.CWO04_PARSER_REPORT) return;
  const target = path.resolve(process.env.CWO04_PARSER_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(observations));
});

function fixture(mode: (typeof sourceModes)[number], limit: number) {
  const f = writeOutputFixture(mode, { readAuthorizationMode: mode, listAuthorizationMode: mode });
  f.runtime.setGlobalOptions({ requestComplexity: { maxBulkConcurrency: limit } });
  // Resource limits are captured by request/runtime identity. Use a fresh request,
  // not an in-flight configuration rewrite or a replacement parser/scheduler.
  const request = { ...f.request };
  const services = runWithRuntime(f.runtime, () => {
    request.macl = new Core(request);
    return {
      direct: new (class extends Service {
        protected createModelAdapter() {
          return f.adapter;
        }
      })(request, f.model.modelName),
      public: new (class extends PublicService {
        protected createModelAdapter() {
          return f.adapter;
        }
      })(request, f.model.modelName),
    };
  });
  return { ...f, ...services, request };
}
type Fixture = ReturnType<typeof fixture>;

function write(f: Fixture, entry: Entry, operation: Write, data: Record<string, unknown>) {
  const args = { select: ['value', 'when', '-_id'] };
  return entry === 'public'
    ? operation === 'create'
      ? f.public._create(data, args, quietOutput)
      : f.public._update('existing', data, args, quietOutput)
    : operation === 'create'
      ? f.direct.create(data, args, quietOutput)
      : f.direct.updateById('existing', data, args, quietOutput);
}

describe('shared ordinary READ/LIST filters preserve parser-owned nested mutation exposure', () => {
  it.each(
    sourceModes.flatMap((mode) =>
      entries.flatMap((entry) =>
        (['read', 'list'] as const).flatMap((operation) => [1, 3].map((limit) => ({ mode, entry, operation, limit }))),
      ),
    ),
  )(
    '$mode $entry $operation limit=$limit keeps its captured filter and lazy sibling traversal',
    async ({ mode, entry, operation, limit }) => {
      const f = fixture(mode, limit);
      const service = entry === 'public' ? f.public : f.direct;
      const input = { value: { held: { stable: 'ordinary' } }, payload: { value: 'before' } };
      f.stored.set('value', input.value);
      f.stored.set('payload', input.payload);
      const original = (service as any).parseClientData.bind(service);
      let parserInput: any;
      let parsed: any;
      vi.spyOn(service as any, 'parseClientData').mockImplementation((data, scheduler, scheduled) => {
        parserInput = data;
        const pending = original(data, scheduler, scheduled);
        pending.then(
          (result: unknown) => {
            parsed = result;
          },
          () => {},
        );
        queueMicrotask(() => {
          (data as any).payload.value = 'queued';
        });
        return pending;
      });
      const args = { select: ['value', '-_id'] };
      const result =
        entry === 'public'
          ? operation === 'read'
            ? await f.public._readFilter(input, args, quietOutput)
            : await f.public._list(input, args, quietOutput)
          : operation === 'read'
            ? await f.direct.findOne(input, args, quietOutput)
            : await f.direct.find(input, args, quietOutput);
      const expected = limit === 1 ? 'queued' : 'before';
      expect(result.success).toBe(true);
      expect(parserInput).not.toBe(input);
      expect(parserInput.payload.value).toBe('queued');
      expect(input.payload.value).toBe('before');
      expect(parsed.payload.value).toBe(expected);
      const query = operation === 'read' ? f.adapter.findOne.mock.calls[0][0] : f.adapter.find.mock.calls[0][0];
      expect(query.filter.payload.value).toBe(expected);
      expect(f.adapter.create).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      observations.push({
        kind: 'shared-filter-capture',
        mode,
        entry,
        operation,
        limit,
        rawValue: input.payload.value,
        parsedValue: parsed.payload.value,
        adapterValue: query.filter.payload.value,
        parserInputDetached: true,
      });
    },
  );
});

describe('real write marker callbacks retain live handler lookup and their service receiver', () => {
  it.each(
    sourceModes.flatMap((mode) =>
      entries.flatMap((entry) =>
        writes.flatMap((operation) => [1, 3].map((limit) => ({ mode, entry, operation, limit }))),
      ),
    ),
  )(
    '$mode $entry $operation limit=$limit keeps a later handler replacement observable',
    async ({ mode, entry, operation, limit }) => {
      const f = fixture(mode, limit);
      const service = entry === 'public' ? f.public : f.direct;
      const firstEntered = deferred();
      const held = deferred<Date>();
      const firstDate = new Date(1);
      const initial = (service as any).handleDate.bind(service);
      const calls: string[] = [];
      const date = vi.spyOn(service as any, 'handleDate').mockImplementation(function (this: unknown, value, key) {
        expect(this).toBe(service);
        calls.push(`initial:${key}`);
        if (key === 'value') {
          firstEntered.resolve();
          return held.promise;
        }
        return initial(value, key);
      });
      let parsed: any;
      const parser = (service as any).parseClientData.bind(service);
      vi.spyOn(service as any, 'parseClientData').mockImplementation((...args) => {
        const pending = parser(...args);
        pending.then(
          (result: unknown) => {
            parsed = result;
          },
          () => {},
        );
        return pending;
      });
      const pending = write(f, entry, operation, { value: { $$date: 1 }, when: { $$date: 2 } });
      try {
        await firstEntered.promise;
        date.mockImplementation(function (this: unknown, _value, key) {
          expect(this).toBe(service);
          calls.push(`replacement:${key}`);
          return new Date(20);
        });
      } finally {
        held.resolve(firstDate);
        await pending;
      }
      const result = await pending;
      const replaced = operation === 'update' && limit === 1;
      const expected = replaced ? 20 : 2;
      expect(result.success).toBe(true);
      expect(calls).toEqual(['initial:value', `${replaced ? 'replacement' : 'initial'}:when`]);
      expect(parsed.value).toBe(firstDate);
      expect(parsed.when).toEqual(new Date(expected));
      expect(f.saved[0].value).toEqual(firstDate);
      expect(f.saved[0].when).toEqual(new Date(expected));
      expect(f.saves).toHaveBeenCalledTimes(operation === 'update' ? 1 : 0);
      observations.push({
        kind: 'live-date-handler',
        mode,
        entry,
        operation,
        limit,
        calls,
        laterTime: expected,
        firstParserDateSame: true,
        originalServiceReceiver: true,
        persistenceCount: f.saved.length,
      });
    },
  );
});

describe('real write parser errors keep already-launched sibling observations', () => {
  it.each(
    sourceModes.flatMap((mode) => entries.flatMap((entry) => writes.map((operation) => ({ mode, entry, operation })))),
  )(
    '$mode $entry $operation keeps a callback-installed marker read failure before persistence',
    async ({ mode, entry, operation }) => {
      const f = fixture(mode, 1);
      const service = entry === 'public' ? f.public : f.direct;
      const failure = new Error('callback-installed marker observation');
      const payload = { ordinary: 'data' };
      const calls: string[] = [];
      let getterCalls = 0;
      const initial = (service as any).handleDate.bind(service);
      vi.spyOn(service as any, 'handleDate').mockImplementation(function (this: unknown, value, key) {
        expect(this).toBe(service);
        calls.push(key as string);
        if (key === 'value') {
          Object.defineProperty(payload, '$$date', {
            configurable: true,
            get() {
              getterCalls++;
              throw failure;
            },
          });
        }
        return initial(value, key);
      });
      let error: unknown;
      try {
        error = await write(f, entry, operation, { value: { $$date: 1 }, payload, when: { $$date: 3 } }).catch(
          (caught: unknown) => caught,
        );
      } finally {
        Reflect.deleteProperty(payload, '$$date');
      }
      expect(error).toBe(failure);
      expect(getterCalls).toBe(1);
      expect(calls).toEqual(operation === 'create' ? ['value', 'when'] : ['value']);
      expect(f.adapter.create).not.toHaveBeenCalled();
      expect(f.saves).not.toHaveBeenCalled();
      expect(f.saved).toEqual([]);
      observations.push({
        kind: 'write-entry-error',
        mode,
        entry,
        operation,
        limit: 1,
        calls,
        getterCalls,
        sameError: true,
        persistenceCount: 0,
      });
    },
  );
});

describe('ordinary real writes retain native promise-adoption observations during entry launch', () => {
  it.each(
    sourceModes.flatMap((mode) => entries.flatMap((entry) => writes.map((operation) => ({ mode, entry, operation })))),
  )(
    '$mode $entry $operation keeps a native then lookup before later ordinary traversal',
    async ({ mode, entry, operation }) => {
      const f = fixture(mode, 1);
      const service = entry === 'public' ? f.public : f.direct;
      const native = new Date(7);
      const payload = { value: 'before' };
      const calls: string[] = [];
      const previous = Object.getOwnPropertyDescriptor(Date.prototype, 'then');
      const date = vi.spyOn(service as any, 'handleDate');
      const subquery = vi.spyOn(service as any, 'handleSubQuery');
      Object.defineProperty(Date.prototype, 'then', {
        configurable: true,
        get() {
          if (this !== native) return undefined;
          calls.push('native:then-read');
          payload.value = 'native-observed';
          return function (this: unknown, resolve: (value: string) => void) {
            expect(this).toBe(native);
            calls.push('native:then-call');
            resolve('adopted');
          };
        },
      });
      let result;
      try {
        result = await write(f, entry, operation, { value: native, payload });
      } finally {
        if (previous) Object.defineProperty(Date.prototype, 'then', previous);
        else Reflect.deleteProperty(Date.prototype, 'then');
      }
      expect(result.success).toBe(true);
      expect(calls).toEqual(['native:then-read', 'native:then-call']);
      expect(f.saved[0].value).toBe('adopted');
      expect(f.saved[0].payload).toEqual({ value: 'native-observed' });
      expect(payload.value).toBe('native-observed');
      expect(date).not.toHaveBeenCalled();
      expect(subquery).not.toHaveBeenCalled();
      observations.push({
        kind: 'ordinary-native-adoption',
        mode,
        entry,
        operation,
        limit: 1,
        calls,
        savedValue: f.saved[0].value,
        savedLaterValue: (f.saved[0].payload as any).value,
        markerCallbacks: 0,
        persistenceCount: f.saved.length,
      });
    },
  );
});
