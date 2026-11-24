import createIntlMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { isContentEnabled, isContentPath, isLocalMode, isLocalUnsupportedPath } from './lib/data-mode';
import { routing } from './i18n/routing';
import { updateSession } from './lib/supabase/middleware';

const intlMiddleware = createIntlMiddleware(routing);

export async function proxy(request: NextRequest) {
  // Сначала next-intl делает редирект на /ru или /kk если префикса нет
  const intlResponse = intlMiddleware(request);
  if (intlResponse.headers.get('location')) {
    return intlResponse;
  }

  // Без базы: входа нет, Supabase не трогаем. Разделы, которым нужна база, ведут на «Сегодня».
  if (isLocalMode()) {
    const { pathname } = request.nextUrl;
    if (isLocalUnsupportedPath(pathname)) {
      const locale = pathname.match(/^\/(ru|kk)(?=\/|$)/)?.[1] ?? 'ru';
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/dashboard`;
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }

  if (isContentPath(request.nextUrl.pathname) && !isContentEnabled()) {
    const target = request.nextUrl.clone();
    target.pathname = `/${target.pathname.split('/')[1]}/dashboard`;
    target.search = '';
    return NextResponse.redirect(target);
  }

  // Дальше Supabase обновляет сессию и проверяет защищённые маршруты
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|auth|.*\\..*).*)'],
};
