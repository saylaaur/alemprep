# 05 — Audit and reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Воспроизводимые отчёты для учителя/управления образования и управляемый жизненный цикл данных.
**Architecture:** Audit записывается с бизнес-изменением; report snapshot фиксируется транзакцией и обрабатывается ограниченным worker. Источник — trusted учебные факты, не аналитика кликов.
**Tech Stack:** PostgreSQL, TypeScript, existing UI, CSV, Vitest/DB/E2E.
**Spec:** [архитектура](../specs/2026-09-09-production-pilot-architecture.md), §§5.3,9; [решения](../../production/DECISIONS.md) D04.

## Global Constraints

- Секреты, дампы, детские данные и персональные выгрузки не попадают в Git, CI artifacts, публичные preview или логи.
- Одна принятая операция даёт один результат и один логический audit event; сетевой retry не создаёт новый учебный факт.
- Учитель имеет доступ только к закреплённым группам; назначить себе роль через браузер нельзя.

## R01 — Метрики, аудит и воспроизводимый snapshot

**Files:** create `supabase/migrations/0032_pilot_reports.sql`, `lib/reporting/{contracts,metrics,service}.ts`, `lib/operations/jobs.ts`, `scripts/pilot/run-jobs.ts`, `lib/reporting/metrics.test.ts`, `tests/db/report-snapshot.test.ts`, `tests/fixtures/reports.ts`; modify `types/db.ts`, `package.json`.
**Consumes:** S02 participants, L02 trusted sessions/audit, O01 limits/flags.
**Produces:** report_runs/report_participants/operation_jobs (§5.3), `computeMetrics(input: ReportSource): PilotMetrics`, `requestPilotReport(input:ReportRequest): Promise<Result<{reportId:string}>>`, `runJobs(input:{limit:number;leaseSeconds:number}): Promise<{done:number;failed:number}>`.

```ts
type ReportSource = {
  eligible: string[]; started: string[];
  firstCompletions: {userId:string; points:number; maxPoints:number}[];
  pairs: {userId:string; baselinePercent:number; endlinePercent:number}[];
};
type PilotMetrics = {
  eligible:number; started:number; completed:number;
  completionRate:number|null; accuracy:number|null;
  pairedN:number; pairedGainPercentagePoints:number|null;
};
type ReportRequest = {
  operationId:string; schoolId:string; assignmentId:string;
  audience:'teacher'|'authority'; startAt:string; endAt:string;
};
```

Actor определяется внутри сервиса. Каждый report считает один assignment; schoolId сверяется с ним, group берётся из БД. Для endline пары берутся только из comparison_baseline_id assignment. Authority snapshot может создавать coordinator своей школы или оператор; учитель не запрашивает чужую школу. Две школы оператор представляет фиксированными секциями сопоставимых assignment reports; не усреднять проценты разных программ и не складывать повторные сдачи как уникальных учеников.

- [ ] Golden fixture: eligible A/B/C/D (4), started A/B/C (3), completions A=6/10 B=8/10 (2), pairs A20→60 B50→80. Ожидание completion .5, accuracy .7, pairedN2, gain35 процентных пунктов; dropped C/D не превращать в нули:

```ts
expect(computeMetrics(reportFixture())).toEqual({
  eligible:4, started:3, completed:2, completionRate:0.5,
  accuracy:0.7, pairedN:2, pairedGainPercentagePoints:35,
});
```

`reportFixture()` — export из `tests/fixtures/reports.ts` со значениями выше. Кейсы: пустой набор→null rates, maxPoints0 rejected, duplicate completion выбирается на SQL границе по acceptedAt/id, legacy/demo excluded, event после cutoff excluded.
- [ ] Migration создаёт immutable report_runs и snapshot participants, jobs с lease/attempts. Snapshot строится одним SQL statement либо REPEATABLE READ transaction с cutoff: eligibility, первые v1 completions, paired results, versions и status events. Не вычислять eligibility по сегодняшнему membership. Scope сохраняется с report, но **право чтения проверяется заново**.
- [ ] Eligibility v1: участник assignment с eligible_from < min(end,closes), withdrawn_at null или после opens; отозван до начала → исключён, после начала → отдельный withdrawn count и остаётся denominator с пометкой. Demo/test — server-controlled `profiles.account_kind` real/demo/test (новое поле 0032, client grant отсутствует). Legacy исключается до агрегирования. Период фильтрует назначение по opens_at; outcome до min(closes,cutoff), поздние сохранения отдельно отмечены.
- [ ] Snapshot test: запрос отчёта → новая попытка/смена членства/новая версия контента → старый готовый отчёт byte-equivalent; новый report ID учитывает новое состояние. Correction audit не переписывает старый report молча.
- [ ] Jobs lease≤60s, batch≤5, maxAttempts3, backoff30/120/600s; crashed worker возобновляет после lease, unique report completion CAS. «Готово» после атомарного сохранения snapshot result. Job payload только IDs, без child answers. Доступ только server/operator, не публичная cron без bearer проверки.
- [ ] Audit allowlist: learning.started/submitted/cancelled, membership.created/ended, teacher.assigned/revoked, assignment.published/cancelled/participant_added, content.published/quarantined, report.requested/ready/exported, privacy.requested/completed. Успешные mutations требуют event. Не сохранять «успех» из браузерного click.
- [ ] DB/unit/typecheck/lint/build, commit R01.

