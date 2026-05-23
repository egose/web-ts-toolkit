export default function removeConsecutiveSlashesFromUrl(url: string): string {
  return url.replace(/\/{2,}/g, '/');
}
