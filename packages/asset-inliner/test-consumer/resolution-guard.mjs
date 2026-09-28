// Loaded before any consumer module. Guard *every* transitive ESM/CJS resolution,
// including file-type's dynamic import, against ancestor/workspace fallbacks.
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { isBuiltin, registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('.', import.meta.url)));
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (isBuiltin(result.url)) return result;
    assert.ok(result.url.startsWith('file:'), `consumer boundary: ${result.url}`);
    const file = fileURLToPath(result.url);
    assert.ok(file.startsWith(`${root}${path.sep}`), `consumer boundary: ${file}`);
    assert.ok(realpathSync(file).startsWith(`${root}${path.sep}`), `consumer boundary (symlink): ${file}`);
    return result;
  },
});
