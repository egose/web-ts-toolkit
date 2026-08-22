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

function ReadmeCancellationExample() {
  const { query } = useRead({ id: 'org_123', advanced: true });

  async function run() {
    // docs-block-start: packages/access-router-react/README.md#13
    const controller = new AbortController();
    const pending = query('org_123', { signal: controller.signal });
    controller.abort(); // cancels the in-flight manual request while it is still pending

    try {
      await pending;
    } catch (error) {
      console.error('manual query cancelled', error);
    }
    // docs-block-end: packages/access-router-react/README.md#13
  }

  void run;
  return null;
}

function WebsiteCancellationExample() {
  const { query } = useRead({ id: 'org_123', advanced: true });

  async function run() {
    // docs-block-start: website/docs/packages/access-router-react.md#11
    const controller = new AbortController();
    const pending = query('org_123', { signal: controller.signal });
    controller.abort(); // cancels the in-flight manual request while it is still pending

    try {
      await pending;
    } catch (error) {
      console.error('manual query cancelled', error);
    }
    // docs-block-end: website/docs/packages/access-router-react.md#11
  }

  void run;
  return null;
}

void ReadmeCancellationExample;
void WebsiteCancellationExample;
