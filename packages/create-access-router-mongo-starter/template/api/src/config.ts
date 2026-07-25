import { normalizeApiBaseURL } from '../../src/shared/normalize-api-base-url';

export const DB_NAME = '{{DB_NAME}}';
export const PORT = Number(process.env.PORT || '8000');
export const HOST = process.env.HOST || '0.0.0.0';

export const API_BASE_URL = normalizeApiBaseURL(process.env.API_BASE_URL);
