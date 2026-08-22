import { describe, it, expect, vi } from 'vitest';
import { composeAbortSignals } from '../src/fetch';

function trackAbortListeners(signal: AbortSignal) {
  const active = new Set<EventListenerOrEventListenerObject>();
  const originalAdd = signal.addEventListener.bind(signal);
  const originalRemove = signal.removeEventListener.bind(signal);

  const addSpy = vi.spyOn(signal, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'abort' && listener) {
      active.add(listener);
    }
    return originalAdd(type, listener, options);
  });

  const removeSpy = vi.spyOn(signal, 'removeEventListener').mockImplementation((type, listener, options) => {
    if (type === 'abort' && listener) {
      active.delete(listener);
    }
    return originalRemove(type, listener, options);
  });

  return {
    addSpy,
    removeSpy,
    activeCount: () => active.size,
    restore: () => {
      addSpy.mockRestore();
      removeSpy.mockRestore();
    },
  };
}

describe('ARR-H01: composeAbortSignals listener ownership', () => {
  it('releases listeners on success/failure paths and keeps release idempotent', () => {
    const internal = new AbortController();
    const request = new AbortController();
    const caller = new AbortController();
    const requestTrack = trackAbortListeners(request.signal);
    const callerTrack = trackAbortListeners(caller.signal);

    const success = composeAbortSignals(internal.signal, request.signal, caller.signal);
    expect(requestTrack.activeCount()).toBe(1);
    expect(callerTrack.activeCount()).toBe(1);
    success.release();
    success.release();
    expect(requestTrack.activeCount()).toBe(0);
    expect(callerTrack.activeCount()).toBe(0);

    const failure = composeAbortSignals(internal.signal, request.signal, caller.signal);
    expect(requestTrack.activeCount()).toBe(1);
    expect(callerTrack.activeCount()).toBe(1);
    failure.release();
    expect(requestTrack.activeCount()).toBe(0);
    expect(callerTrack.activeCount()).toBe(0);

    requestTrack.restore();
    callerTrack.restore();
  });

  it('aborts with the first source reason and releases listeners for internal, request-config, and per-call aborts', () => {
    {
      const internal = new AbortController();
      const request = new AbortController();
      const caller = new AbortController();
      const requestTrack = trackAbortListeners(request.signal);
      const callerTrack = trackAbortListeners(caller.signal);
      const composed = composeAbortSignals(internal.signal, request.signal, caller.signal);
      internal.abort('internal-reason');
      expect(composed.signal.aborted).toBe(true);
      expect(composed.signal.reason).toBe('internal-reason');
      expect(requestTrack.activeCount()).toBe(0);
      expect(callerTrack.activeCount()).toBe(0);
      requestTrack.restore();
      callerTrack.restore();
    }

    {
      const internal = new AbortController();
      const request = new AbortController();
      const caller = new AbortController();
      const requestTrack = trackAbortListeners(request.signal);
      const callerTrack = trackAbortListeners(caller.signal);
      const composed = composeAbortSignals(internal.signal, request.signal, caller.signal);
      request.abort('request-config-reason');
      expect(composed.signal.aborted).toBe(true);
      expect(composed.signal.reason).toBe('request-config-reason');
      expect(requestTrack.activeCount()).toBe(0);
      expect(callerTrack.activeCount()).toBe(0);
      requestTrack.restore();
      callerTrack.restore();
    }

    {
      const internal = new AbortController();
      const request = new AbortController();
      const caller = new AbortController();
      const requestTrack = trackAbortListeners(request.signal);
      const callerTrack = trackAbortListeners(caller.signal);
      const composed = composeAbortSignals(internal.signal, request.signal, caller.signal);
      caller.abort('caller-reason');
      expect(composed.signal.aborted).toBe(true);
      expect(composed.signal.reason).toBe('caller-reason');
      expect(requestTrack.activeCount()).toBe(0);
      expect(callerTrack.activeCount()).toBe(0);
      requestTrack.restore();
      callerTrack.restore();
    }
  });

  it('avoids listeners for already-aborted and same-signal inputs', () => {
    const internal = new AbortController();
    const alreadyAborted = new AbortController();
    alreadyAborted.abort('already-aborted');
    const caller = new AbortController();
    const callerTrack = trackAbortListeners(caller.signal);
    const aborted = composeAbortSignals(internal.signal, alreadyAborted.signal, caller.signal);
    expect(aborted.signal).toBe(alreadyAborted.signal);
    expect(aborted.signal.aborted).toBe(true);
    expect(callerTrack.activeCount()).toBe(0);
    callerTrack.restore();

    const shared = new AbortController();
    const sharedTrack = trackAbortListeners(shared.signal);
    const sameSignal = composeAbortSignals(shared.signal, shared.signal, shared.signal);
    expect(sameSignal.signal).toBe(shared.signal);
    expect(sharedTrack.activeCount()).toBe(0);
    sharedTrack.restore();
  });

  it('releases listeners on replacement, unmount-style abort, and after 100 settled requests leaves zero listeners', () => {
    const request = new AbortController();
    const caller = new AbortController();
    const requestTrack = trackAbortListeners(request.signal);
    const callerTrack = trackAbortListeners(caller.signal);

    const replacement = composeAbortSignals(new AbortController().signal, request.signal, caller.signal);
    replacement.release();
    expect(requestTrack.activeCount()).toBe(0);
    expect(callerTrack.activeCount()).toBe(0);

    const unmountLike = composeAbortSignals(new AbortController().signal, request.signal, caller.signal);
    unmountLike.release();
    expect(requestTrack.activeCount()).toBe(0);
    expect(callerTrack.activeCount()).toBe(0);

    for (let i = 0; i < 100; i++) {
      const settled = composeAbortSignals(new AbortController().signal, request.signal, caller.signal);
      settled.release();
    }

    expect(requestTrack.activeCount()).toBe(0);
    expect(callerTrack.activeCount()).toBe(0);
    requestTrack.restore();
    callerTrack.restore();
  });
});
