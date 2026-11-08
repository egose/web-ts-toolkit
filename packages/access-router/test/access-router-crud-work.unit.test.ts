/** Diagnostic work probes only. Never imported by the timing bundle. */
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { caseId, createCrudFixture, type CrudCase } from './access-router-crud-fixture';
import * as calls from '../src/acl/service-authorization';
import * as fields from '../src/acl/output-field-filter';
import * as concurrency from '../src/helpers/concurrency';
import * as logging from '../src/logger-helpers';

const report: any[] = [];
afterAll(async () => {
  if (!process.env.ARPC_CRUD_WORK_REPORT) return;
  const target = path.resolve(process.env.ARPC_CRUD_WORK_REPORT);
  expect(target.startsWith(`${path.resolve(process.env.TMPDIR!)}${path.sep}`)).toBe(true);
  await fs.writeFile(target, JSON.stringify(report));
});

describe('real CRUD preparation/copy/scheduler/log/metadata work (not timings)', () => {
  it.each(['isolated', 'trusted'] as const)(
    '%s records real LIST/bulk CREATE and READ/UPDATE controls',
    async (mode) => {
      for (const entry of ['direct', 'public'] as const)
        for (const shape of ['bare', 'hooks', 'metadata'] as const)
          for (const rows of [1, 16])
            for (const operation of ['read-hit', 'list-many', 'create-bulk', 'update-id'] as const) {
              const spec = { modes: Array(4).fill(mode), entry, shape, rows, width: rows === 1 ? 4 : 16, operation };
              const c: CrudCase = { ...spec, id: caseId(spec) };
              const f = createCrudFixture(c, true);
              const finalizer = vi.spyOn(calls, 'readServiceFinalizerConfiguration');
              const policy = vi.spyOn(calls, 'readServiceOutputPolicy');
              const copies = vi.spyOn(fields, 'copyOutputValue');
              const scheduler = vi.spyOn(concurrency, 'mapWithConcurrencyLimit');
              const summaries = vi.spyOn(logging, 'summarizeFilter');
              const sortCapture = vi.spyOn(f.services[entry], 'captureVirtualSnapshot');
              try {
                const result = await f.invoke();
                const counts = {
                  finalizerPreparations: finalizer.mock.calls.length,
                  outputPolicyReads: policy.mock.calls.length,
                  selectedCopyCalls: copies.mock.calls.length,
                  schedulerCalls: scheduler.mock.calls.length,
                  emptySchedulerCalls: scheduler.mock.calls.filter(([input]) => input.length === 0).length,
                  disabledDebugSummaries: summaries.mock.calls.length,
                  sortConfigurationCaptures: sortCapture.mock.calls.length,
                  ...f.counts,
                };
                f.check(result);
                expect(counts.finalizerPreparations).toBeGreaterThan(0);
                expect(counts.selectedCopyCalls).toBeGreaterThan(0);
                // Do not pin optimization candidates to today's repeated-work counts.
                // Package correctness/mode tests protect behavior; the report preserves the observed baseline.
                expect(counts['logger.debug'] ?? 0).toBe(0);
                report.push({ id: c.id, counts, trace: [...f.trace] });
              } finally {
                vi.restoreAllMocks();
                f.dispose();
              }
            }
    },
  );
});
