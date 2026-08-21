import { requestKeyFor, RequestKeyError } from '@web-ts-toolkit/access-router-react';

const key = requestKeyFor({ filter: { status: 'active', since: new Date('2026-01-01') } });

declare const someUserSuppliedFilter: unknown;

try {
  requestKeyFor(someUserSuppliedFilter);
} catch (e) {
  if (e instanceof RequestKeyError) {
    // handle an unsupported value before passing it to a query hook
  }
}
