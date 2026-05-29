export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const normalizeOptionalId = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const displayNameFromEmail = (email: string) => {
  const [local = 'Member'] = email.split('@');
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
};

export const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
