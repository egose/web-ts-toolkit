// Internal policy for recursive preparation. Roots start at depth 0; containers,
// leaves, array slots (including holes) and repeated DAG occurrences all count.
// Capping expanded work makes subsequent recursive clone/freeze passes bounded.
export const MAX_INPUT_DEPTH = 64;
export const MAX_INPUT_NODES = 10_000;

type Input<Context> = { value: unknown; path: string; context?: Context };
type Failure = 'depth' | 'nodes' | 'cycle';

function* children<Context>(value: object, path: string, context?: Context): Generator<Input<Context>> {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield { value: value[i], path: `${path}[${i}]`, context };
  } else {
    // Read incrementally, without materializing an unbounded list of values or
    // placing all siblings on the stack before the visit budget can reject.
    for (const key in value) {
      if (Object.hasOwn(value, key))
        yield { value: (value as Record<string, unknown>)[key], path: `${path}.${key}`, context };
    }
  }
}

export function validateBoundedInputs<Context = undefined>(
  inputs: Input<Context>[],
  isContainer: (value: unknown, context?: Context) => boolean,
  reject: (failure: Failure, path: string) => never,
  childContext?: (value: unknown, context?: Context) => Context,
): void {
  const ancestors = new WeakSet<object>();
  const stack: Array<{ values: Iterator<Input<Context>>; depth: number; container?: object }> = [
    { values: inputs[Symbol.iterator](), depth: 0 },
  ];
  let nodes = 0;
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    const next = frame.values.next();
    if (next.done) {
      if (frame.container) ancestors.delete(frame.container);
      stack.pop();
      continue;
    }
    const { value, path, context } = next.value;
    if (++nodes > MAX_INPUT_NODES) reject('nodes', path);
    if (frame.depth > MAX_INPUT_DEPTH) reject('depth', path);
    if (!isContainer(value, context)) continue;
    const container = value as object;
    if (ancestors.has(container)) reject('cycle', path);
    ancestors.add(container);
    stack.push({
      values: children(container, path, childContext ? childContext(value, context) : context),
      depth: frame.depth + 1,
      container,
    });
  }
}
