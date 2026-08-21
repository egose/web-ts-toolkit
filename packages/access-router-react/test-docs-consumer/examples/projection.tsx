/**
 * ARR-11: README "Projection Typing" block (#14).
 *
 * Anchors the documented literal-`select` narrowing contract against the
 * published `ProjectedShape<T, TSelect>` surface: omitted keys become
 * `T[key] | undefined` rather than definitely-present so a consumer that
 * reads a server-omitted field is typechecked as possibly-undefined. The
 * fixture asserts the literal types the narrowing advertises (`string` for
 * the selected `name` field, `string | undefined` for `status`/`_id`).
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

function ProjectionExample() {
  // docs-block-start: packages/access-router-react/README.md#15
  const { data } = useRead({
    id: 'org_123',
    advanced: true,
    select: ['name', 'status'] as const,
  });

  if (data) {
    const name: string = data.name; // definitely present
    const status: string | undefined = data.status; // selected, still T[key] | undefined
    const id: string | undefined = data._id; // omitted-key reads as possibly undefined
  }
  // docs-block-end: packages/access-router-react/README.md#15

  return null;
}

void ProjectionExample;
