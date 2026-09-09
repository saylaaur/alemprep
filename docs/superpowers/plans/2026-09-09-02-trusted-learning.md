# 02 — Trusted learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать учебные результаты серверными, атомарными и проверяемыми.
**Architecture:** Immutable версии заданий, серверный manifest, TypeScript grading и закрытая транзакционная RPC. Старые факты integrity=0 сохраняются отдельно от доверенного школьного отчёта.
**Tech Stack:** TypeScript/Zod, PostgreSQL, Supabase RPC, Vitest + настоящие REST/DB тесты.
**Spec:** [архитектура](../specs/2026-09-09-production-pilot-architecture.md), разделы 5–8.

## Global Constraints

- Новые миграции; применённые SQL-файлы, `.env.local` и материалы презентации не изменяются.
- Одна принятая операция даёт один результат и один логический audit event; сетевой retry не создаёт новый учебный факт.
- Проверка схемы/прав и конкурентных записей проходит на реальном PostgreSQL с ролями `anon`, `authenticated`, `service_role`.
- Браузер не получает grading/explanation до разрешённого review.

## L01 — Схема, immutable версии и DTO

**Files:** create `supabase/migrations/0024_learning_integrity_schema.sql`, `lib/learning/{contracts,validation,grading}.ts`, `lib/content/{public-question,versions}.ts`, `lib/supabase/admin.ts`, `lib/server/{actor,config}.ts`, `tests/db/learning-schema.test.ts`, `lib/content/public-question.test.ts`, `lib/learning/validation.test.ts`; modify `types/db.ts`, `lib/supabase/server.ts`.
**Consumes:** E02 DbHarness, existing QuestionBody/ContentBlock/scoreAnswer.
**Produces:** весь §5.1 schema, §6 DTO, `validateStart(raw: unknown): StartInput`, `validateSubmit(raw: unknown): SubmitInput`, `toPublicQuestion(version: QuestionVersion): PublicQuestion`. Validation throws ZodError только внутри модуля; action переводит её в invalid-input.

- [ ] Написать table/privilege tests: новую версию нельзя изменить/прочитать browser JWT; удаление question с историей отклонено; legacy integrity=0; повтор session_item отклонён UNIQUE. Миграция должна проходить на populated legacy fixture и на empty DB.
- [ ] Добавить schema по §5.1. Значения status legacy выводить из finished_at, integrity не повышать. FK audit actor сделать SET NULL; rows учебной истории сохранить. Публичным ролям не дать grants на новые внутренние таблицы; включить RLS сразу. Никаких широких `FOR ALL` для новых таблиц.
- [ ] `QuestionVersion` тип: id/questionId/familyId/revision/locale/type/publicBody/gradingBody/explanation/contextSnapshot/contentHash; `PublicQuestion` — отдельный тип, построение explicit allowlist. Не применять rest/spread исходной DB строки:

```ts
it('does not serialize the answer key or explanation before review', () => {
  const q = toPublicQuestion(versionFixture());
  const json = JSON.stringify(q);
  expect(Object.hasOwn(q.body, 'correct')).toBe(false);
  expect(json).not.toContain('EXPLANATION_PRIVATE_MARKER');
  expect(json).not.toContain('gradingBody');
  expect(json).not.toContain('explanation');
});
```

`versionFixture()` создаётся в `tests/fixtures/learning.ts`, экспортирует валидную single version (options A/B, correct A), explanation содержит EXPLANATION_PRIVATE_MARKER. Варианты A/B законно видны клиенту; тест не должен запрещать сам ID правильного варианта. Фикстура не использует реальный контент.
- [ ] Validation на unknown верхнего уровня до `input.foo`; `.strict()` rejects score/userId/schoolId/isCorrect extras. UUID, размер≤64KiB, bounds §7. Проверить null, массив вместо input, `NaN`, Infinity, float duration, дубли option/item IDs, matching `__proto__`, неизвестный ключ. Runtime проверка вариантов выполняется также против выданной версии после загрузки manifest.
- [ ] `admin.ts` содержит `import 'server-only'`; удалить createAdminClient из browser-reachable barrel. Config проверяет ключи без вывода значений, не делает сетевых запросов при build; actor получает auth.getUser и никогда client actor ID.
- [ ] Проверить DB tests + typecheck/lint/unit/build. Commit L01, миграция production **не применена** до runbook.

