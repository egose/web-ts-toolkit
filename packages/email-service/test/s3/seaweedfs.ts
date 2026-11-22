import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createS3AttachmentClient } from '../../src/attachments/s3';

const exec = promisify(execFile);
const loopback = '127.0.0.1';
const VERSION = '4.54';
const COMMIT = '5ef99c1d8dbbeb4a035c055e3b464620506aefac';
const ASSET = `https://github.com/seaweedfs/seaweedfs/releases/download/${VERSION}/linux_amd64.tar.gz`;
const DIGEST = 'e7424a82eee327809bfa449fda4924c9a0f42f6669a01288eebb1b79674c8196';

export async function verifySeaweedArchive(filename: string): Promise<void> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  if (hash.digest('hex') !== DIGEST) throw new Error('SeaweedFS archive SHA-256 does not match the pin');
}

async function fetchPinnedSeaweed(directory: string): Promise<string> {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error('test:s3 requires Linux x64');
  const archive = join(directory, 'weed.tar.gz');
  try {
    await exec(
      'curl',
      [
        '--disable',
        '--fail',
        '--silent',
        '--location',
        '--proto',
        '=https',
        '--proto-redir',
        '=https',
        '--max-redirs',
        '4',
        '--max-time',
        '100',
        '--max-filesize',
        '50000000',
        '--output',
        archive,
        ASSET,
      ],
      { timeout: 105_000 },
    );
  } catch {
    throw new Error('Could not download the pinned SeaweedFS test archive over HTTPS (curl required)');
  }
  await verifySeaweedArchive(archive);
  const binary = join(directory, 'weed');
  try {
    await exec('tar', ['-xzf', archive, '--no-same-owner', '-C', directory, '--', 'weed'], { timeout: 15_000 });
    await chmod(binary, 0o700);
    const { stdout } = await exec(binary, ['version'], { cwd: directory, timeout: 5_000 });
    if (!stdout.split('\n')[0]?.endsWith(` ${VERSION} ${COMMIT} linux amd64`)) throw new Error();
  } catch {
    throw new Error('Could not extract/verify the pinned SeaweedFS executable (tar required)');
  }
  return binary;
}

async function leasePorts(names: readonly string[]) {
  const listeners = [];
  const ports: string[] = [];
  try {
    // Reserve all ports at once so no two roles can be assigned the same port.
    for (const name of names) {
      const listener = createServer();
      listeners.push(listener);
      listener.listen({ host: loopback, port: 0, exclusive: true });
      await once(listener, 'listening');
      const address = listener.address();
      if (!address || typeof address === 'string') throw new Error('Could not reserve a loopback fixture port');
      ports.push(`-${name}=${address.port}`);
    }
  } finally {
    await Promise.all(listeners.map((listener) => new Promise<void>((done) => listener.close(() => done()))));
  }
  return ports;
}

function identity(name: string, actions: string[]) {
  return {
    name,
    actions,
    credentials: [{ accessKey: randomBytes(12).toString('hex'), secretKey: randomBytes(24).toString('hex') }],
  };
}

export async function startSeaweedFs() {
  const base = tmpdir();
  const repo = resolve(import.meta.dirname, '../../../..');
  if (!relative(repo, base).split(sep)[0]?.startsWith('_tmp')) {
    throw new Error('Run test:s3 with ignored checkout-local scratch (use pnpm test:s3)');
  }
  await exec('git', ['check-ignore', '-q', '--', base], { cwd: repo, timeout: 5_000 });
  // Keep the leaf short for UNIX socket path limits as well as isolated from every other suite.
  const directory = await mkdtemp(join(base, 'sw-'));
  let stop: (() => Promise<void>) | undefined;
  let provisioner: S3Client | undefined;
  const close = async () => {
    provisioner?.destroy();
    try {
      await stop?.();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
  try {
    const binary = await fetchPinnedSeaweed(directory);
    const state = join(directory, 'data');
    await mkdir(state);
    const admin = identity('provisioner', ['Admin']);
    const reader = identity('worker', ['Read']);
    const config = join(directory, 's3.json');
    await writeFile(config, JSON.stringify({ identities: [admin, reader] }), { mode: 0o600 });
    const [s3, ...internal] = await leasePorts([
      's3.port',
      's3.port.grpc',
      'filer.port',
      'filer.port.grpc',
      'master.port',
      'master.port.grpc',
      'volume.port',
      'volume.port.grpc',
      'admin.port',
      'admin.port.grpc',
    ]);
    const port = Number(s3?.split('=')[1]);
    if (!s3 || !port) throw new Error('No loopback S3 port reserved');
    const endpoint = `http://${loopback}:${port}`;
    const filerSocket = join(directory, 'filer.sock');
    const child = spawn(
      binary,
      [
        'mini',
        `-ip=${loopback}`,
        `-ip.bind=${loopback}`,
        `-dir=${state}`,
        '-master.telemetry=false',
        s3,
        ...internal,
        `-filer.localSocket=${filerSocket}`,
        `-s3.localFilerSocket=${filerSocket}`,
        `-s3.localSocket=${join(directory, 's3.sock')}`,
        `-s3.config=${config}`,
        '-s3.autoCreateBucket=false',
        '-s3.iam=false',
        '-s3.port.iceberg=0',
        '-s3.port.lance=0',
        '-admin.ui=false',
        '-admin.port.legacy=0',
        '-webdav=false',
      ],
      {
        cwd: state,
        env: { HOME: state, XDG_CONFIG_HOME: state, TMPDIR: directory },
        stdio: 'ignore',
      },
    );
    let exited = false;
    child.on('error', () => {});
    const terminate = new Promise<boolean>((done) => {
      child.once('close', () => {
        exited = true;
        done(true);
      });
    });
    stop = async () => {
      if (exited) return;
      child.kill('SIGTERM');
      if (!(await Promise.race([terminate, sleep(4_000, false, { ref: false })]))) {
        child.kill('SIGKILL');
        if (!(await Promise.race([terminate, sleep(3_000, false, { ref: false })]))) {
          throw new Error('SeaweedFS fixture did not shut down');
        }
      }
    };
    const sdkConfig = (through = endpoint, role: 'producer' | 'worker' = 'producer') => {
      const native = (role === 'producer' ? admin : reader).credentials[0];
      if (!native || new URL(through).hostname !== loopback) throw new Error('Expected a loopback S3 fixture');
      return {
        endpoint: through,
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: native.accessKey, secretAccessKey: native.secretKey },
      };
    };
    const client = (...args: Parameters<typeof sdkConfig>) => createS3AttachmentClient(sdkConfig(...args));
    const control = (provisioner = new S3Client({ ...sdkConfig(), maxAttempts: 1, followRegionRedirects: false }));
    const readyBucket = `ready-${randomBytes(8).toString('hex')}`;
    const until = performance.now() + 20_000;
    let created = false;
    while (!exited && performance.now() < until) {
      try {
        if (!created) {
          await control.send(new CreateBucketCommand({ Bucket: readyBucket }), {
            abortSignal: AbortSignal.timeout(750),
          });
          created = true;
        }
        await control.send(new PutObjectCommand({ Bucket: readyBucket, Key: 'ready', Body: 'ready' }), {
          abortSignal: AbortSignal.timeout(750),
        });
        return { client, control, endpoint, close };
      } catch {
        await sleep(125);
      }
    }
    throw new Error('Pinned SeaweedFS did not become ready on its isolated loopback port');
  } catch (error) {
    await close();
    throw error;
  }
}
