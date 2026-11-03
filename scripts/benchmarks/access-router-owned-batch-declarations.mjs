/** Short-lived compiler heap. Never imported by a timed worker. No files written. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function inspectBatchDeclarations(root) {
  root = resolve(root);
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const conditions = [];
  for (const [extension, entry] of [
    ['mts', 'mjs'],
    ['cts', 'js'],
  ]) {
    const file = resolve(root, `__b1_public_probe.${extension}`);
    const text = `
import { type AccessRouterRequest, type ModelRouter, type FilteredOutput } from './packages/access-router/dist/index.${entry}';
import { type ModelRequest, type FilteredOutput as AdvancedOutput } from './packages/access-router/dist/advanced.${entry}';
declare const req: AccessRouterRequest;
declare const modelRequest: ModelRequest;
declare const router: ModelRouter;
const rows = [{field0:'value'}];
const core: Promise<readonly FilteredOutput<{field0:string}>[]> = req.macl!.pickAllowedFieldsMany('B1Source', rows, 'list');
const base: Promise<readonly AdvancedOutput<{field0:string}>[]> = router.getService(modelRequest).pickAllowedFieldsMany(rows, 'list');
void core; void base;
`;
    const options = {
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      types: [],
      ignoreDeprecations: '6.0',
    };
    const host = ts.createCompilerHost(options);
    const read = host.readFile.bind(host),
      exists = host.fileExists.bind(host);
    host.readFile = (path) => (path === file ? text : read(path));
    host.fileExists = (path) => path === file || exists(path);
    const program = ts.createProgram([file], options, host);
    const errors = ts.getPreEmitDiagnostics(program);
    assert.equal(
      errors.length,
      0,
      ts.formatDiagnosticsWithColorAndContext(errors, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (f) => f,
        getNewLine: () => '\n',
      }),
    );
    const checker = program.getTypeChecker(),
      classes = {};
    for (const source of program.getSourceFiles()) {
      if (!source.fileName.startsWith(resolve(root, 'packages/access-router/dist'))) continue;
      const visit = (node) => {
        if (ts.isClassDeclaration(node) && ['Core', 'Base'].includes(node.name?.text)) {
          const method = node.members.find((m) => m.name?.getText(source) === 'pickAllowedFieldsMany');
          assert.ok(method, `${node.name.text} has an actual declared method`);
          assert.equal(method.typeParameters.length, node.name.text === 'Core' ? 3 : 1);
          classes[node.name.text] = method.getText(source);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    assert.deepEqual(Object.keys(classes).sort(), ['Base', 'Core']);
    const surfaces = {};
    for (const name of ['index', 'advanced']) {
      const source = program.getSourceFile(
        resolve(root, `packages/access-router/dist/${name}.d.${extension === 'mts' ? 'mts' : 'ts'}`),
      );
      assert.ok(source);
      const names = checker
        .getExportsOfModule(checker.getSymbolAtLocation(source))
        .map((s) => s.name)
        .sort();
      assert.ok(names.includes('FilteredOutput'));
      for (const forbidden of [
        'Core',
        'Base',
        'DocumentAuthorization',
        'DocumentStage',
        'filterModelOutputManyForHelper',
        'OutputWorkLedger',
      ])
        assert.ok(!names.includes(forbidden), `Private public export: ${forbidden}`);
      assert.ok(!names.some((n) => n.startsWith('__oar')));
      surfaces[name] = names;
    }
    conditions.push({
      extension,
      classes,
      surfaces,
      publicCoreVia: 'AccessRouterRequest.macl',
      publicBaseVia: 'ModelRouter.getService',
      sourceDiagnostics: 0,
    });
  }
  const pkg = JSON.parse(await readFile(resolve(root, 'packages/access-router/package.json'), 'utf8'));
  assert.deepEqual(Object.keys(pkg.exports).sort(), ['.', './advanced', './processors'].sort());
  return {
    status: 'ok',
    typescript: ts.version,
    conditions,
    note: 'Real public reachability/signatures; compiler outside timed heaps; no new installation',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await inspectBatchDeclarations(process.argv[2])));
}
