'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveOAuthOrigin } from '@/lib/auth-origin';
import { resolveAuthRedirect } from '@/lib/auth-redirect';
import { createClient } from './server';

export async function signInWithGoogle(redirectTo: string) {
  const origin = resolveOAuthOrigin((await headers()).get('origin'), {
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
    vercelEnv: process.env.VERCEL_ENV,
    vercelUrl: process.env.VERCEL_URL,
    vercelBranchUrl: process.env.VERCEL_BRANCH_URL,
  });
  const callback = new URL('/auth/callback', origin);
  callback.searchParams.set('next', resolveAuthRedirect(redirectTo).next);
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callback.toString(),
      // Shared school devices: never silently reuse the previous pupil's Google account.
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error) throw error;
  if (data.url) redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
