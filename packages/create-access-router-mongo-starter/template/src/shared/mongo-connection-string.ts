/**
 * Bounded MongoDB connection-string grammar shared by deploy-time validation
 * (`scripts/deploy-shared.ts`) and generated-runtime validation
 * (`template/api/src/config.ts`).
 *
 * Deliberate placement: this file lives in the generated template's own
 * `src/shared` tree so generated apps never import scaffolder internals; the
 * scaffolder imports it from the template source, mirroring the existing
 * `normalize-api-base-url.ts` arrangement. WHATWG `new URL` is intentionally
 * not used here because it rejects normal multi-host seed lists such as
 * `mongodb://db-a:27017,db-b:27017/app?replicaSet=rs0`, which the
 * transaction-capable MongoDB requirement depends on.
 *
 * Accepted grammar (bounded, no network or driver needed):
 *   mongodb://[user[:password]@]host1[:port1][,host2[:port2]...][/db][?opts]
 *   mongodb+srv://[user[:password]@]single-host[/db][?opts]
 * Hosts may be DNS names, IPv4 literals, or bracketed IPv6 literals
 * (`[::1][:port]`); bare unbracketed IPv6 is rejected. SRV accepts exactly one
 * host and no port. Fragments (`#`) and whitespace are always rejected.
 */

function isValidPort(port: string): boolean {
  if (!/^\d+$/u.test(port)) return false;
  const n = Number(port);
  return Number.isSafeInteger(n) && n >= 1 && n <= 65535;
}

function isValidHostname(host: string): boolean {
  if (!host) return false;
  // Hosts never legitimately contain these; this also keeps userinfo/query
  // delimiters from leaking across grammar boundaries.
  if (/[\s/@#,[\]?]/u.test(host)) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/u.test(host)) return false;
  return true;
}

function isValidHostEntry(entry: string, allowPort: boolean): boolean {
  if (!entry) return false;
  if (entry.startsWith('[')) {
    const close = entry.indexOf(']');
    if (close <= 1) return false;
    if (/\s/u.test(entry.slice(1, close))) return false;
    const rest = entry.slice(close + 1);
    if (!rest) return true;
    if (!rest.startsWith(':')) return false;
    const port = rest.slice(1);
    return allowPort && port.length > 0 && isValidPort(port);
  }
  if (entry.includes('[') || entry.includes(']')) return false;
  const colons = entry.split(':').length - 1;
  // More than one colon without brackets is a bare IPv6 literal, which the
  // MongoDB URI spec requires to be bracketed; reject it rather than guess.
  if (colons > 1) return false;
  if (colons === 0) return isValidHostname(entry);
  const separator = entry.lastIndexOf(':');
  const host = entry.slice(0, separator);
  const port = entry.slice(separator + 1);
  return allowPort && isValidHostname(host) && isValidPort(port);
}

export function isMongoConnectionString(value: string): boolean {
  if (!value || /\s/u.test(value)) return false;

  const schemeEnd = value.indexOf('://');
  if (schemeEnd === -1) return false;
  const scheme = value.slice(0, schemeEnd).toLowerCase();
  const isSrv = scheme === 'mongodb+srv';
  if (!isSrv && scheme !== 'mongodb') return false;

  let rest = value.slice(schemeEnd + 3);
  if (!rest) return false;
  if (rest.includes('#')) return false;

  const queryIndex = rest.indexOf('?');
  if (queryIndex !== -1) {
    const query = rest.slice(queryIndex + 1);
    rest = rest.slice(0, queryIndex);
    if (rest.includes('?')) return false;
    // A `?` must introduce actual connection options.
    if (!query) return false;
  }

  let authority = rest;
  const slashIndex = rest.indexOf('/');
  if (slashIndex !== -1) {
    authority = rest.slice(0, slashIndex);
    // The database name is optional, but it must not nest or smuggle
    // delimiters once the query string has been removed.
    if (rest.slice(slashIndex + 1).includes('/')) return false;
  }
  if (!authority) return false;

  let hosts = authority;
  const atIndex = authority.lastIndexOf('@');
  if (atIndex !== -1) {
    const userinfo = authority.slice(0, atIndex);
    hosts = authority.slice(atIndex + 1);
    if (!hosts) return false;
    const user = userinfo.split(':')[0];
    // Credentials may carry sub-delims; only the nonblank user, the absence
    // of whitespace/path characters, and a present host list are enforced.
    if (!user || /[/\s]/u.test(userinfo)) return false;
  }

  const entries = hosts.split(',');
  if (entries.length === 0) return false;
  if (isSrv && entries.length !== 1) return false;
  // SRV bootstraps from a DNS record, so IP literals (which are never
  // bracket-escaped here) are rejected; only plain hostnames are allowed.
  if (isSrv && entries[0].includes('[')) return false;
  return entries.every((entry) => isValidHostEntry(entry, !isSrv));
}
