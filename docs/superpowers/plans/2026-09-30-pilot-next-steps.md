# Pilot Next Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute one card, report its evidence, then continue in this order.

**Goal:** Complete one supervised RU lesson with fixed assignments, server-owned results and a reproducible class summary; prepare accepted KK content alongside it.

**Architecture:** Keep Next.js + Supabase and the existing learning grader/receipts. Add assignment attribution and ordered lesson progress inside the database transaction, reuse the trusted single-question UI, close legacy bypasses before student release. A teacher dashboard and Desmos follow the first accepted lesson.

**Tech Stack:** TypeScript strict, Next.js 16, PostgreSQL/Supabase, Vitest and Playwright; existing dependencies only.

**Spec:** [first-class rebaseline](2026-09-27-first-class-rebaseline.md), [A3 contracts](2026-09-29-a3-first-class-scope.md), [current review](../../production/reviews/2026-09-30-c47385b.md), [SP admission](../../pilot/SUPERVISED_PILOT.md). This handoff supersedes stale next-task labels, not the long-term ROADMAP.

## Global constraints

- Reuse `/Users/macbook/.codex/worktrees/trusted-practice/alemprep`, branch `codex/trusted-practice`; reviewed code is `c47385b`. The desktop checkout has older code and unrelated untracked presentation work.
- 0026–0032 were reported applied by owner; selected hosted function/permission/trigger fingerprints now match local. Never edit or blindly rerun them. Reserve 0033 for A3-R2, 0034 for binding; A4 uses the next unused number at execution time.
- Scope: one RU maths group, planning assumption at most 15 learners and 10–15 approved questions. Actual group size/language/date must come from school before admission.
- One question per session; answer → trusted submit → explanation → next ordered step. No second grading engine, no browser-selected school/user/content version/score.
- Accepted identical submit replays after revocation/closure without new facts; unaccepted writes after access loss refuse. Historical owner receipt/review remains readable. Active/start-replay content requires current eligibility.
- UI strings in both locale files; RU lesson is explicitly RU. No hidden RU fallback for a promised KK lesson.
- Tests use synthetic local Docker data. DB and migration-reset suites never run together. Read relevant installed Next docs before route/action changes.
- Code acceptance, CI/integration, hosted schema and student admission are separate states. User authorized ordinary commits/merges previously; still complete applicable review/CI before integration. Do not request or enable unsafe fallback grants.

## Review focus

1. Teacher role revoked during publication: lock the actual group authorization; test both orderings in A3-R2.
2. Two tabs start different operations on one lesson step: at most one active session/accepted first-pass fact; test in A3-B.
3. Submit response lost before school access ends: exact accepted replay succeeds, a fresh pending write fails; A3-B and A3-C.
4. Two assignments share one topic on a shared device: pending storage never crosses assignment/owner; A3-C.
5. Closed/withdrawn learner and later retries alter counts: fixed denominator and cutoff survive; A5.

## Actual status

| Block | Code | Remaining |
| --- | --- | --- |
| A1 / L02 | Accepted and merged as bb903a2 | Do not reimplement |
| A2 / trusted topic practice | Written in this branch, including 1199447 | Include in whole-branch CI/browser acceptance; not on verified production alias |
| A3 access/program/publication | 0029–0032 and service modules exist | A3-R2 below, then binding and student entry |
| Hosted 0026–0032 | Owner applied; selected catalog comparison matches | Full constraints/index inventory and synthetic release smoke remain A6 |
| A4 | Legacy entry points still present | Server restrictions plus actual REST/RPC denial |
| A5 | No class-report implementation | First-pass attribution, reconciliation, cutoff report |
| A6 | Not accepted | Alias→SHA, flags, rehearsal, load/restore and school approval |
| KK / teacher dashboard / Desmos | Not accepted for real use | Separate content/feature tracks after dependencies |

Remote main checked read-only is bb903a2; no PR currently exists for this work branch. Do not equate SQL success with an updated public application.

## Task 1 — A3-R2: finish the narrow mutation boundary

**Files:** create `supabase/migrations/0033_pilot_authorization_boundary.sql`; modify `tests/db/pilot-assignments.test.ts`, `tests/db/pilot-school-access.test.ts`; add `tests/db/lock-barrier.ts`; update review evidence. Existing service signatures remain unchanged; no new tables or browser contract.

