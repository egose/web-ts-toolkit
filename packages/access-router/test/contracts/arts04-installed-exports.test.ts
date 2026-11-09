import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const packageRoot = path.resolve(__dirname, '../..');
let consumer: string | undefined;

beforeAll(() => {
  consumer = mkdtempSync(path.join(tmpdir(), 'arts04-installed-exports-'));
  const installed = path.join(consumer, 'node_modules/@web-ts-toolkit/access-router');
  mkdirSync(installed, { recursive: true });
  cpSync(path.resolve(packageRoot, 'dist'), path.join(installed, 'dist'), { recursive: true });
  cpSync(path.resolve(packageRoot, 'package.json'), path.join(installed, 'package.json'));
  symlinkSync(path.resolve(packageRoot, 'node_modules'), path.join(installed, 'node_modules'), 'dir');
  // Copy finite, checked-in modules verbatim; no generated source or policy exemption.
  writeFileSync(
    path.join(consumer, 'arts04-exports.mjs'),
    readFileSync(path.resolve(packageRoot, 'test/support/public/arts04-exports.mjs'), 'utf8'),
  );
  writeFileSync(
    path.join(consumer, 'arts04-exports.cjs'),
    readFileSync(path.resolve(packageRoot, 'test/support/public/arts04-exports.cjs'), 'utf8'),
  );
  writeFileSync(
    path.join(consumer, 'arts04-export-assertions.cjs'),
    readFileSync(path.resolve(packageRoot, 'test/support/public/arts04-export-assertions.cjs'), 'utf8'),
  );
});

describe('ARTS-04 installed semantic exports', () => {
  it('EXPORT-ESM installed root/advanced/processors preserve supported identities and encapsulation', () => {
    expect(execFileSync(process.execPath, ['arts04-exports.mjs'], { cwd: consumer, encoding: 'utf8' }).trim()).toBe(
      'ARTS04-EXPORTS-PASS',
    );
  });
  it('EXPORT-CJS installed root/advanced/processors preserve supported identities and encapsulation', () => {
    expect(execFileSync(process.execPath, ['arts04-exports.cjs'], { cwd: consumer, encoding: 'utf8' }).trim()).toBe(
      'ARTS04-EXPORTS-PASS',
    );
  });
});

afterAll(() => {
  if (consumer) rmSync(consumer, { recursive: true, force: true });
});
