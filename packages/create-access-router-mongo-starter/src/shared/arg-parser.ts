export function readRequiredOptionValue(argv: string[], index: number, arg: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`Missing value for ${arg}`);
  }
  return value;
}
