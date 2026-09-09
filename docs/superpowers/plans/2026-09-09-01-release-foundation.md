# 01 — Release foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Выполнять inline; делегирование только при отдельном разрешении.

**Goal:** Получить проверяемую исходную версию и безопасный стенд для следующих задач.
**Architecture:** Текущий Next.js/Supabase остаётся. Отдельная локальная или staging БД используется только для synthetic тестов; production не является тестовой фикстурой.
**Tech Stack:** Node 22, npm lockfile, Next.js, Vitest, PostgreSQL/Supabase CLI, Playwright.
**Spec:** [архитектура](../specs/2026-09-09-production-pilot-architecture.md), разделы 2, 8.

## Global Constraints

- Новые миграции; применённые SQL-файлы, `.env.local` и материалы презентации не изменяются.
- TypeScript strict; не добавлять `any`, `@ts-ignore`, двойные приведения для обхода схемы.
- Секреты, дампы, детские данные и персональные выгрузки не попадают в Git, CI artifacts, публичные preview или логи.
- Один task = отдельный проверенный commit; gate не обходится сменой модели.

## E01 — Примирить код, схему и release

**Files:** modify `docs/pilot/RELEASE.md`, `docs/production/EXECUTION_LOG.md`; интегрировать существующие изменения `codex/production-safety` без переписывания их логики. При необходимости build fix: `app/[locale]/layout.tsx`, `next.config.mjs`, `package.json`, lockfile — только после воспроизведения причины.
**Consumes:** main `9342568`, safety `68a7c23`, общий base `a97a62e` — исходные наблюдения, SHA заново проверить.
**Produces:** baseline SHA + schema evidence + стандартный build; список несовместимых rollback SHA.

- [x] Снять read-only состояние, без stage всего дерева:

```bash
git status --short
git worktree list
git log --oneline --graph --all -15
git diff --stat main...codex/production-safety
git diff --check main...codex/production-safety
```

- [ ] Выполнить `docs/pilot/check-release.sql` read-only в нужном проекте; записать проект/время/effective grants, не строки учеников. Получить через Vercel control plane действующие production alias→deployment→SHA и env key names/presence. GitHub deployments и HTTP200 — вспомогательные доказательства.
- [x] На изолированной ветке `codex/release-foundation` объединить текущие main и safety обычным merge после просмотра diff. Candidate `b9dad45`; не force-push/rebase чужую опубликованную историю; untracked pitch assets остались вне staging. Фактическая schema 0022/0023 была проверена ранее read-only, миграции в этом task не применялись.
- [ ] Запустить `npm ci --legacy-peer-deps` на Node22, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. Локально candidate прошёл typecheck/lint/485 tests и diagnostic webpack build; standard Turbopack build заблокирован execution environment после подтверждённой доступности Google Fonts. Получить стандартный build в CI; не менять build-команду молча на webpack. Исходники шрифтов/типизации не менялись.
- [ ] Подготовить reviewed diff для конкретного remote/PR. Existing Verify запускается на **PR и push main**, а не на произвольный branch push. До публикации проверить конкретный payload на секреты/закрытые материалы. Предыдущий push был отклонён automatic approval review; не повторять его косвенно.
- [ ] Записать результаты и commit только E01. Если production всё ещё несовместим с 0023, подготовить минимальный совместимый выпуск по runbook раньше функциональных изменений. Отсутствие доступа к alias/CI фиксировать `blocked evidence`, а локальную подготовку продолжать; весь E01 пока не done.

**Acceptance:** стандартный build принят на baseline; нет предположений «секрет отсутствует» из ошибочного парсера; конкретные deployment/scheme gates известны. Никаких пользовательских записей ради этой проверки.

## E02 — Реальные тесты БД и браузера

**Files:** create `supabase/config.toml` если отсутствует; `vitest.db.config.ts`, `playwright.config.ts`, `tests/db/helpers.ts`, `tests/db/baseline.test.ts`, `tests/e2e/helpers.ts`, `tests/e2e/auth.spec.ts`; modify `vitest.config.ts`, `package.json`, lockfile, `.github/workflows/verify.yml`, `.gitignore`.
**Consumes:** E01 schema baseline.
**Produces:** команды `test:db` и `test:e2e`; harness, который последующие планы используют.

Контракт `tests/db/helpers.ts`:

```ts
type TestActor = { id: string; email: string; password: string; accessToken: string };
type DbResponse = { status: number; data: unknown };
export type DbHarness = {
  actor(label: string): Promise<TestActor>;
  rest(actor: TestActor | null, path: string, init?: RequestInit): Promise<DbResponse>;
  rpc(actor: TestActor | 'service', name: string, args: Record<string, unknown>): Promise<DbResponse>;
  scalar<T extends string | number | boolean | null>(sql: string, params?: unknown[]): Promise<T>;
  close(): Promise<void>;
};
export function createDbHarness(): Promise<DbHarness>;
```

