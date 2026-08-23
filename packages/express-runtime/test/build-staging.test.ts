import { describe, it, expect } from 'vitest';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  lstatSync,
  rmSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  buildBundleFromEntryContent,
  buildRuntime,
  buildServerless,
  generateRuntimeEntry,
  validateOutDirForClean,
  TEMP_BUILD_ENTRY_FILENAME,
  TEMP_SERVERLESS_ENTRY_FILENAME,
} from '../src/cli-utils';
import { runBuildEntryCommand } from '../src/cli-api';

function createTempProject(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'wtt-build-staging-'));
  const cleanup = () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup errors */
    }
  };
  return { dir, cleanup };
}

function writeApp(dir: string) {
  writeFileSync(
    join(dir, 'app.ts'),
    `import express from 'express'; const app = express(); app.get('/hi', (_req, res) => res.send('hi')); export default app;`,
    'utf8',
  );
}

function listStagingDirs(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.startsWith('.wtt-build-'));
  } catch {
    return [];
  }
}

function absOut(dir: string, sub: string) {
  return join(dir, sub);
}

describe('ERT-03 build staging safety', () => {
  it('legacy files remain byte-for-byte unchanged after build', async () => {
    const { dir, cleanup } = createTempProject();
    try {
      writeApp(dir);
      const legacyBuild = 'LEGACY BUILD CONTENT';
      const legacyServerless = 'LEGACY SERVERLESS CONTENT';
      writeFileSync(join(dir, TEMP_BUILD_ENTRY_FILENAME), legacyBuild, 'utf8');
      writeFileSync(join(dir, TEMP_SERVERLESS_ENTRY_FILENAME), legacyServerless, 'utf8');
      const cwd = process.cwd();
      // Use absolute paths to avoid global cwd pollution, but also verify legacy files are in the temp dir (not cwd)
      // buildRuntime uses cwd for staging, but outDir absolute ensures output goes to temp dir
      await buildRuntime({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist'),
        outName: 'app',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      });
      expect(readFileSync(join(dir, TEMP_BUILD_ENTRY_FILENAME), 'utf8')).toBe(legacyBuild);
      expect(readFileSync(join(dir, TEMP_SERVERLESS_ENTRY_FILENAME), 'utf8')).toBe(legacyServerless);
      await buildServerless({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist2'),
        outName: 'handler',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      });
      expect(readFileSync(join(dir, TEMP_BUILD_ENTRY_FILENAME), 'utf8')).toBe(legacyBuild);
      expect(readFileSync(join(dir, TEMP_SERVERLESS_ENTRY_FILENAME), 'utf8')).toBe(legacyServerless);
      // staging is in cwd (repo root), not temp dir, so check cwd for leftovers, but we pass absolute outDir so staging should still be cleaned
      // Ensure no leftover in temp dir and in cwd (check both)
      expect(listStagingDirs(dir).length).toBe(0);
      expect(listStagingDirs(cwd).filter((f) => f.startsWith('.wtt-build-')).length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('symlink collision cannot modify its target', async () => {
    const { dir, cleanup } = createTempProject();
    try {
      writeApp(dir);
      const victimPath = join(dir, 'victim.txt');
      const victimContent = 'VICTIM ORIGINAL ' + randomBytes(4).toString('hex');
      writeFileSync(victimPath, victimContent, 'utf8');
      symlinkSync(victimPath, join(dir, TEMP_BUILD_ENTRY_FILENAME));
      expect(lstatSync(join(dir, TEMP_BUILD_ENTRY_FILENAME)).isSymbolicLink()).toBe(true);
      await buildRuntime({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist'),
        outName: 'app',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      });
      expect(readFileSync(victimPath, 'utf8')).toBe(victimContent);
      expect(lstatSync(join(dir, TEMP_BUILD_ENTRY_FILENAME)).isSymbolicLink()).toBe(true);
      expect(listStagingDirs(dir).length).toBe(0);
      symlinkSync(victimPath, join(dir, TEMP_SERVERLESS_ENTRY_FILENAME));
      rmSync(join(dir, TEMP_BUILD_ENTRY_FILENAME), { force: true });
      await buildServerless({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist2'),
        outName: 'handler',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      });
      expect(readFileSync(victimPath, 'utf8')).toBe(victimContent);
    } finally {
      cleanup();
    }
  });

  it('staging is removed after successful build', async () => {
    const { dir, cleanup } = createTempProject();
    try {
      writeApp(dir);
      await buildRuntime({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist'),
        outName: 'app',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      });
      expect(existsSync(join(dir, 'dist', 'app.js'))).toBe(true);
      expect(listStagingDirs(dir).length).toBe(0);
      expect(listStagingDirs(process.cwd()).length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('staging is removed after failed build', async () => {
    const { dir, cleanup } = createTempProject();
    try {
      const badContent = 'THIS IS NOT VALID TYPESCRIPT {{{{';
      let threw = false;
      try {
        await buildBundleFromEntryContent({
          entryContent: badContent,
          outDir: absOut(dir, 'dist'),
          outName: 'app',
          format: 'cjs',
          target: 'node22',
          external: [],
          clean: false,
          tsconfigPath: undefined,
        });
      } catch {
        threw = true;
      }
      if (!threw) {
        try {
          await buildBundleFromEntryContent({
            entryContent: generateRuntimeEntry(join(dir, 'nonexistent-app-xyz.ts')),
            outDir: absOut(dir, 'dist'),
            outName: 'app',
            format: 'cjs',
            target: 'node22',
            external: [],
            clean: true,
          });
        } catch {
          threw = true;
        }
      }
      expect(listStagingDirs(dir).length).toBe(0);
      expect(listStagingDirs(process.cwd()).length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('two concurrent local builds complete independently', async () => {
    const { dir, cleanup } = createTempProject();
    try {
      writeApp(dir);
      const p1 = buildRuntime({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist1'),
        outName: 'app',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      });
      const p2 = buildRuntime({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist2'),
        outName: 'app',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      });
      await Promise.all([p1, p2]);
      expect(existsSync(join(dir, 'dist1', 'app.js'))).toBe(true);
      expect(existsSync(join(dir, 'dist2', 'app.js'))).toBe(true);
      expect(listStagingDirs(dir).length).toBe(0);
      expect(listStagingDirs(process.cwd()).length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('two concurrent serverless builds complete independently', async () => {
    const { dir, cleanup } = createTempProject();
    try {
      writeApp(dir);
      const p1 = buildServerless({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist1'),
        outName: 'handler',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      });
      const p2 = buildServerless({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist2'),
        outName: 'handler',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      });
      await Promise.all([p1, p2]);
      expect(existsSync(join(dir, 'dist1', 'handler.js'))).toBe(true);
      expect(existsSync(join(dir, 'dist2', 'handler.js'))).toBe(true);
      expect(listStagingDirs(dir).length).toBe(0);
      expect(listStagingDirs(process.cwd()).length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('mixed concurrent local and serverless builds complete independently', async () => {
    const { dir, cleanup } = createTempProject();
    try {
      writeApp(dir);
      const p1 = buildRuntime({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist'),
        outName: 'app',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      });
      const p2 = buildServerless({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist-srv'),
        outName: 'handler',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      });
      await Promise.all([p1, p2]);
      expect(existsSync(join(dir, 'dist', 'app.js'))).toBe(true);
      expect(existsSync(join(dir, 'dist-srv', 'handler.js'))).toBe(true);
      expect(listStagingDirs(dir).length).toBe(0);
      expect(listStagingDirs(process.cwd()).length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('unsafe --out-dir/clean combinations fail before any source is removed', async () => {
    const { dir, cleanup } = createTempProject();
    const originalCwd = process.cwd();
    try {
      // Need to chdir for this test because validateOutDirForClean uses cwd
      process.chdir(dir);
      writeApp(dir);
      writeFileSync(join(dir, 'keep.txt'), 'keep', 'utf8');
      expect(() => validateOutDirForClean('/', true)).toThrow(/filesystem root/);
      expect(() => validateOutDirForClean('.', true)).toThrow(/project directory/);
      expect(() => validateOutDirForClean(dir, true)).toThrow(/project directory/);
      const parent = pathResolve(dir, '..');
      expect(() => validateOutDirForClean(parent, true)).toThrow(/ancestor/);
      expect(() => validateOutDirForClean('out', true, './app.ts')).not.toThrow();
      expect(() => validateOutDirForClean('.', true, './app.ts')).toThrow();
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'src', 'app.ts'), `export default {}`, 'utf8');
      expect(() => validateOutDirForClean('src', true, './src/app.ts')).toThrow(/contains/);
      const realOut = join(dir, 'real-out');
      mkdirSync(realOut);
      const linkOut = join(dir, 'link-out');
      try {
        symlinkSync(realOut, linkOut);
      } catch {
        /* symlink creation can be unavailable on some platforms */
      }
      if (existsSync(linkOut) && lstatSync(linkOut).isSymbolicLink()) {
        expect(() => validateOutDirForClean('link-out', true)).toThrow(/symlinked/);
      }
      expect(() => validateOutDirForClean('/', false)).not.toThrow();
      expect(() => validateOutDirForClean('.', false)).not.toThrow();
      let threw = false;
      try {
        await runBuildEntryCommand(
          {
            appPath: './app.ts',
            outDir: '.',
            outName: 'app',
            format: 'cjs',
            target: 'node22',
            external: [],
            clean: true,
          },
          { generateEntry: generateRuntimeEntry },
        );
      } catch (e) {
        threw = true;
        expect(String(e)).toMatch(/Refusing to clean/);
      }
      expect(threw).toBe(true);
      expect(existsSync(join(dir, 'keep.txt'))).toBe(true);
      expect(readFileSync(join(dir, 'keep.txt'), 'utf8')).toBe('keep');
      expect(existsSync(join(dir, 'app.ts'))).toBe(true);
      expect(listStagingDirs(dir).length).toBe(0);
    } finally {
      try {
        process.chdir(originalCwd);
      } catch {
        /* ignore cwd restore errors */
      }
      cleanup();
    }
  });

  it('consumer-local imports and tsconfig path resolution still work', async () => {
    const { dir, cleanup } = createTempProject();
    try {
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@alias/*': ['src/*'] } } }),
        'utf8',
      );
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'src', 'util.ts'), `export const val = 42;`, 'utf8');
      writeFileSync(
        join(dir, 'app.ts'),
        `import { val } from "@alias/util"; import express from 'express'; const app = express(); app.get('/', (_req,res)=> res.send(String(val))); export default app;`,
        'utf8',
      );
      await buildRuntime({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist'),
        outName: 'app',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
        tsconfigPath: join(dir, 'tsconfig.json'),
      });
      expect(existsSync(join(dir, 'dist', 'app.js'))).toBe(true);
      const out = readFileSync(join(dir, 'dist', 'app.js'), 'utf8');
      expect(out).toMatch(/42/);
      expect(listStagingDirs(dir).length).toBe(0);
      expect(listStagingDirs(process.cwd()).length).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('remove only uniquely created staging, not pre-existing', async () => {
    const { dir, cleanup } = createTempProject();
    try {
      writeApp(dir);
      const fakeDir = join(dir, '.wtt-build-preexisting');
      mkdirSync(fakeDir);
      writeFileSync(join(fakeDir, 'keep.txt'), 'keep', 'utf8');
      // staging for this test will be in cwd (repo root), not dir, so fakeDir in dir should remain
      // Also create a fake in cwd to ensure it's not deleted
      const cwdFake = join(process.cwd(), '.wtt-build-preexisting-cwd');
      let cwdFakeCreated = false;
      try {
        mkdirSync(cwdFake);
        writeFileSync(join(cwdFake, 'keep.txt'), 'keep', 'utf8');
        cwdFakeCreated = true;
      } catch {
        /* ignore pre-existing cwd fixture */
      }
      await buildRuntime({
        appPath: join(dir, 'app.ts'),
        outDir: absOut(dir, 'dist'),
        outName: 'app',
        format: 'cjs',
        target: 'node22',
        external: [],
        clean: true,
      });
      expect(existsSync(fakeDir)).toBe(true);
      expect(readFileSync(join(fakeDir, 'keep.txt'), 'utf8')).toBe('keep');
      if (cwdFakeCreated) {
        expect(existsSync(cwdFake)).toBe(true);
        expect(readFileSync(join(cwdFake, 'keep.txt'), 'utf8')).toBe('keep');
        rmSync(cwdFake, { recursive: true, force: true });
      }
      expect(listStagingDirs(dir).includes('.wtt-build-preexisting')).toBe(true);
      rmSync(fakeDir, { recursive: true, force: true });
      expect(listStagingDirs(dir).length).toBe(0);
      expect(listStagingDirs(process.cwd()).length).toBe(0);
    } finally {
      cleanup();
    }
  });
});
