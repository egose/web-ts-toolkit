import type {
  ConsumeLogoutNavigationTicketInput,
  OidcVaultLogoutNavigationTicket,
} from '@web-ts-toolkit/express-oidc-vault';

const HASH = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const PREFIX = 'logout-navigation:v1:';
// eslint-disable-next-line no-control-regex -- Raw URL controls must be rejected before URL normalization.
const UNSAFE_URL = /[\s\\\u0000-\u001f\u007f-\u009f]/u;
export const usableEpoch = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 8_640_000_000_000_000;

export const captureTicketIdentity = (
  input: ConsumeLogoutNavigationTicketInput,
): ConsumeLogoutNavigationTicketInput => ({
  namespace: input?.namespace,
  ticketHash: input?.ticketHash,
});

export const validTicketIdentity = (input: ConsumeLogoutNavigationTicketInput): boolean =>
  typeof input.namespace === 'string' &&
  input.namespace.startsWith(PREFIX) &&
  HASH.test(input.namespace.slice(PREFIX.length)) &&
  typeof input.ticketHash === 'string' &&
  HASH.test(input.ticketHash);

export const captureTicket = (input: OidcVaultLogoutNavigationTicket): OidcVaultLogoutNavigationTicket => ({
  ...captureTicketIdentity(input),
  upstreamLogoutUrl: input?.upstreamLogoutUrl,
  createdAt: input?.createdAt,
  expiresAt: input?.expiresAt,
});

export const validTicket = (record: OidcVaultLogoutNavigationTicket, now?: number): boolean => {
  if (
    !record ||
    typeof record !== 'object' ||
    Array.isArray(record) ||
    Object.keys(record).length !== 5 ||
    !validTicketIdentity(record) ||
    !usableEpoch(record.createdAt) ||
    !usableEpoch(record.expiresAt) ||
    record.expiresAt - record.createdAt < 1000 ||
    record.expiresAt - record.createdAt > 120_000 ||
    (now !== undefined && (record.expiresAt <= now || record.expiresAt - now > 120_000)) ||
    typeof record.upstreamLogoutUrl !== 'string' ||
    !/^https?:\/\//i.test(record.upstreamLogoutUrl) ||
    /^https?:\/\/[^/?#]*@/i.test(record.upstreamLogoutUrl) ||
    UNSAFE_URL.test(record.upstreamLogoutUrl) ||
    Buffer.byteLength(record.upstreamLogoutUrl, 'utf8') > 16_384
  )
    return false;
  try {
    const url = new URL(record.upstreamLogoutUrl);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !record.upstreamLogoutUrl.includes('#') &&
      Buffer.byteLength(url.href, 'utf8') <= 16_384
    );
  } catch {
    return false;
  }
};

export const assertTicket = (record: OidcVaultLogoutNavigationTicket, now?: number): void => {
  if (!validTicket(record, now)) throw new TypeError('OIDC vault logout navigation ticket is invalid or expired.');
};

export const ticketLimit = (value: number | undefined): number => {
  const max = value === undefined ? 10_000 : value;
  if (!Number.isSafeInteger(max) || max <= 0)
    throw new TypeError('OIDC vault logoutNavigationMaxEntries must be a positive safe integer.');
  return max;
};

export const ticketId = ({ namespace, ticketHash }: ConsumeLogoutNavigationTicketInput): string =>
  `${namespace}:${ticketHash}`;
