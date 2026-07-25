export function normalizeApiBaseURL(value: string | undefined): string {
  const normalized = value?.trim().replace(/^\/+|\/+$/g, '');
  return normalized ? `/${normalized}` : '/api';
}
