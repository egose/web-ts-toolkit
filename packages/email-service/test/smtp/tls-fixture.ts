import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';

export const TLS_NAME = 'smtp.loopback.invalid';

/** Fresh, short-lived synthetic CA and server key; the fixture never uses or preserves host trust material. */
export function createSmtpTlsFixture(dnsName = TLS_NAME) {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(dnsName)) throw new Error('Expected a synthetic fixture DNS name.');
  const root = resolve(import.meta.dirname, '../../../..');
  const base = realpathSync(tmpdir());
  if (!relative(root, base).split(sep)[0]?.startsWith('_tmp')) {
    throw new Error('Set TMPDIR to an existing, gitignored repo-local _tmp* directory.');
  }
  execFileSync('git', ['check-ignore', '--', base], { cwd: root, timeout: 5_000 });
  const cwd = mkdtempSync(join(base, 'smtp-fixture-'));
  const close = () => rmSync(cwd, { recursive: true, force: true });
  const openssl = (...args: string[]) =>
    execFileSync('openssl', args, { cwd, timeout: 5_000, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const keyOptions = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-noenc', '-sha256', '-batch'];
  try {
    openssl(
      'req',
      '-x509',
      ...keyOptions,
      '-subj',
      '/CN=Synthetic SMTP test CA',
      '-days',
      '2',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign',
      '-keyout',
      'ca.key',
      '-out',
      'ca.pem',
    );
    openssl('req', '-new', ...keyOptions, '-subj', `/CN=${dnsName}`, '-keyout', 'server.key', '-out', 'server.csr');
    writeFileSync(
      join(cwd, 'server-extensions.cnf'),
      `basicConstraints=critical,CA:FALSE\nkeyUsage=digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:${dnsName},IP:127.0.0.1\n`,
    );
    openssl(
      'x509',
      '-req',
      '-in',
      'server.csr',
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-days',
      '2',
      '-sha256',
      '-extfile',
      'server-extensions.cnf',
      '-out',
      'server.pem',
    );
    return {
      ca: readFileSync(join(cwd, 'ca.pem'), 'utf8'),
      server: { key: readFileSync(join(cwd, 'server.key')), cert: readFileSync(join(cwd, 'server.pem'), 'utf8') },
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}
