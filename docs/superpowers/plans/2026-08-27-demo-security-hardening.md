# Demo Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подготовить AlemPrep к завтрашнему live demo: закрыть критические обходы доверия к клиенту, усилить HTTP-защиту и дать ведущему готовый сценарий питча и чек-лист запуска.

**Architecture:** Сервер сам пересчитывает правильность ответа, а новые SQL-миграции ограничивают изменение привилегированных полей и счётчиков AI. HTTP-заголовки добавляются централизованно через Next.js. Операции, доступные только в Supabase Dashboard, оформляются как короткий ручной runbook без автоматического изменения удалённого проекта.

**Tech Stack:** Next.js 15, TypeScript strict, Vitest, Supabase Postgres/Auth/RLS.

**Spec:** `/Users/macbook/Desktop/alemprep/AGENTS.md` и запрос пользователя от 2026-08-27; пункт 8 (отключение регистрации) исключён.

## Global Constraints

- Не изменять `.env.local`, старые применённые миграции, `app/globals.css` и `tailwind.config.ts`.
- Новые изменения схемы делать только новыми файлами в `supabase/migrations`.
- Не отключать регистрацию пользователей.
- Не заявлять, что миграция применена к удалённой Supabase, пока это не подтверждено отдельно.
- Перед завершением должны пройти `npm run typecheck`, `npm run lint`, релевантные тесты и `npm run build`.
- Существующие untracked-файлы пользователя не изменять без необходимости.

---

### Task 1: Server-authoritative practice scoring and profile privilege hardening

**Files:**
- Modify: `lib/supabase/practice-actions.test.ts`
- Modify: `lib/supabase/practice-actions.ts`
- Modify: `components/practice/PracticeView.tsx`
- Create: `supabase/migrations/0020_profile_privilege_hardening.sql`

**Interfaces:**
- Consumes: existing `scoreAnswer`, `QUESTION_POINTS`, authenticated Supabase server client.
- Produces: `recordAttempt({ questionId, givenAnswer, timeSpentMs })` whose stored `is_correct` and XP are derived server-side.

- [ ] Add a failing test proving a forged client correctness flag cannot award XP or store a correct attempt.
- [ ] Run the focused test and confirm the failure.
- [ ] Fetch the question server-side and derive correctness before writing the attempt/profile.
- [ ] Remove the client-owned correctness input and update callers.
- [ ] Add a migration that prevents authenticated users from updating `profiles.is_admin` while retaining required profile-field updates.
- [ ] Run the focused tests and TypeScript checks.

### Task 2: AI quota mutation hardening

**Files:**
- Create: `supabase/migrations/0021_ai_quota_hardening.sql`
- Modify: `lib/supabase/assistant-actions.test.ts`
- Modify: `lib/supabase/assistant-actions.ts`
- Modify: `lib/supabase/testing/in-memory-db.ts`

**Interfaces:**
- Consumes: authenticated user ID, current usage date, existing daily/global limits.
- Produces: an atomic per-user quota-consumption RPC; global counter mutation executable only by trusted server credentials.

- [ ] Add failing tests for atomic quota consumption and denied over-limit behavior.
- [ ] Add a SECURITY DEFINER quota RPC bound to `auth.uid()` and revoke direct user writes to `ai_usage`.
- [ ] Restrict the global increment RPC to trusted server credentials.
- [ ] Update the server action and in-memory test adapter to use the new quota interface.
- [ ] Run focused tests and TypeScript checks.

### Task 3: HTTP security headers

**Files:**
- Modify: `next.config.mjs`

**Interfaces:**
- Produces: baseline security headers for every route without changing product behavior or OAuth routes.

- [ ] Add `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, and production HSTS headers through `headers()`.
- [ ] Avoid a brittle last-minute CSP that could break Next.js, OAuth, KaTeX, or Supabase connections.
- [ ] Run config/build verification.

### Task 4: Pitch and live-demo runbook

**Files:**
- Create: `docs/DEMO_PITCH.md`
- Create: `docs/DEMO_RUNBOOK.md`

**Interfaces:**
- Produces: a 5–7 minute Russian pitch script, demo route, likely Q&A, manual Supabase checklist, backup plan, and friend-laptop rehearsal checklist.

- [ ] Write an honest pitch around problem, solution, live flow, differentiation, security, roadmap, and ask.
- [ ] Add exact pre-demo and emergency-fallback steps, including Backup/Export and Security Advisor.
- [ ] Explicitly keep signups enabled and note that platform MFA is already enabled.

### Task 5: Integration verification and review

**Files:**
- Review all changed files from Tasks 1–4.

**Interfaces:**
- Produces: verified local release candidate plus an explicit list of remaining dashboard-only and architectural risks.

- [ ] Review diffs for scope, conflicts, and secret leakage.
- [ ] Run focused tests, full tests, typecheck, lint, and build.
- [ ] Perform a final security/code review and resolve critical findings.
- [ ] Report what is implemented locally, what still requires Supabase Dashboard action, and what is intentionally deferred.
