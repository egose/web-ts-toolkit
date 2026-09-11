export function readRequiredOptionValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`Missing value for ${arg}`);
  }
  return value;
}

/**
 * Split a raw argv element into its option name and equals-form value.
 * `--auth-token=secret` yields `{ name: '--auth-token', value: 'secret' }`;
 * any other element yields `{ name: arg, value: undefined }`. Splitting on
 * the first `=` preserves values that themselves contain `=`.
 */
export function splitEqualsOption(arg: string): { name: string; value: string | undefined } {
  if (!arg.startsWith('-')) return { name: arg, value: undefined };
  const eq = arg.indexOf('=');
  if (eq < 0) return { name: arg, value: undefined };
  return { name: arg.slice(0, eq), value: arg.slice(eq + 1) };
}

/**
 * Resolve a value-taking option from either `--opt=value` or
 * `--opt <value>` form. Empty equals values are reported as missing so no
 * credential-bearing text is echoed. Returns the value and the number of
 * extra argv slots consumed (0 for equals-form, 1 for space-form).
 */
export function readOptionValue(
  argv: string[],
  index: number,
  name: string,
  equalsValue: string | undefined,
): { value: string; advance: number } {
  if (equalsValue !== undefined) {
    if (equalsValue.length === 0) throw new Error(`Missing value for ${name}`);
    return { value: equalsValue, advance: 0 };
  }
  return { value: readRequiredOptionValue(argv, index, name), advance: 1 };
}

/**
 * Build a value-free unknown-option diagnostic. Only the option name (before
 * any `=`) is reported so credential-bearing values never reach stdout/stderr.
 */
export function unknownOptionError(arg: string, help: string): Error {
  const { name } = splitEqualsOption(arg);
  const display = name.length > 0 ? name : arg;
  return new Error(`Unknown option: ${display}\n\n${help}`);
}
