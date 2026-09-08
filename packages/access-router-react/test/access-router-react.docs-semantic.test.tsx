/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Document, Model, ModelResponse } from '@web-ts-toolkit/access-router-client';
import { describe, expect, it } from 'vitest';

import { createModelHooks } from '../src/create-model-hook';
import { createMockService, makeServiceError } from './support';

interface TestDoc extends Document {
  _id: string;
  name: string;
  status: string;
}

function makeModelResponse(id: string, name: string): ModelResponse<TestDoc> {
  return {
    success: true,
    raw: { _id: id, name, status: 'active' },
    data: { _id: id, name, status: 'active' } as Model<TestDoc> & TestDoc,
    message: 'ok',
    status: 200,
    headers: {},
  };
}

function makeSeed(): ReturnType<typeof createMockService<TestDoc>>['seed'] {
  const read = makeModelResponse('org_123', 'Northwind Labs');

  return {
    list: {
      success: true,
      raw: [],
      data: [],
      message: 'ok',
      status: 200,
      headers: {},
      totalCount: 0,
    },
    read,
    create: read,
    delete: { success: true, raw: 'org_123', data: 'org_123', message: 'ok', status: 200, headers: {} },
    count: { success: true, raw: 1, data: 1, message: 'ok', status: 200, headers: {} },
    distinct: { success: true, raw: ['active'], data: ['active'], message: 'ok', status: 200, headers: {} },
  };
}

// ---------------------------------------------------------------------------
// ARR-B07: load the ACTUAL mapped documentation blocks + fixtures instead of
// hand-duplicated algorithms. The docs compile gate
// (test/access-router-react.docs.compile.test.ts) remains the authoritative
// verbatim check; the helpers below reuse its extraction rules so this
// runtime test executes the same mapped text the compile gate pins.
// ---------------------------------------------------------------------------

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, '..');
const workspaceRoot = path.resolve(packageRoot, '..', '..');

function extractTypeScriptBlocks(absolutePath: string): string[] {
  const lines = readFileSync(absolutePath, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const opening = lines[lineIndex].match(/^ {0,3}(`{3,}|~{3,})\s*([^\s{]+)?/);
    const language = opening?.[2]?.toLowerCase();
    if (!opening || !['ts', 'typescript', 'tsx'].includes(language ?? '')) {
      continue;
    }

    const marker = opening[1][0];
    const minimumLength = opening[1].length;
    const contentLines: string[] = [];
    let closingLine = lineIndex + 1;
    for (; closingLine < lines.length; closingLine += 1) {
      const candidate = lines[closingLine].trim();
      if (candidate.length >= minimumLength && [...candidate].every((character) => character === marker)) {
        break;
      }
      contentLines.push(lines[closingLine]);
    }
    if (closingLine === lines.length) {
      throw new Error(`Unclosed TypeScript code fence in ${absolutePath}:${lineIndex + 1}`);
    }

    blocks.push(contentLines.join('\n'));
    lineIndex = closingLine;
  }

  return blocks;
}

function readDocBlock(relativeSource: string, ordinal: number): string {
  const blocks = extractTypeScriptBlocks(path.resolve(workspaceRoot, relativeSource));
  const block = blocks[ordinal - 1];
  if (block === undefined) {
    throw new Error(`Missing ${relativeSource}#${ordinal}`);
  }
  return block;
}

function extractScaffoldedBlock(fixtureContent: string, blockId: string): string {
  const normalized = fixtureContent.replace(/\r\n/g, '\n');
  const startMarker = `// docs-block-start: ${blockId}`;
  const endMarker = `// docs-block-end: ${blockId}`;
  const startIndex = normalized.indexOf(startMarker);
  const endIndex = normalized.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`Missing scaffold markers for ${blockId}`);
  }

  return normalized
    .slice(startIndex + startMarker.length, endIndex)
    .replace(/^\n/, '')
    .replace(/\n[ \t]*$/, '');
}

