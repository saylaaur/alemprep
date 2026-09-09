# 04 — Schools and teachers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Учитель управляет своими группами и назначениями; школа не видит чужих участников.
**Architecture:** DB memberships и scoped RPC, immutable assignment participants snapshot, существующая learning transaction расширяется проверкой участия.
**Tech Stack:** PostgreSQL/RLS, Next Server Actions/Components, next-intl, Vitest/Playwright.
**Spec:** [архитектура](../specs/2026-09-09-production-pilot-architecture.md), §§5.2,9.

## Global Constraints

- Учитель имеет доступ только к закреплённым группам; назначить себе роль через браузер нельзя.
- RU/KK: ключи сообщений в паритете, контент пилота принят человеком по математике и казахскому языку.
- Проверка схемы/прав и конкурентных записей проходит на реальном PostgreSQL с ролями `anon`, `authenticated`, `service_role`.

## S01 — Школы, роли, приглашения

**Files:** create `supabase/migrations/0029_schools_and_access.sql`, `lib/pilot/{contracts,access,repository}.ts`, `lib/supabase/pilot-actions.ts`, `scripts/pilot/provision-school.ts`, `tests/db/school-access.test.ts`, `tests/fixtures/schools.ts`; modify `types/db.ts`.
**Consumes:** L04 закрытые client writes, E02 DbHarness.
**Produces:** schools/memberships/groups/group_teachers/invites из spec; серверные functions:

```ts
type CreateGroupInput = {operationId:string; schoolId:string; name:string; locale:'ru'|'kk'};
type InviteInput = {operationId:string; groupId:string; expiresInHours:24|72; maxUses:number};
type JoinInput = {operationId:string; token:string};
// Result<T> из lib/learning/contracts, auth actor определяется внутри:
createGroup(input: CreateGroupInput): Promise<Result<{groupId:string}>>;
createGroupInvite(input: InviteInput): Promise<Result<{inviteId:string; token:string; expiresAt:string}>>;
joinGroup(input: JoinInput): Promise<Result<{groupId:string}>>;
revokeGroupInvite(input: {operationId:string; inviteId:string}): Promise<Result<{revoked:true}>>;
```

- [ ] Tests `seedSchoolPair(db)` → `{schoolA,schoolB,teacherA,teacherA2,teacherB,studentA,studentB,groupA,groupB}`. A2 не закреплён к groupA. В db policy/mutation tests teacherA не читает B, A2 не читает индивидуальное A, студент не видит roster.
- [ ] Создать schema + RLS до UI. Membership helpers для SELECT policies не должны вызывать рекурсию memberships RLS; маленькие SECURITY DEFINER boolean helpers с фиксированным search_path проверяют `auth.uid()` внутри, не принимают произвольный actor; EXECUTE только нужной роли, no dynamic SQL. Privileged mutation RPC — только service_role и отдельные scope checks.
- [ ] Создание school/первого coordinator только CLI `provision-school` с dry-run, required actor operator ID, allowlist администраторов из защищённого server config, action audit. Не использовать `profiles.is_admin` как автоматический school-superuser. Самоназначение teacher/coordinator по metadata запрещено.
- [ ] Invite: crypto random bytes≥16, base64url, хранить SHA-256 токена; проверка и increment uses под row lock одной транзакцией. Максимум maxUses100; expires1..72h; revoke мгновенный. Invite даёт только student membership; не повышает уже существующую роль. Предлагаемый pilot default — одна активная school membership ученика; cross-school join → forbidden до операторского перевода с историей.
- [ ] Проверить 20 параллельных join при maxUses1: ровно один новый участник. Повтор того же пользователя/operation возвращает прежний успех без расхода uses. Role revoke и join гонки корректны. Токен не попадает в error logs/referrer analytics, join page no-store и Referrer-Policy no-referrer.
- [ ] Typecheck/lint/unit/DB/build, commit S01. Production provision без данных/решения D02–D04 не запускать.

## S02 — Назначение и серверное участие

**Files:** create `supabase/migrations/0030_school_assignments.sql`, `lib/pilot/assignments.ts`, `tests/db/assignments.test.ts`; modify `lib/learning/{service,repository}.ts`, `lib/supabase/pilot-actions.ts`, `types/db.ts`.
**Consumes:** S01 scope, C01 approved programs, L02 RPC.
**Produces:** assignments/assignment_participants; sessions.assignment_id + school_membership_id; `publishAssignment`, `cancelAssignment`, `addAssignmentParticipant`.

```ts
type PublishAssignmentInput = {
  operationId:string; groupId:string; programId:string;
  purpose:'practice'|'baseline'|'endline'; opensAt:string; dueAt:string; closesAt:string;
  comparisonBaselineId?:string;
};
publishAssignment(input: PublishAssignmentInput): Promise<Result<{assignmentId:string; participants:number}>>;
cancelAssignment(input: {operationId:string; assignmentId:string; reason:'content-error'|'schedule-change'}): Promise<Result<{cancelled:true}>>;
addAssignmentParticipant(input: {operationId:string; assignmentId:string; membershipId:string}): Promise<Result<{added:true}>>;
```

