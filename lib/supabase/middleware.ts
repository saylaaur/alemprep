import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/subjects', '/full-practice', '/progress', '/settings', '/practice', '/admin'];

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
  const pathWithoutLocale = pathname.replace(/^\/(ru|kk)/, '') || '/';

  const isProtected = PROTECTED_PREFIXES.some((p) => pathWithoutLocale.startsWith(p));

  if (isProtected && !user) {
    const locale = pathname.match(/^\/(ru|kk)/)?.[1] ?? 'ru';
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    return NextResponse.redirect(url);
  }

  return response;
}