**Consumes:** 0032 publication and 0031 invite/cancellation functions. **Produces:** draft-only programme creation, serialized group-role revocation, deterministic race evidence.

- [ ] Add red test for direct programme INSERT. Use the real DB harness, not a string assertion:

```ts
await expect(db.execute(`INSERT INTO public.pilot_programs
  (title_ru,status,review_ref) VALUES ('Synthetic','approved','TEST')`))
  .rejects.toThrow(/draft|approval/i);
```

Also assert `status='retired'` insertion fails, draft creation succeeds, and a valid draft→approved transition still succeeds. Test locale mismatch and missing/quarantined publication at approval; never mark an automated fixture as human-reviewed content.

- [ ] Reproduce R2 with three dedicated connections: blocker holds SHARE on assignments; publisher uses authenticated role/JWT; observer polls for publisher's ungranted relation lock. Revoke the teacher link on the third connection. Before fix revoke completes; after fix it waits behind publisher. After publication rollback/commit, finish revoke and assert a fresh publish returns `not-found`. Repeat revoke-first with publisher waiting on that teacher row. Assert one audit/receipt on accepted replay.
- [ ] Replace fixed sleeps in race assertions with a bounded barrier (`pg_locks`/`pg_stat_activity`, max 2 seconds, 25ms polls); on timeout report barrier failure. Capture request rejection immediately and settle every promise before releasing connections. Use the same helper for existing approval and participant races.
- [ ] Run red tests: `npm run test:db -- tests/db/pilot-assignments.test.ts tests/db/pilot-school-access.test.ts`.
- [ ] Implement a BEFORE INSERT programme trigger requiring draft in 0033. Keep the approved-content UPDATE validator from 0032; preserve existing historical rows. SQL guard:

```sql
IF NEW.status <> 'draft' THEN
  RAISE EXCEPTION 'pilot programmes must be created as draft';
END IF;
RETURN NEW;
```

- [ ] Replace group-teacher EXISTS authority reads with a row-locking SELECT and status recheck in publish, create invite, cancel and join issuer validation. School/group and school-membership locks remain. Serialize role-ending paths against the same group-teacher row; document actual order before changing it, test no deadlock under publish/revoke and cancel/revoke. Do not create a second role system or expose a service credential.
- [ ] Apply 0033 locally only. Run focused DB tests, full DB suite, then migration-path suite sequentially; typecheck/lint/unit and standard build for the release candidate. Record exact results; do not repeat green suites without a new change/failure.
- [ ] Commit `fix: serialize pilot group authority and programme creation`, then review this small diff. Hosted application of 0033 is a separate rollout step; owner need not repeat 0026–0032.

## Task 2 — A3-B: bind issued sessions to an ordered assignment

**Files:** create `0034_pilot_learning_binding.sql`, `lib/pilot/learning.ts`, `lib/pilot/repository.ts`, `lib/pilot/learning.test.ts`, `tests/db/pilot-learning-scope.test.ts`; modify `types/db.ts`, `lib/learning/{repository,service,state,submit,review}.ts` and their tests. Read existing 0027/0028 before wrapping RPCs.

**Consumes:** corrected school/assignment model and existing grading/commit pipeline. **Produces:** `startAssignedPractice(raw: unknown): Promise<Result<AssignedStart>>`; actor always comes from `getActor()`.

```ts
type AssignedStartInput = { operationId: string; assignmentId: string };
type AssignedStart =
  | { status: 'active'; learning: StartedLearning; totalSteps: number; completedSteps: number }
  | { status: 'completed'; totalSteps: number; completedSteps: number };
```

