import 'server-only';

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { getSupabaseAdminConfig } from '@/lib/server/config';

/** Service-role client. Keep imports of this module inside server-only code. */
export function createAdminClient() {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  return createSupabaseAdminClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
