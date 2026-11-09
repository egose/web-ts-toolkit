import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { consumerPolicy } from './test-layer-consumers.mjs';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const packageName = '@web-ts-toolkit/access-router';
export const layers = ['contracts', 'invariants', 'internal'];
const extensions = ['', '.ts', '.mts', '.cts', '.tsx', '.mjs', '.cjs', '.js', '.d.ts', '/index.ts'];
const codeExtension = /\.(?:[cm]?[jt]sx?)$/;
const slash = (value) => value.replaceAll('\\', '/');

export function walkFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', 'dist', '.git'].includes(entry.name) || entry.name.startsWith('_tmp')) return [];
    const file = path.join(root, entry.name);
    return entry.isDirectory() ? walkFiles(file) : [file];
  });
}

/** Pure set check; inputs are actual resolved Vitest discovery, not a second glob implementation. */
export function checkLayerSets({ runnable, all, selected }) {
  const errors = [];
  const baseline = new Set(runnable);
  const exhaustive = new Set(all);
  for (const layer of layers) {
    if (!selected[layer]?.length) errors.push(`empty layer: ${layer}`);
    if (new Set(selected[layer] ?? []).size !== (selected[layer]?.length ?? 0)) errors.push(`duplicate discovery: ${layer}`);
  }
  if (exhaustive.size !== all.length) errors.push('duplicate discovery: default');
  for (const file of new Set([...runnable, ...all, ...layers.flatMap((layer) => selected[layer] ?? [])])) {
    const owners = layers.filter((layer) => selected[layer]?.includes(file));
    const declared = /^test\/(contracts|invariants|internal)\//.exec(file)?.[1];
    if (!declared) errors.push(`orphan/support runnable: ${file}; move to test/<layer>/`);
    if (owners.length !== 1) errors.push(`${owners.length ? 'overlap' : 'unselected'}: ${file} (${owners.join(', ')})`);
    if (owners.length === 1 && owners[0] !== declared) errors.push(`wrong layer: ${file} selected by ${owners[0]}`);
    if (!baseline.has(file) || !exhaustive.has(file)) errors.push(`default/union mismatch: ${file}`);
  }
  return errors;
}

/** Uses the installed Vitest API; discovers files only, never executes test/setup modules. */
export async function discoverLayers(root = packageRoot) {
  const { createVitest } = await import('vitest/node');
  const result = { selected: {}, setup: [], aliases: [] };
  for (const layer of ['all', ...layers]) {
    const ctx = await createVitest('test', {
      root,
      config: path.join(root, layer === 'all' ? 'vitest.config.ts' : `vitest.${layer}.config.ts`),
      watch: false,
    });
    try {
      const specs = await ctx.globTestSpecifications();
      const files = specs.map((spec) => slash(path.relative(root, spec.moduleId))).sort();
      if (layer === 'all') result.all = files;
      else result.selected[layer] = files;
      for (const project of ctx.projects) {
        const settings = project.config;
        if (layer === 'all' || layer === 'contracts') result.aliases.push(...project.vite.config.resolve.alias);
        if (settings.environment !== 'node' || settings.fileParallelism !== false || settings.testTimeout !== 30_000) {
          throw new Error(`${layer}: preserve node, fileParallelism:false and testTimeout:30000`);
        }
        if (settings.passWithNoTests) throw new Error(`${layer}: passWithNoTests is forbidden`);
        const setup = [settings.setupFiles, settings.globalSetup].flat(2).filter(Boolean);
        result.setup.push(...setup.map((file) => path.resolve(root, file)));
        if (!setup.some((file) => path.resolve(root, file) === path.join(root, 'test/global-setup.ts'))) {
          throw new Error(`${layer}: test/global-setup.ts must remain configured`);
        }
      }
    } finally {
      await ctx.close();
    }
  }
  result.setup = [...new Set(result.setup)];
  result.runnable = walkFiles(root).filter((file) => file.endsWith('.test.ts')).map((file) => slash(path.relative(root, file))).sort();
  return result;
}

function unwrap(node) {
  while (node && (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node)
    || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
}

function literal(node) {
  node = unwrap(node);
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
}

function resolveFile(file) {
  return extensions.map((ext) => file + ext).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function nodes(root, predicate) {
  const result = [];
  const visit = (node) => {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return result;
}

// Resolve lexical variable initializers only. No eval, test import, or arbitrary string scan.
function initializer(node, name) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    for (const statement of scope.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration.initializer;
      }
    }
  }
}

