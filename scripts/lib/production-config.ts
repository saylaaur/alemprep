export const REQUIRED_PRODUCTION_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SITE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
] as const;

type RequiredProductionEnv = (typeof REQUIRED_PRODUCTION_ENV)[number];
type ProductionEnv = Partial<Record<RequiredProductionEnv, string | undefined>>;

function readHttpsUrl(name: string, value: string | undefined, errors: string[]): URL | null {
  if (!value?.trim()) {
    errors.push(`${name} is missing`);
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') errors.push(`${name} must use https`);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      errors.push(`${name} must not point to a local host`);
    }
    return url;
  } catch {
    errors.push(`${name} must be a valid URL`);
    return null;
  }
}

/** Checks deployment variables without printing any secret values. */
export function validateProductionConfig(env: ProductionEnv): string[] {
  const errors: string[] = [];
  for (const name of REQUIRED_PRODUCTION_ENV) {
    if (!env[name]?.trim()) errors.push(`${name} is missing`);
  }

  const supabaseUrl = readHttpsUrl('NEXT_PUBLIC_SUPABASE_URL', env.NEXT_PUBLIC_SUPABASE_URL, errors);
  const siteUrl = readHttpsUrl('NEXT_PUBLIC_SITE_URL', env.NEXT_PUBLIC_SITE_URL, errors);
  if (supabaseUrl && !supabaseUrl.hostname.endsWith('.supabase.co')) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL must use a Supabase project host');
  }
  if (siteUrl && siteUrl.pathname !== '/' && siteUrl.pathname !== '') {
    errors.push('NEXT_PUBLIC_SITE_URL must be an origin without a path');
  }

  return [...new Set(errors)];
}