`scalar` — только локальный test DB connection, не production admin endpoint. `actor` создаёт синтетическую Auth учётку через **локальный** admin API, логинится паролем и получает реальный JWT; метки уникальны на run. Отдельно `tests/e2e/helpers.ts` экспортирует `loginAs(page, actor)` через поддерживаемый тестовый вход на local/staging, без production backdoor/route; fixture cookies устанавливаются из локального Supabase session, проверка OAuth проводится ручным P01.

- [ ] Добавить guard до соединения: URL разрешён только loopback/local Supabase; remote staging требует явного allowlisted project ref и подтверждённого `APP_ENV=staging`; production ref `euypaocjzcqlapfilrak` всегда запрещён для harness. Проверить отказ на production URL **до** сетевого вызова.
- [ ] Добавить dev-only зависимости Playwright и `pg`/`@types/pg`, фиксировать lockfile. Определить scripts: `test:db = vitest run --config vitest.db.config.ts`, `test:e2e = playwright test`. Обычный Vitest не подхватывает DB/E2E suite. Не ставить плавающую CLI версию в CI; выбрать совместимую Supabase CLI и записать pin в workflow.
- [ ] Написать и запустить первый integration test:

```ts
it('does not expose another user profile through real REST', async () => {
  const a = await db.actor('a');
  const b = await db.actor('b');
  const response = await db.rest(a, `/profiles?id=eq.${b.id}&select=id`);
  expect(response.status).toBe(200);
  expect(response.data).toEqual([]);
});
```

- [ ] Собрать чистую локальную схему из последовательности миграций; сначала сравнить inventory, не запускать `run_all.sql` как доказательство полной актуальности. На hosted проекте без ledger — отдельная reconciled baseline процедура, не `db reset`. CI с Docker поднимает локальную Supabase, seed synthetic, запускает DB/E2E, останавливает в finally.
- [ ] E2E: RU/KK гостевой login, защищённый dashboard, A logout → B login, callback redirect hostile next не выходит на внешний домен. Проверить тест при преднамеренно ослабленной **локальной fixture policy**, затем восстановить: harness действительно обнаруживает утечку.
- [ ] Выполнить typecheck/lint/unit/build + новые suites. В артефактах только synthetic screenshots, без JWT/паролей; raw network tracing с auth headers не публиковать. Commit E02.

**Acceptance:** тесты запускаются одной документированной последовательностью на чистой машине/CI; настоящие роли, не только in-memory mock. Docker/доступность runtime — реальная зависимость, не fake PASS.

## E03 — Repo, secrets и защищённый выпуск

**Files:** `.github/workflows/verify.yml`, create `.github/workflows/security.yml`, `.github/CODEOWNERS`, `SECURITY.md`, `.env.example`; modify `.gitignore`, `docs/production/RELEASE_RUNBOOK.md`.
**Consumes:** D01, E01, [security model](../../production/SECURITY.md).
**Produces:** конкретная конфигурация доступа/CI и release evidence; имя repository не меняется.

- [ ] Проверить tracked paths и всю доступную git history redacted secret scanner (например, pinned Gitleaks). Не выводить совпавшие values; сохранить только тип/путь/commit ID в закрытый локальный результат. Проверить .env, tokens, service keys, SQL dumps, test artifacts, copyrighted seeds и source maps. `forks_count=0` не исключает чужие clones.
- [ ] Если найден настоящий секрет — остановить его публикацию, подготовить rotation конкретного provider/env, проверить новый ключ, отозвать старый, проверить отказ старого. Переписывание истории не заменяет ротацию; его делать только отдельным разрешённым действием после review.
- [ ] `.env.example` только names и фиктивные безопасные placeholders значений; пример build не обращается в production. Разделить Development/Preview/Production env. Fork PR выполняет проверки без production secrets; запретить `pull_request_target` с checkout недоверенного кода. Workflow `permissions: contents: read`, минимальные отдельные права deployment job, actions pin SHA с обновлением Dependabot.
- [ ] Проверить GitHub тариф: доступны ли required checks/branch protections для private repo. Где доступны — запрет force push main, required Verify и review перед prod; если недоступны — явный документированный ручной gate либо согласованный upgrade, не фиктивное «защита включена». CODEOWNERS указывает существующего ответственного аккаунта после D01, не вымышленную команду.
- [ ] Смена visibility после конкретного согласованного действия: проверить Vercel App Selected repositories, владелец personal User, тариф, commit author linkage; затем private и контрольный безвредный preview/CI. GitHub Free private organisation → Vercel Hobby не поддерживается; текущий repo personal, но перенос в org проверяется отдельно. Не переносить repo в org ради этого task.
- [ ] Проверить 2FA/recovery у владельцев GitHub/Vercel/Supabase, минимум collaborators, preview protection, Git artifacts retention. Сохранить только статусы, не backup codes. Выпустить E03 commit; внешние настройки перечислить отдельно от commit.

**Acceptance:** private repo при выбранном D01 продолжает deployment с нужными правами; secret scan не содержит открытых утечек; public исходник также безопасен по grants/secret rules. `package.json private:true` защищает npm publish, не GitHub visibility.
