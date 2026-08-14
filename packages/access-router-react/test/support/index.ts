//
// Public surface for the access-router-react test harness (ARR-01).
//
// Tests should import only from this barrel:
//   from './support'
//
// The barrel keeps the per-file internals (`lazy-request.ts`,
// `mock-service.ts`, `flush.ts`) free to evolve without churn in the test
// import paths.
//
import { createLazyRequest, createImmediateLazyRequest, createImmediateRejectedLazyRequest } from './lazy-request';
import { createMockService, makeFailureResult, makeServiceError } from './mock-service';
import { flushAsync, flushMicrotasks } from './flush';

export {
  type MockService,
  type MockServiceResults,
  type MockServiceSurface,
  type MockMethodName,
  type MethodResult,
  type ControlledLazyRequest,
  type DeferredController,
  createMockService,
  makeFailureResult,
  makeServiceError,
  createLazyRequest,
  createImmediateLazyRequest,
  createImmediateRejectedLazyRequest,
  flushAsync,
  flushMicrotasks,
};
