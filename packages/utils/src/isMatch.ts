import { partialMatch } from './_internal';

export default function isMatch(object: unknown, source: unknown) {
  return partialMatch(object, source);
}
