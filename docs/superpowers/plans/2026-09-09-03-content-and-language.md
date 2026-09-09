# 03 — Content and language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Допускать в школьные уроки только проверенную программу RU/KK с корректными объяснениями и медиа.
**Architecture:** Версии L01 + отдельные publication records; approved программа фиксирует конкретные question version IDs. Проверка содержания человеком обязательна.
**Tech Stack:** TypeScript, existing ContentBlocks/MathText, SQL, Vitest/Playwright, next-intl.
**Spec:** [архитектура](../specs/2026-09-09-production-pilot-architecture.md), §§2,5,9.

## Global Constraints

- RU/KK: ключи сообщений в паритете, контент пилота принят человеком по математике и казахскому языку.
- Существующие design tokens, темы и согласованный дизайн визуализации сохраняются.
- Новые миграции; применённые SQL-файлы, `.env.local` и материалы презентации не изменяются.

## C01 — Отбор, версии и программа пилота

**Files:** create `supabase/migrations/0027_pilot_programs.sql`, `lib/content/pilot-catalog.ts`, `scripts/pilot/{validate-program,publish-program}.ts`, `scripts/lib/pilot-program.test.ts`, `docs/pilot/CONTENT_REVIEW.md`, `tests/fixtures/pilot-program.ts`; modify `scripts/lib/content-audit.ts`, `types/db.ts`, `package.json`.
**Consumes:** L01 question_versions/publications; D03 subjects/topics/language.
**Produces:** pilot_programs/items из spec; `getApprovedProgram(id: string, locale: Locale): Promise<ApprovedProgram | null>`; `validateProgram(program): ProgramIssue[]`.

ApprovedProgram = `{id:string; version:number; locale:Locale; items:{position:number; purpose:'practice'|'baseline'|'endline'; questionVersionId:string}[]}`. ProgramIssue = `{code:'missing-locale'|'missing-review'|'missing-source-rights'|'invalid-body'|'invalid-explanation'|'missing-media'|'invalid-pair'; versionId:string; detail:string}`. Один program содержит пары версий RU/KK; выдача фильтрует язык без fallback, сохраняя эквивалентный family и purpose. Позиция уникальна **в пределах locale+purpose**, schema/items хранит locale/purpose явно, FK version проверяет их соответствие.

- [ ] Составить synthetic программу: по одной single/multi/matching, контекст с таблицей и рисунком, RU/KK пары. Написать тесты rejected missing table/image/answer/explanation/translation, mismatched difficulty/answer между языками, устаревший review после новой revision.
- [ ] Миграция 0027 создаёт schema программы, immutable approved items; редактирование approved = новая version/program ID. SQL запрещает approved, если нужная publication не approved. Проверки source_rights_ref и review_ref не заменяют проверку прав на оригинальные материалы.
- [ ] `validate-program` по умолчанию read-only, печатает только counts/issue IDs; `publish-program` имеет dry-run по умолчанию, пишет через проверенную operator функцию с audit и operation ID только после review. Synthetic fixture можно в Git, реальные исходники НЦТ/фото/ограниченные вопросы не добавлять.
- [ ] Методист выбирает небольшой связный набор тем после D03, проверяет все условия, варианты, баллы, объяснения, таблицы и изображения. KK принимается знающим язык человеком; русский fallback в школьном уроке запрещён. Для каждого family — math review, language review, media/source check, дата, версия, reviewer reference в закрытом реестре. Не ставить human review от имени модели.
- [ ] Baseline/endline: сопоставимые по темам/типам/сложности разные варианты; не использовать exact practice questions, по которым только что показывался ответ. Учитель принимает сопоставимость; report показывает versions, без обещания валидированного стандартизированного теста.
- [ ] Добавить commands `pilot:validate-program`, `pilot:publish-program`, тесты SQL publication race/quarantine. Typecheck/lint/unit/DB/build. Commit C01 кода; реальная программа не ready до человеческой приёмки.

```ts
it('blocks a Kazakh lesson instead of silently using Russian', () => {
  const issues = validateProgram(programFixture({ missingLocale: 'kk' }));
  expect(issues.some(x => x.code === 'missing-locale')).toBe(true);
});
```

## C02 — Рендер, жалоба и карантин

**Files:** modify `components/content/{ContentBlocks,QuestionStem}.tsx`, `components/math/MathText.tsx`, `app/[locale]/(app)/admin/review/{page,ReviewCard}.tsx`, `lib/supabase/admin-actions.ts`, `messages/{ru,kk}.json`; create `components/content/ReportQuestionButton.tsx`, `lib/content/report.ts`, `supabase/migrations/0028_content_reports.sql`, `tests/e2e/content.spec.ts`, `tests/db/content-publication.test.ts`.
**Consumes:** C01 programs и L01 publications.
**Produces:** readable mobile content + `reportQuestion({operationId,sessionItemId,reason})` c reason `statement|answer|explanation|translation|media`; reason enum вместо свободного текста в MVP.

- [ ] Создать content_reports(id,user_id,session_item_id,reason,status new/confirmed/rejected,resolved_version_id,created_at) с RLS, server-write, rate limit и unique operation. Report допускается только на выданный item текущего пользователя; teacher отдельный scoped путь. Не принимать внешний URL изображения или полный question body от клиента.
- [ ] Browser fixtures для text/KaTeX/table/image/context во всех типах, обе темы RU/KK и 360/768/1280px. Таблица скроллится внутри карточки, не ломает viewport; рисунок имеет текстовую альтернативу/размеры, ошибка загрузки явно сообщает о недоступном материале. Не «исправлять» отсутствующий рисунок случайной AI-картинкой.
- [ ] Карантин отменяет новые выдачи, но immutable snapshot завершённого результата остаётся. Для активной сессии с подтверждённо ошибочным вопросом: блокировать новый submit с content-unavailable, предложить учителю новое назначение; старый факт не пересчитывать молча. Если score invalidated позднее — новый correction event/report revision, исходник сохраняется по policy.
- [ ] Admin review требует existing content-admin, SQL publication function не даёт назначить school role. Связать исправление → новая question_version → повторный math/KK review → новая program version. Разрешить видеть очередь с pagination≤50, без всего банка в клиентском JSON.
- [ ] Test XSS: `<script>`, dangerous href/image protocol, HTML в таблице, KaTeX trust disabled; никаких `dangerouslySetInnerHTML` для пользовательских строк. Если текущий renderer использует HTML KaTeX, источник только KaTeX с безопасными options и проверенным input.
- [ ] Commit C02 после typecheck/lint/unit/DB/build/browser. Приёмка C01/C02 включает человеческий список принятой программы, не только screenshots synthetic.