- [ ] Add tests rejecting topicSlug/locale/actor/version extras; foreign assignment returns generic `not-found`. Existing generic `startLearning` must keep refusing assignment inputs until explicit path is implemented.
- [ ] Add nullable session references `assignment_id`, `assignment_participant_id`, `pilot_program_item_id` with an all-or-none check. Composite constraints/transaction checks must prove actor=participant.user, assignment=participant.assignment and item belongs to assignment.program. First-pass progress is derived from accepted issued items, never client points or random topic selection.
- [ ] Add a service-only assigned-start transaction. Lock the per-participant lesson progression row before finding/reusing an active step. Select first unfinished programme position, validate approved publication and eligibility, issue exactly one item and persist attribution and start receipt atomically. Two distinct concurrent operation IDs reuse the same active step; a replay never issues the next step. Return explicit completed state after the last accepted step. Expired unsubmitted session can be replaced; a submitted position cannot be scored twice.
- [ ] Preserve existing start/commit RPC callers. Put eligibility checks inside the final commit transaction, not only the TypeScript precheck. Accepted receipt lookup precedes revocation rejection. Update service error mapping; no second grading/reward implementation. Current school/group/student/participant/assignment statuses and closes_at govern new work; due_at labels lateness but does not close early.
- [ ] Active state/start replay requires current eligibility. Historical submitted owner receipt/review survives lesson closure; non-owner never sees answer keys. Quarantined next content refuses issuance without changing past results.
- [ ] DB matrix: two schools, nonparticipant, late join, withdrawn participant, archived group/paused school, cancelled assignment, both start/submit vs revoke orders, simultaneous two-tab starts, lost-response retry, null skip, expiry replacement, final completed state, first-pass uniqueness. Assert receipt/attempt/reward/audit counts and attribution for each accepted fact.
- [ ] Run `npm test -- lib/pilot/learning.test.ts` and `npm run test:db -- tests/db/pilot-learning-scope.test.ts`, then relevant full gates. Commit/review before UI depends on the SQL contract.

## Task 3 — A3-C: student joins and opens their assigned lesson

**Files:** create `lib/supabase/pilot-actions.ts`, `lib/supabase/queries/pilot-assignments.ts`, `app/[locale]/(app)/assignments/page.tsx`, `app/[locale]/(app)/assignments/[assignmentId]/page.tsx`, `components/pilot/{AssignmentList,JoinGroupForm}.tsx`, `tests/e2e/pilot-assignment.spec.ts`; modify `LearningPracticeView.tsx`, `lib/learning/{pending,browser-storage}.ts`, `i18n/routing.ts`, both message files and pending tests.

**Consumes:** `AssignedStart` and Task 2 eligibility. **Produces:** owner-only assignment DTO/list/detail and join action; server read derives actor internally (no public caller-supplied actorId).

- [ ] Add pending tests first. Introduce a versioned discriminated selector `{kind:'topic',topicSlug,locale}` or `{kind:'assignment',assignmentId}` plus authenticated owner and UI locale. Old topic-only v1 storage must be cleared or validated/migrated explicitly. A topic string must never impersonate assignment identity.
- [ ] Reuse question rendering/retry/review components. Add assigned start adapter and completed state, not a second grading loop. Completed lesson stops issuance and shows confirmed progress; different assignment/account clears the previous pending state before rendering.
- [ ] Wire join action to existing `joinGroup`; strict token/operation validation, no plaintext invite in logs/roster. Present a generic error for unavailable lesson. The list has no peer names, emails, service keys or grading body.
- [ ] E2E: individual entry→join→own assignment→first answer→review→reload→next step→completion; two assignments with same topic, account switch, foreign UUID, lost submit response, expired/revoked access, 360px and keyboard. Test honest RU programme label in KK UI.
- [ ] Run `APP_ENV=local LEARNING_V1_ENABLED=true npm run test:e2e -- tests/e2e/pilot-assignment.spec.ts --workers=1` and pending/unit/typecheck/lint/build. Whole A2/A3 browser suite is required before integration; existing UI presence is not evidence of passing it.

## Task 4 — A4: cut over the accessible surface

**Files:** `lib/supabase/{practice-actions,diagnostic-actions,weekly-actions,learning-actions,pilot-actions}.ts`, actual AI action found by export inventory, affected routes, new next-number migration, `tests/db/pilot-cutover.test.ts`, action tests and release runbook.

- [ ] Inventory every exported action, table/view and executable RPC. Include recordAttempt/createExamSession/startPairExam/finishExamSession, diagnostic, weekly, AI and direct question reads. An invisible menu is not a deny rule.
- [ ] Adopt assignment-only mode for the pilot target. Deny unsupported starts and legacy writes server-side; do not let general topic action issue arbitrary tasks for enrolled pilot users.
- [ ] Revoke dangerous effective REST/RPC grants and answer-key exposure with a forward migration. Ensure ordinary valid assigned submit still works. If the shared public app depends on legacy paths, first deploy a compatible app/maintenance boundary; do not silently break it or restore unsafe grants as rollback.
- [ ] Real JWT tests must attempt own points/XP/attempt/session tampering, foreign reads, internal RPCs, legacy calls and answer-key reads. Browser test then completes a legitimate assigned lesson under final permissions.
- [ ] Document deploy-before-revoke order, compatible rollback SHA and pause path; migration test starts from populated 0032/0034 state. Commit/review before real student enablement.

