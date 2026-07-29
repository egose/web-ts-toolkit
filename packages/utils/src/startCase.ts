import { words } from './_internal';

export default function startCase(value: unknown): string {
  return words(value)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
