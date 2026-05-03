import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const VER_PLACEHOLDER = '0.0.0-PLACEHOLDER';
const PUBLISH_DIR = 'dist';
const PACKAGE_JSON = 'package.json';
const COPY_FILES = ['README.md'];
const DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const OMITTED_FIELDS = new Set(['additionalNames', 'devDependencies', 'files', 'packageManager', 'private', 'scripts']);

const args = parseArgs(process.argv.slice(2));
let { tag } = args;

if (!tag) {
  throw new Error('tag not supplied');
}

if (tag.startsWith('v')) {
  tag = tag.slice(1);
}

console.log(`target tag ${tag}`);

const npmTag = args.npmTag ?? inferNpmTag(tag);
if (npmTag) {
  console.log(`npm dist-tag ${npmTag}`);
}

const rootPackageJson = readJson(path.join(rootDir, PACKAGE_JSON));
const rootAuthor = rootPackageJson.author;
const rootBugs = rootPackageJson.bugs;
const rootEngines = rootPackageJson.engines;
const rootLicense = rootPackageJson.license;
const rootRepository = rootPackageJson.repository;
const rootLicensePath = path.join(rootDir, 'LICENSE');

const packageRoot = path.join(rootDir, 'packages');
const packageDirs = readdirSync(packageRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packageRoot, entry.name))
  .filter((dir) => existsSync(path.join(dir, PACKAGE_JSON)));

const packages = packageDirs.map((dir) => {
  const packageJsonPath = path.join(dir, PACKAGE_JSON);
  const packageJson = readJson(packageJsonPath);

  if (!packageJson.name) {
    throw new Error(`Package name missing in ${packageJsonPath}`);
  }

  return {
    dir,
    packageJson,
  };
});

const internalPackageNames = new Set(packages.map(({ packageJson }) => packageJson.name));
const orderedPackages = selectPackages(sortPackagesByInternalDependencies(packages, internalPackageNames), args);

if (orderedPackages.length === 0) {
  throw new Error('No packages matched the current selection');
}

for (const pkg of orderedPackages) {
  console.log(`processing ${pkg.dir}`);
  runCommand('pnpm', ['build'], pkg.dir);

  const publishDir = path.join(pkg.dir, PUBLISH_DIR);
  if (!existsSync(publishDir)) {
    throw new Error(`Missing publish directory: ${publishDir}`);
  }

  copyPublishFiles(pkg.dir, publishDir, rootLicensePath);

  const publishPackageData = createPublishPackageJson(pkg.packageJson, tag, internalPackageNames, {
    author: rootAuthor,
    bugs: rootBugs,
    engines: rootEngines,
    license: rootLicense,
    repository: mergeRepository(rootRepository, path.relative(rootDir, pkg.dir)),
  });
  const names = [publishPackageData.name, ...(Array.isArray(pkg.packageJson.additionalNames) ? pkg.packageJson.additionalNames : [])];
  const targetPackageJson = path.join(publishDir, PACKAGE_JSON);

  for (const name of names) {
    const packageJson = {
      ...publishPackageData,
      name,
    };

    writeJson(targetPackageJson, packageJson);

    const publishArgs = ['publish', '--access', 'public'];
    if (npmTag) {
      publishArgs.push('--tag', npmTag);
    }

    if (args.dryRun) {
      publishArgs.push('--dry-run');
    }

    runCommand('npm', publishArgs, publishDir);
  }
}

function parseArgs(rawArgs) {
  const parsed = { dryRun: false, filters: [], from: undefined, npmTag: undefined, tag: undefined };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];

    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }

    if (arg === '--tag') {
      parsed.tag = rawArgs[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--filter') {
      parsed.filters.push(...splitListArg(rawArgs[index + 1]));
      index += 1;
      continue;
    }

    if (arg === '--from') {
      parsed.from = rawArgs[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--npm-tag') {
      parsed.npmTag = rawArgs[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--tag=')) {
      parsed.tag = arg.slice('--tag='.length);
      continue;
    }

    if (arg.startsWith('--filter=')) {
      parsed.filters.push(...splitListArg(arg.slice('--filter='.length)));
      continue;
    }

    if (arg.startsWith('--from=')) {
      parsed.from = arg.slice('--from='.length);
      continue;
    }

    if (arg.startsWith('--npm-tag=')) {
      parsed.npmTag = arg.slice('--npm-tag='.length);
      continue;
    }
  }

  return parsed;
}

function splitListArg(value) {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function inferNpmTag(version) {
  if (typeof version !== 'string') {
    return undefined;
  }

  const prereleasePart = version.split('-')[1];
  if (!prereleasePart) {
    return undefined;
  }

  const [preid] = prereleasePart.split('.');
  return preid || undefined;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runCommand(command, args, cwd) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
  });
}

function copyPublishFiles(packageDir, publishDir, rootLicensePath) {
  mkdirSync(publishDir, { recursive: true });

  for (const fileName of COPY_FILES) {
    const sourcePath = path.join(packageDir, fileName);
    if (!existsSync(sourcePath)) {
      continue;
    }

    copyFileSync(sourcePath, path.join(publishDir, fileName));
  }

  copyFileSync(rootLicensePath, path.join(publishDir, 'LICENSE'));
}

