import '@testing-library/jest-dom';

// jsdom does not implement ResizeObserver, which Radix UI (used by
// @egose/shadcn-theme) relies on at mount time.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
