/**
 * ARR-11: website "Active Record Integration" block (#15).
 *
 * Exercises the `Model<T>` wrapper surface (`save()` and `find`/`_id`) on
 * `useList` data, anchored against the published declarations. The documented
 * block stays verbatim inside scaffold markers while this fixture provides the
 * surrounding hook setup.
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

const { useList } = createModelHooks({ modelService: organizationService });

function ActiveRecordExample() {
  // docs-block-start: website/docs/packages/access-router-react.md#15
  const { data, refetch } = useList({ listParams: { pageSize: 20 } });

  async function rename(id: string, name: string) {
    const organization = data.find((entry) => entry._id === id);
    if (!organization) return;

    organization.name = name;
    const result = await organization.save();

    if (result.success) {
      refetch();
    }
  }
  // docs-block-end: website/docs/packages/access-router-react.md#15

  void rename;
  return null;
}

void ActiveRecordExample;