function createPublishPackageJson(packageJson, version, internalPackageNames, rootMetadata) {
  const publishPackageJson = {};

  for (const [key, value] of Object.entries(packageJson)) {
    if (OMITTED_FIELDS.has(key)) {
      continue;
    }

    if (key === 'version') {
      publishPackageJson.version = rewriteVersionValue(value, version, internalPackageNames, '');
      continue;
    }

    if (DEPENDENCY_FIELDS.includes(key)) {
      publishPackageJson[key] = rewriteDependencyMap(value, version, internalPackageNames);
      continue;
    }

    if (key === 'main' || key === 'module' || key === 'types') {
      publishPackageJson[key] = rewriteDistPath(value);
      continue;
    }

    if (key === 'exports') {
      publishPackageJson.exports = rewriteExports(value);
      continue;
    }

    publishPackageJson[key] = value;
  }

  if (rootMetadata.author) {
    publishPackageJson.author = rootMetadata.author;
  }

  if (rootMetadata.bugs) {
    publishPackageJson.bugs = rootMetadata.bugs;
  }

  if (rootMetadata.engines) {
    publishPackageJson.engines = rootMetadata.engines;
  }

  if (rootMetadata.license) {
    publishPackageJson.license = rootMetadata.license;
  }

  if (rootMetadata.repository) {
    publishPackageJson.repository = rootMetadata.repository;
  }

  return publishPackageJson;
}

function mergeRepository(rootRepositoryValue, packageDirectory) {
  if (!rootRepositoryValue || typeof rootRepositoryValue !== 'object' || Array.isArray(rootRepositoryValue)) {
    return undefined;
  }

  if (!packageDirectory) {
    return rootRepositoryValue;
  }

  return {
    ...rootRepositoryValue,
    directory: packageDirectory,
  };
}

function rewriteDependencyMap(dependencies, version, internalPackageNames) {
  if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
    return dependencies;
  }

  const rewritten = {};

  for (const [name, range] of Object.entries(dependencies)) {
    rewritten[name] = rewriteVersionValue(range, version, internalPackageNames, name);
  }

  return rewritten;
}

function rewriteVersionValue(value, version, internalPackageNames, packageName) {
  if (typeof value !== 'string') {
    return value;
  }

  if (value === VER_PLACEHOLDER) {
    return version;
  }

  if (packageName && internalPackageNames.has(packageName) && value.startsWith('workspace:')) {
    const workspaceRange = value.slice('workspace:'.length);

    if (workspaceRange === '*' || workspaceRange === '') {
      return version;
    }

    if (workspaceRange === '^' || workspaceRange === '~') {
      return `${workspaceRange}${version}`;
    }

    return workspaceRange;
  }

  return value;
}

function rewriteDistPath(value) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(/^\.\/dist\//, './').replace(/^dist\//, './');
}

function rewriteExports(exportsField) {
  if (typeof exportsField === 'string') {
    return rewriteDistPath(exportsField);
  }

  if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
    return exportsField;
  }

  return Object.fromEntries(
    Object.entries(exportsField).map(([key, value]) => [key, rewriteExports(value)]),
  );
}

function sortPackagesByInternalDependencies(packages, internalPackageNames) {
  const packagesByName = new Map(packages.map((pkg) => [pkg.packageJson.name, pkg]));
  const visited = new Set();
  const visiting = new Set();
  const ordered = [];

  for (const pkg of packages) {
    visit(pkg);
  }

  return ordered;

  function visit(pkg) {
    const packageName = pkg.packageJson.name;
    if (visited.has(packageName)) {
      return;
    }

    if (visiting.has(packageName)) {
      throw new Error(`Circular internal dependency detected involving ${packageName}`);
    }

    visiting.add(packageName);

    for (const dependencyName of getInternalDependencies(pkg.packageJson, internalPackageNames)) {
      const dependencyPackage = packagesByName.get(dependencyName);
      if (dependencyPackage) {
        visit(dependencyPackage);
      }
    }

    visiting.delete(packageName);
    visited.add(packageName);
    ordered.push(pkg);
  }
}

function selectPackages(packages, args) {
  let selectedPackages = packages;

  if (args.filters.length > 0) {
    selectedPackages = packages.filter((pkg) => matchesAnySelector(pkg, args.filters));
  }

  if (args.from) {
    const startIndex = selectedPackages.findIndex((pkg) => matchesSelector(pkg, args.from));
    if (startIndex === -1) {
      throw new Error(`No package matched --from ${args.from}`);
    }

    selectedPackages = selectedPackages.slice(startIndex);
  }

  return selectedPackages;
}

function matchesAnySelector(pkg, selectors) {
  return selectors.some((selector) => matchesSelector(pkg, selector));
}

function matchesSelector(pkg, selector) {
  if (typeof selector !== 'string' || selector.length === 0) {
    return false;
  }

  const packageName = pkg.packageJson.name;
  const directoryName = path.basename(pkg.dir);

  return packageName === selector || directoryName === selector;
}

function getInternalDependencies(packageJson, internalPackageNames) {
  const dependencyNames = new Set();

  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = packageJson[field];
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
      continue;
    }

    for (const dependencyName of Object.keys(dependencies)) {
      if (internalPackageNames.has(dependencyName)) {
        dependencyNames.add(dependencyName);
      }
    }
  }

  return dependencyNames;
}