## L02 — Одна транзакция выдачи и завершения

**Files:** create `supabase/migrations/0025_learning_integrity_rpc.sql`, `lib/learning/{service,repository}.ts`, `tests/db/learning-atomic.test.ts`, `lib/learning/grading.test.ts`, `lib/learning/service.test.ts`; extend `tests/fixtures/learning.ts`, `types/db.ts`.
**Consumes:** L01, scoreAnswer из `lib/exam.ts`.
**Produces:** startLearning/submitLearning/getLearningReview из §6; service-only start_learning_v1/commit_learning_v1 из §7.

Тестовая fixture дополнительно экспортирует `seedLearning(db, actor)` → `{sessionId, itemIds, versionIds, maxScore}` и `gradeFixtureAnswers(fixture, answers)` → JSON для **service** RPC; это test helper, не публичная action. `readLearningFacts(db, sessionId)` → `{attempts, submittedEvents, xpAwarded, receipt}`.

- [ ] Написать failing concurrency test на настоящей БД:

```ts
const calls = Array.from({ length: 20 }, () =>
  db.rpc('service', 'commit_learning_v1', sameValidatedArgs));
const replies = await Promise.all(calls);
expect(replies.every(r => r.status === 200)).toBe(true);
const facts = await readLearningFacts(db, seeded.sessionId);
expect(facts.attempts).toBe(seeded.itemIds.length);
expect(facts.submittedEvents).toBe(1);
expect(facts.xpAwarded).toBe(expectedReward);
```

- [ ] Реализовать locks/receipt/payload-hash/manifest проверку в точном порядке §7. Start создаёт обе exam session/items и receipt одной транзакцией. Service grading читает immutable versions, проверяет variant IDs, нормализует missing answers, вычисляет points на всех выданных items. SQL считает итог из `graded_items` после сравнения manifest, не принимает отдельный total из запроса.
- [ ] Зафиксировать SQL permissions в той же миграции:

```sql
REVOKE ALL ON FUNCTION public.commit_learning_v1(uuid,uuid,text,uuid,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_learning_v1(uuid,uuid,text,uuid,jsonb,text)
  TO service_role;
```

То же для start. Новые helpers не оставлять EXECUTE PUBLIC по умолчанию. SECURITY INVOKER не даёт authenticated прав только потому, что функция существует; actual roles tests обязательны.
- [ ] Добавить DB rollback test: локальный test-only trigger на audit_events вызывает exception на marker operation; submit падает, attempts/session/XP/receipt остаются прежними. Снять trigger в finally. Не добавлять production debug/fail endpoint.
- [ ] Test matrix: тот же operation с другим answer → conflict; две разные операции одной сессии → один commit; две разные сессии одного ученика → сумма XP без lost update; старый NULL manifest → rejected; wrong mode/id/owner → rejected; удалить один ответ → 0 за пропуск при неизменном maxScore; grading version mismatch → rejected; unpublished/quarantined version не выдаётся вновь.
- [ ] Test time: 23:59→00:01 Asia/Almaty, retry на следующий день не меняет acceptedAt/XP; истёкшая сессия не принимает новую сдачу, ранее accepted receipt читается после expiry. Клиентская смена часов ничего не продлевает.
- [ ] Добавить daily unique family rewards и caps §7; streak row lock и доверенные achievement inputs. При параллельном достижении дневного cap сумма≤cap. Не переносить профиль из браузера в RPC.
- [ ] Запустить DB suite + scoring/unit + typecheck/lint/build. Commit L02; Astra review перед дальнейшим cutover.

## L03 — Перевести существующие пользовательские пути

**Files:** modify `lib/supabase/{practice-actions,diagnostic-actions,weekly-actions,assistant-actions}.ts`, `lib/supabase/queries.ts`, create `lib/supabase/queries/learning.ts`; modify `components/practice/{PracticeView,MockExamView,DiagnosticView,WeeklyTestView,QuestionAnswerInput}.tsx`, связанные страницы и tests, `messages/{ru,kk}.json`.
**Consumes:** L02 contracts.
**Produces:** каждый пользовательский режим использует выданные sessionItem IDs, server receipt и permitted review; старые экспорты не дают обходной записи.

