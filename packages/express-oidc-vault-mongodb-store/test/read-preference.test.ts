import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Long,
  MongoClient,
  ReadConcern,
  ReadPreference,
  type CommandStartedEvent,
  type Db,
  type DbOptions,
  type MongoClientOptions,
  type ReadPreferenceMode,
} from 'mongodb';
import { createMongoOidcVaultStore } from '../src';
import { logoutTicket } from '../../express-oidc-vault/test/store-provider-conformance';
import { createReplicaSetHarness, MONGO_TIMEOUT, type MongoMemoryHarness } from './mongo-memory';

type Configuration = { label: string; level: 'default' | 'uri' | 'client' | 'db'; mode: ReadPreferenceMode };
const configurations: Configuration[] = [
  { label: 'primary control', level: 'default', mode: 'primary' },
  ...(['uri', 'client', 'db'] as const).flatMap((level) =>
    (['secondaryPreferred', 'secondary'] as const).map((mode) => ({ label: `${level}/${mode}`, level, mode })),
  ),
];
const absent = { deviceBinding: null, browserBindingHash: null } as const;
const sessionInput = (sessionId: string) => ({
  sessionId,
  subject: sessionId,
  providerSessionId: sessionId,
  refreshToken: 'fixture-refresh',
  idToken: 'fixture-id',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

describe('OVMONGO real-secondary read policy', () => {
  let harness: MongoMemoryHarness;
  let primary: string;
  let secondary: string;

  const role = (event: CommandStartedEvent) => {
    expect([primary, secondary]).toContain(event.address);
    return event.address === primary ? 'P' : 'S';
  };
  const summarize = (event: CommandStartedEvent) => ({
    command: event.commandName,
    role: role(event),
    preference: event.command.$readPreference?.mode ?? 'primary',
    session: !!event.command.lsid,
    transaction: event.command.autocommit === false,
    start: event.command.startTransaction === true,
    readConcern: event.command.readConcern?.level,
  });

  beforeAll(async () => {
    harness = await createReplicaSetHarness({ monitorCommands: true, replicaSetMembers: 2 });
    // Wait for a real SECONDARY, not just initiation/primary election.
    const deadline = Date.now() + 15_000;
    for (;;) {
      const status = await harness.client.db('admin').command({ replSetGetStatus: 1 });
      const members = status.members as { name: string; stateStr: string }[];
      primary = members.find((member) => member.stateStr === 'PRIMARY')?.name ?? '';
      secondary = members.find((member) => member.stateStr === 'SECONDARY')?.name ?? '';
      if (members.length === 2 && primary && secondary) break;
      if (Date.now() >= deadline) throw new Error('Disposable replica set did not acquire its secondary.');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const build = await harness.client.db('admin').command({ buildInfo: 1 });
    const status = await harness.client.db('admin').command({ serverStatus: 1 });
    const concerns = await harness.client.db('admin').command({ getDefaultRWConcern: 1 });
    const driverRequire = createRequire(require.resolve('mongodb'));
    const memoryRequire = createRequire(require.resolve('mongodb-memory-server'));
    console.info('OVMONGO topology', {
      driver: driverRequire('mongodb/package.json').version,
      memoryServer: memoryRequire('mongodb-memory-server/package.json').version,
      server: build.version,
      storageEngine: status.storageEngine.name,
      members: ['PRIMARY', 'SECONDARY'],
      defaultReadConcern: concerns.defaultReadConcern,
      defaultWriteConcern: concerns.defaultWriteConcern,
    });
  }, MONGO_TIMEOUT);

  afterAll(async () => {
    await harness?.stop();
  }, MONGO_TIMEOUT);

  // Test-only causal barrier: make setup visible on the secondary without a
  // replication sleep, changing store concerns, or treating visibility as routing.
  const replicated = async (db: Db) => {
    const write = await db.command({
      update: 'fixture_barrier',
      updates: [{ q: { _id: 'barrier' }, u: { $inc: { revision: 1 } }, upsert: true }],
      writeConcern: { w: 'majority' },
      maxTimeMS: 5000,
    });
    await db.command(
      {
        find: 'fixture_barrier',
        filter: { _id: 'barrier' },
        singleBatch: true,
        readConcern: { level: 'majority', afterClusterTime: write.operationTime },
        maxTimeMS: 5000,
      },
      { readPreference: 'secondary' },
    );
  };

  const run = async (
    configuration: Configuration,
    test: (db: Db, setup: Db, events: CommandStartedEvent[]) => Promise<void>,
    options: { client?: MongoClientOptions; db?: DbOptions } = {},
  ) => {
    const setup = harness.createDb('read-policy');
    const uri =
      configuration.level === 'uri'
        ? `${harness.uri}${harness.uri.includes('?') ? '&' : '?'}readPreference=${configuration.mode}`
        : harness.uri;
    const client = new MongoClient(uri, {
      monitorCommands: true,
      serverSelectionTimeoutMS: 5000,
      timeoutMS: 10_000,
      ...(configuration.level === 'client' ? { readPreference: configuration.mode } : {}),
      ...options.client,
    });
    const events: CommandStartedEvent[] = [];
    client.on('commandStarted', (event) => events.push(event));
    try {
      await client.connect();
      const db = client.db(setup.databaseName, {
        ...(configuration.level === 'db' ? { readPreference: configuration.mode } : {}),
        ...options.db,
      });
      expect(client.readPreference.mode).toBe(configuration.level === 'db' ? 'primary' : configuration.mode);
      expect(db.readPreference.mode).toBe(configuration.mode);
      await test(db, setup, events);
      // Store construction/transactions must not reconfigure caller handles.
      expect(db.readPreference.mode).toBe(configuration.mode);
      expect(db.collection('unrelated').readPreference?.mode).toBe(configuration.mode);
    } finally {
      try {
        await client.close();
      } finally {
        await setup.dropDatabase();
      }
    }
  };

  const prepare = async (setup: Db) => {
    const store = createMongoOidcVaultStore({ db: setup });
    await store.ready();
    for (const id of ['read', 'rotate', 'delete', 'logical', 'subject', 'provider', 'alias', 'expired']) {
      const created = await store.createSession({
        ...sessionInput(id),
        ...(id === 'expired' ? { expiresAt: Date.now() + 60_000 } : {}),
      });
      if (id === 'alias')
        await store.rotateSession({ sessionId: id, nextSession: { ...created, sessionId: 'alias-next' } });
    }
    for (const id of ['read', 'legacy', 'guarded']) {
      await store.createAuthorizationTransaction({
        state: id,
        nonce: 'n',
        pkceVerifier: 'v',
        codeChallenge: 'c',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
      await store.createExchangeCode({
        code: id,
        sessionId: 'read',
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
    }
    await replicated(setup);
    return store;
  };

  describe('operation inventory regression (OVMONGO-01 evidence, OVMONGO-02 primary policy)', () => {
    const inventory = async (configuration: Configuration) => {
      await run(configuration, async (db, setup, events) => {
        const results: { operation: string; outcome: unknown; commands: ReturnType<typeof summarize>[] }[] = [];
        const observe = async (operation: string, action: () => Promise<unknown>) => {
          const start = events.length;
          let outcome: unknown = 'ok';
          try {
            const result = await action();
            if (result === null || typeof result === 'boolean' || typeof result === 'number') outcome = result;
          } catch (error) {
            outcome = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          }
          results.push({ operation, outcome, commands: events.slice(start).map(summarize) });
        };
        const cold = createMongoOidcVaultStore({ db });
        await observe('cold readiness', () => cold.ready());
        // Retain the investigation's independent, causally replicated setup.
        await prepare(setup);
        const store = createMongoOidcVaultStore({ db });
        await observe('replicated readiness', () => store.ready());
        const future = createMongoOidcVaultStore({ db, now: () => Date.now() + 120_000 });
        await future.ready();
        await observe('expired session read and cleanup', () => future.getSession('expired'));
        await observe('session create', () => store.createSession(sessionInput('created')));
        await observe('session read', () => store.getSession('created'));
        await observe('authorization create', () =>
          store.createAuthorizationTransaction({
            state: 'created',
            nonce: 'n',
            pkceVerifier: 'v',
            codeChallenge: 'c',
            createdAt: Date.now(),
            expiresAt: Date.now() + 60_000,
          }),
        );
        await observe('authorization read', () => store.getAuthorizationTransaction('created'));
        await observe('authorization legacy consume', () => store.consumeAuthorizationTransaction('legacy'));
        await observe('authorization guarded consume', () =>
          store.consumeAuthorizationTransactionIfMatches({ state: 'guarded', match: absent }),
        );
        await observe('exchange create', () =>
          store.createExchangeCode({
            code: 'created',
            sessionId: 'read',
            createdAt: Date.now(),
            expiresAt: Date.now() + 60_000,
          }),
        );
        await observe('exchange read', () => store.getExchangeCode('created'));
        await observe('exchange legacy consume', () => store.consumeExchangeCode('legacy'));
        await observe('exchange guarded consume', () =>
          store.consumeExchangeCodeIfMatches({ code: 'guarded', expectedSessionId: 'read', match: absent }),
        );
        await observe('live revocation context', () => store.getSessionRevocationContext('read'));
        await observe('alias revocation context', () => store.getSessionRevocationContext('alias'));
        await observe('rotation', async () => {
          const next = await store.rotateSession({ sessionId: 'rotate', nextSession: sessionInput('rotated') });
          expect(next.logicalSessionId).toBe('rotate');
        });
        await observe('delete live session and alias cleanup', () => store.deleteSession('delete'));
        await observe('delete via alias and alias cleanup', () => store.deleteSession('alias'));
        await observe('delete logical lineage and alias cleanup', () =>
          store.deleteSessionsByLogicalSessionId('logical'),
        );
        await observe('delete subject enumeration and cleanup', () => store.deleteSessionsBySubject('subject'));
        await observe('delete provider-session enumeration and cleanup', () =>
          store.deleteSessionsByProviderSessionId('provider'),
        );
        await observe('backchannel JTI create', () =>
          store.consumeBackchannelLogoutTokenJti({ jti: 'jti', expiresAt: Date.now() + 60_000 }),
        );
        await observe('backchannel JTI duplicate', () =>
          store.consumeBackchannelLogoutTokenJti({ jti: 'jti', expiresAt: Date.now() + 60_000 }),
        );
        await observe('backchannel JTI expired reuse', () =>
          future.consumeBackchannelLogoutTokenJti({ jti: 'jti', expiresAt: Date.now() + 180_000 }),
        );
        await observe('DPoP reserve', () =>
          store.reserveDpopProof({ replayKey: 'proof', expiresAt: Date.now() + 60_000 }),
        );
        await observe('DPoP reserve duplicate', () =>
          store.reserveDpopProof({ replayKey: 'proof', expiresAt: Date.now() + 60_000 }),
        );
        const state = {
          deletedSessionAbsent:
            (await setup.collection<{ _id: string }>('oidc_vault_sessions').countDocuments({ _id: 'delete' })) === 0,
          replayProofs: await setup.collection('oidc_vault_dpop_proofs').countDocuments({}),
          replayEntries: (
            await setup
              .collection<{ _id: string; entries: number }>('oidc_vault_dpop_replay_capacity')
              .findOne({ _id: 'capacity' })
          )?.entries,
        };
        for (const result of results) {
          console.info(
            'OVMONGO inventory',
            configuration.label,
            result.operation,
            result.outcome,
            result.commands
              .map(
                (command) =>
                  `${command.command}:${command.role}/${command.preference}${command.transaction ? '/txn' : '/implicit'}${command.start ? '/start' : ''}${command.readConcern ? `/${command.readConcern}` : ''}`,
              )
              .join(' '),
          );
          expect(result.commands.every((command) => command.session)).toBe(true);
          expect(result.commands.every((command) => command.role === 'P' && command.preference === 'primary')).toBe(
            true,
          );
          for (const command of result.commands.filter((command) => command.start)) {
            expect(command.readConcern).toBe(result.operation === 'rotation' ? undefined : 'snapshot');
          }
        }
        console.info('OVMONGO state', configuration.label, state);
        expect(results.map(({ operation, outcome }) => [operation, outcome])).toEqual([
          ['cold readiness', 'ok'],
          ['replicated readiness', 'ok'],
          ['expired session read and cleanup', null],
          ['session create', 'ok'],
          ['session read', 'ok'],
          ['authorization create', 'ok'],
          ['authorization read', 'ok'],
          ['authorization legacy consume', 'ok'],
          ['authorization guarded consume', 'ok'],
          ['exchange create', 'ok'],
          ['exchange read', 'ok'],
          ['exchange legacy consume', 'ok'],
          ['exchange guarded consume', 'ok'],
          ['live revocation context', 'ok'],
          ['alias revocation context', 'ok'],
          ['rotation', 'ok'],
          ['delete live session and alias cleanup', 'ok'],
          ['delete via alias and alias cleanup', 'ok'],
          ['delete logical lineage and alias cleanup', 1],
          ['delete subject enumeration and cleanup', 1],
          ['delete provider-session enumeration and cleanup', 1],
          ['backchannel JTI create', true],
          ['backchannel JTI duplicate', false],
          ['backchannel JTI expired reuse', true],
          ['DPoP reserve', true],
          ['DPoP reserve duplicate', false],
        ]);
        expect(state).toEqual({ deletedSessionAbsent: true, replayProofs: 1, replayEntries: 1 });
      });
    };
    it.each(configurations)('$label', inventory, MONGO_TIMEOUT);
  });

  describe('driver boundary experiment', () => {
    const boundary = async (configuration: Configuration) => {
      await run(configuration, async (db, setup, events) => {
        await setup.collection('boundary').insertOne({ value: 1 });
        await replicated(setup);
        for (const variant of ['inherited', 'collection-only', 'transaction-only', 'both'] as const) {
          const collectionPrimary = variant === 'collection-only' || variant === 'both';
          const transactionPrimary = variant === 'transaction-only' || variant === 'both';
          const collection = db.collection('boundary', collectionPrimary ? { readPreference: 'primary' } : {});
          let start = events.length;
          await collection.findOne({});
          expect(role(events[start])).toBe(collectionPrimary || configuration.mode === 'primary' ? 'P' : 'S');
          const session = db.client.startSession();
          start = events.length;
          let failure: unknown;
          try {
            await session.withTransaction(
              async () => {
                await collection.findOne({}, { session });
              },
              transactionPrimary
                ? { readPreference: 'primary', readConcern: { level: 'snapshot' } }
                : { readConcern: { level: 'snapshot' } },
            );
          } catch (error) {
            failure = error;
          } finally {
            await session.endSession();
          }
          const nonprimaryClient = configuration.level !== 'db' && configuration.mode !== 'primary';
          if (!transactionPrimary && nonprimaryClient) {
            expect(failure).toMatchObject({
              name: 'MongoTransactionError',
              message: `Read preference in a transaction must be primary, not: ${configuration.mode}`,
            });
            expect(events.slice(start).filter((event) => event.commandName === 'find')).toHaveLength(0);
          } else {
            expect(failure).toBeUndefined();
            expect(
              events
                .slice(start)
                .filter((event) => event.commandName === 'find')
                .map(role),
            ).toEqual(['P']);
          }
          console.info(
            'OVMONGO boundary',
            configuration.label,
            variant,
            JSON.stringify({
              transactionPreference:
                transactionPrimary || configuration.level === 'db' ? 'primary' : configuration.mode,
              outcome: failure instanceof Error ? failure.message : 'ok',
              commands: events.slice(start).map(summarize),
            }),
          );
        }
      });
    };
    it.each(configurations)('$label: collection-only vs transaction-only vs both', boundary, MONGO_TIMEOUT);
  });

  // Ordinary assertions retained from OVMONGO-01's fail-before reproduction.
  describe('OVMONGO-02 regression', () => {
    const readiness = async (configuration: Configuration) => {
      await run(configuration, async (db, _setup, events) => {
        const store = createMongoOidcVaultStore({ db });
        await store.ready();
        const reads = events.filter((event) => ['hello', 'listIndexes', 'find'].includes(event.commandName));
        expect(reads.map(role)).toEqual(Array(6).fill('P'));
      });
    };
    it.each(configurations)(
      '$label: cold readiness validates indexes and capacity on primary',
      readiness,
      MONGO_TIMEOUT,
    );

    const reads = async (configuration: Configuration) => {
      await run(configuration, async (db, setup, events) => {
        await prepare(setup);
        const store = createMongoOidcVaultStore({ db });
        await store.ready();
        const start = events.length;
        expect(await store.getSession('read')).toMatchObject({ sessionId: 'read' });
        expect(
          events
            .slice(start)
            .filter((event) => event.commandName === 'find')
            .map(role),
        ).toEqual(['P']);
        const unrelated = events.length;
        await db.collection('unrelated').findOne({});
        expect(role(events[unrelated])).toBe(configuration.mode === 'primary' ? 'P' : 'S');
      });
    };
    it.each(configurations)(
      '$label: vault reads select primary while unrelated reads retain caller policy',
      reads,
      MONGO_TIMEOUT,
    );

    const transactions = async (configuration: Configuration) => {
      await run(configuration, async (db, setup, events) => {
        await prepare(setup);
        const store = createMongoOidcVaultStore({ db });
        await store.ready();
        const start = events.length;
        expect(await store.getSessionRevocationContext('alias')).toEqual({ logicalSessionId: 'alias' });
        await store.rotateSession({ sessionId: 'rotate', nextSession: sessionInput('rotated') });
        await store.deleteSessionsByLogicalSessionId('logical');
        expect(await store.reserveDpopProof({ replayKey: 'proof', expiresAt: Date.now() + 60_000 })).toBe(true);
        expect(await store.reserveDpopProof({ replayKey: 'proof', expiresAt: Date.now() + 60_000 })).toBe(false);
        const transactional = events.slice(start).filter((event) => event.command.autocommit === false);
        expect(transactional.filter((event) => event.command.startTransaction)).toHaveLength(5);
        expect(
          transactional
            .filter((event) => event.command.startTransaction)
            .map((event) => event.command.readConcern?.level),
        ).toEqual(['snapshot', undefined, 'snapshot', 'snapshot', 'snapshot']);
        expect(transactional.map(role).every((selected) => selected === 'P')).toBe(true);
      });
    };
    it.each(configurations)(
      '$label: all four transaction boundaries accept the supplied Db',
      transactions,
      MONGO_TIMEOUT,
    );

    it.each(['client', 'db'] as const)(
      '%s: preserves custom namespaces, tagged caller preference, BSON options and concerns',
      async (level) => {
        const preference = new ReadPreference('secondaryPreferred', [{ fixture: 'not-a-member-tag' }, {}], {
          maxStalenessSeconds: 120,
        });
        const inherited = {
          readPreference: preference,
          readConcern: new ReadConcern('majority'),
          writeConcern: { w: 'majority', wtimeoutMS: 5000 },
          promoteLongs: false,
          ignoreUndefined: true,
        } as const;
        await run(
          { label: `${level}/custom-options`, level, mode: 'secondaryPreferred' },
          async (db, setup, events) => {
            const before = {
              clientPreference: db.client.readPreference,
              dbPreference: db.readPreference,
              readConcern: db.readConcern,
              writeConcern: db.writeConcern,
              bsonOptions: { ...db.bsonOptions },
            };
            const names = {
              authorizationTransactionsCollectionName: 'custom_authorization',
              exchangeCodesCollectionName: 'custom_exchange',
              sessionsCollectionName: 'custom_sessions',
              backchannelLogoutTokenJtisCollectionName: 'custom_jtis',
              rotatedSessionAliasesCollectionName: 'custom_aliases',
              dpopProofsCollectionName: 'custom_proofs',
              dpopReplayCapacityCollectionName: 'custom_capacity',
              logoutNavigationTicketsCollectionName: 'custom_logout_tickets',
              logoutNavigationCapacityCollectionName: 'custom_logout_capacity',
            };
            const store = createMongoOidcVaultStore({ db, ...names });
            await store.ready();
            const metadata = { long: Long.fromNumber(42), omitted: undefined };
            const original = await store.createSession({ ...sessionInput('source'), metadata });
            expect((await store.getSession('source'))?.metadata).toEqual({ long: Long.fromNumber(42) });
            await store.rotateSession({ sessionId: 'source', nextSession: { ...original, sessionId: 'next' } });
            expect(await store.getSessionRevocationContext('source')).toEqual({ logicalSessionId: 'source' });
            expect(await store.reserveDpopProof({ replayKey: 'custom', expiresAt: Date.now() + 60_000 })).toBe(true);
            expect(await store.deleteSessionsBySubject('source')).toBe(1);
            const ticket = logoutTicket(Date.now());
            await store.createLogoutNavigationTicket(ticket);
            expect(await store.consumeLogoutNavigationTicket(ticket)).toEqual(ticket);
            expect((await setup.listCollections().toArray()).map((row) => row.name).sort()).toEqual(
              Object.values(names).sort(),
            );
            const vaultEvents = events.filter((event) => event.databaseName === db.databaseName);
            expect(vaultEvents.length).toBeGreaterThan(0);
            expect(vaultEvents.map(role).every((selected) => selected === 'P')).toBe(true);
            const starts = vaultEvents.filter((event) => event.command.startTransaction);
            expect(starts.map((event) => event.command.readConcern?.level)).toEqual([
              level === 'client' ? 'majority' : undefined,
              'snapshot',
              'snapshot',
              'snapshot',
              'snapshot',
              'snapshot',
            ]);
            expect(
              vaultEvents.find((event) => event.commandName === 'find' && event.command.autocommit !== false)?.command
                .readConcern,
            ).toEqual({ level: 'majority' });
            expect(
              vaultEvents.find(
                (event) => event.commandName === 'update' && event.command.update === names.sessionsCollectionName,
              )?.command.writeConcern,
            ).toEqual({ w: 'majority', wtimeout: 5000 });
            expect(db.client.readPreference).toBe(before.clientPreference);
            expect(db.readPreference).toBe(before.dbPreference);
            expect(db.readPreference.tags).toEqual([{ fixture: 'not-a-member-tag' }, {}]);
            expect(db.readPreference.maxStalenessSeconds).toBe(120);
            expect(db.readConcern).toBe(before.readConcern);
            expect(db.writeConcern).toBe(before.writeConcern);
            expect(db.bsonOptions).toEqual(before.bsonOptions);
            const unrelated = db.collection('unrelated');
            expect(unrelated.readPreference).toBe(before.dbPreference);
            expect(unrelated.readConcern).toEqual(before.readConcern);
            expect(unrelated.writeConcern).toEqual(before.writeConcern);
            expect(unrelated.bsonOptions).toEqual(before.bsonOptions);
            await unrelated.insertOne({ metadata });
            await replicated(setup);
            const start = events.length;
            expect((await unrelated.findOne({}))?.metadata).toEqual({ long: Long.fromNumber(42) });
            expect(role(events[start])).toBe('S');
            const session = db.client.startSession();
            try {
              session.startTransaction();
              expect(session.transaction.options.readPreference).toEqual(before.clientPreference);
              await session.abortTransaction();
            } finally {
              await session.endSession();
            }
          },
          {
            client: { timeoutMS: undefined, ...(level === 'client' ? inherited : {}) },
            ...(level === 'db' ? { db: inherited } : {}),
          },
        );
      },
      MONGO_TIMEOUT,
    );
  });

  it(
    'rejects primary-required work during an actual primary outage while a caller secondary read still succeeds',
    async () => {
      // A separate two-voter set: after crashing its primary, the remaining member
      // cannot elect itself. Never perturb the shared routing/control fixture.
      const outage = await createReplicaSetHarness({ replicaSetMembers: 2, serverSelectionTimeoutMS: 1000 });
      const client = new MongoClient(outage.uri, {
        readPreference: 'secondaryPreferred',
        monitorCommands: true,
        heartbeatFrequencyMS: 500,
        serverSelectionTimeoutMS: 1000,
        // Readiness creates indexes while other replica-set files are running.
        // Keep its normal setup budget; unavailable-primary selection is still 1s.
        timeoutMS: 10_000,
      });
      const events: CommandStartedEvent[] = [];
      client.on('commandStarted', (event) => events.push(event));
      try {
        await client.connect();
        const setup = outage.createDb('primary-outage');
        const db = client.db(setup.databaseName);
        // Establish both voting members before majority-write readiness/setup.
        await replicated(setup);
        const store = createMongoOidcVaultStore({ db });
        await store.ready();
        const original = await store.createSession(sessionInput('outage-source'));
        const ticket = logoutTicket(Date.now());
        await store.createLogoutNavigationTicket(ticket);
        await setup.collection('unrelated').insertOne({ marker: 'still-on-secondary' });
        await replicated(setup);
        const { primary: stoppedPrimary } = await setup.command({ hello: 1 });
        await outage.stopPrimary();
        const start = events.length;
        for (const operation of [
          () => store.getSession('outage-source'),
          () => store.getSessionRevocationContext('outage-source'),
          () =>
            store.rotateSession({ sessionId: 'outage-source', nextSession: { ...original, sessionId: 'outage-next' } }),
          () => store.reserveDpopProof({ replayKey: 'outage', expiresAt: Date.now() + 60_000 }),
          () => store.consumeLogoutNavigationTicket(ticket),
          () => store.createLogoutNavigationTicket(logoutTicket(Date.now(), 'outage-create')),
        ]) {
          await expect(operation()).rejects.toMatchObject({
            name: expect.stringMatching(/^Mongo(ServerSelection|OperationTimeout|Network)Error$/),
          });
        }
        // No authentication-state command may be sent to the surviving secondary.
        expect(events.slice(start).filter((event) => event.databaseName === db.databaseName)).toEqual([]);
        const cold = createMongoOidcVaultStore({ db });
        const failure = await cold.ready().catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(Error);
        await expect(cold.getSession('outage-source')).rejects.toBe(failure);
        const callerStart = events.length;
        expect(await db.collection('unrelated').findOne({})).toMatchObject({ marker: 'still-on-secondary' });
        expect(events[callerStart].command.$readPreference?.mode).toBe('secondaryPreferred');
        expect(events[callerStart].address).not.toBe(stoppedPrimary);
      } finally {
        try {
          await client.close();
        } finally {
          await outage.stop();
        }
      }
    },
    MONGO_TIMEOUT,
  );
});
