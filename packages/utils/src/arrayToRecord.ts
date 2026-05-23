export default function arrayToRecord(arr: string[]): Record<string, true> {
  const obj: Record<string, true> = {};

  for (let x = 0; x < arr.length; x++) {
    obj[arr[x]] = true;
  }

  return obj;
}
