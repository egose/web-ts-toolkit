import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { RedisScriptRunner, type RedisScriptRunnerClient, WRITE_SESSION_SCRIPT } from '../src/scripts.js';

const sha1 = (script: string): string => createHash('sha1').update(script).digest('hex');

class FakeScriptClient implements RedisScriptRunnerClient {
  readonly commands: string[][] = [];
  private readonly digests = new Map<string, string>();

  constructor(options: { loaded: boolean } = { loaded: true }) {
    if (options.loaded) {
      this.digests.set(sha1(WRITE_SESSION_SCRIPT), WRITE_SESSION_SCRIPT);
    }
  }

  sendCommand(args: string[]): Promise<unknown> {
    this.commands.push(args);

    return Promise.resolve(this.sendCommandSync(args));
  }

  private sendCommandSync(args: string[]): unknown {
    const [command, ...rest] = args;

    if (command === 'EVALSHA') {
      const [digest] = rest;

      if (!digest || !this.digests.has(digest)) {
        throw new Error('NOSCRIPT No matching script. Please use EVAL.');
      }

      return this.digests.get(digest) === WRITE_SESSION_SCRIPT ? 1 : 99;
    }

    if (command === 'SCRIPT') {
      const [subcommand, body] = rest;

      if (subcommand !== 'LOAD' || !body) {
        throw new Error('Unsupported SCRIPT subcommand.');
      }

      const digest = sha1(body);
      this.digests.set(digest, body);

      return digest;
    }

    return undefined;
  }

  flush(): void {
    this.digests.clear();
  }

  get digest(): string {
    return sha1(WRITE_SESSION_SCRIPT);
  }
}

const buildEvalCommand = (): string[] => [
  'EVAL',
  WRITE_SESSION_SCRIPT,
  '4',
  'session:sess_1',
  'subject:user_1',
  'logical:logical_1',
  'alias:sess_1',
  'value',
  'expiresAt',
  'sess_1',
  'score',
  '',
  'prefix:',
];

