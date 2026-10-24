import assert from 'node:assert/strict';
import { assertDeviceBindingStore, assertLogoutNavigationStore } from './store-contract.mjs';

// Runs against installed, release-transformed ESM/CJS roots and a real secondary.
export async function assertPrimaryReadPolicy(api, CapacityError, client, peer, databaseName, dbMode, peerMode, ticketErrors) {
  const clients = [client, peer];
  const preferences = clients.map((caller) => caller.readPreference);
  const events = [];
  const monitor = (event) => events.push(event);
  clients.forEach((caller) => caller.on('commandStarted', monitor));
  try {
    const { primary } = await client.db('admin').command({ hello: 1 });
    assert.equal(typeof primary, 'string');
    const db = client.db(databaseName, { readPreference: dbMode });
    const peerDb = peer.db(databaseName, { readPreference: peerMode });
    const options = {
      dpopReplayMaxEntries: 1,
      dpopProofsCollectionName: 'packed_proofs',
      dpopReplayCapacityCollectionName: 'packed_capacity',
      logoutNavigationMaxEntries: 1,
      logoutNavigationTicketsCollectionName: 'packed_logout_tickets',
      logoutNavigationCapacityCollectionName: 'packed_logout_capacity',
    };
    await assertDeviceBindingStore(
      api.createMongoOidcVaultStore({ ...options, db }),
      CapacityError,
      api.createMongoOidcVaultStore({ ...options, db: peerDb }),
    );
    await assertLogoutNavigationStore(
      api.createMongoOidcVaultStore({ ...options, db }), ticketErrors,
      api.createMongoOidcVaultStore({ ...options, db: peerDb }),
    );
    const vaultCommands = events.filter((event) => event.databaseName === databaseName);
    assert.ok(vaultCommands.some((event) => event.commandName === 'listIndexes'));
    assert.ok(vaultCommands.some((event) => event.commandName === 'find'));
    assert.ok(vaultCommands.some((event) => event.command.startTransaction));
    assert.ok(vaultCommands.every((event) => event.address === primary));
    for (const [index, callerDb] of [db, peerDb].entries()) {
      assert.equal(clients[index].readPreference, preferences[index]);
      assert.equal(callerDb.readPreference.mode, index === 0 ? dbMode : peerMode);
      const start = events.length;
      await callerDb.collection('unrelated').findOne({});
      assert.notEqual(events[start].address, primary);
    }
  } finally {
    clients.forEach((caller) => caller.off('commandStarted', monitor));
  }
}
