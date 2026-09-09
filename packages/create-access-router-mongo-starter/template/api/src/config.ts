import { isMongoConnectionString } from '../../src/shared/mongo-connection-string';
import { normalizeApiBaseURL } from '../../src/shared/normalize-api-base-url';

export const DB_NAME = '{{DB_NAME}}';
export const API_BASE_URL = normalizeApiBaseURL(process.env.API_BASE_URL);

const MONGODB_URI_ERROR =
  'MONGODB_URI must be a nonblank MongoDB connection string using mongodb:// or mongodb+srv://.';

export function requireMongoUri(value: string | undefined): string {
  const uri = value?.trim();
  // WHATWG `new URL` is intentionally not used: it rejects normal multi-host
  // seed lists (e.g. `mongodb://db-a:27017,db-b:27017/app?replicaSet=rs0`)
  // required for transaction-capable MongoDB. See `src/shared/mongo-connection-string.ts`.
  if (!uri || !isMongoConnectionString(uri)) throw new Error(MONGODB_URI_ERROR);

  return uri;
}

export const MONGODB_URI = requireMongoUri(process.env.MONGODB_URI);
