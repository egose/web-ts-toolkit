// Compiler-based verification exits before the measured worker loads peers/runtime.
import { inspectSnapshotDeclarations } from './access-router-core.mjs';

const [root] = process.argv.slice(2);
if (!root) throw new Error('Usage: node access-router-declarations.mjs <prepared-root>');
console.log(JSON.stringify(await inspectSnapshotDeclarations(root)));
