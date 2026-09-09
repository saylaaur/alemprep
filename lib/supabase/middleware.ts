import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/subjects', '/full-practice', '/progress', '/settings', '/practice', '/admin', '/onboarding', '/diagnostic', '/weekly'];

export function isProtectedPath(pathname: string): boolean {
  const pathWithoutLocale = pathname.replace(/^\/(ru|kk)/, '') || '/';
  return PROTECTED_PREFIXES.some((prefix) => pathWithoutLocale.startsWith(prefix));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Парсим путь без locale префикса
  const pathname = request.nextUrl.pathname;
  const isProtected = isProtectedPath(pathname);

  if (isProtected && !user) {
    const locale = pathname.match(/^\/(ru|kk)/)?.[1] ?? 'ru';
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    return NextResponse.redirect(url);
  }

  if (isProtected) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.append('Vary', 'Cookie');
  }

  return response;
}
