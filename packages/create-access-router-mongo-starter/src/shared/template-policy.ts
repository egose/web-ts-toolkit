export const GITIGNORE_FILE = '.gitignore';
export const GITIGNORE_STAGING_ALIAS = '_gitignore';
export const GENERATED_LOCKFILE = 'pnpm-lock.yaml';

/**
 * Allowed dotenv example-file policy: the only dotenv file that may be
 * staged, packed, or scaffolded is a file whose basename is exactly
 * `.env.example` (at any depth). Every other file under a `.env` or
 * `.env.*` path segment is private and excluded at both boundaries.
 */
export const ALLOWED_DOTENV_EXAMPLE_BASENAME = '.env.example';

export interface TemplatePathPolicy {
  name: string;
  excludedPaths: readonly string[];
  gitignore: 'stage-as-alias' | 'restore-from-alias';
  lockfile: 'generate-and-ship' | 'preserve-shipped';
}

export const PUBLISH_TEMPLATE_POLICY: TemplatePathPolicy = {
  name: 'publish-template',
  excludedPaths: ['node_modules', 'dist', '.tmp', '.netlify', 'netlify', 'netlify.toml', 'api/functions'],
  gitignore: 'stage-as-alias',
  lockfile: 'generate-and-ship',
};

export const SCAFFOLD_TEMPLATE_POLICY: TemplatePathPolicy = {
  name: 'scaffold-template',
  excludedPaths: ['node_modules', 'dist', 'api/functions', 'netlify', '.netlify', '.tmp', '.env'],
  gitignore: 'restore-from-alias',
  lockfile: 'preserve-shipped',
};

export function normalizeTemplatePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/');
}

export function isPrivateDotenvPath(relativePath: string): boolean {
  const normalized = normalizeTemplatePath(relativePath);
  return normalized.split('/').some((segment) => {
    if (segment === ALLOWED_DOTENV_EXAMPLE_BASENAME) return false;
    return segment === '.env' || segment.startsWith('.env.');
  });
}

export function isTemplatePathExcluded(policy: TemplatePathPolicy, relativePath: string): boolean {
  if (isPrivateDotenvPath(relativePath)) return true;
  const normalized = normalizeTemplatePath(relativePath);
  return policy.excludedPaths.some((excluded) => normalized === excluded || normalized.startsWith(`${excluded}/`));
}
