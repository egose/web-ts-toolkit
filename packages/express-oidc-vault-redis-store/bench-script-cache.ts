import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { createClient } from 'redis';

import { RedisOidcVaultStoreKeys } from './src/keys';
import { buildWriteSessionCommand, RedisScriptRunner, WRITE_SESSION_SCRIPT } from './src/scripts';
import { type OidcVaultRedisClient } from './src/index';

const execFileAsync = promisify(execFile);

const docker = async (args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync('docker', args, { maxBuffer: 1024 * 1024 });
  return stdout.trim();
};

const waitForRedis = async (url: string) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const client = createClient({ url, socket: { connectTimeout: 1_000 } });
    try {
      await client.connect();
      await client.ping();
      return client;
    } catch {
      client.destroy();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('Timed out waiting for Redis.');
};

const startRedis = async (image: string) => {
  console.error(`[bench] starting ${image}...`);
  const containerId = await docker([
    'run',
    '--rm',
    '--detach',
    '--publish',
    '127.0.0.1::6379',
    image,
    'redis-server',
    '--save',
    '',
    '--appendonly',
    'no',
  ]);
  console.error(`[bench] container ${containerId}`);
  const portBinding = await docker(['port', containerId, '6379/tcp']);
  const port = portBinding.split(':').at(-1);
  if (!port) throw new Error(`Could not resolve port for ${containerId}`);
  const url = `redis://127.0.0.1:${port}`;
  const client = await waitForRedis(url);
  console.error(`[bench] connected at ${url}`);
  return { client, containerId, url };
};

type RedisClient = ReturnType<typeof createClient>;

const createEvalOnlyClient = (client: RedisClient): OidcVaultRedisClient => ({
  set: client.set.bind(client),
  get: client.get.bind(client),
  del: client.del.bind(client),
  sendCommand: (args: string[]) => client.sendCommand(args),
});

const run = async (
  name: string,
  iterations: number,
  fn: (i: number) => Promise<void>,
): Promise<{ ms: number; perOpUs: number; throughput: number }> => {
  for (let i = 0; i < Math.min(iterations, 200); i += 1) {
    await fn(i);
  }
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) {
    await fn(i);
  }
  const elapsedNs = Number(process.hrtime.bigint() - start);
  const ms = elapsedNs / 1e6;
  return {
    ms,
    perOpUs: elapsedNs / iterations / 1e3,
    throughput: iterations / (elapsedNs / 1e9),
  };
};

const flushPrefix = async (client: RedisClient, prefix: string): Promise<void> => {
  let cursor = '0';
  do {
    const response = await client.sendCommand(['SCAN', cursor, 'MATCH', `${prefix}:*`, 'COUNT', '500']);
    if (!Array.isArray(response) || typeof response[0] !== 'string' || !Array.isArray(response[1])) {
      throw new Error('Unexpected SCAN response');
    }
    cursor = response[0];
    const keys = response[1].filter((key): key is string => typeof key === 'string');
    if (keys.length > 0) {
      await client.del(keys);
    }
  } while (cursor !== '0');
};

