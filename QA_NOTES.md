# QA_NOTES — polish/auto-qa

Журнал автономного QA-прохода. Для каждого пункта: что нашли → что сделали.

## 1. i18n: паритет ru/kk, захардкоженные строки

**Найдено:**
- Паритет ключей `ru.json` ↔ `kk.json` — полный, расхождений нет (проверено скриптом flatten+diff).
- `PracticeView` и `MockExamView` **уже локализованы** через `useTranslations` — заметка в CLAUDE.md («строки в PracticeView захардкожены») устарела.
- Захардкоженные строки нашлись в другом:
  - `components/theme-toggle.tsx` — «Переключить тему», «Светлая/Тёмная тема», плейсхолдер «Тема» (только RU);
  - `app/[locale]/layout.tsx` — метаданные (title/description) захардкожены на русском для обеих локалей;
  - `components/layout/MobileNav.tsx` — aria-label'ы на английском («Open navigation», «Close navigation», «Navigation drawer»);
  - `lib/supabase/queries.ts` `displayName()` — fallback-имя «студент»/«оқушы» инлайном вне messages.

**Сделано:**
- Новые ключи в `ru.json` и `kk.json` (паритет сохранён): `meta.title`, `meta.description`, `theme.toggle/light/dark`, `nav.openMenu/closeMenu/menu`, `dashboard.defaultName`.
- `theme-toggle.tsx` переведён на `useTranslations('theme')`.
- `layout.tsx`: статичный `metadata` → `generateMetadata()` с локалью.
- `MobileNav.tsx`: aria-label'ы через `tNav(...)`.
- `displayName()` теперь возвращает `string | null`; fallback берётся из `dashboard.defaultName` на месте вызова (dashboard).

## 2. tsconfig.scripts.json: scripts не типизировались

**Найдено:**
- `tsconfig.scripts.json` наследует `exclude: ["node_modules", "scripts"]` из базового `tsconfig.json`, а свой `exclude` не задаёт → унаследованный exclude гасил `include: ["scripts/**/*.ts"]`. Проверка `tsc -p tsconfig.scripts.json --listFilesOnly` показывала **0 файлов** из `scripts/`.
- `npm run typecheck` гонял только основной конфиг — scripts вообще не проверялись.

**Сделано:**
- В `tsconfig.scripts.json` добавлен собственный `exclude: ["node_modules"]` — теперь в scope все 7 файлов из `scripts/`.
- `npm run typecheck` расширен: `tsc --noEmit && tsc -p tsconfig.scripts.json --noEmit`.
- Скрипты уже типизировались чисто — ошибок после включения не выявлено.
