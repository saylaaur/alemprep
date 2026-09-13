import 'server-only';

type ServerConfigEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type SupabaseAdminConfig = { url: string; serviceRoleKey: string };

/** Validates server configuration locally; it never sends or logs a secret. */
export function getSupabaseAdminConfig(env: ServerConfigEnv = process.env as ServerConfigEnv): SupabaseAdminConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    throw new Error('missing Supabase server configuration');
  }

  try {
    new URL(url);
  } catch {
    throw new Error('invalid Supabase server configuration');
  }

  return { url, serviceRoleKey };
}
