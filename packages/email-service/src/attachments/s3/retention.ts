import { MANAGED_CLOUD_EXPIRATION_DAYS, managedCloudHold } from '../cloud-records';

export type S3RetentionMode = 'expiration-header' | 'bucket-policy';

function httpDate(value: string | null | undefined): number {
  if (typeof value !== 'string' || value.length !== 29) return NaN;
  const date = new Date(value);
  return date.toUTCString() === value ? date.getTime() : NaN;
}

export function s3RetainedThrough(
  anchor: string | null | undefined,
  header: string | null | undefined,
  ruleId: string,
  mode: S3RetentionMode,
): number | undefined {
  const created = httpDate(anchor);
  if (header === undefined) return mode === 'bucket-policy' ? managedCloudHold(created) : undefined;
  if (header === null || header.length > 160) return;
  const match = /^expiry-date="([^"]+)",[ \t]*rule-id="([a-z0-9]+)"$/.exec(header);
  if (match?.[2] !== ruleId) return;
  return managedCloudHold(created, httpDate(match[1]));
}

// Deliberately recognize only the small, supported S3 wire documents; a general XML parser (including
// the SDK's modeled result) can silently drop unmodeled or duplicate elements/attributes. No strings
// from commands are XML patterns or interpolated into a regex, and the wire buffer is bounded upstream.
const XML_DECLARATION = /^<\?xml\s+version=(?:"1\.0"|'1\.0')(?:\s+encoding=(?:"utf-8"|'utf-8'))?\s*\?>\s*/i;
const S3_NAMESPACE = String.raw`(?:\s+xmlns\s*=\s*(["'])http://s3\.amazonaws\.com/doc/2006-03-01/\1)?`;
function xmlRoot(document: string | undefined, tag: 'LifecycleConfiguration' | 'VersioningConfiguration') {
  const xml = document?.trim().replace(XML_DECLARATION, '');
  if (!xml) return;
  const root = new RegExp(`^<${tag}${S3_NAMESPACE}\\s*(?:/>|>([\\s\\S]*)</${tag}\\s*>)$`).exec(xml);
  if (root) return root[2] ?? '';
}

function elements(content: string | undefined, fields: readonly string[]): Record<string, string> | undefined {
  if (content === undefined) return;
  const result = Object.create(null) as Record<string, string>;
  const body = content.trim();
  let offset = 0;
  for (const match of body.matchAll(/<([A-Za-z]+)>([\s\S]*?)<\/\1>\s*/g)) {
    const [, name, text] = match;
    if (
      !name ||
      text === undefined ||
      offset !== match.index ||
      !fields.includes(name) ||
      Object.hasOwn(result, name)
    ) {
      return;
    }
    offset += match[0].length;
    result[name] = text;
  }
  if (offset === body.length && Object.keys(result).length === fields.length) return result;
}

export function hasExactS3Lifecycle(document: string | undefined, boundary: string, ruleId: string): boolean {
  const root = elements(xmlRoot(document, 'LifecycleConfiguration'), ['Rule']);
  const rule = elements(root?.Rule, ['ID', 'Filter', 'Status', 'Expiration']);
  const filter = elements(rule?.Filter, ['Prefix']);
  const expiration = elements(rule?.Expiration, ['Days']);
  return (
    rule?.ID === ruleId &&
    rule.Status === 'Enabled' &&
    filter?.Prefix === boundary &&
    expiration?.Days === String(MANAGED_CLOUD_EXPIRATION_DAYS)
  );
}

export function isNeverVersionedS3Bucket(document: string | undefined): boolean {
  return xmlRoot(document, 'VersioningConfiguration')?.trim() === '';
}
