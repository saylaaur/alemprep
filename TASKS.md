# AlemPrep — Бэклог задач для Claude Code

> Приоритизированный список реальных задач. Контекст проекта — в `CLAUDE.md`, стратегия — в `ROADMAP.md`.
>
> **Как пользоваться:** бери задачу сверху (P0 → P1 → P2). Один таск = один коммит.
> Перед «готово» прогоняй `/verify` (typecheck + lint + build). У каждой задачи есть готовый
> промпт — скопируй блок «Промпт» в Claude Code.
>
> Состояние на момент составления: `npm run typecheck` проходит чисто (0 ошибок).

---

## Порядок выполнения (план — выбрано «всё по порядку»)

Тех-долг P0 закрыт (T1–T3c ✅). Дальше по приоритету:

1. **T6 — Страница «Прогресс»** (функционал, контент не нужен)
2. **T7 — Режим «Полный пробник»** (функционал, контент не нужен)
3. **T5 — Мобильная адаптация** (полировка)
4. **Контент-пайплайн** — когда будут материалы (Sprint 3 в ROADMAP)
5. **P2** — error tracking, тесты

Дизайн-направление и бэклог полировки — в `DESIGN.md`.

---

## P0 — реальные баги

### T1. Починить локаль в OAuth-callback — ✅ СДЕЛАНО (verified)

**Проблема.** `app/auth/callback/route.ts` после входа всегда редиректит на `/ru...`
(хардкод). Ученик, вошедший на казахской версии, попадёт на русскую.

**Файлы.** `app/auth/callback/route.ts`, `lib/supabase/auth-actions.ts` (функция `signInWithGoogle`).

**Что сделать.** Прокинуть локаль через OAuth-флоу: при инициировании входа класть в
`redirectTo`/`next` локаль (например `next=/${locale}/dashboard`), а в callback использовать
её вместо хардкода `/ru`. Для `error`-редиректа — тоже определять локаль (из параметра,
дефолт `ru`).

**Готово, когда.** Вход на `/kk/login` приводит на `/kk/dashboard`, на `/ru/login` — на
`/ru/dashboard`. `npm run typecheck` чист.

**Промпт:**
```
Прочитай app/auth/callback/route.ts и lib/supabase/auth-actions.ts. Сейчас callback
хардкодит локаль /ru при редиректе. Прокинь актуальную локаль через OAuth: signInWithGoogle
должна передавать локаль в next/redirectTo, а callback — использовать её вместо /ru (и для
успеха, и для ошибки; дефолт ru). Не меняй ничего лишнего. В конце прогони /verify.
```

### T2. Убрать `as never` в ссылках (типизировать маршруты) — ✅ СДЕЛАНО (verified)

**Проблема.** Динамические ссылки приведены через `as never` — костыль, отключающий
проверку типов:
- `app/[locale]/(app)/dashboard/page.tsx:168` → `/subjects/${s.slug}`
- `app/[locale]/(app)/subjects/page.tsx:59` → `/subjects/${s.slug}`
- `app/[locale]/(app)/subjects/[subject]/page.tsx:78` → `/practice/topic/${topic.slug}`

**Файлы.** `i18n/routing.ts` + три файла выше.

**Что сделать.** Определить `pathnames` в `defineRouting` для динамических маршрутов
(`/subjects/[subject]`, `/practice/topic/[topic]`) и использовать типобезопасную форму
`<Link href={{ pathname: '/subjects/[subject]', params: { subject: slug } }}>`. Убрать все
`as never`.

**Готово, когда.** В `.tsx` нет `as never`; ссылки ведут с правильным locale-префиксом;
`npm run typecheck` чист.

**Промпт:**
```
Найди все `as never` в app/**/*.tsx (их 3, в dashboard и subjects). Они на динамических
ссылках next-intl Link. Настрой pathnames в i18n/routing.ts для /subjects/[subject] и
/practice/topic/[topic] и перепиши ссылки в типобезопасной форме (href-объект с params),
убрав as never. Проверь навигацию на /ru и /kk. В конце /verify.
```

### T2b. Лендинг рендерит ссылки в неправильной локали — ✅ СДЕЛАНО (verified)

**Проблема.** `app/[locale]/page.tsx` не вызывает `setRequestLocale(locale)` и не является
async-компонентом, поэтому на `/kk/` next-intl рендерит ссылки с префиксом `/ru` (кнопки
«Войти»/«Начать» ведут на `/ru/login`). Подтверждено верификацией T2 — баг pre-existing,
не связан с типизацией маршрутов.

