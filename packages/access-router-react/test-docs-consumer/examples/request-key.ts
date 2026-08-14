/**
 * ARR-11: README "Dependency-Key Policy" block (#16).
 *
 * Anchors the `requestKeyFor` / `RequestKeyError` public exports against the
 * published declarations. The block exercises the structural-key digest on a
 * `Date` value (which is supported and never collides with an ISO-string
 * filter) and the `instanceof RequestKeyError` branch for unsupported values.
 */
import { requestKeyFor, RequestKeyError } from '@web-ts-toolkit/access-router-react';

const key = requestKeyFor({ filter: { status: 'active', since: new Date('2026-01-01') } });

void key;

declare const someUserSuppliedFilter: unknown;

try {
  requestKeyFor(someUserSuppliedFilter);
} catch (e) {
  if (e instanceof RequestKeyError) {
    // handle an unsupported value before passing it to a query hook
  }
}
