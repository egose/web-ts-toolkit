import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import {
  BlobSASPermissions,
  ContainerClient,
  ContainerSASPermissions,
  generateBlobSASQueryParameters,
  newPipeline,
  SASProtocol,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import { createAzureAttachmentContainerClient } from '../../src/attachments/azure';

export const AZURE_REST_VERSION = '2026-10-06';
const exec = promisify(execFile);
const HOST = '127.0.0.1';

export function fixtureContainerName(): string {
  return `mail-${randomBytes(10).toString('hex')}`;
}

export const fixtureCall = () => ({ abortSignal: AbortSignal.timeout(5_000) });

/** Locked local dev dependency, no server/connection-string override and no cloud credentials. */
export async function startAzurite() {
  const root = resolve(import.meta.dirname, '../../../..');
  const base = tmpdir();
  if (!relative(root, base).split(sep)[0]?.startsWith('_tmp')) {
    throw new Error('Run test:azure with ignored checkout-local scratch (use pnpm test:azure)');
  }
  await exec('git', ['check-ignore', '-q', '--', base], { cwd: root, timeout: 5_000 });
  const cli = resolve(import.meta.dirname, '../../node_modules/.bin/azurite-blob');
  const directory = await mkdtemp(join(base, 'az-'));
  const account = `mail${randomBytes(8).toString('hex')}`;
  const key = randomBytes(64).toString('base64');
  const credential = new StorageSharedKeyCredential(account, key);
  // Local pnpm bin shim; no inherited SQL/proxy credentials, Azurite environment or Node flags.
  const env = {
    PATH: dirname(process.execPath) + delimiter + (process.env.PATH ?? ''),
    HOME: directory,
    TMPDIR: directory,
    AZURITE_ACCOUNTS: `${account}:${key}`,
  };
  let stop: (() => Promise<void>) | undefined;
  const close = async () => {
    try {
      await stop?.();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
  try {
    const { stdout } = await exec(cli, ['--version'], { env, cwd: directory, timeout: 5_000 });
    if (stdout.trim() !== '3.38.0') throw new Error('Unexpected Azurite Blob version; expected 3.38.0');
    const child = spawn(
      cli,
      ['--blobHost', HOST, '--blobPort', '0', '--location', directory, '--disableTelemetry', '--silent'],
      { cwd: directory, env, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    let exited = false;
    const terminated = new Promise<boolean>((done) => {
      child.once('close', () => {
        exited = true;
        done(true);
      });
    });
    stop = async () => {
      if (exited) return;
      child.kill('SIGTERM');
      if (await Promise.race([terminated, sleep(3_000, false, { ref: false })])) return;
      child.kill('SIGKILL');
      if (!(await Promise.race([terminated, sleep(3_000, false, { ref: false })]))) {
        throw new Error('Pinned Azurite Blob did not shut down');
      }
    };
    let log = '';
    const listening = new Promise<string>((ready, fail) => {
      const exitedEarly = () => fail(new Error('Pinned Azurite Blob exited before listening'));
      child.once('error', exitedEarly);
      child.once('close', exitedEarly);
      child.stdout.on('data', (chunk: Buffer) => {
        log = (log + chunk.toString()).slice(-4096);
        const endpoint = /successfully listens on (http:\/\/127\.0\.0\.1:\d{1,5})\r?\n/.exec(log)?.[1];
        if (endpoint) ready(endpoint);
      });
    });
    const endpoint = await Promise.race([listening, sleep(8_000, undefined, { ref: false })]);
    if (!endpoint) throw new Error('Pinned Azurite Blob did not listen on its isolated loopback port');
    const containerUrl = (name: string, through = endpoint) => {
      if (new URL(through).hostname !== HOST) throw new Error('Expected an isolated loopback endpoint');
      return `${through}/${account}/${name}`;
    };
    const control = (name: string) =>
      new ContainerClient(containerUrl(name), newPipeline(credential, { retryOptions: { maxTries: 1 } }));
    const writer = (name: string, through: string) =>
      createAzureAttachmentContainerClient(containerUrl(name, through), credential);
    const delegated = (name: string, through: string, permissions: string, blobName?: string) => {
      const common = {
        containerName: name,
        expiresOn: new Date(Date.now() + 300_000),
        protocol: SASProtocol.HttpsAndHttp,
      };
      const scope =
        blobName === undefined
          ? { permissions: ContainerSASPermissions.parse(permissions) }
          : { permissions: BlobSASPermissions.parse(permissions), blobName };
      const sas = generateBlobSASQueryParameters({ ...common, ...scope }, credential);
      return createAzureAttachmentContainerClient(`${containerUrl(name, through)}?${sas.toString()}`);
    };
    const ready = control(fixtureContainerName());
    try {
      const created = await ready.create(fixtureCall());
      if (created.version !== AZURE_REST_VERSION) throw new Error();
    } catch {
      throw new Error('Pinned Azurite Blob is not ready with the required SDK service version and fixture credentials');
    }
    return { endpoint, control, writer, delegated, containerUrl, close };
  } catch (error) {
    await close();
    throw error;
  }
}