describe('RedisScriptRunner', () => {
  it('issues EVALSHA on steady-state runs and never reloads if the script is cached', async () => {
    const client = new FakeScriptClient({ loaded: true });
    const runner = new RedisScriptRunner(client);
    const command = buildEvalCommand();

    await runner.run(command);
    await runner.run(command);
    await runner.run(command);

    expect(client.commands[0]).toEqual([
      'EVALSHA',
      client.digest,
      '4',
      'session:sess_1',
      'subject:user_1',
      'logical:logical_1',
      'alias:sess_1',
      'value',
      'expiresAt',
      'sess_1',
      'score',
      '',
      'prefix:',
    ]);
    expect(client.commands[1]).toEqual(client.commands[0]);
    expect(client.commands[2]).toEqual(client.commands[0]);
    expect(client.commands.some((sent) => sent[0] === 'SCRIPT')).toBe(false);
    expect(client.commands.filter((sent) => sent[0] === 'EVALSHA')).toHaveLength(3);
  });

  it('recovers silently from NOSCRIPT by reloading once and retrying via EVALSHA', async () => {
    const client = new FakeScriptClient({ loaded: false });
    const runner = new RedisScriptRunner(client);
    const command = buildEvalCommand();

    const result = await runner.run(command);

    expect(result).toBe(1);
    expect(client.commands).toEqual([
      [
        'EVALSHA',
        client.digest,
        '4',
        'session:sess_1',
        'subject:user_1',
        'logical:logical_1',
        'alias:sess_1',
        'value',
        'expiresAt',
        'sess_1',
        'score',
        '',
        'prefix:',
      ],
      ['SCRIPT', 'LOAD', WRITE_SESSION_SCRIPT],
      [
        'EVALSHA',
        client.digest,
        '4',
        'session:sess_1',
        'subject:user_1',
        'logical:logical_1',
        'alias:sess_1',
        'value',
        'expiresAt',
        'sess_1',
        'score',
        '',
        'prefix:',
      ],
    ]);
  });

  it('does not reload on the second run after recovery because the cache is populated', async () => {
    const client = new FakeScriptClient({ loaded: false });
    const runner = new RedisScriptRunner(client);
    const command = buildEvalCommand();

    await runner.run(command);
    client.commands.length = 0;
    await runner.run(command);

    expect(client.commands).toEqual([
      [
        'EVALSHA',
        client.digest,
        '4',
        'session:sess_1',
        'subject:user_1',
        'logical:logical_1',
        'alias:sess_1',
        'value',
        'expiresAt',
        'sess_1',
        'score',
        '',
        'prefix:',
      ],
    ]);
  });

  it('recovers transparently after SCRIPT FLUSH by reloading on the next mutation', async () => {
    const client = new FakeScriptClient({ loaded: true });
    const runner = new RedisScriptRunner(client);
    const command = buildEvalCommand();

    await runner.run(command);

    expect(client.commands.some((sent) => sent[0] === 'SCRIPT')).toBe(false);

    client.flush();
    client.commands.length = 0;

    const result = await runner.run(command);

    expect(result).toBe(1);
    expect(client.commands).toEqual([
      [
        'EVALSHA',
        client.digest,
        '4',
        'session:sess_1',
        'subject:user_1',
        'logical:logical_1',
        'alias:sess_1',
        'value',
        'expiresAt',
        'sess_1',
        'score',
        '',
        'prefix:',
      ],
      ['SCRIPT', 'LOAD', WRITE_SESSION_SCRIPT],
      [
        'EVALSHA',
        client.digest,
        '4',
        'session:sess_1',
        'subject:user_1',
        'logical:logical_1',
        'alias:sess_1',
        'value',
        'expiresAt',
        'sess_1',
        'score',
        '',
        'prefix:',
      ],
    ]);
  });

  it('reset drops the cache so the next run reloads the script body over a forced failover', async () => {
    const client = new FakeScriptClient({ loaded: true });
    const runner = new RedisScriptRunner(client);
    const command = buildEvalCommand();

    await runner.run(command);

    expect(runner.digestFor(WRITE_SESSION_SCRIPT)).toBe(client.digest);
    expect(client.commands.some((sent) => sent[0] === 'SCRIPT')).toBe(false);

    client.flush();
    runner.reset();
    client.commands.length = 0;

    const result = await runner.run(command);

    expect(result).toBe(1);
    expect(client.commands).toEqual([
      [
        'EVALSHA',
        client.digest,
        '4',
        'session:sess_1',
        'subject:user_1',
        'logical:logical_1',
        'alias:sess_1',
        'value',
        'expiresAt',
        'sess_1',
        'score',
        '',
        'prefix:',
      ],
      ['SCRIPT', 'LOAD', WRITE_SESSION_SCRIPT],
      [
        'EVALSHA',
        client.digest,
        '4',
        'session:sess_1',
        'subject:user_1',
        'logical:logical_1',
        'alias:sess_1',
        'value',
        'expiresAt',
        'sess_1',
        'score',
        '',
        'prefix:',
      ],
    ]);
  });

  it('rethrows non-NOSCRIPT errors verbatim and never reloads', async () => {
    let sent = false;
    const client: RedisScriptRunnerClient = {
      sendCommand(): Promise<unknown> {
        if (!sent) {
          sent = true;

          return Promise.reject(new Error('WRONGTYPE Operation against a key holding the wrong kind of value.'));
        }

        return Promise.resolve(0);
      },
    };
    const runner = new RedisScriptRunner(client);

    await expect(runner.run(buildEvalCommand())).rejects.toThrow('WRONGTYPE');
    expect(sent).toBe(true);
  });

  it('rejects commands that are not EVAL-form with an actionable diagnostic', async () => {
    const client = new FakeScriptClient();
    const runner = new RedisScriptRunner(client);

    await expect(runner.run(['SET', 'k', 'v'])).rejects.toThrow('RedisScriptRunner.run expects an EVAL-form command.');
    expect(client.commands).toHaveLength(0);
  });
});