**Файлы.** `app/[locale]/page.tsx` (и проверить `app/[locale]/login/page.tsx`).

**Что сделать.** Привести к паттерну `dashboard/page.tsx`: сделать компонент `async`, принять
`params: Promise<{ locale: string }>`, `const { locale } = await params;`, затем
`setRequestLocale(locale)`. **Важно:** в async Server Component хук `useTranslations`
использовать нельзя — заменить на `await getTranslations(...)` из `next-intl/server`.

**Готово, когда.** На `/kk/` все ссылки лендинга ведут на `/kk/...`, на `/ru/` — на `/ru/...`;
`npm run typecheck` чист.

**Промпт:**
```
В app/[locale]/page.tsx ссылки на /kk/ рендерятся с префиксом /ru, потому что нет
setRequestLocale. Приведи к паттерну dashboard/page.tsx: сделай компонент async, прими
params: Promise<{locale: string}>, await locale, вызови setRequestLocale(locale). Замени
useTranslations на await getTranslations из next-intl/server (в async-компоненте useTranslations
нельзя). Проверь то же в login/page.tsx. Убедись, что на /kk кнопки ведут на /kk/login. /verify.
```

### T3. Прибрать типы в `queries.ts` (убрать двойной каст) — ✅ СДЕЛАНО (verified)

**Проблема.** `getQuestionsForTopic` возвращает слабо типизированный массив, поэтому
страница тренажёра делает `questions as unknown as Question[]`
(`app/[locale]/(app)/practice/topic/[topic]/page.tsx:30`).

**Файлы.** `lib/supabase/queries.ts`, `app/[locale]/(app)/practice/topic/[topic]/page.tsx`.

**Что сделать.** Типы из `types/db.ts` теперь реальные — типизируй возврат
`getQuestionsForTopic` как `{ topic: ...; questions: Question[]; contexts: Map<string, Context> }`,
приводя строки Supabase к `Question`/`Context` внутри queries. Убрать `as unknown as` на странице.

**Готово, когда.** На странице тренажёра нет `as unknown as`; тренажёр работает; typecheck чист.

**Промпт:**
```
В lib/supabase/queries.ts типизируй возврат getQuestionsForTopic настоящими типами из
types/db.ts (Question[], Context). Затем в app/[locale]/(app)/practice/topic/[topic]/page.tsx
убери `as unknown as Question[]`. Ничего в UI не меняй. Проверь, что тренажёр по логарифмам
открывается. /verify.
```

### T3b. Убрать `as never` в practice-actions — ✅ СДЕЛАНО (verified)

**Проблема.** `lib/supabase/practice-actions.ts:22` использует `as never` при записи
`given_answer` (insert в `attempts`) — костыль из-за заглушечного `Database`-типа
Supabase-клиента. Найдено при верификации T3.

**Файлы.** `lib/supabase/practice-actions.ts`.

**Что сделать.** Заменить `as never` на корректную типизацию payload (тип строки `attempts`
из `types/db.ts` либо явный объект без `never`). Логику стрика и `recordAttempt` не менять.

**Готово, когда.** В `practice-actions.ts` нет `as never`; typecheck чист; попытка по-прежнему
сохраняется (виден инкремент «решено сегодня» на дашборде).

**Промпт:**
```
В lib/supabase/practice-actions.ts:22 убери `as never` при insert given_answer. Типизируй
payload корректно (используй типы из types/db.ts или явный объект). Логику стрика и
recordAttempt не трогай. /verify.
```

### T3c. Настроить ESLint (lint-гейт сейчас не работает) — ✅ СДЕЛАНО (verified) — ✅ СДЕЛАНО (verified)

**Проблема.** `npm run lint` (`next lint`) падает в интерактивный промпт — в проекте нет
ESLint-конфига (`.eslintrc.*` / `eslint.config.*`), хотя `eslint` и `eslint-config-next`
есть в devDependencies. Один из трёх «ворот качества» (`/verify`) — холостой.

**Файлы.** Новый конфиг ESLint в корне; при необходимости — `package.json` (скрипт `lint`).

**Что сделать.** Добавить конфиг, расширяющий `next/core-web-vitals` (+ `next/typescript`).
ESLint в проекте 9.x — возможно понадобится flat-config (`eslint.config.mjs`). Убедиться,
что `npm run lint` запускается без интерактивного промпта и проходит чисто на текущем коде
(починить или явно отключить единичные правила, если будут ложные срабатывания — но без
массового глушения).

**Готово, когда.** `npm run lint` отрабатывает без вопросов и без ошибок; `/verify` зелёный
по всем трём пунктам.

