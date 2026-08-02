import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

export function loadEnv(): void {
  const envFile = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

/**
 * Non-generic wrapper so ReturnType captures the same permissive client shape
 * createClient(url, key, opts) infers at a real call site (a generic
 * ReturnType<typeof createClient> resolves the function's default type params
 * instead, which are far stricter). Same trick as insert-to-db.ts.
 */
function createServiceClient(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false } });
}

export type SupabaseServiceClient = ReturnType<typeof createServiceClient>;

/** Service-role клиент (в обход RLS) для скриптов, читающих/пишущих в БД напрямую. */
export function getServiceClient(): SupabaseServiceClient {
  loadEnv();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      '\n❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n',
    );
    process.exit(1);
  }
  return createServiceClient(supabaseUrl, serviceRoleKey);
}
