export default function padEnd(value: unknown, length = 0, chars = ' ') {
  return String(value).padEnd(length, chars);
}
