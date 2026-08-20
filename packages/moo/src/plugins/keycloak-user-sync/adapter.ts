import type KeycloakAdminClientFluent from '@egose/keycloak-fluent';

export type KeycloakUser = {
  id?: string;
  username?: string;
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  attributes?: Record<string, string[]>;
};

export type KeycloakRealmRole = { id?: string; name?: string };

type RealmHandle = {
  get(): Promise<{ duplicateEmailsAllowed?: boolean } | null | undefined>;
  user(username: string): {
    get(): Promise<KeycloakUser | null | undefined>;
    getById(id: string): Promise<KeycloakUser | null | undefined>;
    create(payload: KeycloakUser): Promise<KeycloakUser | null | undefined>;
  };
  role(name: string): {
    ensure(payload: Record<string, never>): Promise<unknown>;
    get(): Promise<KeycloakRealmRole | null | undefined>;
  };
};

type CoreUsers = {
  find(query: { realm: string; email: string; exact: true; first: 0; max: 2 }): Promise<KeycloakUser[]>;
  update(params: { realm: string; id: string }, payload: KeycloakUser): Promise<unknown>;
  del(params: { realm: string; id: string }): Promise<unknown>;
  sendVerifyEmail(params: { realm: string; id: string }): Promise<unknown>;
  resetPassword(params: {
    realm: string;
    id: string;
    credential: { temporary: boolean; type: 'password'; value: string };
  }): Promise<unknown>;
  listRealmRoleMappings(params: { realm: string; id: string }): Promise<KeycloakRealmRole[]>;
  addRealmRoleMappings(params: { realm: string; id: string; roles: KeycloakRealmRole[] }): Promise<unknown>;
  delRealmRoleMappings(params: { realm: string; id: string; roles: KeycloakRealmRole[] }): Promise<unknown>;
};

type SupportedKeycloakClient = {
  realm(realm: string): RealmHandle;
  core: { users: CoreUsers };
};

export const createKeycloakUserSyncAdapter = (client: KeycloakAdminClientFluent, realm: string) => {
  const supportedClient = client as unknown as SupportedKeycloakClient;
  const realmHandle = () => supportedClient.realm(realm);
  const users = supportedClient.core.users;

  return {
    async getRealm() {
      return realmHandle().get();
    },
    async getUserById(username: string, id: string) {
      return realmHandle().user(username).getById(id);
    },
    async getUserByUsername(username: string) {
      return realmHandle().user(username).get();
    },
    async findUsersByEmail(email: string) {
      return users.find({ realm, email, exact: true, first: 0, max: 2 });
    },
    async createUser(username: string, payload: KeycloakUser) {
      return realmHandle().user(username).create(payload);
    },
    async updateUser(id: string, payload: KeycloakUser) {
      await users.update({ realm, id }, payload);
    },
    async deleteUser(id: string) {
      await users.del({ realm, id });
    },
    async sendVerifyEmail(id: string) {
      await users.sendVerifyEmail({ realm, id });
    },
    async resetPassword(id: string, value: string, temporary: boolean) {
      await users.resetPassword({ realm, id, credential: { temporary, type: 'password', value } });
    },
    async ensureRole(name: string) {
      await realmHandle().role(name).ensure({});
    },
    async getRole(name: string) {
      return realmHandle().role(name).get();
    },
    async listRealmRoleMappings(id: string) {
      return users.listRealmRoleMappings({ realm, id });
    },
    async addRealmRoleMappings(id: string, roles: KeycloakRealmRole[]) {
      await users.addRealmRoleMappings({ realm, id, roles });
    },
    async delRealmRoleMappings(id: string, roles: KeycloakRealmRole[]) {
      await users.delRealmRoleMappings({ realm, id, roles });
    },
  };
};

export type KeycloakUserSyncAdapter = ReturnType<typeof createKeycloakUserSyncAdapter>;
