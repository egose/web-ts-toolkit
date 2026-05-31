export default function parseBooleanString(str: string | undefined, defaultValue?: boolean): boolean | undefined {
  return str ? str === 'true' : defaultValue;
}
