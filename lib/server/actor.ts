import 'server-only';

import { isLocalMode } from '@/lib/data-mode';
import { LOCAL_USER_ID } from '@/lib/local/state';
import { createClient } from '@/lib/supabase/server';

export type Actor = { id: string };

/** The authenticated actor always comes from Supabase Auth, never client input. */
export async function getActor(): Promise<Actor | null> {
  // Без базы входа нет: единственный «пользователь» — этот браузер.
  if (isLocalMode()) return { id: LOCAL_USER_ID };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id };
}