- [ ] Сначала contract test: прямой вызов публичного start не принимает arbitrary questionIds/totalQuestions; `recordAttempt` не получает isCorrect/XP. Удалить export createExamSession или сделать внутренней функцией модуля без `'use server'` и без внешнего входа. Проверять весь набор exported actions, а не только кнопки UI.
- [ ] Адаптировать четыре режима и тему: StartInput содержит только mode/locale/topic/assignment/second; сервер выбирает вопросы. Practice начинает single-item session при выдаче; review показывается после receipt. В exam/diagnostic/weekly правильные ответы не сериализуются в initial props/RSC/localStorage. Разбор baseline/endline ждёт closes_at.
- [ ] Progress queries добавляют явную границу доверенности: школьные metrics только integrity=1; личная legacy история остаётся с маркировкой при необходимости. Не делать N+1 и не получать весь банк ради count; SQL count/aggregate и пагинация с deterministic order.
- [ ] Все day boundaries в progress/streak/quotas используют Asia/Almaty, включая `lib/streak.ts` и existing queries; серверный timezone процесса/UTC не подменяет день школы. Сверить fixtures около полуночи с SQL date.
- [ ] User achievements и AI turns — закрытые server writes; историю AI нельзя сфальсифицировать direct INSERT. Разрешение AI-разбора выводить из trusted session/review policy, не факта любой legacy attempt. Default-off интегрируется O01; в школьном пути не полагаться только на скрытую UI кнопку.
- [ ] Обновить RU/KK ошибки по enum, не отдавать `error.message` Supabase пользователю. RevalidatePath после accepted commit только для relevant страниц; failure revalidation не превращает успешную DB запись в «не принято».
- [ ] Browser tests на synthetic: каждый режим от старта до reload показывает тот же server result. Проверить payload/RSC не содержит marker correct/explanation. Пропущенный item уменьшает score, не denominator. Старый localStorage восстанавливается только после проверки владельца/версии, legacy выдаёт понятный restart.
- [ ] Typecheck/lint/unit/DB/build/E2E. Commit L03.

## L04 — Закрыть прямые записи и принять cutover

**Files:** create `supabase/migrations/0026_learning_write_cutover.sql`, `tests/db/direct-write-denial.test.ts`, `tests/e2e/answer-secrecy.spec.ts`; update `types/db.ts`, `docs/production/EXECUTION_LOG.md`.
**Consumes:** L03 работающий со server-only writes.
**Produces:** доказанный отказ прямого присвоения баллов/ролей/manifest, совместимый release для новых grants.

- [ ] Failing REST tests для собственного actor A: PATCH sessions score/finished_at/question_ids, POST/PATCH/DELETE attempts, POST user_achievements, PATCH profile xp/is_admin/streak, POST ai_turns. Проверять итог в DB после запроса: пустой response/HTTP200 не считается гарантией, что write не прошёл.
- [ ] Отозвать INSERT/UPDATE/DELETE таблиц sessions/attempts/user_achievements/ai_turns у anon/authenticated; удалить старые ALL mutation policies. Сохранить нужные SELECT и точные profile settings column grants + DB CHECK для locale/goal/date/target границ, согласованных с `lib/settings.ts`. Сначала revoke table UPDATE profiles, потом grant разрешённых колонок — additive grants нельзя исправить только column REVOKE.
- [ ] Закрыть SELECT старых questions.body/explanation и contexts, если через них можно получить exam key; все нужные обычные чтения переводятся L03 на safe DTO. Публикация teacher не даёт доступа к grading bank. Catalog metadata можно оставить по минимальному SELECT.
- [ ] anon/authenticated direct RPC attempts → forbidden; serviceRPC с чужим actor/session → rejected ownership. Проверить views, вложенные REST joins, старые functions, grants PUBLIC, security-definer helpers, новые функции EXECUTE default. Обновить manifest отказов в тестах.
- [ ] Cutover rehearsal: baseline → expand → L03 → write pause → 0026 → v1 → smoke. Старый application SHA не rollback target. Production запуск только по P02, если не нужен отдельно согласованный emergency baseline fix.
- [ ] Astra получает SQL + action/DTO diff + настоящие test outputs. Без незакрытых P0/P1, включая alternate API. Commit L04, запись миграции applied/not applied в журнале.
