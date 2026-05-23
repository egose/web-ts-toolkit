import addLeadingSlash from './addLeadingSlash';
import removeConsecutiveSlashesFromUrl from './removeConsecutiveSlashesFromUrl';

export default function normalizeUrlPath(url: string): string {
  return addLeadingSlash(removeConsecutiveSlashesFromUrl(url));
}
