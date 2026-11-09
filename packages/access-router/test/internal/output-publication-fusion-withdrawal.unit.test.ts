/** The withdrawn graph-transfer prototype is not a third owned-authorization engine. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccessRuntime } from '../../src/runtime';
import * as finalizers from '../../src/output/finalize-model-output';
import { ownedStageFixture, quietOutput, sourceModes } from '../support/private/owned-stage-test-fixture';

afterEach(() => vi.restoreAllMocks());

it('does not ship the former publication flags or completion issuers in declarations or installed documentation', () => {
  const root = path.resolve(__dirname, '../..');
  const declarations = readdirSync(path.join(root, 'dist')).filter((file) => /\.d\.(?:ts|mts)$/.test(file));
  expect(declarations).toHaveLength(8);
  for (const file of [...declarations.map((file) => `dist/${file}`), 'README.md', 'llms.txt']) {
    expect(readFileSync(path.join(root, file), 'utf8')).not.toMatch(
      /unsafeFuse(?:List|Read)OutputPublication|finalizeServiceModelOutput|tryAssociateServiceOutputPublication|assertServiceOutputPublication/,
    );
  }
  const defaults = new AccessRuntime().getDefaultModelOptions();
  expect(defaults).not.toHaveProperty('unsafeFuseListOutputPublication');
  expect(defaults).not.toHaveProperty('unsafeFuseReadOutputPublication');
});

describe('one completed ordinary DTO publication, without authority-transfer copies', () => {
  it.each(
    sourceModes.flatMap((mode) =>
      ['direct-list', 'public-list', 'direct-read', 'public-read'].map((entry) => ({ mode, entry })),
    ),
  )('$mode $entry publishes the actual completed private builder result once', async ({ mode, entry }) => {
    const hook = vi.fn(() => ({}));
    const f = ownedStageFixture({ mode, modelOptions: { docPermissions: { list: hook, read: hook } } });
    const rows = Array.from({ length: entry.endsWith('list') ? 3 : 1 }, (_, index) => ({
      _id: 'same',
      name: `row:${index}`,
      hidden: 'denied',
    }));
    f.adapter.find.mockResolvedValue(rows);
    f.adapter.findOne.mockResolvedValue(rows[0]);
    const original = finalizers.finalizeModelOutput;
    const completed: object[] = [];
    vi.spyOn(finalizers, 'finalizeModelOutput').mockImplementation(async (args) => {
      const dto = await original(args);
      completed.push(dto);
      return dto;
    });
    const args = { select: ['name', 'hidden', '-_id'], limit: rows.length };
    const result =
      entry === 'direct-list'
        ? await f.direct.find({}, args, quietOutput)
        : entry === 'public-list'
          ? await f.public._list({}, args, quietOutput)
          : entry === 'direct-read'
            ? await f.direct.findOne({}, args, quietOutput)
            : await f.public._readFilter({}, args, { ...quietOutput, tryList: false });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.code);
    const data = Array.isArray(result.data) ? result.data : [result.data];
    expect(data).toEqual(rows.map(({ name }) => ({ name })));
    expect(completed).toHaveLength(rows.length);
    for (let index = 0; index < data.length; index++) {
      expect(data[index]).toBe(completed[index]);
      expect(Object.isFrozen(data[index])).toBe(false);
      expect(Reflect.ownKeys(data[index] as object)).toEqual(['name']);
    }
    expect(hook).toHaveBeenCalledTimes(rows.length);
    expect(f.adapter.find.mock.calls.length + f.adapter.findOne.mock.calls.length).toBe(1);
  });

  it.each(sourceModes)(
    '%s normalizes selected native output without using its observations as later same-ID row authority',
    async (mode) => {
      const hook = vi.fn((doc) => ({ owner: doc.name === 'first' }));
      const rule = vi.fn((_permissions, facts) => facts.owner);
      const get = vi.fn(() => new Date(1777777777777));
      const f = ownedStageFixture({
        mode,
        modelOptions: {
          permissionSchema: { name: rule, v: rule },
          docPermissions: { list: hook },
          virtuals: { v: { dependsOn: ['name'], get } },
        },
      });
      f.adapter.find.mockResolvedValue([
        { _id: 'same', name: 'first' },
        { _id: 'same', name: 'second' },
      ]);
      const result = await f.direct.find({}, { select: ['name', 'v', '-_id'] }, quietOutput);
      expect(result.success).toBe(true);
      if (!result.success) throw new Error(result.code);
      expect(result.data).toEqual([{ name: 'first', v: new Date(1777777777777) }, {}]);
      expect(hook).toHaveBeenCalledTimes(2);
      expect(get).toHaveBeenCalledTimes(1);
      expect(rule).toHaveBeenCalledTimes(4);
      expect(result.contexts[0].docPermissions.owner).toBe(true);
      expect(result.contexts[1].docPermissions.owner).toBe(false);
      expect(result.contexts[0].docPermissions).not.toBe(result.contexts[1].docPermissions);
    },
  );
});
