import * as fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { captureAuthorizationFieldCatalog } from '../../src/acl/field-catalog';
import { assertModelInputComplexity, sanitizePreparedInput } from '../../src/acl/model-input-admission';
import { ServiceAuthorizationError } from '../../src/acl/service-authorization';

const observations: object[] = [];
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (!process.env.CWO03_CONSTRUCTION_REPORT) return;
  const target = path.resolve(process.env.CWO03_CONSTRUCTION_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(observations));
});
const catalog = () =>
  captureAuthorizationFieldCatalog(new mongoose.Schema({ payload: mongoose.Schema.Types.Mixed }), {});

describe('phase-local input construction observations, not allocation/timing acceptance', () => {
  it('finishes later native normalization before the first earlier-field catalog string observation', () => {
    const captured = catalog();
    const events: string[] = [];
    const original = String.prototype.split;
    const input = { cwo03Early: 'business', when: new Date(1) };
    vi.spyOn(String.prototype, 'split').mockImplementation(function (...args) {
      if (String(this) === 'cwo03Early') events.push('catalog.early');
      return Reflect.apply(original, this, args);
    });
    const native = vi.spyOn(input.when, 'getTime').mockImplementation(() => {
      events.push('native.late');
      return 7;
    });
    const result = sanitizePreparedInput(input, captured);
    expect(result).toEqual({ cwo03Early: 'business', when: new Date(7) });
    expect(events[0]).toBe('native.late');
    expect(events.slice(1).length).toBeGreaterThan(0);
    expect(events.slice(1).every((event) => event === 'catalog.early')).toBe(true);
    expect(native).toHaveBeenCalledOnce();
    observations.push({ kind: 'normalization-before-catalog', events, nativeCalls: 1 });
  });

  it('retains whole-normalization first-error order instead of throwing earlier validation/scrub errors', () => {
    const captured = catalog();
    const nativeFailure = new ServiceAuthorizationError('late native normalization');
    const catalogFailure = new Error('early catalog observation');
    const original = String.prototype.split;
    const catalogReads = vi.fn();
    vi.spyOn(String.prototype, 'split').mockImplementation(function (...args) {
      if (String(this) === 'cwo03Early') {
        catalogReads();
        throw catalogFailure;
      }
      return Reflect.apply(original, this, args);
    });
    const date = new Date(1);
    const native = vi.spyOn(date, 'getTime').mockImplementation(() => {
      throw nativeFailure;
    });
    for (const run of [
      () => sanitizePreparedInput({ cwo03Early: 'business', when: date }, captured),
      () => assertModelInputComplexity({ constructor: 'unsafe', when: date }, {}),
    ]) {
      let caught: unknown;
      try {
        run();
      } catch (error) {
        caught = error;
      }
      // All controlled errors share the generic Error.message; compare identity,
      // not toThrow(message), to retain the actual winning native failure.
      expect(caught).toBe(nativeFailure);
    }
    expect(catalogReads).not.toHaveBeenCalled();
    expect(native).toHaveBeenCalledTimes(2);
    observations.push({
      kind: 'normalization-first-error',
      nativeCalls: 2,
      catalogReads: 0,
      validationErrorDeferred: true,
    });
  });

  it('a native-installed array method can retain normalized shells that remain distinct from scrubbed output', () => {
    const captured = catalog();
    const previous = Object.getOwnPropertyDescriptor(Array.prototype, 'map')!;
    const original = previous.value as typeof Array.prototype.map;
    const input = { payload: [{ keep: 'business', _permissions: { forged: true } }], when: new Date(1) };
    let retained: any[] | undefined;
    let exposures = 0;
    const native = vi.spyOn(input.when, 'getTime').mockImplementation(() => {
      Object.defineProperty(Array.prototype, 'map', {
        ...previous,
        value: function (callback: unknown, receiver: unknown) {
          if (this !== input.payload && this.length === 1 && this[0]?._permissions?.forged === true) {
            retained = this;
            exposures++;
          }
          return Reflect.apply(original, this, [callback, receiver]);
        },
      });
      return 7;
    });
    let result;
    try {
      result = sanitizePreparedInput(input, captured);
    } finally {
      Object.defineProperty(Array.prototype, 'map', previous);
    }
    expect(native).toHaveBeenCalledOnce();
    expect(exposures).toBe(1);
    expect(retained).not.toBe(input.payload);
    expect(retained![0]).not.toBe(input.payload[0]);
    expect(result.payload).not.toBe(retained);
    expect(result.payload[0]).not.toBe(retained![0]);
    expect(retained![0]).toEqual({ keep: 'business', _permissions: { forged: true } });
    expect(result.payload).toEqual([{ keep: 'business' }]);
    retained![0].keep = 'retained mutation';
    expect(result.payload[0].keep).toBe('business');
    expect(input.payload[0].keep).toBe('business');
    observations.push({
      kind: 'normalized-shell-exposure',
      nativeCalls: 1,
      exposures,
      rawNormalizedFinalDistinct: true,
      protectedKeyRetainedOnlyInIntermediate: true,
    });
  });
});
