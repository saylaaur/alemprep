import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type Actor = { id: string };

/** The authenticated actor always comes from Supabase Auth, never client input. */
export async function getActor(): Promise<Actor | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id };
}
