# 07 — Operations and security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ограничить злоупотребления/расходы и доказать восстановление после отказа.
**Architecture:** Серверные флаги, транзакционные лимиты, bounded jobs и запросы, обезличенная диагностика, отдельные backup/restore. Продукт сохраняет основной урок при отказе optional функций.
**Tech Stack:** PostgreSQL, Next.js, existing AI adapter, Playwright load generator, provider metrics.
**Spec:** [архитектура](../specs/2026-09-09-production-pilot-architecture.md), §§5.3,10–11.

## Global Constraints

- AI и Desmos для школьного контура выключены до отдельных допусков. Сейчас это требование, а не реализованный флаг.
- Секреты, дампы, детские данные и персональные выгрузки не попадают в Git, CI artifacts, публичные preview или логи.
- Проверка схемы/прав и конкурентных записей проходит на реальном PostgreSQL с ролями `anon`, `authenticated`, `service_role`.

## O01 — Feature flags, входные лимиты и бюджеты

**Files:** create `supabase/migrations/0031_pilot_operation_limits.sql`, `lib/operations/{flags,limits}.ts`, `tests/db/operation-limits.test.ts`, `lib/operations/flags.test.ts`; modify `lib/supabase/assistant-actions.ts`, learning/pilot services, `lib/server/config.ts`, `types/db.ts`, `next.config.mjs`.
**Consumes:** E02, L03, S02. Полную задачу выполнить до R01/R02; они подключают уже готовый export limit/flag. Маленький global AI-off config commit разрешён раньше, без преждевременной 0031 на отсутствующих таблицах.
**Produces:** `getFeatureAccess(actorId:string):Promise<{learningWrites:boolean;teacherExports:boolean;ai:boolean;desmos:boolean}>`; `consumeLimit({actorId,schoolId,action,operationId}):Promise<{allowed:boolean;retryAfterMs:number}>`. Actor/school создаются доверенным сервисом, не payload.

- [ ] Flags default false для AI/Desmos; AI direct action в school scope отклонён до quota/provider call. Test env API key set + AI false → mock provider вызван0. LearningWrites при config-store outage fail closed для новых writes, но retry already committed receipt доступен. Content read и pending сохраняются.
- [ ] Starter quotas per-user: start30/min, submit60/min, join10/hour, content report10/day, export5/hour; per-school start/submit600/min при N60. Повторы **уже принятого operationId** не повторяют бизнес-write и не тратят business quota; общий HTTP abuse limit учитывает их. IP — дополнительный мягкий signal, школьный NAT не должен блокировать60 учеников.
- [ ] Atomic UPSERT rate bucket, fixed window с окном/RetryAfter; ограничить ключи action enum, TTL очистки2days, длину scope hash. Не создавать бесконечно labels/rows по произвольному URL/client schoolId. Test конкурентные101 вызов при limit100 → allowed≤100 и rest denied.
- [ ] AI если включается вне школы: before-provider reservation общей daily money/token upper bound, индивидуальная quota и atomic reconcile после ответа; max tokens fixed, timeout, не более одного ограниченного retry. Ошибка global budget store → provider не зовётся. Незавершённая reservation освобождается только по безопасному правилу, которое не допускает новый расход поверх уже оплаченного unknown outcome. Для пилота AI остаётся off; не тратить токены ради load tests.
- [ ] Payload64KiB, arrays80, query ranges/pages≤spec; одинаковые проверки transport/service/RPC где применимо. Next allowed origins берутся из документированных trusted hosts; не `*`. CSP сначала report-only на synthetic, проверить Next inline nonce, KaTeX и условный Desmos, затем enforced без unsafe произвольных domains. HSTS/preload не распространять на неподготовленные домены.
- [ ] Typecheck/lint/unit/DB/build + no-provider-call test. Commit O01; paid WAF/plan upgrade не выполняется автоматически.

## O02 — Метрики, здоровье и реагирование

**Files:** create `lib/operations/{telemetry,health}.ts`, `app/api/health/route.ts`, `scripts/pilot/synthetic-smoke.ts`, `lib/operations/telemetry.test.ts`, `docs/pilot/INCIDENTS.md`; instrument learning/report actions, existing error boundary.
**Consumes:** O01 flags/limits.
**Produces:** `recordOperationMetric({action,outcome,durationMs,requestId,release})`; request ID коррелирует sanitized event, не хранит ответы.

- [ ] Allowlist action/outcome labels, bounded release hash; metrics не используют userID/email/IP как label. Errors: internal safe code + request ID; не SQL params/HTTP bodies. Test payload с bearer/cookie/email/answer marker никогда не появляется в output logger.
- [ ] Health public возвращает только up/degraded и release identifier; не connection string/SQL/version topology. Глубокая DB check только protected operator smoke, bounded query timeout2s, rate≤1/min. Public health не запускает expensive scans или creates accounts.
- [ ] Метрики: accepted submit count/error rate/p50/p95/p99, duplicate retries, denied writes, DB lock timeout, auth failures, report queue age, backup age, last restore date, daily cost/egress. Business audit без sampling, operational repetitive errors sampled/aggregated с подсчётом.
- [ ] Стартовые тревоги: save errors>1% при≥20 операциях за5min; p95>3s5min; нет synthetic success5min в окно урока; backup age>26h при daily policy; jobs age>10min. Низкий трафик учитывает absolute repeated errors, не деление на0. Контакт и quiet hours D06; не отправлять сообщения без разрешения.
- [ ] Runbook incidents: data exposure/integrity violation → остановка школьных writes/набора, сохранить evidence IDs, scope, timestamp; DB outage → pending + резервный урок; Desmos/AI outage → module off; budget threshold → exports/AI suspend, learning priority. Код flag доступен только operator scope, изменение аудируется.
- [ ] Tests sanitization/health + typecheck/lint/build. Commit O02; external monitor activation owner D06.

