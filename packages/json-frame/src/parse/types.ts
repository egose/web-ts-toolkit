import type { IndexKind, IndexLabel, JsonValue, ResolvedOrient, TableSchema } from '../types';

export interface ParsedFrame {
  readonly orient: ResolvedOrient;
  readonly columns: readonly string[];
  readonly index: readonly IndexLabel[];
  readonly indexKind: IndexKind;
  readonly data: ReadonlyMap<string, readonly JsonValue[]>;
  readonly tableSchema?: TableSchema;
  readonly tableIndexField?: string;
}
