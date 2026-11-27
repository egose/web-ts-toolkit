import { type KeycloakGroupSyncConfig, planKeycloakGroups, readGroupSyncPath } from './planner';

type GroupClient = KeycloakGroupSyncConfig['client']['core']['groups'];
type Group = NonNullable<Awaited<ReturnType<GroupClient['findOne']>>>;

interface DesiredGroup {
  readonly name: string;
  readonly description: string | undefined;
  readonly path: string;
  readonly parentId: string | null;
}

const ownerAttribute = 'moo.keycloakGroupSync.owner';

function isGroupId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function readStoredId(document: Record<string, unknown>, binding: string): string | undefined {
  const id = readGroupSyncPath(document, binding);
  if (id == null) return undefined;
  if (!isGroupId(id)) throw new Error(`keycloakGroupSyncPlugin has an invalid stored ID at "${binding}"`);
  return id;
}

async function findSibling(groups: GroupClient, realm: string, desired: DesiredGroup): Promise<Group | undefined> {
  const { name, parentId } = desired;
  // Lookup by immediate parent and exact name. Keycloak can interpret a slash
  // after a trailing '~' as an escape in its group-by-path endpoint.
  const max = 100;
  for (let first = 0; ; first += max) {
    const query = { realm, search: name, exact: true, briefRepresentation: false, first, max };
    const candidates =
      parentId === null
        ? await groups.find({ ...query, populateHierarchy: false })
        : await groups.listSubGroups({ ...query, parentId });
    const match = candidates.find((group) => group.name === name && (parentId !== null || group.parentId == null));
    if (match || candidates.length < max) return match;
  }
}

async function findOrCreateGroup(
  groups: GroupClient,
  realm: string,
  owner: string,
  desired: DesiredGroup,
): Promise<Group | undefined> {
  const existing = await findSibling(groups, realm, desired);
  if (existing) return existing;

  const { name, description, parentId } = desired;
  const payload = {
    name,
    ...(description === undefined ? {} : { description }),
    attributes: { [ownerAttribute]: [owner] },
  };
  let created: { id: string };
  try {
    created =
      parentId === null
        ? await groups.create({ realm, ...payload })
        : await groups.createChildGroup({ realm, id: parentId }, payload);
  } catch (error) {
    if ((error as { response?: { status?: number } } | null)?.response?.status !== 409) throw error;
    const winner = await findSibling(groups, realm, desired);
    if (!winner) throw error;
    return winner;
  }
  if (!isGroupId(created?.id)) throw new Error(`keycloakGroupSyncPlugin did not receive an ID for "${desired.path}"`);
  return groups.findOne({ realm, id: created.id });
}

export async function reconcileKeycloakGroups(
  config: KeycloakGroupSyncConfig,
  document: Record<string, unknown>,
  owner: string,
  persistId: (binding: string, id: string, slug: string) => Promise<void>,
): Promise<ReadonlyMap<string, string>> {
  const { root, roleGroups } = planKeycloakGroups(config, document);
  const { realm, paths } = config;
  const groups = config.client.core.groups;
  const bindings = new Map<string, string>();

  async function reconcile(desired: DesiredGroup, binding: string): Promise<string> {
    const storedId = readStoredId(document, binding);
    const group =
      storedId === undefined
        ? await findOrCreateGroup(groups, realm, owner, desired)
        : await groups.findOne({ realm, id: storedId });

    // The configured realm scopes every request. Full representations carry
    // the direct parent, path, and the marker supplied when the group was made.
    const marker: unknown = group?.attributes?.[ownerAttribute];
    if (
      !group ||
      !isGroupId(group.id) ||
      (storedId !== undefined && group.id !== storedId) ||
      group.name !== desired.name ||
      group.path !== desired.path ||
      (group.parentId ?? null) !== desired.parentId ||
      !Array.isArray(marker) ||
      marker.length !== 1 ||
      marker[0] !== owner
    ) {
      const source = storedId === undefined ? 'group at the desired path' : 'stored group ID';
      throw new Error(
        `keycloakGroupSyncPlugin ${source} does not identify the owned group "${desired.path}" in realm "${realm}"`,
      );
    }

    if (storedId === undefined) await persistId(binding, group.id, root.name);
    bindings.set(binding, group.id);
    const { description } = desired;
    if (description !== undefined && description !== (group.description ?? '')) {
      await groups.update({ realm, id: group.id }, { name: group.name, description });
    }
    return group.id;
  }

  const rootPath = `/${root.name}`;
  const rootId = await reconcile({ ...root, path: rootPath, parentId: null }, paths.providerId);
  for (const role of roleGroups) {
    const parentId = role.parentKey === null ? rootId : bindings.get(`${paths.roleGroupIds}.${role.parentKey}`);
    if (parentId === undefined)
      throw new Error(`keycloakGroupSyncPlugin could not resolve the parent of "${role.key}"`);
    await reconcile({ ...role, path: `${rootPath}/${role.key}`, parentId }, `${paths.roleGroupIds}.${role.key}`);
  }
  return bindings;
}
