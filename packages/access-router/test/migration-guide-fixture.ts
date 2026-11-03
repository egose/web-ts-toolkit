/** Shared extraction/schema for the actual SHIPPED guide, never rewritten target code. */
export type MigrationBlock = { kind: 'partial' | 'complete-runtime' | 'expected-error'; source: string };

export const retiredAuthorizationControls = [
  'unsafeSkipListDocumentSnapshotChecks',
  'unsafeSkipReadDocumentSnapshotChecks',
  'unsafeSkipListOutputSnapshotChecks',
  'unsafeSkipReadOutputSnapshotChecks',
  'unsafeSkipListNestedDocumentSnapshotChecks',
  'unsafeSkipReadNestedDocumentSnapshotChecks',
  'unsafeSkipListInitialOutputSnapshotCopy',
  'unsafeSkipReadInitialOutputSnapshotCopy',
  'unsafeUseListAuthorizationFastPath',
  'unsafeUseReadAuthorizationFastPath',
] as const;

export function extractMigrationBlocks(markdown: string): MigrationBlock[] {
  for (const section of ['M1.', 'M2.', 'M3.', 'M4.', 'M5.']) {
    if (!markdown.includes(`## ${section}`)) throw new Error(`Missing migration contract ${section}`);
  }
  for (const key of retiredAuthorizationControls) {
    if (!markdown.includes(`\`${key}\``)) throw new Error(`Missing retired-control inventory: ${key}`);
  }
  const blocks: MigrationBlock[] = [];
  const pattern = /(?:<!--\s*doc-example:\s*(partial|complete-runtime|expected-error)\s*-->\s*)?```ts\n([\s\S]*?)```/g;
  for (const match of markdown.matchAll(pattern)) {
    const kind = match[1];
    if (kind !== 'partial' && kind !== 'complete-runtime' && kind !== 'expected-error')
      throw new Error('Every migration TypeScript block needs an explicit executable/negative classification');
    const source = match[2];
    if (/@ts-(?:ignore|expect-error)|\bas\s+(?:any|unknown)\b/.test(source))
      throw new Error('Migration examples must not suppress errors or cast around the public contract');
    if (/['"]@web-ts-toolkit\/access-router\/(?:src|dist)\//.test(source))
      throw new Error('Migration examples must use public package imports');
    blocks.push({ kind, source });
  }
  if (blocks.filter((block) => block.kind === 'complete-runtime').length !== 1)
    throw new Error('The complete owned-authorization workflow must execute exactly once per module condition');
  if (blocks.filter((block) => block.kind === 'expected-error').length !== 1)
    throw new Error('The exact historical source must be a separate expected-error fixture');
  if (blocks.filter((block) => block.kind === 'partial').length < 4)
    throw new Error('Missing typed facts, write, scoped helper or modes target example');
  for (const name of ['rawBefore', 'rawMany', 'presentationSubset', 'currentList'])
    if (
      !blocks.some(
        (block) =>
          block.kind === 'partial' &&
          block.source.includes(`export ${name === 'presentationSubset' ? '' : 'async '}function ${name}(`),
      )
    )
      throw new Error(`Missing executable collection alternative: ${name}`);
  return blocks;
}

/** Un-suppressed negative collection statements must each fail in consumer source only. */
export function assertCollectionDiagnostics(source: string, filename: string, output: string): void {
  const diagnostics = [...output.matchAll(/^([^\n(]+)\((\d+),\d+\): error TS\d+:/gm)];
  if (!diagnostics.length || diagnostics.some((match) => match[1] !== filename))
    throw new Error(`Expected only collection consumer errors in ${filename}:\n${output}`);
  const lines = new Set(diagnostics.map((match) => Number(match[2])));
  const sourceLines = source.split('\n');
  const markers = sourceLines.flatMap((line, index) => (line === '// reject-next' ? [index] : []));
  for (const [position, index] of markers.entries()) {
    const end = markers[position + 1] ?? sourceLines.length;
    // Prettier may wrap an excess-property diagnostic onto a later line of the SAME statement.
    if (![...lines].some((line) => line >= index + 2 && line <= end))
      throw new Error(`Missing collection rejection ${filename}:${index + 2}:\n${output}`);
  }
}

/** Each intentionally invalid source statement must actually receive a compiler diagnostic. */
export function assertMigrationDiagnostics(source: string, filename: string, output: string): void {
  const diagnostics = [...output.matchAll(/^([^\n(]+)\((\d+),\d+\): error TS\d+:/gm)];
  if (!diagnostics.length || diagnostics.some((match) => match[1] !== filename))
    throw new Error(`Expected only consumer-source errors in ${filename}:\n${output}`);
  const lines = new Set(diagnostics.map((match) => Number(match[2])));
  for (const [index, line] of source.split('\n').entries()) {
    if (
      /^const \w+:|^context\.|^req\.macl\.|^import type \{.*\bDocumentAuthorization\b|^\s*DocumentAuthorization[,}]/.test(
        line,
      ) &&
      !lines.has(index + 1)
    )
      throw new Error(`Missing rejection of ${filename}:${index + 1}: ${line}\n${output}`);
  }
}
