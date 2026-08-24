import { JsonFrameValidationError } from './errors';
import type { JsonObject, JsonValue, ResolvedOrient } from './types';

/**
 * Maximum supported nesting for JSON arrays/objects traversed by the package.
 * The parsed root is depth 0; an array/object at depth 1000 is accepted, while
 * an array/object at depth 1001 fails with `JsonFrameValidationError`.
 */
export const JSON_FRAME_MAX_DEPTH = 1000;

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

type PathNode =
  | { readonly parent?: undefined; readonly type: 'root'; readonly path: string }
  | { readonly parent: PathNode; readonly type: 'property'; readonly key: string }
  | { readonly parent: PathNode; readonly type: 'index'; readonly index: number };

type ContainerFrame =
  | {
      readonly kind: 'array';
      readonly source: readonly unknown[];
      readonly target: JsonValue[];
      readonly path: PathNode;
      readonly depth: number;
      index: number;
    }
  | {
      readonly kind: 'object';
      readonly source: Record<string, unknown>;
      readonly target: Record<string, JsonValue>;
      readonly keys: readonly string[];
      readonly path: PathNode;
      readonly depth: number;
      index: number;
    };

const rootPath = (path: string): PathNode => ({ type: 'root', path });

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const pathToString = (path: PathNode): string => {
  const segments: PathNode[] = [];
  let current: PathNode | undefined = path;
  while (current !== undefined && current.type !== 'root') {
    segments.push(current);
    current = current.parent;
  }

  let formatted = current?.type === 'root' ? current.path : '$';
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]!;
    if (segment.type === 'index') {
      formatted += `[${segment.index}]`;
    } else if (segment.type === 'property') {
      formatted += IDENTIFIER_PATTERN.test(segment.key) ? `.${segment.key}` : `[${JSON.stringify(segment.key)}]`;
    }
  }

  return formatted;
};

const childIndexPath = (parent: PathNode, index: number): PathNode => ({ parent, type: 'index', index });

const childPropertyPath = (parent: PathNode, key: string): PathNode => ({ parent, type: 'property', key });

const throwValidation = (
  message: string,
  path: PathNode,
  value: unknown,
  orient: ResolvedOrient | undefined,
): never => {
  throw new JsonFrameValidationError(message, {
    ...(orient === undefined ? {} : { orient }),
    path: pathToString(path),
    value,
  });
};

const cloneScalar = (value: unknown, path: PathNode, orient: ResolvedOrient | undefined): JsonValue | undefined => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throwValidation('Numbers must be finite JSON values.', path, value, orient);
    }

    return value;
  }

  if (
    typeof value === 'undefined' ||
    typeof value === 'function' ||
    typeof value === 'symbol' ||
    typeof value === 'bigint'
  ) {
    throwValidation('Input must contain only JSON-compatible values.', path, value, orient);
  }

  return undefined;
};

const createFrame = (
  source: unknown,
  path: PathNode,
  depth: number,
  ancestors: Set<object>,
  orient: ResolvedOrient | undefined,
): { readonly value: JsonValue; readonly frame?: ContainerFrame } => {
  const scalar = cloneScalar(source, path, orient);
  if (scalar !== undefined) {
    return { value: scalar };
  }

  if (depth > JSON_FRAME_MAX_DEPTH) {
    throwValidation(
      `JSON input exceeds the maximum supported nesting depth of ${JSON_FRAME_MAX_DEPTH}.`,
      path,
      source,
      orient,
    );
  }

  if (Array.isArray(source)) {
    if (ancestors.has(source)) {
      throwValidation('Input contains a cyclic array.', path, source, orient);
    }

    const target: JsonValue[] = [];
    ancestors.add(source);
    return { value: target, frame: { kind: 'array', source, target, path, depth, index: 0 } };
  }

  if (!isPlainObject(source)) {
    throwValidation('Input objects must be plain JSON objects or arrays.', path, source, orient);
  }

  const objectSource = source as Record<string, unknown>;
  if (ancestors.has(objectSource)) {
    throwValidation('Input contains a cyclic object.', path, objectSource, orient);
  }

  const target = Object.create(null) as Record<string, JsonValue>;
  ancestors.add(objectSource);
  return {
    value: target as JsonObject,
    frame: { kind: 'object', source: objectSource, target, keys: Object.keys(objectSource), path, depth, index: 0 },
  };
};

export const cloneJsonCompatible = (value: unknown, orient?: ResolvedOrient, path = '$'): JsonValue => {
  const ancestors = new Set<object>();
  const root = createFrame(value, rootPath(path), 0, ancestors, orient);
  const stack = root.frame === undefined ? [] : [root.frame];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!;

    if (frame.kind === 'array') {
      if (frame.index >= frame.source.length) {
        ancestors.delete(frame.source);
        stack.pop();
        continue;
      }

      const index = frame.index;
      frame.index += 1;
      const childPath = childIndexPath(frame.path, index);
      if (!(index in frame.source)) {
        throwValidation('Sparse arrays are not valid JSON input.', childPath, frame.source, orient);
      }

      const child = createFrame(frame.source[index], childPath, frame.depth + 1, ancestors, orient);
      frame.target.push(child.value);
      if (child.frame !== undefined) {
        stack.push(child.frame);
      }
      continue;
    }

    if (frame.index >= frame.keys.length) {
      ancestors.delete(frame.source);
      stack.pop();
      continue;
    }

    const key = frame.keys[frame.index]!;
    frame.index += 1;
    const childPath = childPropertyPath(frame.path, key);
    const child = createFrame(frame.source[key], childPath, frame.depth + 1, ancestors, orient);
    frame.target[key] = child.value;
    if (child.frame !== undefined) {
      stack.push(child.frame);
    }
  }

  return root.value;
};
