export default function assign<T extends object>(target: T, ...sources: unknown[]): T {
  return Object.assign(target, ...sources);
}