- [ ] DB tests teacherA assign groupB rejected; wrong language/unapproved program rejected; opens>due/closes or >90day period invalid; duplicates same operation return same assignment; participant count from eligible membership snapshot, не браузерного массива userIds.
- [ ] Publish RPC одной транзакцией фиксирует assignment, participants, audit `assignment.published` и receipt. Ограничить имя group120симв, датыISOвалидные, purpose enum, teacher scope и school.active под lock. Новых учеников не добавлять задним числом автоматически — explicit add с audit и eligible_from; ушедшие withdrawn_at сохраняют исторический denominator по metrics policy.
- [ ] В start_learning/commit_learning добавить проверку assignment group/school, opens/closes и участника. Не менять опубликованную исходную миграцию 0025: replace functions в **новой 0030**. Student не передаёт school_id. Sessions привязаны к конкретному membership на start; смена locale не меняет закреплённые questions.
- [ ] Baseline/endline: один активный/принятый session на (assignment,user), уникальность enforced SQL; retry start не создаёт дубль. Practice повторяемая, rewards ограничены L02. Late submit между dueAt и closesAt сохраняется с late признаком из server time; после closes reject. Deadline не зависит от browserclock.
- [ ] Endline требует comparisonBaselineId уже опубликованного baseline той же group/program; baseline/purpose practice запрещают поле. Ссылка фиксируется при publish и не меняется после сдач. Это точная пара отчёта R01, не поиск «последней диагностики пользователя» по всей истории.
- [ ] Tests concurrent cancel/submit, membership revoke/submit: действие имеет определённый порядок под scope lock, после завершённого revoke новый submit не проходит. Finished record не стирается; поведение cancelled active session понятное UI error.
- [ ] DB/unit/typecheck/lint/build, commit S02.

## S03 — Кабинет учителя и ученические назначения

**Files:** create `app/[locale]/(app)/teacher/{layout,page}.tsx`, `app/[locale]/(app)/teacher/groups/[groupId]/page.tsx`, `app/[locale]/(app)/teacher/assignments/[assignmentId]/page.tsx`, `app/[locale]/(app)/assignments/page.tsx`, `app/[locale]/join/[token]/page.tsx`, `components/teacher/{GroupList,AssignmentForm,AssignmentRoster}.tsx`, `lib/supabase/queries/pilot.ts`, `tests/e2e/teacher.spec.ts`; modify `components/layout/nav-items.ts`, `proxy.ts`, `i18n/routing.ts`, `messages/{ru,kk}.json`.
**Consumes:** S01/S02 actions, scoped query DTO.
**Produces:** `getMyTeachingGroups(): Promise<GroupSummary[]>`, `getAssignmentRoster(assignmentId: string,cursor?:string): Promise<Page<RosterRow>>`, `getMyAssignments(): Promise<StudentAssignment[]>`.

Types в `lib/pilot/contracts.ts`: Page<T>={items:T[];nextCursor:string|null}; GroupSummary={id:string;name:string;locale:Locale;studentCount:number}; StudentAssignment={id:string;title:string;dueAt:string;state:'assigned'|'started'|'submitted'}; RosterRow={participantRef:string;displayName:string;state:'assigned'|'started'|'submitted'|'withdrawn';score:number|null;maxScore:number|null;acceptedAt:string|null}. Email/Googleavatar не нужны в roster.

- [ ] Сначала scoped DB query tests: limit≤50, deterministic ID keyset; teacher scopes из DB, params очищаются; invalid чужой resource → одинаковый not-found без раскрытия существования.
- [ ] Server Components читают готовый DTO; Client только form/filter/copy invite. Учитель видит группы, форму принятой программы, dates с Asia/Almaty, участников и проблемы. Не строить общий admin dashboard или новую design system.
- [ ] Join сохраняет target locale/route через login безопасным auth redirect helper. Токен только по allowlisted пути, не открытому URL из query. UI показывает группу после проверки invite; не выдаёт список участников до входа. Expired/revoked показывают понятное сообщение RU/KK.
- [ ] Ученику — назначенное, срок, подтверждённый статус. Teacher nav показывается по server role; спрятанная nav не единственная защита. Layout/server actions/query отдельно проверяют доступ. Не кешировать roster между teacher ID.
- [ ] E2E RU/KK: teacher creates assignment → student joins → answers → teacher reload sees submitted. Проверить empty states, ошибку сети, disabled double-submit, телефон360px, keyboard focus. Не делать оптимистичный «сдано» до receipt.
- [ ] Typecheck/lint/unit/DB/build/E2E, commit S03.

## S04 — Полная проверка школьной изоляции

**Files:** create `tests/db/pilot-isolation.test.ts`, `tests/e2e/pilot-isolation.spec.ts`; update `docs/production/EXECUTION_LOG.md` и точечные исправления выявленных файлов отдельным task scope.
**Consumes:** S03 full path.
**Produces:** acceptance matrix guest/student A/student B/teacher A/teacher A2/teacher B/coordinator A/content-admin.

- [ ] Для каждой роли проверить REST table/view/RPC и actions: school details, group roster, invite, assignment create/cancel, own/foreign session, report links, role changes. Положительные случаи обязательны: полностью закрытая сломанная функция не считается безопасной.
- [ ] Browser attempt изменить URL/hidden input/schoolId/userId, повторить после revoke в другой вкладке. Старый HTML/browser cache не отдаёт fresh данные; новая server операция закрыта немедленно после revoke commit.
- [ ] Проверить orphan transfer: участник удалён из группы, приглашён снова, переведён в другую школу; историческая attribution не меняется и старый teacher не получает результаты новой школы. Admin service query обязан иметь scope даже при BYPASSRLS.
- [ ] Независимое ревью Astra: migrations + effective grants + cross-school tests + failed cases. Исправить P0/P1, повторить только затронутую матрицу и quality gates. Commit S04, не отмечать пилот запущенным.
