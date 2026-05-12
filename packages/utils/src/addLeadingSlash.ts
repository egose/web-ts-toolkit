export default function addLeadingSlash(value: string): string {
  return value.startsWith('/') ? value : `/${value}`;
}