## Task 5 — A5: useful operator/teacher summary

**Files:** new `lib/reporting/{contracts,metrics,service}.ts`, `scripts/pilot/{reconcile-learning,report-lesson}.ts`, `tests/db/report-snapshot.test.ts`; append-only snapshot schema only if required by accepted reporting contract.

- [ ] Freeze assignment, participant denominator, programme/metric versions and cutoff. Use Task 2 first-pass facts, exclude synthetic/legacy by explicit server-owned classification. A late membership change must not rewrite yesterday's report.
- [ ] Test 4 eligible, 3 started, 2 completed with 6/10 and 8/10: completion 2/4, completed score 14/20. Duplicate submits, later re-practice and later events must not increase first-pass totals. Keep missing work separate from incorrect answers.
- [ ] Reconcile session items, attempts, receipts, rewards and audit; discrepancy blocks a report's ready status. Operator obtains one school's summary; other schools denied. Sharing with administration uses agreed aggregates and small-cell rules from existing reporting spec.
- [ ] Produce one reproducible synthetic report and reconcile it before claiming reporting exists. A dashboard UI is deferred, the usable report is not.

## Task 6 — A6: integration and first-class admission

- [ ] Prepare PR of accepted branch, attach it, run required CI including standard build and whole browser suite. Merge only when applicable review/checks pass. Restore main-workspace consistency without deleting presentation assets. Record merge and real Vercel alias→SHA separately.
- [ ] Reconcile full hosted schema/grants/flags after approved forward migrations; keys remain server-only. Seed/import only the selected approved real lesson after content sign-off. Confirm kill switch, privacy-safe error monitoring and spend limits.
- [ ] Test 15/30 synthetic concurrent users in agreed non-production environment; auth per-user limits must tolerate shared school IP. Weak-network pending/retry, shared-device logout, backup restoration and compatible rollback must be evidenced. Do not load-test hosted student data.
- [ ] Teacher/operator rehearsal: entry, full lesson, saved result and report reconciliation, then repeat after reload/network interruption. School confirms teacher, class N, language, devices/accounts, participation/data decisions and backup materials.
- [ ] SP0–SP7 satisfied → one accompanied RU lesson. Otherwise adult demonstration/rehearsal only. A deploy is not the admission gate.

## Content and later product track

Prepare 10–15 reviewed RU tasks now in parallel with engineering. For KK: source sample and usable rights → 20–30 candidate tasks → maths/language review → approved immutable versions → explicit KK programme support and tests. No purchase or paid generation is authorized by this plan. No KK reviewer/source acceptance is inferred from buying ten booklets.

After first working lesson: minimal teacher cabinet (own classes, assignment, completion, summary); accepted KK lesson before Kazakh classes; Desmos with 1–3 useful presets and SDK-failure fallback; then second school after first-class issues are closed. Preserve the agreed visual design. Full mock/diagnostic/weekly and general reports follow their existing cards.

## Remaining effort and immediate handoff

Engineering estimate, including tests/review and ordinary correction time, not a promised launch date:

| Card | Active hours |
| --- | --- |
| A3-R2 | 2–4 |
| A3-B + A3-C | 10–18 |
| A4 | 6–10 |
| A5 | 5–8 |
| A6 | 6–10 |
| Total to supervised RU gate | 29–50 |

At 6–8 focused hours/day, plan roughly 4–9 working days; external school/content/access waits are additional. Re-estimate after the first complete assigned lesson, not after every small fix. A responsible RU reviewer needs separate time; a two-day full student launch is not supported by current evidence.

**Next executor prompt:** read AGENTS, this plan Task 1 and review c47385b; work in the existing trusted-practice checkout. Implement A3-R2 only, using 0033 and deterministic local tests. Preserve applied SQL and unrelated work. Report commit/tests/remaining limitation; then proceed to Task 2 after its correction review. Do not rebuild A1/A2 or spend the pass redesigning the whole platform.
