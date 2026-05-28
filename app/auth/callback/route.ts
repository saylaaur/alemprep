import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_LOCALES = ['ru', 'kk'];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/ru/dashboard';

  const rawLocale = next.split('/')[1];
  const locale = VALID_LOCALES.includes(rawLocale) ? rawLocale : 'ru';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=auth`);
}
