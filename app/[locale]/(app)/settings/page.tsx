import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PageHeader } from '@/components/layout/PageHeader';
import { SettingsView } from '@/components/settings/SettingsView';
import { TelegramCard } from '@/components/settings/TelegramCard';
import { telegramConfigured } from '@/lib/telegram/bot';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/queries';
import { EXAM_SECOND_SUBJECTS } from '@/lib/exam';
import { isLocalMode } from '@/lib/data-mode';
import { MIN_TARGET_SCORE } from '@/lib/settings';
import type { Locale } from '@/types/db';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('settings');
  // Без базы: ни аккаунта, ни Telegram — только настройки из cookie браузера.
  const local = isLocalMode();
  const supabase = local ? null : await createClient();
  const [user, profile] = await Promise.all([
    supabase ? supabase.auth.getUser().then((r) => r.data.user) : Promise.resolve(null),
    getProfile(),
  ]);

  const email = user?.email ?? null;
  const showTelegram = !local && telegramConfigured();
  const telegramLinked =
    supabase && showTelegram && user
      ? Boolean((await supabase.from('telegram_links').select('user_id').eq('user_id', user.id).maybeSingle()).data)
      : false;
  const name = profile?.full_name?.trim() || email || t('defaultName');

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <SettingsView
        locale={locale as Locale}
        displayName={name}
        email={email}
        avatarUrl={profile?.avatar_url ?? null}
        dailyGoal={profile?.daily_goal ?? 20}
        secondSubject={profile?.second_subject ?? EXAM_SECOND_SUBJECTS[0]}
        examDate={profile?.exam_date ?? null}
        targetScore={profile?.target_score ?? MIN_TARGET_SCORE}
      />
      {showTelegram && (
        <div className="mx-auto max-w-3xl px-4 pb-8 sm:px-6 lg:px-8">
          <TelegramCard
            linked={telegramLinked}
            labels={{
              title: t('telegramTitle'),
              text: t('telegramText'),
              connect: t('telegramConnect'),
              open: t('telegramOpen'),
              openHint: t('telegramOpenHint'),
              linked: t('telegramLinked'),
              disconnect: t('telegramDisconnect'),
              error: t('telegramError'),
            }}
          />
        </div>
      )}
    </>
  );
}
