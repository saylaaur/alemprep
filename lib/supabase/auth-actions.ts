'use server';

import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
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
  const target = resolveAuthRedirect(redirectTo);
  // Supabase matches the complete redirect URL. Preserve variable destinations
  // in a short-lived same-origin cookie, keeping the allowlisted URL fixed.
  const cookieStore = await cookies();
  cookieStore.set('alemprep_auth_next', encodeURIComponent(target.next), {
    httpOnly: true, sameSite: 'lax', secure: new URL(origin).protocol === 'https:',
    path: '/', maxAge: 600,
  });
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callback.toString(),
      // Shared school devices: never silently reuse the previous pupil's Google account.
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error || !data.url) {
    cookieStore.set('alemprep_auth_next', '', { path: '/', maxAge: 0 });
    const login = new URL(`/${target.locale}/login`, origin);
    login.searchParams.set('error', 'auth');
    login.searchParams.set('next', target.next);
    redirect(login.toString());
  }
  if (data.url) redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
