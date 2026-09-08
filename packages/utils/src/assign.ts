/**
 * Thin wrapper over native `Object.assign`: copies own enumerable
 * string/symbol properties from each source onto `target` and returns
 * `target`. Source getters and target setters run as normal JavaScript
 * semantics dictate. This is a plain copy helper, not a hardened
 * untrusted-input sanitizer.
 */
export default function assign<T extends object>(target: T, ...sources: unknown[]): T {
  return Object.assign(target, ...sources);
}
