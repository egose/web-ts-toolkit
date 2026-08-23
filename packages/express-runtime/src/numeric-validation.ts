export const MAX_INTEGER_OPTION_VALUE = Number.MAX_SAFE_INTEGER;

export interface FiniteIntegerValidationOptions {
  name: string;
  min?: number;
  max?: number;
}

export function validateFiniteInteger(value: unknown, options: FiniteIntegerValidationOptions): number {
  const min = options.min ?? Number.MIN_SAFE_INTEGER;
  const max = options.max ?? MAX_INTEGER_OPTION_VALUE;
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Invalid ${options.name}: ${String(value)}. Must be a finite integer in ${min}..${max}.`);
  }
  return value;
}

export function parsePortValue(value: number | string, name: string): number | string {
  if (typeof value === 'number') {
    return validateFiniteInteger(value, { name, min: 0, max: 65535 });
  }
  if (value.trim() === '') {
    throw new Error(
      `Invalid ${name}: ${JSON.stringify(value)}. Must be a port number in 0..65535 or a named pipe path.`,
    );
  }
  if (value.trim() !== value) {
    throw new Error(
      `Invalid ${name}: ${JSON.stringify(value)}. Numeric ports must not contain surrounding whitespace.`,
    );
  }
  if (/^(0|[1-9]\d*)$/.test(value)) {
    return validateFiniteInteger(Number(value), { name, min: 0, max: 65535 });
  }
  if (/^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(value) || /^[+-]?(?:infinity|nan)$/i.test(value)) {
    throw new Error(`Invalid ${name}: ${value}. Numeric ports must be canonical decimal integers in 0..65535.`);
  }
  return value;
}
