import * as api from '@web-ts-toolkit/express-oidc-vault-mongodb-store';

if (typeof api.createMongoOidcVaultStore !== 'function') throw new Error('ESM factory export missing');
if (api.DEFAULT_ROTATED_SESSION_ALIAS_RETENTION_MS !== 300000) throw new Error('ESM default alias retention export missing');
if ('MongoOidcVaultStore' in api || 'resolveCollectionNames' in api) throw new Error('ESM internal export leaked');
import { MongoClient } from 'mongodb';
import { OidcVaultDpopReplayCapacityError } from '@web-ts-toolkit/express-oidc-vault';
import { assertDeviceBindingStore } from './store-contract.mjs';
// DBJWT-13: bounded handshake budget for the ephemeral replica set on loaded
// hosts — 60s server selection across fresh sockets, 30s per-socket connect.
// Both are finite (never zero/infinite) and fit the 180s test timeout.
// socketTimeoutMS stays at the driver default: only handshake/selection is
// extended, operation semantics are unchanged.
const client = new MongoClient(process.argv[2], { serverSelectionTimeoutMS: 60000, connectTimeoutMS: 30000 });
const peer = new MongoClient(process.argv[2], { serverSelectionTimeoutMS: 60000, connectTimeoutMS: 30000 });
await client.connect(); await peer.connect();
try {
  const options = { dpopReplayMaxEntries: 1, dpopProofsCollectionName: 'packed_proofs', dpopReplayCapacityCollectionName: 'packed_capacity' };
  await assertDeviceBindingStore(api.createMongoOidcVaultStore({ ...options, db: client.db(process.argv[3]) }),
    OidcVaultDpopReplayCapacityError, api.createMongoOidcVaultStore({ ...options, db: peer.db(process.argv[3]) }));
} finally { await peer.close(); await client.close(); }
console.log('CONSUMER OK');
