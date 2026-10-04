import type { RequestHandler } from 'express';

/** Exact-origin credentialed CORS; source checks remain enforced by the vault. */
export const createExampleCors = (
  origins: readonly string[],
  fingerprintHeader = 'X-Device-Fingerprint',
): RequestHandler => {
  const trusted = new Set(origins.map((origin) => new URL(origin).origin));
  const headers = ['Content-Type', 'Authorization', 'DPoP', fingerprintHeader];
  const permitted = new Set(headers.map((header) => header.toLowerCase()));
  return (req, res, next) => {
    res.vary('Origin');
    const origin = req.get('Origin');
    if (origin && trusted.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Expose-Headers', 'DPoP-Nonce, WWW-Authenticate');
    }
    if (req.method !== 'OPTIONS') {
      next();
      return;
    }
    res.vary('Access-Control-Request-Headers');
    const requested = (req.get('Access-Control-Request-Headers') ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (!origin || !trusted.has(origin) || requested.some((header) => !permitted.has(header))) {
      res.status(403).end();
      return;
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', headers.join(', '));
    res.status(204).end();
  };
};
