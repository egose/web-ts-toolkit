import { describe, expect, it } from 'vitest';

import { createDiagnosticDispatcher } from '../src/diagnostics';

describe('OVAPP-02 observer reentrancy', () => {
  it('drops synchronous recursive notification and recovers after an observer throws', () => {
    const seen: number[] = [];
    const notify = createDiagnosticDispatcher<number>((event) => {
      seen.push(event);
      notify(event + 1);
      throw new Error('Private observer diagnostic.');
    });
    notify(1);
    notify(10);
    expect(seen).toEqual([1, 10]);
  });
});
