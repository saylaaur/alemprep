# AlemPrep

Подготовка к ЕНТ. Math · Physics · Informatics.

## Быстрый старт

Двойной клик по `start.command` — установит зависимости и запустит dev-сервер на `http://localhost:3000`.

Если двойной клик не работает (macOS ругается на безопасность):

```bash
cd "/Users/macbook/Documents/Claude/Projects/UNT platform/alemprep"
chmod +x start.command
./start.command
```

или вручную:

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

## Supabase

Авторизация заработает только после настройки Supabase:

1. Создай проект на [supabase.com](https://supabase.com)
2. Settings → API → скопируй `Project URL` и `anon public`
3. Вставь в `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Authentication → Providers → Google → включи и добавь redirect URL: `http://localhost:3000/auth/callback`

## Структура

```
app/[locale]/(app)/   — основное приложение под Sidebar
  dashboard/          — главная после логина
  subjects/           — список предметов
  full-practice/      — полный пробник (Шаг 5)
  progress/           — статистика (Шаг 5)
  settings/

app/[locale]/         — публичные страницы (landing, login)
app/auth/callback/    — OAuth-redirect Supabase

components/layout/    — Sidebar, AppShell, PageHeader
components/ui/        — shadcn-стиль (Button, Card)

lib/supabase/         — SSR-клиенты + auth-actions
i18n/                 — next-intl (ru/kk)
messages/             — словари
```

## Roadmap

- [x] **Шаг 1** — каркас, i18n, Sidebar, auth-shell
- [ ] **Шаг 2** — схема БД, миграции Supabase, сидинг первых задач
- [ ] **Шаг 3** — тренажёр single-choice + Deep-Work шорткаты
- [ ] **Шаг 4** — multi-select, matching, контекстные блоки
- [ ] **Шаг 5** — Dashboard со статистикой, режим полного пробника

## Миграция шкалы баллов (fix/exam-format)

Блюпринты `EXAM_BLUEPRINT`, `DIAGNOSTIC_BLUEPRINT` (`lib/exam.ts`) и
`WEEKLY_BLUEPRINT` (`lib/weekly.ts`) приведены к официальному формату
ЕНТ-2026 (40 заданий / 50 баллов на профильный предмет, диагностика и
еженедельный тест — та же пропорция 6:1:1 в масштабе 8 заданий / 10 баллов).
Это меняет шкалу баллов у уже сохранённых сессий — старые диагностики и
еженедельные тесты записаны в другой шкале, и график траектории на
`/progress` смешает несравнимые баллы. Реальных пользователей ещё нет,
поэтому перед следующим деплоем нужно очистить тестовые сессии:

```sql
delete from sessions where mode in ('diagnostic', 'weekly');
```
