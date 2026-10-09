# Pilot launch readiness implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` task by task. Owner delegated planning, implementation, release and verification; do not ask to continue between tasks.

**Goal:** Finish the existing RU/KK self-study product for a controlled two-school pilot and leave one reproducible launch checklist.
**Architecture:** Retain server-issued immutable practice, server grading and scoped teacher RPCs. Add read-only operational evidence and authenticated report downloads; rehearse concurrency on the isolated local stack. School admission is recorded separately from software deployment.
**Tech Stack:** Next.js 16.3.8, React 19, Supabase/Postgres, next-intl, Vitest, Playwright.
**Spec:** `docs/pilot/PILOT_LAUNCH.md` is the current operational specification and status; historical September/early October plans remain history.

## Global constraints

- Preserve applied migrations 0001–0040, `.env.local`, theme tokens and released content snapshots.
- No paid APIs, purchases, outgoing messages or invented school/teacher identities.
- Pilot is mathematics topic practice in RU/KK, with teacher observation and graphs. Full exams/diagnostics/weekly remain hidden by `PILOT_TOPICS_ONLY=true`.
- Existing owner exception permits AI-reviewed selected content; never label it human reviewed.
- Existing KaTeX/Tailwind major-upgrade deferral remains in force.
- Hosted inventory is read-only and uses explicitly supplied credentials without logging them. Synthetic writes/load target loopback only.
- A browser handoff blocked by a locked Mac does not block independent coding/local/API work.
- First group starts with 10–20 pupils with a person on call. This is an operational cap, not a production capacity measurement.

## Evidence at start

Main `c5b535a` deployed successfully, RU/KK public pages HTTP 200. PR #37 CI: 1081 unit,158 DB,6 migration,36 browser passes. Read-only hosted snapshot 09.10: 90 RU+89 KK approved versions; 0 schools/groups/memberships. Missing native Chrome access: Mac locked. OAuth audience and hosted teacher rehearsal remain unverified. One legacy approved RU source is excluded from KK for ambiguous sum notation; prepare a reversible quarantine transaction rather than silently rewrite it.

## Review focus

- An expired/revoked teacher cannot download another pupil's report, even with a copied URL.
- Exported names beginning with spreadsheet formulas, quotes or newlines remain plain cells.
- An empty or unreadable approved bank must not yield a green readiness result; legacy published count is not approved coverage.
- Twenty pupils submitting concurrently and retrying the same operation do not inflate teacher counts or rewards.
- Missing school bindings and real-device/OAuth rehearsal are reported as pending rather than silently treated as passed.

### Task 1: Reproducible read-only pilot inventory

Files: `scripts/pilot/check-readiness.ts`, `scripts/lib/pilot-readiness.ts`, `scripts/lib/pilot-readiness.test.ts`, `package.json`.
Interface: `summarizePilotInventory(input: PilotInventory): PilotReadiness`, returning approved-family counts by locale/topic and explicit school-binding warnings. CLI reads only approved public snapshots, topic metadata and bounded membership counts. JSON contains no pupil rows, email, answer keys or secrets.

- [x] Write tests: empty approved bank fails; duplicated family versions counted once and warned; RU-only topic flagged; zero bindings reports pending; malformed rows/read failures fail closed.
- [x] Run `npm test -- scripts/lib/pilot-readiness.test.ts`, observe failure before implementation.
- [x] Add strict schemas, pure summary and read-only adapter; require `--project-ref=euypaocjzcqlapfilrak` for hosted use, support explicit `--env-file`, emit redacted errors.
- [x] Run focused tests and typecheck/lint; run hosted inventory once and save aggregate JSON privately. Commit.

### Task 2: Teacher report download

Files: `lib/teacher/export.ts`, `lib/teacher/export.test.ts`, `app/[locale]/(app)/teacher/groups/[groupId]/export/route.ts`, route tests, group page, `messages/ru.json`, `messages/kk.json`.
Interface: `buildTeacherCsv(roster: TeacherRoster, reportId: string, labels: TeacherExportLabels): string`. Route consumes existing `getTeacherRoster(groupId)` under caller authentication on every download. No admin data reader or schema change.

