import { normalizeApiBaseURL } from '../../src/shared/normalize-api-base-url';

export const DB_NAME = '{{DB_NAME}}';
export const API_BASE_URL = normalizeApiBaseURL(process.env.API_BASE_URL);

const MONGODB_URI_ERROR =
  'MONGODB_URI must be a nonblank MongoDB connection string using mongodb:// or mongodb+srv://.';

export function requireMongoUri(value: string | undefined): string {
  const uri = value?.trim();
  if (!uri || /\s/u.test(uri)) throw new Error(MONGODB_URI_ERROR);

  try {
    const parsed = new URL(uri);
    if (
      !['mongodb:', 'mongodb+srv:'].includes(parsed.protocol) ||
      !parsed.hostname ||
      parsed.hash ||
      (parsed.protocol === 'mongodb+srv:' && parsed.port)
    ) {
      throw new Error(MONGODB_URI_ERROR);
    }
  } catch {
    throw new Error(MONGODB_URI_ERROR);
  }

  return uri;
}

export const MONGODB_URI = requireMongoUri(process.env.MONGODB_URI);