function finiteStrings(node, seen = new Set()) {
  node = unwrap(node);
  if (!node || seen.has(node)) return undefined;
  seen = new Set([...seen, node]);
  const value = literal(node);
  if (value !== undefined) return [value];
  if (ts.isIdentifier(node)) {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (ts.isArrowFunction(parent) && parent.parameters[0]?.name.getText() === node.text
        && ts.isCallExpression(parent.parent) && ts.isPropertyAccessExpression(parent.parent.expression)
        && parent.parent.expression.name.text === 'map') return finiteStrings(parent.parent.expression.expression, seen);
      if (!ts.isForOfStatement(parent) || !ts.isVariableDeclarationList(parent.initializer)) continue;
      const binding = parent.initializer.declarations[0].name;
      if (ts.isIdentifier(binding) && binding.text === node.text) return finiteStrings(parent.expression, seen);
      if (ts.isArrayBindingPattern(binding)) {
        const index = binding.elements.findIndex((element) => ts.isBindingElement(element) && element.name.getText() === node.text);
        const table = unwrap(parent.expression);
        if (index >= 0 && ts.isArrayLiteralExpression(table)) {
          const values = table.elements.map((row) => ts.isArrayLiteralExpression(row) && finiteStrings(row.elements[index], seen));
          if (values.every(Boolean)) return values.flat();
        }
      }
    }
    return finiteStrings(initializer(node, node.text), seen);
  }
  if (ts.isSpreadElement(node)) return finiteStrings(node.expression, seen);
  if (ts.isArrayLiteralExpression(node)) {
    const values = node.elements.map((element) => finiteStrings(element, seen));
    return values.every(Boolean) ? values.flat() : undefined;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const a = finiteStrings(node.left, seen), b = finiteStrings(node.right, seen);
    return a && b && a.length * b.length < 1000 ? a.flatMap((left) => b.map((right) => left + right)) : undefined;
  }
  if (ts.isTemplateExpression(node)) {
    let values = [node.head.text];
    for (const span of node.templateSpans) {
      const substitutions = finiteStrings(span.expression, seen);
      if (!substitutions || values.length * substitutions.length > 1000) return undefined;
      values = values.flatMap((value) => substitutions.map((part) => value + part + span.literal.text));
    }
    return values;
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'join') {
    const values = finiteStrings(node.expression.expression, seen);
    const separator = literal(node.arguments[0]);
    if (values && separator !== undefined) return [values.join(separator)];
  }
  return undefined;
}

/**
 * Fail-closed on module edges and unreviewed source producers. This is a boundary
 * guard, not a sandbox or proof of semantic independence (see scripts/README.md).
 */
