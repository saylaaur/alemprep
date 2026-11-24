/**
 * Режим данных. `local` — сайт работает без Supabase и без входа: данные ученика
 * лежат в браузере (cookie), каталог и книги берутся из файлов репозитория.
 * `supabase` (по умолчанию) — боевой режим.
 *
 * Переменная публичная (NEXT_PUBLIC_), чтобы её видели и сервер, и клиентские
 * компоненты (меню прячет разделы, которым нужна база).
 */
export type DataMode = 'local' | 'supabase';

export function getDataMode(): DataMode {
  return process.env.NEXT_PUBLIC_DATA_MODE === 'local' ? 'local' : 'supabase';
}

export function isContentEnabled(topicsOnly = process.env.PILOT_TOPICS_ONLY === 'true'): boolean {
  return isLocalMode() || (!topicsOnly && process.env.NEXT_PUBLIC_CONTENT_V1_ENABLED === 'true');
}

const CONTENT_ROUTE = /^\/(?:ru|kk)\/(?:library|videos|problems|review)(?:\/|$)/;

export function isContentPath(pathname: string): boolean {
  return CONTENT_ROUTE.test(pathname);
}

export function isLocalMode(): boolean {
  return getDataMode() === 'local';
}

/**
 * Разделы, которые без базы работать не могут (тренажёр на вопросах из Supabase,
 * пробник, кабинет учителя…). В локальном режиме их адреса ведут на «Сегодня».
 */
const LOCAL_UNSUPPORTED_PREFIXES = [
  '/subjects',
  '/practice',
  '/onboarding',
  '/teacher',
  '/join',
  '/admin',
] as const;

export function isLocalUnsupportedPath(pathname: string): boolean {
  const path = pathname.replace(/^\/(ru|kk)(?=\/|$)/, '') || '/';
  return LOCAL_UNSUPPORTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}-`));
}
