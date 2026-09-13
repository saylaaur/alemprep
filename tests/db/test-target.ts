/** The hosted student database is never a fixture for automated tests. */
export const PRODUCTION_SUPABASE_PROJECT_REF = 'euypaocjzcqlapfilrak';

export type DbTestTargetEnv = {
  APP_ENV?: string;
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

/**
 * Fails closed before a DB harness constructs a client or performs a request.
 * This harness supports only a local loopback database. A hosted staging
 * harness needs separate credentials, retention controls, and review.
 */
export function assertSafeDbTestTarget(env: DbTestTargetEnv): URL {
  const url = readUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const projectRef = url.hostname.endsWith('.supabase.co')
    ? url.hostname.slice(0, -'.supabase.co'.length)
    : null;

  if (projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('production Supabase project is never a test target');
  }

  if (env.APP_ENV !== 'local') {
    throw new Error('DB tests require APP_ENV=local');
  }

  if (url.protocol !== 'http:' || !isLoopback(url.hostname)) {
    throw new Error('local DB tests require a loopback Supabase URL over http');
  }
  return url;
}

/** Local SQL is allowed only over the same loopback boundary as REST tests. */
export function assertSafeDbConnectionString(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('local SQL helpers require a valid PostgreSQL URL');
  }
  if ((url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') || !isLoopback(url.hostname)) {
    throw new Error('local SQL helpers require a loopback PostgreSQL URL');
  }
  return url;
}