- [x] Test names with `=`, `+`, `-`, `@`, tabs/newlines and quotes; empty/no-score versus zero-score. Test route 401/404/503 and valid CSV with private no-store headers.
- [x] Run failing tests; implement escaping/BOM, report UUID, RPC as-of time, 30-day period, timezone and metric version, plus localized export link.
- [x] Add browser download scenario: own teacher gets CSV with known counts; pupil/foreign/revoked teacher cannot download. Keep test fixtures local and disposable.
- [x] Run focused unit/typecheck/lint/browser verification. Commit.

### Task 3: Two-school concurrency rehearsal

Files: `tests/db/pilot-readiness.test.ts`, optionally shared local fixture only if needed.
Uses guarded `createDbHarness`, `seedPilotSchoolPair`, existing start/submit/state/replay clients. Create 20 synthetic pupils across two groups, RU/KK paired task versions with one family. Issue, submit and retry in parallel; read both teacher dashboards.

- [x] Assert 20 sessions/accepted attempts, identical retry receipts, first-family scores not doubled, 10 active pupils per school, no cross-school pupils or answer-key leakage. Record local timings; do not advertise hosted throughput.
- [x] Run focused DB test, inspect failures and fix actual product defects with RED→GREEN tests if found.
- [x] Commit verified test and aggregate evidence.

### Task 4: Launch/operations package and release

Files: `app/[locale]/page.tsx`, matching `pilotLanding` messages, mobile landing regression, exact data quarantine SQL/test, `docs/pilot/PILOT_LAUNCH.md`, `docs/pilot/START_FIRST_CLASS.md`, `docs/pilot/LAUNCH_2026-10-06.md`, `docs/production/README.md`, `TASKS.md`, `docs/production/EXECUTION_LOG.md`.

- [x] Replace active status entries with current approved coverage and deployed SHA; link historical status to canonical launch file.
- [x] Provide pupil/teacher quick guides, school intake fields, 14-day pilot schedule, success metrics, reporting limits, incident/stop checklist, compatible rollback and backup/restore commands. Distinguish proposed dates/thresholds from school commitments.
- [ ] Prepare private data-only quarantine SQL for exact ambiguous RU version with atomic audit and preserved snapshots. Apply only through already authorized owner/database access; do not bypass locked-browser or invent success.
- [x] Run typecheck/lint/unit/build, DB/migration and browser matrix; one independent whole-branch review; resolve blockers with regression tests.
- [ ] Push PR, attach it, wait required CI green, merge and verify exact production deployment plus RU/KK HTTP checks.

### Task 5: Real school opening (external facts required)

- [ ] Obtain real school/class/locale/cohort size and existing Google teacher/coordinator identities. Keep personal data out of Git.
- [ ] Run private bootstrap transaction; teacher creates invitation; one real pupil joins, answers, reloads; teacher sees exactly +1 accepted attempt.
- [ ] Confirm Google audience allows a non-developer pupil account, actual school network/devices and support contact.
- [ ] Confirm provider backup/export access and restore to separate local/staging before widening the cohort.
- [ ] First 10–20 pupils, observe accepted saves, collect language/content feedback; after stable operation extend to second school. New schema, paid plans, contracts and external messages require their concrete necessary details; never claim them performed by proxy.

## Execution ruling

Production landing still advertised three subjects and editorial KK review. Add a pilot-only landing variant matching four released math topics and AI review, preserve general landing when the pilot flag is off. No hard-coded question counts or public database query. Regression: RU/KK badge, review disclosure and no physics card/overflow at390px.

## Completion rule

Tasks 1–4 can be finished autonomously. A release plus local tests is technical evidence, not a fabricated real-school launch. Task 5 stays pending until real facts/actions are verified. Final report names deployed SHA, observed evidence, remaining external facts and next exact action.
