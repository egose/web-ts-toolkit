import '@testing-library/jest-dom';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/starter-test';

// jsdom does not implement ResizeObserver, which Radix UI (used by
// @egose/shadcn-theme) relies on at mount time.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