const main = async () => {
  const image = 'redis:7.2-alpine';
  const { client, containerId } = await startRedis(image);

  try {
    await client.ping();
    const keyPrefix = `bench:${randomUUID()}`;

    let sessionSeq = 0;
    const createSessionInput = () => {
      const i = (sessionSeq += 1);
      return {
        sessionId: `bench_sess_${i}`,
        subject: `bench_user_${i % 50}`,
        providerSessionId: `bench_psid_${i}`,
        provider: { issuer: 'https://issuer.example.com', clientId: 'client_1' },
        refreshToken: `bench_refresh_${i}_${'x'.repeat(80)}`,
        idToken: `bench_id_${i}_${'y'.repeat(200)}`,
      };
    };

    const iterations = 5_000;
    const baseClient = createEvalOnlyClient(client);

    // Phase A: EVAL. Force the full script body on every mutation. Equivalent to
    // the pre-RVR-11 store behaviour. No store orchestration: we test only the
    // script command path so per-op cost is the script-cache overhead itself.
    sessionSeq = 0;
    const evalPrefix = `${keyPrefix}:eval`;
    const evalKeys = new RedisOidcVaultStoreKeys(evalPrefix);
    const evalResult = await run('EVAL (full body on every mutation)', iterations, async () => {
      await baseClient.sendCommand(buildWriteSessionCommand(evalKeys, createSessionInput()));
    });
    console.error('[bench] EVAL phase complete; flushing prefix...');
    await flushPrefix(client, evalPrefix);
    console.error('[bench] prefix flushed; SCRIPT FLUSH...');
    await client.sendCommand(['SCRIPT', 'FLUSH']);

    // Phase B: EVALSHA. Same script command path through the runner, which sends
    // the 40-char SHA1 digest in steady state and reloads on NOSCRIPT.
    sessionSeq = 0;
    const evalShaPrefix = `${keyPrefix}:evalsha`;
    const evalShaKeys = new RedisOidcVaultStoreKeys(evalShaPrefix);
    const runner = new RedisScriptRunner(baseClient);
    const evalshaResult = await run('EVALSHA (cached + NOSCRIPT reload)', iterations, async () => {
      await runner.run(buildWriteSessionCommand(evalShaKeys, createSessionInput()));
    });
    console.error('[bench] EVALSHA phase complete; flushing prefix...');
    await flushPrefix(client, evalShaPrefix);
    console.error('[bench] prefix flushed; SCRIPT FLUSH...');
    await client.sendCommand(['SCRIPT', 'FLUSH']);

    // Bytes transmitted per write command (worst-case Lua body length vs digest length).
    const sampleEval = buildWriteSessionCommand(evalKeys, createSessionInput());
    const evalCommandBytes =
      sampleEval.reduce((sum, part) => sum + Buffer.byteLength(part, 'utf8'), 0) + sampleEval.length - 1;
    const evalShaCommandBytes =
      ['EVALSHA', '0'.repeat(40), ...sampleEval.slice(2)].reduce(
        (sum, part) => sum + Buffer.byteLength(part, 'utf8'),
        0,
      ) +
      sampleEval.length -
      1;
    const scriptBodyBytes = Buffer.byteLength(WRITE_SESSION_SCRIPT, 'utf8');

    console.log('\n================ RVR-11 SCRIPT-CACHE BENCHMARK ================');
    console.log(`Image: ${image} | iterations per run: ${iterations} (after warmup)`);
    console.log(`WRITE_SESSION_SCRIPT body size: ${scriptBodyBytes} bytes`);
    console.log(`EVAL   write command payload: ~${evalCommandBytes} bytes/op`);
    console.log(`EVALSHA write command payload: ~${evalShaCommandBytes} bytes/op (digest=${40})`);
    console.log('');
    console.log(
      `EVAL    total: ${evalResult.ms.toFixed(0)} ms | ${evalResult.perOpUs.toFixed(1)} µs/op | ${evalResult.throughput.toFixed(0)} ops/s`,
    );
    console.log(
      `EVALSHA total: ${evalshaResult.ms.toFixed(0)} ms | ${evalshaResult.perOpUs.toFixed(1)} µs/op | ${evalshaResult.throughput.toFixed(0)} ops/s`,
    );
    const deltaUs = evalResult.perOpUs - evalshaResult.perOpUs;
    const pct = (deltaUs / evalResult.perOpUs) * 100;
    console.log(`Delta:    ${deltaUs > 0 ? '-' : '+'}${Math.abs(deltaUs).toFixed(1)} µs/op (${pct.toFixed(1)}%)`);
    console.log(`Wire bytes saved/op: ~${evalCommandBytes - evalShaCommandBytes} bytes (script-body compression)`);
    console.log('==============================================================\n');

    await client.sendCommand(['FLUSHDB']);
  } finally {
    if (client.isOpen) {
      await client.quit();
    }
    await docker(['stop', containerId]);
  }
};

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
