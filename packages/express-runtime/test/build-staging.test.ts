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
  generateServerlessEntry,
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
    const originalCwd = process.cwd();
    try {
      writeApp(dir);
      const legacyBuild = 'LEGACY BUILD CONTENT';
      const legacyServerless = 'LEGACY SERVERLESS CONTENT';
      writeFileSync(join(dir, TEMP_BUILD_ENTRY_FILENAME), legacyBuild, 'utf8');
      writeFileSync(join(dir, TEMP_SERVERLESS_ENTRY_FILENAME), legacyServerless, 'utf8');
      // Run the build with cwd inside the temp project so the legacy files
      // sit in the actual staging parent (process.cwd()), not an unrelated
      // dir. The bundler itself is mocked: tsup caches per-process cwd state
      // and cannot run real builds under two different cwds in one process,
      // so temp-cwd assertions use a mocked build while real-build coverage
      // lives in the no-chdir tests below.
      process.chdir(dir);
      const seenEntries: string[] = [];
      const mockBuild = async (options: { entry: Record<string, string> }): Promise<void> => {
        seenEntries.push(...Object.values(options.entry));
      };
      await buildBundleFromEntryContent(
        {
          entryContent: generateRuntimeEntry(join(dir, 'app.ts')),
          outDir: absOut(dir, 'dist'),
          outName: 'app',
          format: 'cjs',
          target: 'node22',
          external: [],
          clean: true,
        },
        { buildImpl: mockBuild },
      );
      expect(readFileSync(join(dir, TEMP_BUILD_ENTRY_FILENAME), 'utf8')).toBe(legacyBuild);
      expect(readFileSync(join(dir, TEMP_SERVERLESS_ENTRY_FILENAME), 'utf8')).toBe(legacyServerless);
      await buildBundleFromEntryContent(
        {
          entryContent: generateServerlessEntry(join(dir, 'app.ts')),
          outDir: absOut(dir, 'dist2'),
          outName: 'handler',
          format: 'cjs',
          target: 'node22',
          external: [],
          clean: true,
        },
        { buildImpl: mockBuild },
      );
      expect(readFileSync(join(dir, TEMP_BUILD_ENTRY_FILENAME), 'utf8')).toBe(legacyBuild);
      expect(readFileSync(join(dir, TEMP_SERVERLESS_ENTRY_FILENAME), 'utf8')).toBe(legacyServerless);
      // The mocked bundler really ran, and staging used unique directories —
      // never the legacy fixed filenames.
      expect(seenEntries.length).toBe(2);
      for (const entry of seenEntries) {
        expect(entry).toContain('.wtt-build-');
        expect(entry).not.toBe(join(dir, TEMP_BUILD_ENTRY_FILENAME));
        expect(entry).not.toBe(join(dir, TEMP_SERVERLESS_ENTRY_FILENAME));
      }
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

  it('symlink collision cannot modify its target', async () => {
    const { dir, cleanup } = createTempProject();
    const originalCwd = process.cwd();
    try {
      writeApp(dir);
      // Collisions live in the actual build cwd (staging parent), so an old
      // fixed-filename writer would have followed them. The bundler is mocked
      // (see above) so temp-cwd builds stay hermetic in one process.
      process.chdir(dir);
      const victimPath = join(dir, 'victim.txt');
      const victimContent = 'VICTIM ORIGINAL ' + randomBytes(4).toString('hex');
      writeFileSync(victimPath, victimContent, 'utf8');
      symlinkSync(victimPath, join(dir, TEMP_BUILD_ENTRY_FILENAME));
      expect(lstatSync(join(dir, TEMP_BUILD_ENTRY_FILENAME)).isSymbolicLink()).toBe(true);
      const mockBuild = async (): Promise<void> => undefined;
      await buildBundleFromEntryContent(
        {
          entryContent: generateRuntimeEntry(join(dir, 'app.ts')),
          outDir: absOut(dir, 'dist'),
          outName: 'app',
          format: 'cjs',
          target: 'node22',
          external: [],
          clean: true,
        },
        { buildImpl: mockBuild },
      );
      expect(readFileSync(victimPath, 'utf8')).toBe(victimContent);
      expect(lstatSync(join(dir, TEMP_BUILD_ENTRY_FILENAME)).isSymbolicLink()).toBe(true);
      expect(listStagingDirs(dir).length).toBe(0);
      symlinkSync(victimPath, join(dir, TEMP_SERVERLESS_ENTRY_FILENAME));
      rmSync(join(dir, TEMP_BUILD_ENTRY_FILENAME), { force: true });
      await buildBundleFromEntryContent(
        {
          entryContent: generateServerlessEntry(join(dir, 'app.ts')),
          outDir: absOut(dir, 'dist2'),
          outName: 'handler',
          format: 'cjs',
          target: 'node22',
          external: [],
          clean: true,
        },
        { buildImpl: mockBuild },
      );
      expect(readFileSync(victimPath, 'utf8')).toBe(victimContent);
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
      let firstError: unknown;
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
      } catch (error) {
        threw = true;
        firstError = error;
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
        } catch (error) {
          threw = true;
          firstError = error;
        }
      }
      // The attempted build must really reject, not merely clean up staging.
      expect(threw).toBe(true);
      expect(firstError).toBeDefined();
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
    // Tracked outside try so a mid-test failure still removes the repo-cwd
    // fixture instead of permanently poisoning later runs.
    const cwdFake = join(process.cwd(), '.wtt-build-preexisting-cwd');
    let cwdFakeCreated = false;
    try {
      writeApp(dir);
      const fakeDir = join(dir, '.wtt-build-preexisting');
      mkdirSync(fakeDir);
      writeFileSync(join(fakeDir, 'keep.txt'), 'keep', 'utf8');
      // staging for this test will be in cwd (repo root), not dir, so fakeDir in dir should remain
      // Also create a fake in cwd to ensure it's not deleted
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
      }
      expect(listStagingDirs(dir).includes('.wtt-build-preexisting')).toBe(true);
      rmSync(fakeDir, { recursive: true, force: true });
      expect(listStagingDirs(dir).length).toBe(0);
      // The cwd fixture itself matches the staging prefix, so exclude it by
      // name: no uniquely created staging may remain.
      expect(listStagingDirs(process.cwd()).filter((f) => f !== '.wtt-build-preexisting-cwd').length).toBe(0);
    } finally {
      if (cwdFakeCreated) {
        try {
          rmSync(cwdFake, { recursive: true, force: true });
        } catch {
          /* ignore fixture cleanup errors */
        }
      }
      cleanup();
    }
  });

  it('ERT-B01: nested ancestor-symlink aliases of cwd are rejected without modifying sentinels', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wtt-phys-root-'));
    const originalCwd = process.cwd();
    try {
      const realProj = join(root, 'project');
      mkdirSync(realProj, { recursive: true });
      writeFileSync(
        join(realProj, 'app.ts'),
        `import express from 'express'; const app = express(); export default app;`,
        'utf8',
      );
      writeFileSync(join(realProj, 'keep.txt'), 'keep', 'utf8');
      // alias inside the project points at the temp root (parent of cwd),
      // so alias/project physically targets cwd itself.
      symlinkSync(root, join(realProj, 'alias'));
      process.chdir(realProj);
      expect(() => validateOutDirForClean(join('alias', 'project'), true)).toThrow(/Refusing to clean/);
      expect(() => validateOutDirForClean('alias', true)).toThrow(/Refusing to clean/);
      let threw = false;
      try {
        await runBuildEntryCommand(
          {
            appPath: './app.ts',
            outDir: join('alias', 'project'),
            outName: 'app',
            format: 'cjs',
            target: 'node22',
            external: [],
            clean: true,
          },
          { generateEntry: generateRuntimeEntry },
        );
      } catch (error) {
        threw = true;
        expect(String(error)).toMatch(/Refusing to clean/);
      }
      expect(threw).toBe(true);
      expect(readFileSync(join(realProj, 'keep.txt'), 'utf8')).toBe('keep');
      expect(existsSync(join(realProj, 'app.ts'))).toBe(true);
      expect(listStagingDirs(realProj).length).toBe(0);
    } finally {
      try {
        process.chdir(originalCwd);
      } catch {
        /* ignore cwd restore errors */
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ERT-B01: symlinked app/init directory overlap is rejected without modifying sentinels', async () => {
    const { dir, cleanup } = createTempProject();
    const originalCwd = process.cwd();
    try {
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(
        join(dir, 'src', 'app.ts'),
        `import express from 'express'; const app = express(); export default app;`,
        'utf8',
      );
      writeFileSync(join(dir, 'src', 'init.ts'), `export default async function init(): Promise<void> {}`, 'utf8');
      writeFileSync(join(dir, 'keep.txt'), 'keep', 'utf8');
      symlinkSync(join(dir, 'src'), join(dir, 'linksrc'));
      process.chdir(dir);
      // linksrc physically equals src, which contains the app and init inputs.
      expect(() => validateOutDirForClean('linksrc', true, './src/app.ts')).toThrow(/Refusing to clean/);
      expect(() => validateOutDirForClean('linksrc', true, './src/app.ts', './src/init.ts')).toThrow(
        /Refusing to clean/,
      );
      let threw = false;
      try {
        await runBuildEntryCommand(
          {
            appPath: './src/app.ts',
            initPath: './src/init.ts',
            outDir: 'linksrc',
            outName: 'app',
            format: 'cjs',
            target: 'node22',
            external: [],
            clean: true,
          },
          { generateEntry: generateRuntimeEntry },
        );
      } catch (error) {
        threw = true;
        expect(String(error)).toMatch(/Refusing to clean/);
      }
      expect(threw).toBe(true);
      expect(readFileSync(join(dir, 'keep.txt'), 'utf8')).toBe('keep');
      expect(readFileSync(join(dir, 'src', 'app.ts'), 'utf8')).toContain('express');
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

  it('ERT-B01: safe nonexistent descendants remain usable, including through a symlink parent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'wtt-phys-safe-'));
    const originalCwd = process.cwd();
    try {
      const realProj = join(root, 'project');
      mkdirSync(realProj, { recursive: true });
      writeFileSync(
        join(realProj, 'app.ts'),
        `import express from 'express'; const app = express(); export default app;`,
        'utf8',
      );
      symlinkSync(root, join(realProj, 'alias'));
      process.chdir(realProj);
      expect(() => validateOutDirForClean(join('fresh', 'nested', 'out'), true, './app.ts')).not.toThrow();
      // Through the symlink parent, alias/project/fresh-out physically equals
      // project/fresh-out: a safe nonexistent descendant of cwd.
      expect(() => validateOutDirForClean(join('alias', 'project', 'fresh-out'), true, './app.ts')).not.toThrow();
      expect(() => validateOutDirForClean('dist', true, './app.ts')).not.toThrow();
    } finally {
      try {
        process.chdir(originalCwd);
      } catch {
        /* ignore cwd restore errors */
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('ERT-B01: symlink loops fail closed instead of cleaning', async () => {
    const { dir, cleanup } = createTempProject();
    const originalCwd = process.cwd();
    try {
      writeApp(dir);
      writeFileSync(join(dir, 'keep.txt'), 'keep', 'utf8');
      try {
        symlinkSync(join(dir, 'loop-b'), join(dir, 'loop-a'));
        symlinkSync(join(dir, 'loop-a'), join(dir, 'loop-b'));
      } catch {
        // Symlink creation unavailable: nothing dangerous to assert.
        return;
      }
      process.chdir(dir);
      expect(() => validateOutDirForClean(join('loop-a', 'out'), true)).toThrow(/Refusing to clean/);
      expect(readFileSync(join(dir, 'keep.txt'), 'utf8')).toBe('keep');
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

  it('ERT-B01: injected entry-write failure leaves no owned staging', async () => {
    const { dir, cleanup } = createTempProject();
    const originalCwd = process.cwd();
    try {
      process.chdir(dir);
      const failingWrite = (() => {
        throw new Error('injected entry-write failure');
      }) as unknown as typeof writeFileSync;
      const neverBuild = async (): Promise<void> => {
        throw new Error('bundler must not run after entry-write failure');
      };
      let threw = false;
      try {
        await buildBundleFromEntryContent(
          {
            entryContent: `export default 1;`,
            outDir: 'dist',
            outName: 'app',
            format: 'cjs',
            target: 'node22',
            external: [],
            clean: false,
          },
          { writeFileSyncImpl: failingWrite, buildImpl: neverBuild },
        );
      } catch (error) {
        threw = true;
        expect(String(error)).toMatch(/injected entry-write failure/);
      }
      expect(threw).toBe(true);
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

  it('ERT-B01: injected post-write inspection failure leaves no owned staging', async () => {
    const { dir, cleanup } = createTempProject();
    const originalCwd = process.cwd();
    try {
      process.chdir(dir);
      const inspectingLstat = ((path: string) => {
        const stat = lstatSync(path);
        if (path.endsWith('entry.ts')) {
          const error = new Error('injected inspection failure') as NodeJS.ErrnoException;
          error.code = 'EACCES';
          throw error;
        }
        return stat;
      }) as unknown as typeof lstatSync;
      const neverBuild = async (): Promise<void> => {
        throw new Error('bundler must not run after inspection failure');
      };
      let threw = false;
      try {
        await buildBundleFromEntryContent(
          {
            entryContent: `export default 1;`,
            outDir: 'dist',
            outName: 'app',
            format: 'cjs',
            target: 'node22',
            external: [],
            clean: false,
          },
          { lstatSyncImpl: inspectingLstat, buildImpl: neverBuild },
        );
      } catch (error) {
        threw = true;
        expect(String(error)).toMatch(/injected inspection failure|unresolvable/);
      }
      expect(threw).toBe(true);
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

  it('ERT-B01: injected staging inspection failure leaves no owned staging', async () => {
    const { dir, cleanup } = createTempProject();
    const originalCwd = process.cwd();
    try {
      process.chdir(dir);
      const failingLstat = (() => {
        const error = new Error('injected staging inspection failure') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      }) as unknown as typeof lstatSync;
      const neverBuild = async (): Promise<void> => {
        throw new Error('bundler must not run after staging inspection failure');
      };
      let threw = false;
      try {
        await buildBundleFromEntryContent(
          {
            entryContent: `export default 1;`,
            outDir: 'dist',
            outName: 'app',
            format: 'cjs',
            target: 'node22',
            external: [],
            clean: false,
          },
          { lstatSyncImpl: failingLstat, buildImpl: neverBuild },
        );
      } catch (error) {
        threw = true;
        expect(String(error)).toMatch(/injected staging inspection failure/);
      }
      expect(threw).toBe(true);
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
});
