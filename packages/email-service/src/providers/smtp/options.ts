import { X509Certificate } from 'node:crypto';
import { isIP } from 'node:net';
import { createSecureContext, type SecureContext } from 'node:tls';
import { SMTP_DEFAULT_PORTS, SMTP_MIN_TLS_VERSION } from '../../constants';
import type { SmtpSnapshot } from '../../contracts/provider';
import { readCapacityOption, type CapacityContext } from '../../internal/smtp-capacity';
import {
  headerString,
  identifier,
  integer,
  invalid,
  readArray,
  readRecord,
  utf8String,
} from '../../internal/validation';

const CONFIG = 'invalid_config';
const DNS_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const MAX_CERTIFICATES = 16;
const MAX_PEM_BYTES = 16 * 1024;
const MAX_CREDENTIAL_BYTES = 1024;

export type SmtpConfig = Readonly<{
  ref: SmtpSnapshot['provider'];
  host: string;
  port: number;
  tls: 'implicit' | 'starttls';
  identity: string;
  servername: string | undefined;
  secureContext: SecureContext;
  auth: Readonly<{ user: string; pass: string }> | undefined;
  capacity: CapacityContext | undefined;
}>;

function dnsName(value: string): boolean {
  return value.split('.').every((part) => DNS_LABEL.test(part));
}

function caCertificate(input: unknown): string {
  const pem = utf8String(input, MAX_PEM_BYTES, CONFIG);
  const match =
    /^-----BEGIN CERTIFICATE-----\r?\n([A-Za-z0-9+/=]+(?:\r?\n[A-Za-z0-9+/=]+)*)\r?\n-----END CERTIFICATE-----(?:\r?\n)?(?![\s\S])/.exec(
      pem,
    );
  if (!match?.[1]) invalid(CONFIG);
  const base64 = match[1].replace(/\r?\n/g, '');
  const der = Buffer.from(base64, 'base64');
  if (!der.length || der.toString('base64') !== base64) invalid(CONFIG);
  try {
    const cert = new X509Certificate(der);
    if (cert.ca && cert.raw.equals(der)) return cert.toString();
  } catch {
    // Do not disclose PEM contents or OpenSSL diagnostics.
  }
  return invalid(CONFIG);
}

function readAuth(input: unknown): SmtpConfig['auth'] {
  const fields = readRecord(input, ['user', 'pass'], [], CONFIG);
  const user = headerString(fields.user, MAX_CREDENTIAL_BYTES, CONFIG);
  const pass = headerString(fields.pass, MAX_CREDENTIAL_BYTES, CONFIG);
  if (!user.trim() || !pass) invalid(CONFIG);
  return Object.freeze({ user, pass });
}

export function readSmtpConfig(input: unknown): SmtpConfig {
  const raw = readRecord(input, ['key', 'host', 'tls'], ['port', 'servername', 'ca', 'auth', 'smtpCapacity'], CONFIG);
  const capacity = readCapacityOption(raw);
  const ref = Object.freeze({ kind: 'smtp', key: identifier(raw.key, CONFIG), mode: 'live' } as const);
  const { tls } = raw;
  if (tls !== 'implicit' && tls !== 'starttls') invalid(CONFIG);
  const host = headerString(raw.host, 253, CONFIG);
  const ip = isIP(host);
  if (host.includes('%') || (!ip && !dnsName(host))) invalid(CONFIG);
  const port = Object.hasOwn(raw, 'port') ? integer(raw.port, 1, 65_535, CONFIG) : SMTP_DEFAULT_PORTS[tls];
  const servername = Object.hasOwn(raw, 'servername')
    ? headerString(raw.servername, 253, CONFIG)
    : ip
      ? undefined
      : host;
  if (servername !== undefined && (isIP(servername) || !dnsName(servername))) invalid(CONFIG);
  const auth = Object.hasOwn(raw, 'auth') ? readAuth(raw.auth) : undefined;
  const ca = Object.hasOwn(raw, 'ca') ? readArray(raw.ca, MAX_CERTIFICATES, CONFIG, caCertificate) : undefined;
  if (ca?.length === 0) invalid(CONFIG);
  try {
    const secureContext = createSecureContext({ minVersion: SMTP_MIN_TLS_VERSION, ...(ca ? { ca: [...ca] } : {}) });
    return Object.freeze({
      ref,
      host,
      port,
      tls,
      identity: servername ?? host,
      servername,
      secureContext,
      auth,
      capacity,
    });
  } catch {
    return invalid(CONFIG);
  }
}