## R02 — Кабинет отчёта и безопасная выгрузка

**Files:** create `lib/reporting/{csv,suppression}.ts`, `lib/supabase/queries/reports.ts`, `app/[locale]/(app)/teacher/reports/[reportId]/page.tsx`, `app/api/reports/[reportId]/download/route.ts`, `components/teacher/ReportView.tsx`, `lib/reporting/{csv,suppression}.test.ts`, `tests/e2e/reports.spec.ts`; modify `messages/{ru,kk}.json`, `i18n/routing.ts`.
**Consumes:** R01 ReportRequest/PilotMetrics, D04 audience/threshold policy.
**Produces:** report UI; `getPilotReport(reportId:string): Promise<Result<PilotReport>>`, authenticated CSV download. PilotReport={id, status, startAt,endAt,cutoffAt,timezone:'Asia/Almaty',metricsVersion:'pilot-v1',metrics:PilotMetrics|null,contentVersions:string[],audience,noticeKeys:string[]}.

- [ ] Suppression tests k10: ячейка9 скрыта; schoolA9/schoolB11/total20 не раскрывают A через total−B; проверять все totals/percentages. Только фиксированный approved набор срезов; произвольные query filters запрещены. Это снижение риска, не обещание полной анонимизации.
- [ ] Teacher report показывает eligible/started/completed/pairedN и missing data; percentage без знаменателя недопустим. Не писать «улучшили ЕНТ на35%» для percentage-points gain. Authority не получает roster/email/user IDs.
- [ ] CSV: UTF-8, quoting двойных кавычек, multiline escaped, formula neutralization при первых непустых символах `= + - @`, tab/CR. Тест `=HYPERLINK(...)` остаётся текстом. Filename из server report ID/locale, не arbitrary input. Не отдавать постоянные публичные URLs.
- [ ] Download route проверяет auth + актуальный membership/scope, status ready и TTL. Headers `Cache-Control: private, no-store`, attachment; audit report.exported фиксирует разрешённую выдачу, не факт прочтения. Rate limit5/user/hour, rows≤500 для teacher, period≤90days. Читается snapshot, не full scan каждый download.
- [ ] E2E: teacherA direct-download B forbidden; teacher после revoke forbidden; expired snapshot не скачать; RU/KK одинаковые числа. Unit/DB/E2E/typecheck/lint/build; commit R02.

## R03 — Retention, отзыв, экспорт и удаление

**Files:** create `supabase/migrations/0033_privacy_lifecycle.sql`, `lib/pilot/privacy.ts`, `scripts/pilot/{privacy-request,apply-retention,reconcile-learning}.ts`, `tests/db/privacy-lifecycle.test.ts`, `docs/pilot/PRIVACY_OPERATIONS.md`, `app/[locale]/privacy/page.tsx`, `app/[locale]/terms/page.tsx`; modify `types/db.ts`, `messages/{ru,kk}.json`, footer links лендинга.
**Consumes:** D02/D04 approved policy, R01 sources/jobs.
**Produces:** privacy_requests, operator workflow, reconciliation report; публичные тексты отражают реального оператора/контур после RU/KK приёмки.

- [ ] Tests synthetic user A с memberships/sessions/attempts/AI/report/job, B unaffected. Withdraw stops new writes и school access. Delete после verified request удаляет допустимые данные/Auth, обезличивает audit actor, expires затронутые report snapshots, отменяет jobs; не удаляет чужие факты и question_versions.
- [ ] Auth API и SQL не общая транзакция: retryable state machine requested→access_revoked→data_processed→auth_deleted→completed, stable request ID. Ошибка оставляет доступ закрытым; retry продолжает. Не отмечать completed по одному SQL DELETE. Operator identity/основание в закрытом журнале.
- [ ] Export личности — только проверенному субъекту/оператору, закрытый одноразовый канал, не teacher report URL/Git artifact. Отчёты управлению образования остаются агрегированными.
- [ ] Retention policy содержит утверждённые численные дни; без approvedRef job отказывает. Dry-run counts, delete batches≤1000/time limits. Очистка receipts не снимает unique submitted session/rewards; активная pending session сохраняется до expiry/grace. Запись не возникает заново после очистки receipt.
- [ ] `reconcile-learning` read-only сравнивает v1 session totals ↔ attempts/maxScore ↔ receipt ↔ reward ledger ↔ audit. Counts/IDs закрыто оператору; не «чинит» UPDATE молча. Расхождение вызывает incident review.
- [ ] Restore test применяет deletion tombstones до открытия доступа, удалённый пользователь не воскресает. Журнал deletions тоже защищён и имеет retention. Privacy/terms без вымышленных реквизитов/гарантий принимаются оператором на RU/KK.
- [ ] Astra review state machine + tests; typecheck/lint/unit/DB/build. Commit R03; реальные удаления не выполняются в разработке.
