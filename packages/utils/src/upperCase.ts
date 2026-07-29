import { words } from './_internal';

export default function upperCase(value: unknown): string {
  return words(value).join(' ').toUpperCase();
}
