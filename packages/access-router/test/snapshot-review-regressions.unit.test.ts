import { isDeepStrictEqual } from 'node:util';
import { mongo } from 'mongoose';
import { describe, expect, it } from 'vitest';
import Permission from '../src/permission';
import type { AccessRouterRequest } from '../src/interfaces';
import { resolveServiceAuthorization, ServiceAuthorizationError } from '../src/acl/service-authorization';
import {
  createDocumentAuthorizationStage,
  readDocumentAuthorizationAccess,
  resolveDocumentAuthorization,
} from '../src/acl/document-authorization';
import { copyAuthorizationValue } from '../src/acl/authorization-snapshot';

async function ordinaryOwner() {
  const binding = {
    request: {} as AccessRouterRequest,
    runtime: {},
    model: {},
    modelName: 'SnapshotReview',
  };
  const call = resolveServiceAuthorization({
    binding,
    access: { operation: 'read', outputAccess: 'read', virtualAccess: 'read', docPermissionsAccess: 'read' },
    configuration: { catalog: { paths: ['value'] } },
    requestPermissions: new Permission({}),
  });
  const source = { value: 'original', nested: { value: 1 } };
  const snapshot = copyAuthorizationValue(source, 'document');
  const handle = await resolveDocumentAuthorization(
    createDocumentAuthorizationStage(call, binding, source),
    () => ({}),
  );
  return { binding, source, snapshot, handle };
}

describe('SNAPCPU-05 live ordinary-shape purity review', () => {
  it('retains the second observation when BSON hasInstance executes code for an ordinary nested value', async () => {
    const f = await ordinaryOwner();
    const constructor = mongo.BSON.BSONValue;
    const descriptor = Object.getOwnPropertyDescriptor(constructor, Symbol.hasInstance);
    const observations: boolean[] = [];
    let failure: unknown;
    try {
      Object.defineProperty(constructor, Symbol.hasInstance, {
        configurable: true,
        value(value: unknown) {
          if (value === f.source.nested) f.source.value = 'changed after its value was copied';
          return false;
        },
      });
      // The two legacy observations differ despite entirely ordinary own slots.
      observations.push(isDeepStrictEqual(copyAuthorizationValue(f.source, 'document'), f.snapshot));
      observations.push(isDeepStrictEqual(copyAuthorizationValue(f.source, 'document'), f.snapshot));
      f.source.value = 'original';
      try {
        readDocumentAuthorizationAccess(f.handle, f.binding);
      } catch (error) {
        failure = error;
      }
    } finally {
      if (descriptor) Object.defineProperty(constructor, Symbol.hasInstance, descriptor);
      else Reflect.deleteProperty(constructor, Symbol.hasInstance);
    }
    expect(observations).toEqual([true, false]);
    expect(f.source.value).toBe('changed after its value was copied');
    expect(failure).toBeInstanceOf(ServiceAuthorizationError);
  });

  it('retains the second observation when ordinary equality inherits a toStringTag getter', async () => {
    const f = await ordinaryOwner();
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, Symbol.toStringTag);
    const observations: boolean[] = [];
    let failure: unknown;
    try {
      Object.defineProperty(Object.prototype, Symbol.toStringTag, {
        configurable: true,
        get() {
          f.source.value = 'changed during equality';
          return undefined;
        },
      });
      observations.push(isDeepStrictEqual(copyAuthorizationValue(f.source, 'document'), f.snapshot));
      observations.push(isDeepStrictEqual(copyAuthorizationValue(f.source, 'document'), f.snapshot));
      f.source.value = 'original';
      try {
        readDocumentAuthorizationAccess(f.handle, f.binding);
      } catch (error) {
        failure = error;
      }
    } finally {
      if (descriptor) Object.defineProperty(Object.prototype, Symbol.toStringTag, descriptor);
      else Reflect.deleteProperty(Object.prototype, Symbol.toStringTag);
    }
    expect(observations).toEqual([true, false]);
    expect(f.source.value).toBe('changed during equality');
    expect(failure).toBeInstanceOf(ServiceAuthorizationError);
  });
});
