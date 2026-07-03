# AlemPrep — AGENTS.md

> Инструкция по этому репозиторию. Прочитай меня первым.
> Долгосрочная стратегия и план по спринтам — в `ROADMAP.md`.
> Здесь — **как устроен код и как с ним работать**.

## Что это

AlemPrep — бесплатная веб-платформа для подготовки к ЕНТ (Казахстан).
Предметы: математика, физика, информатика. UX в духе oneprep.xyz:
минимализм, фокус, клавиатурные шорткаты, тёмная тема. Двуязычие ru/kk
(казахский — полноценный, не автоперевод).

## Стек

- **Next.js 15** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS 3.4** + компоненты в стиле shadcn + CSS-переменные для темы
- **Supabase** (Postgres, Auth, RLS, SSR через `@supabase/ssr`) — проект `euypaocjzcqlapfilrak`, регион Frankfurt
- **next-intl 3.26** (`localePrefix: 'always'` → URL вида `/ru/...`, `/kk/...`)
- **next-themes** (light/dark), шрифт **Inter** (next/font, кириллица)
- **KaTeX** через CDN (auto-render) — рендер формул в `$...$`
- **lucide-react** — иконки

## Как запускать

- Dev-сервер: `npm run dev` → http://localhost:3000 (или двойной клик по `start.command`)
- Установка зависимостей: `npm install --legacy-peer-deps` (нужен флаг из-за React 19 + старые peer-deps)
- Прод-сборка: `npm run build` ← **только она проверяет типы** (см. «Грабли»)
- Переменные окружения: `.env.local` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`

## Структура

```
app/[locale]/
  (app)/            — защищённые страницы под общим layout (AppShell + Sidebar)
    dashboard/  subjects/  subjects/[subject]/  practice/topic/[topic]/
    full-practice/  progress/  settings/
  page.tsx          — лендинг
  login/            — вход (Google OAuth)
  layout.tsx        — корневой layout (шрифт, KaTeX, ThemeProvider, i18n)
app/auth/callback/route.ts — OAuth callback
components/
  ui/               — button, card (база shadcn-стиля)
  layout/           — Sidebar, AppShell, PageHeader
  practice/         — PracticeView (ядро тренажёра)
  math/             — MathText (KaTeX-рендер)
  theme-*           — провайдер и переключатель темы
lib/supabase/       — client/server/middleware (SSR), auth-actions, practice-actions, queries
lib/icons.ts        — строка-иконка → Lucide-компонент
types/db.ts         — типы по схеме БД (см. «Грабли»)
i18n/               — routing.ts, request.ts
messages/           — ru.json, kk.json (ключи держим в ПАРИТЕТЕ)
supabase/migrations/— 0001 schema, 0002 seed subjects/topics, 0003 seed logarithms; run_all.sql — всё вместе
middleware.ts       — next-intl + Supabase auth-guard
```

## База данных (7 таблиц)

`profiles`, `subjects`, `topics`, `contexts`, `questions`, `sessions`, `attempts`.
Все под **RLS**: контент (subjects/topics/questions) читают `authenticated`,
личные данные (profiles/attempts/sessions) — только своё.
`questions.body` — **JSONB**, полиморфно по типу: `single | multi | matching`.
Триггеры: `handle_new_user` (автосоздание profile при регистрации), `handle_updated_at`.

## Известные грабли (важно!)

- **Dev-сервер на SWC НЕ проверяет типы.** Сайт может работать на localhost, а `next build` — падать. Перед деплоем ВСЕГДА гонять `npx tsc --noEmit` (или `npm run build`).
- **`types/db.ts` поддерживается вручную** по схеме из `supabase/migrations`. При изменении схемы — обновить типы или сгенерировать: `npx supabase gen types typescript --project-id euypaocjzcqlapfilrak > types/db.ts`.
- **Строки в `PracticeView` захардкожены на русском** — тренажёр пока не локализован (отдельная задача).
- **`app/auth/callback` хардкодит локаль `/ru`** — починить при деплое (тех-долг, см. ROADMAP §1.3).
- `npm install` требует `--legacy-peer-deps`.

## Соглашения по коду

- TypeScript strict; без `any` / `@ts-ignore` без явной причины
- Server Components по умолчанию; `'use client'` — только когда нужен state/effects
- Запись в БД — через **server actions**; чтение — через `lib/supabase/queries`
- Новая таблица: сначала RLS-политики, потом код
- Изменения схемы — только через миграции (не править руками в Supabase Studio)
- Тема — через CSS-переменные в `app/globals.css` + токены в `tailwind.config.ts` (`primary`, `success`, `warning`, тени, анимации)
- Тексты — через next-intl; ключи добавлять синхронно в `ru.json` И `kk.json`

## Текущее состояние (май 2026)

Рабочий MVP на localhost. Готово: инфраструктура, Google OAuth, БД,
тренажёр (все 4 типа задач, KaTeX, шорткаты, сохранение попыток, стрики, focus-режим),
полный визуальный апгрейд (дизайн-система, лендинг, дашборд, тренажёр).
Контент: математика — 12 тем, ~9 задач (логарифмы). Пока не задеплоен.
`tsc --noEmit` проходит чисто.

## Что дальше (см. ROADMAP §5)

Sprint 2 — деплой на Vercel + мобильная адаптация.
Sprint 3 — AI-генерация контента (математика до 200+ задач).
Sprint 4 — страница «Прогресс» (графики, heatmap).
Sprint 5 — режим полного пробника под таймером.

## Работа с Codex (рабочее соглашение)

- **Бэклог задач — в `TASKS.md`.** Бери задачи сверху по приоритету (P0 → P1 → P2). Один таск = один коммит с понятным сообщением.
- **Ворота качества перед «готово».** Dev-сервер на SWC НЕ проверяет типы, поэтому всегда:
  - `npm run typecheck` — обязан проходить (0 ошибок);
  - `npm run lint` — без новых предупреждений;
  - `npm run build` — для задач, влияющих на сборку/маршруты.
  - Удобно прогнать всё разом командой `/verify`.
- **Не отмечай задачу выполненной, если typecheck/lint красные** или фича доделана наполовину.
- **Схема БД — только через миграции** в `supabase/migrations` (новые файлы, старые не править). После изменения схемы — обновить `types/db.ts`.
- **Тексты — синхронно в `messages/ru.json` И `messages/kk.json`** (паритет ключей обязателен). Казахский — полноценный язык, не автоперевод; если не уверен в формулировке — оставь `TODO` и спроси.
- **Не трогать без явной задачи:** дизайн-токены в `app/globals.css` и `tailwind.config.ts` (они согласованы), `.env.local`, уже применённые миграции.
- **Стиль кода:** TypeScript strict, без `any`/`@ts-ignore` без причины; Server Components по умолчанию, `'use client'` только при необходимости; запись в БД — через server actions, чтение — через `lib/supabase/queries`.
- **Стратегия и долгосрочный план — в `ROADMAP.md`** (не дублируй сюда).