## O03 — Нагрузка, планы запросов и ёмкость

**Files:** create `scripts/load/{pilot,scenarios,verify-results}.ts`, `docs/pilot/CAPACITY.md`; индексы только новой `supabase/migrations/0034_measured_query_indexes.sql` при измеренной необходимости; query modules по профилю.
**Consumes:** L04/S04/R02/U01/O02; production-equivalent synthetic staging.
**Produces:** evidence N60/2N120, request/DB/cost budget, ограничение пилота реальным принятым N.

- [ ] Load script отказывает production origin/project; секреты/JWT не пишет в output. Использовать Playwright independent authenticated contexts и реальные server action формы/кнопки текущего build; не выдумывать стабильный Next-Action ID. Один synthetic actor на участника, два school scope. При необходимости два генератора; CPU/network генератора<70% и error metric отдельно, чтобы не измерять его bottleneck.
- [ ] Сценарии: 5min ramp0→N, 30min steady N (answer раз в15–30s), synchronized start/finish burst, 10min2N; teacher polls≤1/30s плюс2 export jobs. Затем single-N45min soak при DB data volume эквиваленте4недель: E≈students×questionsPerLesson×lessons, seed multiplier10 для роста. Все данные synthetic.
- [ ] Fault cases: HTTP response lost after commit, 20 same-operation retries, teacher export одновременно с classroom submit, DB timeout, provider429/Desmos blocked, login burst за одним NAT. Проверять **семантический receipt**, Next action HTTP200 с error не success.
- [ ] После прогона verify-results сопоставляет unique accepted receipts с attempts/audit/rewards. Ожидание zero lost confirmed, zero duplicate reward, zero cross-school rows. N: success≥99.5%, p95≤2s/p99≤5s; 2N допускает понятные429/pending, но не corruption. Операции отказа validation не входят в valid-write success denominator.
- [ ] Снять EXPLAIN ANALYZE BUFFERS на synthetic для roster/report/session submit/content counts; запросы пагинированы, foreign keys индексированы, timeout/batch limits соблюдены. Учитывать PostgREST row cap, не считать первые1000 всем банком. Нет безлимитных count-fetch-all в браузере.
- [ ] CAPACITY: SHA/schema, DB/provider tier, N, request mix, p95/error/locks/connections, объём аудита/backup/egress, расходы и ограничения. Если N не пройден — исправить bottleneck или ограничить расписание/пик, не писать «сервер выдержит». Typecheck/lint/tests/build для кода; commit O03.

## O04 — Backup, восстановление и rollback

**Files:** create `docs/pilot/RESTORE_REHEARSAL.md`, `scripts/pilot/verify-restore.ts`; update `docs/production/RELEASE_RUNBOOK.md`, `docs/pilot/OPERATIONS.md`.
**Consumes:** D02/D05, O03, R03 deletion lifecycle.
**Produces:** фактически восстановленная изолированная копия и измеренные RTO/RPO, документированный compatible rollback.

- [ ] Инвентаризация backup: schema/data/Auth identities и configuration, content media, storage, env/keys в защищённом менеджере, SQL functions/grants, migration checksums. Managed DB backup не считать автоматической копией всех storage blobs/OAuth secrets. Восстанавливаемость каждой категории проверить по выбранному provider.
- [ ] Backup encrypted, отдельный доступ/учётка от runtime, принятый регион/retention. Daily schedule + alarm отсутствия копии; PITR и уменьшение RPO только после согласованного тарифа/испытания. В Git хранить metadata результата, не dump.
- [ ] Restore в изолированный target: запрет уведомлений/AI/webhooks, **до открытия** применить deletion tombstones; проверить counts/checksums, authenticated grants, synthetic login, trusted submit, teacher isolation, report golden values. Копию реальных данных не выдавать девелоперу на laptop как fixture.
- [ ] Симулировать fail midway job/transaction и восстановление lease; accepted операции не начисляются снова. Проверить cookie/session invalidation при Auth ключах/новомhost. Измерить время от обнаружения до готовности и фактически потерянный interval.
- [ ] Приложение rollback на последний проверенный compatible SHA; migration schema не откатывать вслепую, restore теряет записи после copy time. Если нет безопасного rollback — maintenance/read-only и forward fix. Записать это как limitation, не fake rollback кнопка.
- [ ] Astra review evidence; commit O04. G6 закрыт только после реального восстановления, а не инструкции на бумаге.