**Промпт:**
```
npm run lint сейчас не работает — нет ESLint-конфига (next lint просит выбрать пресет
интерактивно). Настрой ESLint для Next 15 + TS: добавь конфиг (учти, что eslint 9.x —
вероятно нужен flat config eslint.config.mjs), расширь next/core-web-vitals и next/typescript.
Добейся, чтобы npm run lint проходил чисто на текущем коде. Массово правила не отключай.
В конце прогони /verify.
```

---

## P1 — качество и охват

### T4. Локализовать тренажёр (PracticeView) — ✅ СДЕЛАНО (verified)

**Проблема.** Строки в `components/practice/PracticeView.tsx` захардкожены на русском
(«Проверить», «Дальше», «Назад», «Разбор», «Правильно!», «Неверно», «Можно выбрать несколько
вариантов», «Выбери…», «верно:», «Всё решено · N из M», «Пока нет задач по этой теме»,
подписи фокус-режима). На `/kk` тренажёр всё равно по-русски — а казахский у нас
первоклассный.

**Файлы.** `components/practice/PracticeView.tsx`, `messages/ru.json`, `messages/kk.json`.

**Что сделать.** Вынести строки в namespace `practice` (часть ключей уже есть). В клиентском
компоненте использовать `useTranslations('practice')`. Добавить недостающие ключи синхронно
в ru и kk (паритет!). Числа — через ICU-плейсхолдеры.

**Готово, когда.** На `/kk` интерфейс тренажёра по-казахски; ключи ru/kk в паритете; typecheck чист.

**Промпт:**
```
Локализуй components/practice/PracticeView.tsx через next-intl (useTranslations('practice')).
Вынеси все захардкоженные русские строки в messages/ru.json и messages/kk.json (namespace
practice), добавь синхронно в оба файла, числа через ICU-плейсхолдеры. Казахский — нормальный
перевод, не калька; сомнительные места помечай TODO. Проверь /ru и /kk. /verify.
```

### T5. Мобильная адаптация

**Проблема.** Сайдбар `hidden md:flex` — на телефоне навигации нет вообще. Отступы (`p-8`)
тесноваты на узких экранах.

**Файлы.** `components/layout/Sidebar.tsx`, `components/layout/AppShell.tsx`,
`components/layout/PageHeader.tsx` (+ возможно новый `components/layout/MobileNav.tsx`).

**Что сделать.** На `<md` добавить верхний бар с кнопкой-меню, открывающей off-canvas
drawer с теми же пунктами навигации и профилем. Тач-таргеты ≥44px, адаптивные отступы
(`p-4 sm:p-6 lg:p-8`), без горизонтального скролла. Дизайн-токены не менять.

**Готово, когда.** На ширине <768px навигация доступна через drawer; нет горизонтального
переполнения; десктоп выглядит как раньше; typecheck чист.

**Промпт:**
```
Сделай мобильную навигацию. Сейчас Sidebar скрыт на <md и навигации на телефоне нет. Добавь
на мобильных верхний бар с кнопкой-бургером и off-canvas drawer (те же пункты, что в Sidebar,
+ профиль и выход). Адаптивные отступы p-4 sm:p-6 lg:p-8, тач-таргеты ≥44px, без горизонтального
скролла. Десктоп не ломай, дизайн-токены globals.css/tailwind.config не трогай. /verify.
```

---

### T6. Страница «Прогресс» (сейчас заглушка) — ПРИОРИТЕТ

**Зачем.** `/progress` — пустая заглушка «Скоро». Это одна из причин, почему сайт
ощущается сырым. Контент для фичи не нужен — работает на уже существующих попытках.

**Файлы.** `app/[locale]/(app)/progress/page.tsx`, `lib/supabase/queries.ts` (новые
агрегирующие запросы по `attempts`), новый компонент(ы) для графиков, `messages/ru|kk.json`.

**Что показать.**
- **Activity heatmap** — последние ~12 недель по дням (как у GitHub), на основе `attempts.attempted_at`.
- **Сильные/слабые темы** — горизонтальный bar по % правильных (join `attempts → questions → topics`).
- **Стрик** — текущий и максимальный (из `profiles.current_streak`; макс можно прикинуть по активности).
- **Последние сессии/попытки** — список с датой, темой, результатом.
- **Сводка** — всего решено, % правильных.

