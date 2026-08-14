/**
 * ARR-11: README "Cancellation" block (#12).
 *
 * Exercises the per-call `query(id, { signal })` composition contract (Task
 * ARR-05 req 4) against the published `UseReadQueryResult.query` signature.
 * The block is intentionally partial (a bare destructure) and is anchored in
 * this fixture's setup so the composed-signal documented operation
 * typechecks.
 */
import type { Document } from '@web-ts-toolkit/access-router-client';
import { createModelHooks } from '@web-ts-toolkit/access-router-react';
import { adapter } from './setup.js';

interface Organization extends Document {
  _id?: string;
  name: string;
  status?: 'active' | 'archived';
}

const organizationService = adapter.createModelService<Organization>({
  modelName: 'Organization',
  basePath: 'organizations',
});

const { useRead } = createModelHooks({ modelService: organizationService });

function CancellationExample() {
  const { query } = useRead({ id: 'org_123', advanced: true });

  async function run() {
    // README block #12
    const controller = new AbortController();
    const result = await query('org_123', { signal: controller.signal });
    controller.abort(); // cancels the in-flight manual request
    return result;
  }

  void run;
  return null;
}

void CancellationExample;