export function auditContractGraph({ root = packageRoot, entries, setup = [], aliases = [], policy = consumerPolicy }) {
  root = path.resolve(root);
  const errors = [];
  const visited = new Set();
  const visitedContexts = new Set();
  const modules = new Map();
  const usedRules = new Set();
  const usedInstalledSources = new Set();
  const installedInputs = new Set((policy.inputs ?? []).map((file) => path.resolve(root, file)));
  const publicEntries = new Set(['index', 'advanced', 'processors'].flatMap((name) =>
    ['js', 'mjs', 'd.ts', 'd.mts'].map((ext) => `dist/${name}.${ext}`)));
  const stableSetup = new Set(['test/setup.ts', 'test/global-setup.ts']);
  const manifestPath = path.join(root, 'package.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const externalPackages = new Set(['dependencies', 'devDependencies', 'peerDependencies'].flatMap((field) => Object.keys(manifest[field] ?? {})));
  const configPath = path.join(root, 'tsconfig.json');
  let compilerOptions = {};
  if (existsSync(configPath)) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    compilerOptions = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  }
  const rel = (file) => slash(path.relative(root, file));
  const position = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const diagnostic = (sf, node, message, chain) => errors.push(`${rel(sf.fileName)}:${position(sf, node)}: ${message}\n  via ${chain.join(' -> ')}`);

  function ruleFor(sf, node, kind, context) {
    const line = position(sf, node);
    const expression = node.getText(sf);
    const rule = (policy.reviews ?? []).find((candidate) => candidate.file === rel(sf.fileName)
      && candidate.kind === kind && candidate.lines.includes(line) && candidate.expression === expression);
    if (rule) {
      usedRules.add(rule);
      for (const input of rule.inputs ?? []) visitFile(path.resolve(root, input), [rel(sf.fileName), `${kind}:${line}`], '', context);
    }
    return rule;
  }

  function allowedFile(file) {
    const name = rel(file);
    return publicEntries.has(name) || stableSetup.has(name) || name.startsWith('test/contracts/')
      || name.startsWith('test/support/public/');
  }

  // Context belongs to the incoming compiler edge, never the filename. A staged
  // consumer imported normally by a repo test must be checked in repo context too.
  function visitFile(file, chain, site = '', context = 'repo') {
    const resolved = resolveFile(file);
    if (!resolved) {
      errors.push(`unresolved local input: ${rel(file)}${site ? ` (${site})` : ''}\n  via ${chain.join(' -> ')}`);
      return;
    }
    file = realpathSync(resolved);
    if (!allowedFile(file)) {
      errors.push(`private dependency: ${rel(file)}${site ? ` (${site})` : ''}\n  via ${chain.join(' -> ')}`);
      return;
    }
    const key = `${context}\0${file}`;
    if (publicEntries.has(rel(file)) || visitedContexts.has(key)) return; // trusted implementation boundary
    visitedContexts.add(key);
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    auditModule(file, source, [...chain, rel(file)], new Map(), context);
  }

  function negativeException(sf, node, specifier) {
    const entry = (policy.negatives ?? []).find((item) => item.file === rel(sf.fileName)
      && item.line === position(sf, node) && item.specifier === specifier);
    if (!entry) return false;
    usedRules.add(entry);
    // A type-only negative is exactly one documented @ts-expect-error import
    // type, never an import binding or runtime import. The alias cannot be used.
    if (entry.kind === 'type') {
      const alias = node.parent;
      const previous = sf.text.split('\n')[entry.line - 2] ?? '';
      return ts.isImportTypeNode(node) && ts.isTypeAliasDeclaration(alias)
        && (!entry.alias || alias.name.text === entry.alias)
        && previous.trim() === entry.directive
        && nodes(sf, (candidate) => ts.isIdentifier(candidate) && candidate.text === alias.name.text).length === 1;
    }
    return false;
  }

  function moduleEdge(sf, node, expression, chain, virtual, context) {
    const site = `${rel(sf.fileName)}:${position(sf, node)}`;
    const specifier = literal(expression);
    if (specifier === undefined) {
      // Only the two exact generated assert.throws(require.resolve(prefix +
      // subpath)) sites have finite reviewed outputs; shape checked below.
      if (negativeResolve(sf, node, expression)) return;
      const reviewed = ruleFor(sf, expression, 'resolve', context);
      if (reviewed && JSON.stringify(finiteStrings(expression)) === JSON.stringify(reviewed.finite)) return;
      diagnostic(sf, node, `computed/unresolved module edge: ${expression?.getText(sf) ?? '<missing>'}`, chain);
      return;
    }
    if (negativeException(sf, node, specifier)) return;
    for (const alias of context === 'repo' ? aliases : []) {
      const matches = typeof alias.find === 'string' ? specifier === alias.find || specifier.startsWith(alias.find + '/')
        : new RegExp(alias.find.source, alias.find.flags).test(specifier);
      if (!matches) continue;
      if (alias.customResolver) diagnostic(sf, node, `unreviewed custom module resolver: ${specifier}`, chain);
      else visitFile(specifier.replace(alias.find, alias.replacement), chain, site, context);
      return;
    }
    const publicName = specifier === packageName || specifier === `${packageName}/advanced` || specifier === `${packageName}/processors`;
    if (publicName && context === 'repo') {
      // Check effective (including inherited) paths/baseUrl BEFORE trusting an
      // exact public name. Installed consumers have their own compiler config;
      // applying repository aliases to them would manufacture private edges.
      const resolved = ts.resolveModuleName(specifier, sf.fileName, compilerOptions, ts.sys).resolvedModule;
      const pathsMatch = Object.keys(compilerOptions.paths ?? {}).some((pattern) => {
        const star = pattern.indexOf('*');
        return star < 0 ? pattern === specifier
          : specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1));
      });
      if (resolved && (pathsMatch || !resolved.isExternalLibraryImport)) {
        visitFile(resolved.resolvedFileName, chain, site, context);
        return;
      }
      if (pathsMatch && !resolved) {
        diagnostic(sf, node, `unresolved TypeScript alias: ${specifier}`, chain);
        return;
      }
    }
    if (publicName) return;
    if (specifier.startsWith(packageName + '/') || specifier.startsWith('#') || specifier.startsWith('@/')
      || specifier.startsWith('~/')) {
      diagnostic(sf, node, `private/aliased package import: ${specifier}`, chain);
      return;
    }
    if (specifier.startsWith('.') || path.isAbsolute(specifier) || specifier.startsWith('file:')) {
      const target = specifier.startsWith('file:') ? fileURLToPath(specifier) : path.resolve(path.dirname(sf.fileName), specifier);
      const targetFile = resolveFile(target);
      const negativeAliases = (policy.negatives ?? []).filter((entry) => entry.alias && targetFile
        && entry.file === rel(realpathSync(targetFile))).map((entry) => entry.alias);
      if (negativeAliases.length) {
        const names = nodes(node, ts.isImportSpecifier).map((binding) => binding.propertyName?.text ?? binding.name.text);
        names.push(...nodes(node, ts.isExportSpecifier).map((binding) => binding.propertyName?.text ?? binding.name.text));
        if (names.some((name) => negativeAliases.includes(name)) || nodes(node, ts.isNamespaceImport).length
          || ts.isExportDeclaration(node) && !node.exportClause || ts.isImportTypeNode(node)) {
          diagnostic(sf, node, 'negative-encapsulation alias must not be consumed or re-exported', chain);
        }
      }
      const generated = virtual?.get(slash(specifier.replace(/^\.\//, '')));
      if (generated) {
        auditModule(generated.file, generated.source, [...chain, specifier], virtual, context);
      } else {
        visitFile(target, chain, site, context);
      }
      return;
    }
    // Bare third-party/Node dependencies are outside this package's boundary.
    // Local tsconfig/Vitest aliases must not disguise access-router implementation.
    if (/^(?:src|test|dist)\//.test(specifier)) diagnostic(sf, node, `local alias is not a public entry: ${specifier}`, chain);
    const resolved = context === 'repo' && ts.resolveModuleName(specifier, sf.fileName, compilerOptions, ts.sys).resolvedModule;
    if (resolved && !resolved.isExternalLibraryImport
      && (!externalPackages.has(specifier) || !path.relative(root, resolved.resolvedFileName).startsWith('..'))) {
      visitFile(resolved.resolvedFileName, chain, site, context);
    }
  }

  function negativeResolve(sf, node, expression) {
    const rules = policy.negativeResolves ?? [];
    const rule = rules.find((item) => item.file === rel(sf.fileName) && item.line === position(sf, node));
    if (!rule || !ts.isCallExpression(node) || node.expression.getText(sf) !== 'require.resolve'
      || expression.getText(sf) !== "'@web-ts-toolkit/access-router/' + subpath") return false;
    const arrow = node.parent, assertion = arrow?.parent;
    if (!ts.isArrowFunction(arrow) || arrow.body !== node || !ts.isCallExpression(assertion)
      || assertion.expression.getText(sf) !== 'assert.throws' || assertion.arguments[0] !== arrow
      || assertion.arguments[1]?.getText(sf) !== "{ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' }") return false;
    let loop = assertion.parent;
    while (loop && !ts.isForOfStatement(loop)) loop = loop.parent;
    const values = loop && finiteStrings(loop.expression);
    if (!values || JSON.stringify(values) !== JSON.stringify(rule.subpaths)) return false;
    // Cannot bind, return, invoke or otherwise use an export; resolve must throw.
    usedRules.add(rule);
    return true;
  }

  function auditRead(sf, node, chain, asSource = false, context = 'repo') {
    const argument = node.arguments[0];
    if (!argument) return;
    const text = argument.getText(sf);
    const strings = nodes(argument, (part) => literal(part) !== undefined).map(literal);
    // JSON/manifests, Markdown and declaration text may be inspected, not executed.
    // Dynamic publication-integrity reads require explicit locations below.
    if (strings.some((value) => /(?:^|\/)(?:src|test\/support\/private|test\/internal|test\/invariants)(?:\/|$)/.test(value))) {
      diagnostic(sf, node, `private filesystem input: ${text}`, chain);
      return;
    }
    const last = strings.at(-1);
    if (!asSource && last && /(?:package\.json|\.md|\.txt|\.d\.[cm]?ts)$/.test(last)) return;
    if (strings.some((value) => /^test\/support\/public\/.+\.[cm]?[jt]s$/.test(value))) {
      const input = path.resolve(root, strings.find((value) => value.startsWith('test/support/public/')));
      visitFile(input, chain, '', installedInputs.has(input) ? 'installed' : context);
      return;
    }
    if (ts.isCallExpression(argument) && ['path.resolve', 'path.join'].includes(argument.expression.getText(sf))
      && argument.arguments[0]?.getText(sf) === 'packageRoot') {
      const components = argument.arguments.slice(1).map((part) => finiteStrings(part));
      if (components.every(Boolean)) {
        const inputs = components.reduce((paths, choices) => paths.flatMap((prefix) => choices.map((part) => path.join(prefix, part))), ['']);
        for (const input of inputs) {
          if (codeExtension.test(input)) {
            const file = path.resolve(root, input);
            visitFile(file, chain, '', installedInputs.has(file) ? 'installed' : context);
          }
          else if (!/\.(?:md|txt|json)$/.test(input)) diagnostic(sf, node, `unreviewed filesystem input: ${input}`, chain);
        }
        return;
      }
    }
    const review = ruleFor(sf, argument, 'read', context);
    if (!review || asSource && review.role !== 'module') diagnostic(sf, node, `unreviewed filesystem/source read: ${text}; use a literal public input or add a finite input review`, chain);
  }

  function auditProducer(sf, node, chain, virtual, context) {
    let data = unwrap(node.arguments[1]);
    if (!data) return;
    if (ts.isCallExpression(data) && data.expression.getText(sf) === 'JSON.stringify') return;
    const targetText = node.arguments[0]?.getText(sf) ?? '';
    if (/\.(?:json|log|yaml)['"`]/.test(targetText)) return;
    if (ts.isBinaryExpression(data) && data.operatorToken.kind === ts.SyntaxKind.PlusToken
      && ts.isCallExpression(data.left) && data.left.expression.getText(sf) === 'JSON.stringify') return;
    const sources = finiteStrings(data);
    if (sources?.length === 1) {
      const name = nodes(node.arguments[0], (part) => literal(part) !== undefined).map(literal).at(-1);
      const generatedFile = `${sf.fileName}#${name && codeExtension.test(name) ? name : `consumer-${position(sf, node)}.ts`}`;
      const generated = new Map(virtual);
      if (name && codeExtension.test(name)) generated.set(name, { file: generatedFile, source: sources[0] });
      const installed = (policy.installedSources ?? []).find((producer) => producer.file === rel(sf.fileName)
        && producer.line === position(sf, node) && producer.target === node.arguments[0].getText(sf));
      if (installed) usedInstalledSources.add(installed);
      auditModule(generatedFile, sources[0], [...chain, `generated:${position(sf, node)}`], generated, installed ? 'installed' : context);
      return;
    }
    const seen = new Set();
    let input = data;
    while (input && !seen.has(input)) {
      seen.add(input);
      if (ts.isIdentifier(input)) input = unwrap(initializer(input, input.text));
      else if (ts.isCallExpression(input) && input.expression.getText(sf) === 'readFileSync') {
        auditRead(sf, input, chain, true, context);
        return;
      }
      else if (ts.isCallExpression(input) && ts.isPropertyAccessExpression(input.expression)
        && input.expression.name.text === 'replaceAll'
        && [["'../../../dist/index.js'", "'@web-ts-toolkit/access-router'"],
          ["'../../../dist/advanced.js'", "'@web-ts-toolkit/access-router/advanced'"]]
          .some(([from, to]) => literal(input.arguments[0]) === from && literal(input.arguments[1]) === to)) {
        input = unwrap(input.expression.expression);
      } else break;
    }
    if (!ruleFor(sf, data, 'source', context)) diagnostic(sf, node, `unreviewed generated consumer source: ${data.getText(sf)}; declare exact public inputs`, chain);
  }

  function auditModule(file, source, chain, virtual = new Map(), context = 'repo') {
    const key = `${context}\0${file}\0${source}`;
    if (modules.has(key)) return;
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    modules.set(key, sf);
    virtual = new Map(virtual);
    for (const output of policy.generated ?? []) {
      if (output.consumer !== rel(file)) continue;
      const markdown = readFileSync(path.resolve(root, output.document), 'utf8');
      const blocks = [...markdown.matchAll(/<!--\s*doc-example:\s*partial\s*-->\s*```ts\n([\s\S]*?)```/g)]
        .filter((match) => match[1].includes(output.marker));
      if (blocks.length !== 1) {
        errors.push(`${output.document}: expected one exact generated partial block for ${output.output}`);
        continue;
      }
      virtual.set(output.output, { file: `${path.resolve(root, output.document)}#${output.output}`, source: blocks[0][1] });
    }
    // Literal consumer modules written in this module share their generated
    // directory. Parse those module contexts, not arbitrary assertion strings.
    for (const call of nodes(sf, ts.isCallExpression)) {
      if (!/(?:^|\.)writeFileSync$/.test(call.expression.getText(sf))) continue;
      const name = call.arguments[0] && nodes(call.arguments[0], (part) => literal(part) !== undefined).map(literal).at(-1);
      const content = finiteStrings(call.arguments[1]);
      if (name && codeExtension.test(name) && content?.length === 1) {
        virtual.set(name, { file: `${file}#${name}`, source: content[0] });
      }
    }
    for (const error of sf.parseDiagnostics) diagnostic(sf, sf, `unparseable consumer/module: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`, chain);
    for (const inventory of policy.inventories ?? []) {
      if (inventory.file !== rel(file)) continue;
      const declaration = nodes(sf, ts.isVariableDeclaration).find((node) => node.name.getText(sf) === inventory.binding
        && position(sf, node) === inventory.line);
      const init = declaration && unwrap(declaration.initializer);
      const values = inventory.property && init && ts.isArrayLiteralExpression(init)
        ? init.elements.map((element) => ts.isObjectLiteralExpression(element)
          ? literal(element.properties.find((property) => property.name?.getText(sf) === inventory.property)?.initializer) : undefined)
        : finiteStrings(init);
      if (JSON.stringify(values) !== JSON.stringify(inventory.values)) {
        errors.push(`${inventory.file}:${inventory.line}: generated consumer file-list inventory changed: ${inventory.binding}; review actual inputs and policy together`);
      }
    }
    const imported = new Set();
    const requires = new Set(['require']);
    const createRequires = new Set(['createRequire']);
    const mocks = new Set(['vi', 'vitest']);
    for (const node of nodes(sf, ts.isImportDeclaration)) {
      const specifier = literal(node.moduleSpecifier);
      if (specifier?.startsWith(packageName) || specifier && /^\.{1,2}\/.*dist\//.test(specifier)) {
        if (node.importClause?.name) imported.add(node.importClause.name.text);
        for (const name of nodes(node.importClause ?? node, ts.isIdentifier)) imported.add(name.text);
      }
      if (specifier === 'vitest') {
        for (const element of node.importClause?.namedBindings?.elements ?? []) {
          if (['vi', 'vitest'].includes(element.propertyName?.text ?? element.name.text)) mocks.add(element.name.text);
        }
      }
      if (specifier === 'node:module' || specifier === 'module') {
        for (const element of node.importClause?.namedBindings?.elements ?? []) {
          if ((element.propertyName?.text ?? element.name.text) === 'createRequire') createRequires.add(element.name.text);
        }
      }
    }
    for (const declaration of nodes(sf, ts.isVariableDeclaration)) {
      const init = unwrap(declaration.initializer);
      if (ts.isIdentifier(declaration.name) && init && ts.isCallExpression(init)
        && (createRequires.has(init.expression.getText(sf)) || /\.createRequire$/.test(init.expression.getText(sf)))) requires.add(declaration.name.text);
      if (ts.isIdentifier(declaration.name) && init && ts.isCallExpression(init)
        && /\.(?:getService|getPublicService)$/.test(init.expression.getText(sf))) imported.add(declaration.name.text);
    }
    const packageReceiver = (node) => {
      node = unwrap(node);
      if (!node) return false;
      if (ts.isIdentifier(node)) return imported.has(node.text);
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return packageReceiver(node.expression);
      if (ts.isAwaitExpression(node)) return packageReceiver(node.expression);
      if (ts.isCallExpression(node)) {
        // Returned DTOs/configuration snapshots are consumer data, not methods
        // to patch. Only owner/factory acquisition propagates this heuristic.
        const method = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText(sf);
        return /^(?:createAccessRuntime|createRouter|createDataRouter|getService|getPublicService|fromModel)$/.test(method)
          && packageReceiver(node.expression);
      }
      return false;
    };
    // Common imported factory -> router -> acquired service and simple alias
    // chains. Arbitrary object/closure/reflection dataflow still needs review.
    for (let pass = 0; pass < 3; pass++) {
      for (const declaration of nodes(sf, ts.isVariableDeclaration)) {
        const init = unwrap(declaration.initializer);
        if (!ts.isIdentifier(declaration.name) || !init) continue;
        if (packageReceiver(init)) imported.add(declaration.name.text);
        if (ts.isIdentifier(init) && requires.has(init.text)) requires.add(declaration.name.text);
      }
    }
    const privateMethod = (name) => /^(?:_(?:stage|authorization|execute)|processOp$|gen(?:IDFilter|AllowedFields|Select)$|trimOutputFields$|findRawParentDoc$|getAuthorizedTargetService$|prepare(?:Query|Create|Update)$|executePrepared|createDocumentAuthorization|resolveDocumentAuthorization)/.test(name ?? '');
    for (const node of nodes(sf, () => true)) {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) moduleEdge(sf, node, node.moduleSpecifier, chain, virtual, context);
      } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        moduleEdge(sf, node, node.moduleReference.expression, chain, virtual, context);
      } else if (ts.isImportTypeNode(node)) {
        moduleEdge(sf, node, ts.isLiteralTypeNode(node.argument) ? node.argument.literal : node.argument, chain, virtual, context);
      } else if (ts.isCallExpression(node)) {
        const name = node.expression.getText(sf);
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword || requires.has(name)
          || [...requires].some((require) => name === `${require}.resolve`)) moduleEdge(sf, node, node.arguments[0], chain, virtual, context);
        if (name === 'readFileSync' || name.endsWith('.readFileSync')) auditRead(sf, node, chain, false, context);
        if (name === 'writeFileSync' || name.endsWith('.writeFileSync')) auditProducer(sf, node, chain, virtual, context);
        if (name === 'ts.createProgram') {
          const values = finiteStrings(node.arguments[0]);
          if (values) for (const input of values) visitFile(path.resolve(root, input), chain, '', context);
          else if (!ruleFor(sf, node.arguments[0], 'compiler', context)) diagnostic(sf, node, 'unresolved compiler file-list input; declare finite public inputs', chain);
        }
        if ((ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))
          && mocks.has(node.expression.expression.getText(sf))) {
          const method = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : literal(node.expression.argumentExpression);
          if (!method) diagnostic(sf, node, 'computed mock API call requires boundary review', chain);
          if (['mock', 'doMock', 'importMock'].includes(method)) {
            const target = literal(node.arguments[0]);
            if (!target || target.startsWith(packageName) || target.startsWith('.') || target.includes('/access-router/')) {
              diagnostic(sf, node, 'package/local implementation mock is forbidden in contracts', chain);
            }
          }
          if (method === 'spyOn' && (packageReceiver(node.arguments[0]) || privateMethod(literal(node.arguments[1])))) {
            diagnostic(sf, node, 'package method spy/patch is not a public override seam', chain);
          }
          if (method === 'importActual') moduleEdge(sf, node, node.arguments[0], chain, virtual, context);
        }
        if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'processOp') {
          diagnostic(sf, node, 'private package method call is forbidden', chain);
        }
        if (['Object.defineProperty', 'Reflect.defineProperty', 'Reflect.set', 'Object.assign'].includes(name)
          && (packageReceiver(node.arguments[0]) || privateMethod(literal(node.arguments[1])))) {
          diagnostic(sf, node, 'package property patch is forbidden', chain);
        }
      } else if (ts.isBinaryExpression(node) && ts.isAssignmentOperator(node.operatorToken.kind)) {
        const left = unwrap(node.left);
        if ((ts.isPropertyAccessExpression(left) || ts.isElementAccessExpression(left))
          && ((packageReceiver(left.expression) && (ts.isPropertyAccessExpression(left) ? left.name.text : literal(left.argumentExpression)) !== 'defaults')
            || privateMethod(ts.isPropertyAccessExpression(left) ? left.name.text : literal(left.argumentExpression)))) {
          diagnostic(sf, node, 'package/private method assignment is forbidden', chain);
        }
      } else if (ts.isPropertyAssignment(node) && ['files', 'include'].includes(node.name.getText(sf))) {
        for (const value of nodes(node.initializer, (part) => literal(part) !== undefined).map(literal)) {
          if (/(?:^|\/)(?:src|test\/support\/private|test\/internal|test\/invariants)(?:\/|$)/.test(value)
            || /(?:^|\/)dist\//.test(value) && !publicEntries.has(value)) {
            diagnostic(sf, node, `private compiler file-list input: ${value}`, chain);
          }
        }
      }
    }
  }

  // Explicit public inputs are also audited even when reached only through a
  // compiler file list or a generated consumer rather than a TS import.
  for (const file of [...entries, ...setup]) visitFile(path.resolve(root, file), ['public graph'], '', 'repo');
  for (const file of installedInputs) visitFile(file, ['finite installed consumer input'], '', 'installed');
  if (policy.declarationExamples && existsSync(path.join(root, 'dist'))) {
    for (const name of readdirSync(path.join(root, 'dist')).filter((name) => /\.d\.[cm]?ts$/.test(name))) {
      const file = path.join(root, 'dist', name);
      const declaration = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      for (const comment of nodes(declaration, (node) => !!node.jsDoc).flatMap((node) => node.jsDoc)) {
        const text = comment.getText(declaration).replace(/^\s*\* ?/gm, '');
        for (const match of text.matchAll(/```ts\n([\s\S]*?)```/g)) {
          auditModule(`${file}#example-${comment.pos}.ts`, match[1], [`dist/${name} public declaration example`], new Map(), 'installed');
        }
      }
    }
  }
  // Finite generated outputs, not unresolved import exceptions. Audit the exact
  // extracted module body and map just these three names into this consumer.
  for (const doc of policy.documents ?? []) {
    const file = path.resolve(root, doc.file);
    if (!existsSync(file)) {
      errors.push(`missing documented consumer input: ${doc.file}`);
      continue;
    }
    const markdown = readFileSync(file, 'utf8');
    const pattern = /(?:<!--\s*doc-example:\s*([\w-]+)\s*-->\s*)?```(?:ts|js)\n([\s\S]*?)```/g;
    for (const match of markdown.matchAll(pattern)) {
      if (doc.markedOnly && !match[1]) continue;
      auditModule(`${file}#block-${markdown.slice(0, match.index).split('\n').length}.ts`, match[2], [doc.file], new Map(), 'installed');
    }
  }
  for (const rule of [...(policy.reviews ?? []), ...(policy.negatives ?? []), ...(policy.negativeResolves ?? [])]) {
    if (!usedRules.has(rule)) errors.push(`stale/unmatched boundary review: ${rule.file}:${rule.line ?? rule.lines.join(',')} (${rule.kind ?? 'negative resolve'})`);
  }
  for (const producer of policy.installedSources ?? []) {
    if (!usedInstalledSources.has(producer)) errors.push(`stale installed consumer producer: ${producer.file}:${producer.line}`);
  }
  return { errors, files: [...visited].map(rel).sort(), modules: modules.size };
}

export async function checkTestLayers(root = packageRoot) {
  const discovery = await discoverLayers(root);
  const errors = checkLayerSets(discovery);
  const graph = auditContractGraph({ root, entries: discovery.selected.contracts, setup: discovery.setup, aliases: discovery.aliases });
  errors.push(...graph.errors);
  if (errors.length) throw new Error(`Test layer check failed (${errors.length}):\n${errors.join('\n')}`);
  return { counts: Object.fromEntries(layers.map((layer) => [layer, discovery.selected[layer].length])), discovery, graph };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: node scripts/check-test-layers.mjs');
    const result = await checkTestLayers();
    console.log(`Test layers: ${Object.entries(result.counts).map(([layer, count]) => `${layer}=${count}`).join(', ')}; exact default union; public graph ${result.graph.files.length} files / ${result.graph.modules} modules.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