**Подсказки.** Данные считать на сервере (новые функции в `queries.ts`, агрегаты по `attempts`).
Heatmap можно сделать без библиотек (сетка `div`-ов по неделям) — это легче, чем тянуть recharts;
если нужен bar-chart, можно тоже на CSS-полосах. Локализация ru/kk (паритет), `setRequestLocale`.
Дизайн — по `DESIGN.md` (карточки, токены success/warning, без новых цветов).

**Готово, когда.** На `/progress` видно личную активность и слабые темы; пусто-состояние
(если попыток ещё нет) оформлено по-человечески, а не «Скоро»; `/verify` зелёный; ключи ru/kk в паритете.

**Промпт:**
```
Построй страницу /progress (app/[locale]/(app)/progress/page.tsx) вместо заглушки. Источник —
таблица attempts (+ join questions→topics). Покажи: activity heatmap за ~12 недель, сильные/слабые
темы (% правильных, горизонтальные полосы), текущий+макс стрик, последние попытки, сводку
(всего решено, % верных). Запросы-агрегаты добавь в lib/supabase/queries.ts (считай на сервере).
Heatmap и полосы можно на CSS/div без внешних библиотек. Сделай аккуратное пусто-состояние, если
попыток нет. Локализуй ru/kk (паритет ключей), вызови setRequestLocale. Держись дизайн-токенов
(см. DESIGN.md), новых цветов не вводи. В конце /verify.
```

### T7. Режим «Полный пробник» (сейчас заглушка) — ПРИОРИТЕТ, крупная

**Зачем.** `/full-practice` — заглушка. Пробник под таймером — ключевая фича для подготовки
к ЕНТ и вторая причина ощущения «нет функционала». Контент не нужен — берёт существующие задачи.

**Файлы.** `app/[locale]/(app)/full-practice/page.tsx`, новый клиентский `MockExamView`,
`lib/supabase/practice-actions.ts` (создать/завершить session), `lib/supabase/queries.ts`
(подбор N задач), `messages/ru|kk.json`. Таблица `sessions` уже есть.

**Логика.**
- Старт создаёт запись `sessions` (`mode = 'mock_exam'`), подбирает N задач (пока только math;
  микс типов; если задач мало — берём сколько есть и честно показываем это).
- Таймер (например 40–240 мин — вынеси в константу), виден всегда; авто-сабмит по истечении.
- Навигатор вопросов с состояниями: не отвечено / отвечено / помечено «вернуться позже».
- **Объяснения скрыты до конца** (иначе теряется смысл пробника).
- Кнопка «Завершить» с подтверждением.
- Результат: балл, затраченное время, разбор по темам, полный список задач с правильными
  ответами и объяснениями. Запись в `sessions` обновляется (`correct_count`, `score`, `finished_at`).

**Подсказки.** Переиспользуй логику рендеринга вопросов из `PracticeView`, но режим другой
(без мгновенной проверки). Это самая крупная задача — **сначала дай Claude Code план (plan mode)**,
потом код. Локализация ru/kk. `/verify` в конце.

**Готово, когда.** Можно пройти пробник под таймером и получить детальный результат; сессия
пишется в БД; `/verify` зелёный; ключи ru/kk в паритете.

**Промпт:**
```
Построй режим «Полный пробник» (/full-practice) вместо заглушки. Сначала составь план (plan mode),
покажи мне, потом реализуй. Логика: старт создаёт session(mode=mock_exam) и подбирает N задач по math
(если задач мало — бери сколько есть); таймер с авто-сабмитом; навигатор вопросов с пометкой
«вернуться позже»; объяснения скрыты до конца; экран результата (балл, время, разбор по темам,
список задач с ответами и разбором); по завершении обнови sessions (correct_count, score, finished_at).
Переиспользуй рендеринг вопросов из PracticeView. Запросы — в queries.ts, запись — в practice-actions.ts.
Локализуй ru/kk (паритет). В конце /verify.
```

---

## P2 — подготовка к продакшену

### T8. Error tracking + analytics

Подключить Sentry (free) и аналитику (Vercel Analytics или Plausible). Завести через env,
не светить ключи. Покрыть как минимум server actions и корневой error boundary.

### T9. Тесты критических путей

Vitest + тесты на чистые функции: `checkAnswer`/`isAnswerComplete` (все 3 типа вопросов),
расчёт стрика, формирование попытки. Это самый дешёвый способ не сломать ядро при рефакторингах.

---

## Шпаргалка

- Запуск: `npm run dev` → http://localhost:3000
- Проверка: `/verify` (или `npm run typecheck && npm run lint && npm run build`)
- Зависимости: `npm install --legacy-peer-deps`
- Гайд по проекту: `CLAUDE.md` · стратегия: `ROADMAP.md`
