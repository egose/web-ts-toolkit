/**
 * ACI-06: extracted from README.md "Correlated Includes", llms.txt
 * correlated-includes pattern, and website services.mdx "Correlated
 * Includes". Exercises the seven correlated-capable builders
 * (`read`/`readAdvanced`/`readAdvancedFilter`/`list`+supplemental filter/
 * `listAdvanced`/`count`+supplemental filter/`countAdvanced`), the
 * `parentField()` marker import, literal `'$special'` preservation, the
 * path-first `$include<'org', Org>('org')` generic spelling, and the
 * executable lines of each documented block so the ARC-20 derived-block
 * gate fails if the public contract drifts.
 */
import { createAdapter, type CorrelatedInclude, parentField } from '@web-ts-toolkit/access-router-client';

type User = { _id?: string; orgId?: string; managerId?: string; name: string };
type Org = { _id?: string; name: string; description?: string; active?: boolean };
type Post = { _id?: string; authorId?: string; reviewerId?: string; title: string };

const adapter = createAdapter({ baseURL: 'http://localhost:3000/api' });
const userService = adapter.createModelService<User>({ modelName: 'User', basePath: 'users' });
const orgService = adapter.createModelService<Org>({ modelName: 'Org', basePath: 'orgs' });
const postService = adapter.createModelService<Post>({ modelName: 'Post', basePath: 'posts' });

const userWithIncludes = await userService.readAdvanced('user-id-1', {
  include: [
    orgService.readAdvanced(parentField('orgId'), { select: ['name', 'description'] }).$include('org'),
    postService
      .listAdvanced(
        { authorId: parentField('_id'), reviewerId: parentField('managerId'), title: '$special' },
        { select: ['title'], sort: { createdAt: -1 }, limit: 5 },
      )
      .$include('posts'),
    postService.countAdvanced({ authorId: parentField('_id') }).$include('postCount'),
  ],
});
void userWithIncludes;

const basicPosts = postService.list({ limit: 5 }).$include('posts', {
  filter: { authorId: parentField('_id') },
});
void basicPosts;

const basicCount = postService.count().$include('postCount', {
  filter: { authorId: parentField('_id') },
});
void basicCount;

const filteredOrg = orgService
  .readAdvancedFilter({ _id: parentField('orgId'), active: true }, { select: ['name'] })
  .$include('org');
void filteredOrg;

// llms.txt condensed spellings (single-line forms of the same builders).
const withOrg = await userService.readAdvanced('user-id-1', {
  include: [
    orgService.readAdvanced(parentField('orgId'), { select: ['name'] }).$include('org'),
    postService.listAdvanced({ authorId: parentField('_id') }, { limit: 5 }).$include('posts'),
    postService.countAdvanced({ authorId: parentField('_id') }).$include('postCount'),
  ],
});
void withOrg;

// Path-first explicit result generic: the literal path is preserved and the
// outer type gains the output path (`Org | null` for reads).
const typedOrg = orgService
  .readAdvanced(parentField('orgId'), { select: ['name', 'description'] })
  .$include<'org', Org>('org');
void typedOrg;
const typedWire: CorrelatedInclude<'org', Org, 'read'> = typedOrg;
void typedWire;
