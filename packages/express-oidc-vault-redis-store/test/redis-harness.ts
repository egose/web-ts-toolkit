import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { createClient } from 'redis';

const execFileAsync = promisify(execFile);

export const REDIS_TIMEOUT = 120_000;

type RedisClient = ReturnType<typeof createClient>;

export type RedisHarness = {
  image: string;
  url: string;
  client: RedisClient;
  createKeyPrefix: (testName: string) => string;
  deleteKeysByPrefix: (keyPrefix: string) => Promise<void>;
  stop: () => Promise<void>;
};

const docker = async (args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync('docker', args, { maxBuffer: 1024 * 1024 });
  return stdout.trim();
};

const waitForRedis = async (url: string): Promise<RedisClient> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const client = createClient({ url, socket: { connectTimeout: 1_000 } });

    try {
      await client.connect();
      await client.ping();
      return client;
    } catch (error) {
      lastError = error;
      client.destroy();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Timed out waiting for Redis.');
};

export const createRedisHarness = async (image: string): Promise<RedisHarness> => {
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

  let client: RedisClient | undefined;

  try {
    const portBinding = await docker(['port', containerId, '6379/tcp']);
    const port = portBinding.split(':').at(-1);

    if (!port) {
      throw new Error(`Could not resolve Redis port for container ${containerId}.`);
    }

    const url = `redis://127.0.0.1:${port}`;
    client = await waitForRedis(url);

    const deleteKeysByPrefix = async (keyPrefix: string): Promise<void> => {
      let cursor = '0';

      do {
        const response = await client!.sendCommand(['SCAN', cursor, 'MATCH', `${keyPrefix}:*`, 'COUNT', '100']);

        if (!Array.isArray(response) || typeof response[0] !== 'string' || !Array.isArray(response[1])) {
          throw new Error('Unexpected Redis SCAN response.');
        }

        cursor = response[0];

        const keys = response[1].filter((key): key is string => typeof key === 'string');

        if (keys.length > 0) {
          await client!.del(keys);
        }
      } while (cursor !== '0');
    };

    return {
      image,
      url,
      client,
      createKeyPrefix: (testName) =>
        `test:${image.replace(/[^a-z0-9]+/gi, '-')}:${testName.replace(/[^a-z0-9]+/gi, '-')}:${randomUUID()}`,
      deleteKeysByPrefix,
      stop: async () => {
        if (client?.isOpen) {
          await client.quit();
        }

        await docker(['stop', containerId]);
      },
    };
  } catch (error) {
    if (client?.isOpen) {
      await client.quit();
    }

    await docker(['stop', containerId]);
    throw error;
  }
};
