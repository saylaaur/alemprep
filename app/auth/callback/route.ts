import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { resolveAuthRedirect } from '@/lib/auth-redirect';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const fallback = resolveAuthRedirect(searchParams.get('next'));
  const saved = (await cookies()).get('alemprep_auth_next')?.value;
  let target = fallback;
  if (saved) {
    try {
      const decoded = decodeURIComponent(saved);
      const resolved = resolveAuthRedirect(decoded);
      if (resolved.next === decoded) target = resolved;
    } catch { /* A malformed cookie must never break authentication. */ }
  }
  const { next, locale } = target;
  const finish = (destination: URL) => {
    const response = NextResponse.redirect(destination);
    response.cookies.set('alemprep_auth_next', '', { path: '/', maxAge: 0 });
    return response;
  };

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return finish(new URL(next, origin));
    }
  }

  const login = new URL(`/${locale}/login`, origin);
  login.searchParams.set('error', 'auth');
  if (next !== `/${locale}/dashboard`) login.searchParams.set('next', next);
  return finish(login);
}
