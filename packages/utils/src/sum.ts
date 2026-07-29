export default function sum(values: number[] | null | undefined): number {
  if (!Array.isArray(values)) {
    return 0;
  }

  let result = 0;
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (value !== undefined) {
      result += value;
    }
  }

  return result;
}
