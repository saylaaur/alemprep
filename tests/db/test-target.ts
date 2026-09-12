/** The hosted student database is never a fixture for automated tests. */
export const PRODUCTION_SUPABASE_PROJECT_REF = 'euypaocjzcqlapfilrak';

export type DbTestTargetEnv = {
  APP_ENV?: string;
  ALEMPREP_TEST_STAGING_REF?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

function readUrl(value: string | undefined): URL {
  if (!value?.trim()) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required for DB tests');
  }

  try {
    return new URL(value);
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL for DB tests');
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isProjectRef(value: string): boolean {
  return /^[a-z0-9]{3,64}$/.test(value);
}

/**
 * Fails closed before a DB harness constructs a client or performs a request.
 * Local is the default. A hosted staging project needs both an explicit
 * environment and an exact project-ref allowlist.
 */
export function assertSafeDbTestTarget(env: DbTestTargetEnv): URL {
  const url = readUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const projectRef = url.hostname.endsWith('.supabase.co')
    ? url.hostname.slice(0, -'.supabase.co'.length)
    : null;

  if (projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('production Supabase project is never a test target');
  }

  if (env.APP_ENV === 'local') {
    if (url.protocol !== 'http:' || !isLoopback(url.hostname)) {
      throw new Error('local DB tests require a loopback Supabase URL over http');
    }
    return url;
  }

  if (env.APP_ENV === 'staging') {
    const allowlistedRef = env.ALEMPREP_TEST_STAGING_REF?.trim();
    if (!allowlistedRef || !isProjectRef(allowlistedRef)) {
      throw new Error('staging DB tests require a valid ALEMPREP_TEST_STAGING_REF');
    }
    if (allowlistedRef === PRODUCTION_SUPABASE_PROJECT_REF) {
      throw new Error('production Supabase project is never a test target');
    }
    if (url.protocol !== 'https:' || projectRef !== allowlistedRef) {
      throw new Error('staging DB tests require the exact allowlisted Supabase project');
    }
    return url;
  }

  throw new Error('DB tests require APP_ENV=local or APP_ENV=staging');
}