function stripSharedIndentation(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);

  if (nonEmptyLines.length === 0) {
    return lines.join('\n');
  }

  const sharedIndent = Math.min(
    ...nonEmptyLines.map((line) => {
      const indent = line.match(/^[ \t]*/);
      return indent?.[0].length ?? 0;
    }),
  );

  if (sharedIndent === 0) {
    return lines.join('\n');
  }

  return lines.map((line) => line.slice(sharedIndent)).join('\n');
}

function readFixtureBlock(fixtureName: string, blockId: string): string {
  const fixtureContent = readFileSync(path.resolve(packageRoot, 'test-docs-consumer', 'examples', fixtureName), 'utf8');
  return extractScaffoldedBlock(fixtureContent, blockId);
}

/** Extract the `onClick={...}` handler expression from a TSX component block. */
function extractOnClickExpression(blockText: string): string {
  const marker = 'onClick={';
  const start = blockText.indexOf(marker);
  if (start === -1) {
    throw new Error('Documented block has no onClick handler expression');
  }
  let depth = 0;
  let i = start + marker.length - 1;
  for (; i < blockText.length; i += 1) {
    if (blockText[i] === '{') depth += 1;
    else if (blockText[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) {
    throw new Error('Unbalanced braces in documented onClick handler');
  }
  return blockText.slice(start + marker.length, i).trim();
}

/** Extract the `saveTwice` async arrow source from the concurrent-mutations block. */
function extractSaveTwiceSource(blockText: string): string {
  const anchor = 'const saveTwice = async () => {';
  const start = blockText.indexOf(anchor);
  if (start === -1) {
    throw new Error('Documented block has no saveTwice handler (expected await-before-abort style drift?)');
  }
  const arrowStart = start + 'const saveTwice = '.length;
  let depth = 0;
  let i: number;
  // Find the opening brace of the arrow body, then match to its close.
  const bodyOpen = blockText.indexOf('{', arrowStart);
  for (i = bodyOpen; i < blockText.length; i += 1) {
    if (blockText[i] === '{') depth += 1;
    else if (blockText[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) {
    throw new Error('Unbalanced braces in documented saveTwice handler');
  }
  return blockText.slice(arrowStart, i + 1).trim();
}

function trackUnhandledRejections(): { unhandled: unknown[]; stop: () => void } {
  const unhandled: unknown[] = [];
  const listener = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', listener);
  return {
    unhandled,
    stop: () => {
      process.removeListener('unhandledRejection', listener);
    },
  };
}

async function flushUnhandledWindow(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('ARR-B07: documented examples execute with handled rejections', () => {
  it('the mapped quickstart + concurrent fixtures still match the README/website blocks verbatim', () => {
    const quickstartBlock = readDocBlock('packages/access-router-react/README.md', 3);
    const concurrentBlock = readDocBlock('packages/access-router-react/README.md', 14);
    const websiteConcurrentBlock = readDocBlock('website/docs/packages/access-router-react.md', 12);
    const cancellationBlock = readDocBlock('packages/access-router-react/README.md', 13);

    expect(
      stripSharedIndentation(readFixtureBlock('quickstart.tsx', 'packages/access-router-react/README.md#3')),
      'quickstart fixture drifted from README#3',
    ).toBe(stripSharedIndentation(quickstartBlock));
    expect(
      stripSharedIndentation(readFixtureBlock('concurrent-mutations.tsx', 'packages/access-router-react/README.md#14')),
      'concurrent fixture drifted from README#14',
    ).toBe(stripSharedIndentation(concurrentBlock));
    expect(
      stripSharedIndentation(
        readFixtureBlock('concurrent-mutations.tsx', 'website/docs/packages/access-router-react.md#12'),
      ),
      'concurrent fixture drifted from website#12',
    ).toBe(stripSharedIndentation(websiteConcurrentBlock));

    // Rejection handling is part of the documented contract: the quickstart
    // click handler must not return a floating rejecting promise, and the
    // concurrent example must catch Promise.all rejections. If a future edit
    // drops the handling, these marker assertions fail alongside the runtime
    // behavior tests below.
    expect(quickstartBlock).toMatch(/void mutate\(/);
    expect(quickstartBlock).toMatch(/\.catch\(/);
    expect(concurrentBlock).toMatch(/try \{/);
    expect(concurrentBlock).toMatch(/await Promise\.all\(/);
    expect(concurrentBlock).toMatch(/catch \(error\)/);
    expect(concurrentBlock).toMatch(/void saveTwice\(\)/);
    expect(websiteConcurrentBlock).toMatch(/void saveTwice\(\)/);
    expect(cancellationBlock).toMatch(/controller\.abort\(\)/);
  });

  it('the actual documented cancellation block aborts before awaiting settlement, so the forwarded signal is already aborted while the transport is pending', async () => {
    // Execute the REAL README#13 statements with an injected `query`. If the
    // snippet + fixture are ever reordered to await-before-abort, the abort
    // runs only after the deferred transport settles: the
    // `signal.aborted === true` assertion below fails (or the runner hangs).
    const cancellationBlock = readDocBlock('packages/access-router-react/README.md', 13);
    const tracker = trackUnhandledRejections();
    try {
      const mock = createMockService<TestDoc>(makeSeed());
      mock.planDeferred('read', makeSeed().read);
      const { useRead } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useRead({ enabled: false }));

      const runDocumented = new Function('query', `return (async () => {\n${cancellationBlock}\n})();`) as (
        query: (id: string, options?: { signal?: AbortSignal }) => Promise<unknown>,
      ) => Promise<void>;
      const documentedCancellation = runDocumented(result.current.query);

      await waitFor(() => expect(mock.spies.read).toHaveBeenCalledTimes(1));
      const controlled = mock.lastCall('read');
      expect(controlled).toBeDefined();
      expect(controlled!.controller.signal?.aborted).toBe(true);

      await act(async () => {
        controlled!.controller.reject(new DOMException('manual query cancelled', 'AbortError'));
      });

      await documentedCancellation;
      await waitFor(() => expect(result.current.isFetching).toBe(false));
      expect(result.current.error).toBeNull();

      await flushUnhandledWindow();
      expect(tracker.unhandled).toEqual([]);
    } finally {
      tracker.stop();
    }
  });

  it('the actual documented quickstart click handler surfaces hook error state with no unhandled rejection on failure', async () => {
    // Execute the REAL README#3 onClick expression with the live hook
    // `mutate` injected. A snippet that returns the bare `mutate(...)`
    // promise yields a thenable here (failing assertion) and leaks the
    // rejection (failing unhandled check).
    const quickstartBlock = readDocBlock('packages/access-router-react/README.md', 3);
    const handlerExpression = extractOnClickExpression(quickstartBlock);
    const tracker = trackUnhandledRejections();
    try {
      const mock = createMockService<TestDoc>(makeSeed());
      mock.planNextRejection('create', makeServiceError({ message: 'create failed', status: 500 }));
      const { useCreate } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useCreate());

      const buildHandler = new Function('mutate', `return (${handlerExpression});`) as (
        mutate: (...args: any[]) => Promise<any>,
      ) => () => unknown;
      let handlerReturn: unknown;
      await act(async () => {
        const handler = buildHandler((...args: any[]) =>
          (result.current.mutate as (...a: any[]) => Promise<any>)(...args),
        );
        handlerReturn = handler();
        await flushUnhandledWindow();
      });

      // `void ... .catch(...)` evaluates to undefined: no floating promise.
      expect(handlerReturn).toBeUndefined();

      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(result.current.error?.message).toMatch(/create failed/);

      await flushUnhandledWindow();
      expect(tracker.unhandled).toEqual([]);
    } finally {
      tracker.stop();
    }
  });

  it('the actual documented concurrent example keeps Promise.all positions tied to invocation order while hook state still follows the latest invocation', async () => {
    // Execute the REAL README#14 saveTwice body with the live hook `mutate`
    // injected. Swapping the destructured positions or returning the wrong
    // result changes the executed function, so the order/return assertions
    // below fail.
    const concurrentBlock = readDocBlock('packages/access-router-react/README.md', 14);
    const saveTwiceSource = extractSaveTwiceSource(concurrentBlock);
    const tracker = trackUnhandledRejections();
    try {
      const mock = createMockService<TestDoc>(makeSeed());
      const { useUpdate } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useUpdate({ advanced: true, select: ['name'] as const }));
      const firstResponse = makeModelResponse('org_1', 'A');
      const secondResponse = makeModelResponse('org_1', 'B');

      mock.planDeferred('updateAdvanced', firstResponse);
      mock.planDeferred('updateAdvanced', secondResponse);

      const buildSaveTwice = new Function('mutate', 'console', `return (${saveTwiceSource});`) as (
        mutate: (...args: any[]) => Promise<any>,
        console: Console,
      ) => () => Promise<any>;
      const logged: unknown[][] = [];
      const stubConsole = { ...console, log: (...args: unknown[]) => void logged.push(args), error: () => undefined };
      const responses = [firstResponse, secondResponse];
      let callIndex = 0;
      const controllers: Array<{ resolve: (value?: any) => void }> = [];
      let savePromise!: Promise<any>;
      act(() => {
        const saveTwice = buildSaveTwice((...args: any[]) => {
          mock.planDeferred('updateAdvanced', responses[callIndex++]);
          const pending = (result.current.mutate as (...a: any[]) => Promise<any>)(...args);
          controllers.push(
            mock.lastCall('updateAdvanced')!.controller as unknown as { resolve: (value?: any) => void },
          );
          return pending;
        }, stubConsole as Console);
        savePromise = saveTwice();
      });
      await waitFor(() => expect(mock.spies.updateAdvanced).toHaveBeenCalledTimes(2));
      expect(controllers).toHaveLength(2);

      // Resolve out of order: newest first, then stale. Hook state must
      // follow the latest invocation even after the stale settles.
      act(() => {
        controllers[1]!.resolve(secondResponse);
      });
      await waitFor(() => expect(result.current.data).toEqual({ _id: 'org_1', name: 'B', status: 'active' }));

      act(() => {
        controllers[0]!.resolve(firstResponse);
      });

      const returned = await savePromise;
      // Promise.all preserves invocation order: the documented log observes
      // (A, B) positionally. Swapping the destructured positions would log
      // (B, A) and return the wrong entry below.
      expect(logged).toEqual([['A', 'B']]);
      // The documented return contract is the SECOND result's data.
      // Returning the wrong concurrent result fails here.
      expect(returned).toEqual({ _id: 'org_1', name: 'B', status: 'active' });
      expect(result.current.data).toEqual({ _id: 'org_1', name: 'B', status: 'active' });

      await flushUnhandledWindow();
      expect(tracker.unhandled).toEqual([]);
    } finally {
      tracker.stop();
    }
  });

  it('the actual documented concurrent example handles failed mutations with no unhandled rejection', async () => {
    const concurrentBlock = readDocBlock('packages/access-router-react/README.md', 14);
    const saveTwiceSource = extractSaveTwiceSource(concurrentBlock);
    const tracker = trackUnhandledRejections();
    try {
      const mock = createMockService<TestDoc>(makeSeed());
      mock.planNextRejection('updateAdvanced', makeServiceError({ message: 'update A failed', status: 500 }));
      mock.planNextRejection('updateAdvanced', makeServiceError({ message: 'update B failed', status: 500 }));
      const { useUpdate } = createModelHooks({ modelService: mock.service });
      const { result } = renderHook(() => useUpdate({ advanced: true, select: ['name'] as const }));

      const buildSaveTwice = new Function('mutate', 'console', `return (${saveTwiceSource});`) as (
        mutate: (...args: any[]) => Promise<any>,
        console: Console,
      ) => () => Promise<any>;
      let returned: unknown;
      await act(async () => {
        const saveTwice = buildSaveTwice(
          (...args: any[]) => (result.current.mutate as (...a: any[]) => Promise<any>)(...args),
          { ...console, error: () => undefined } as Console,
        );
        returned = await saveTwice();
      });

      // The documented try/catch converts the Promise.all rejection into a
      // defined `undefined` return while hook error state records the
      // failure. Without the catch, `saveTwice()` would reject here.
      expect(returned).toBeUndefined();
      await waitFor(() => expect(result.current.error).not.toBeNull());

      await flushUnhandledWindow();
      expect(tracker.unhandled).toEqual([]);
    } finally {
      tracker.stop();
    }
  });
});
