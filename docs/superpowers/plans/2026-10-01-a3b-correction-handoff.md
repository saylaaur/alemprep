# A3-B correction and Terra implementation plan

> **For agentic workers:** use `superpowers:executing-plans`. Execute the cards below in order; do not start A3-C before the A3-B review. This packet supersedes the next-task prompt in the 30 September plan.

**Goal:** Finish assignment-bound start/state/submit using the existing learning grader and rewards, with reproducible access-revocation and retry guarantees.

**Architecture:** Retain the assignment/participant/programme model and the existing immutable question sessions. Correct the applied draft SQL through a forward migration, serialize eligibility with each new write, and expose a strict server-only assigned-start service. Historical accepted results remain available to their owner.

**Tech Stack:** existing PostgreSQL/Supabase, TypeScript, Zod and Vitest; no new packages.

**Spec:** [next steps, Task 2](2026-09-30-pilot-next-steps.md), [A3 contracts](2026-09-29-a3-first-class-scope.md), [first-class rebaseline](2026-09-27-first-class-rebaseline.md).

## Status and fixed constraints

- Work in `/Users/macbook/.codex/worktrees/trusted-practice/alemprep`, branch `codex/trusted-practice`, HEAD `c5d176b`. Preserve desktop presentation assets.
- A3-R2 has local implementation/evidence in `c5d176b`. Do not restart it. The older plan's unchecked Task 1 boxes are historical, not a new work queue; two older race tests still use fixed waits, so replace those when touching the concurrency suite.
- A3-B is **CHANGES REQUIRED / incomplete**. At review time `0034_pilot_learning_binding.sql` and `tests/db/pilot-learning-scope.test.ts` are untracked. Preserve them in the final change; a fresh checkout otherwise loses the applied SQL history.
- Owner reported applying 0034. Freeze its exact current contents; do not edit, delete, renumber, or rerun it hosted. Use **0035_pilot_learning_binding_corrections.sql**, after confirming the number is unused. Hosted 0033/0034 catalog verification was not completed in this review; owner report is not an independent fingerprint check.
- Local 0034 function-definition MD5: `91a576efd19bc56c96403d9224fcd8a1`. Read-only comparison SQL: `SELECT md5(pg_get_functiondef(to_regprocedure('public.pilot_start_assigned_learning_v1(uuid,uuid,text,uuid)')));`. A matching body alone does not verify grants, constraints, or application deployment.
- No pupil rollout from 0034 alone. There is no application caller for the new RPC, no assigned-start service and no assigned UI yet. The RPC denies anon/authenticated EXECUTE locally and permits service_role.
- RU practice only, one question per session; no redesign, second grader, Desmos, KK generation, teacher dashboard, or new reporting engine in this pass.

## Review evidence, 1 October

### Latest Astra review — CHANGES REQUIRED (local reproduction)

This review supersedes the readiness claims in the earlier B2 slice below. No application or migration code was changed during review. 0034 still has SHA-256 `934a447137ba6db18aea3087735a6a4ff696e53810c23ec2a7e3dcc26cf5d9f4`. Do not apply draft 0035 hosted yet.

Three diagnostic probes ran against the local Docker database with synthetic fixtures; each probe rolled back its transaction, and the harness closed afterward. The diagnostic command exited 0. These are reproductions, **not durable regression coverage**; turn each into a failing test before correcting 0035.

1. **P1 — publication/start deadlock.** 0035 eligibility locks the programme `FOR UPDATE` before the school (lines 23–28). 0033 publication locks group/school before inserting its assignment (lines 236, 271); that insert needs a programme FK key-share lock. Reproduction: pause a publisher after its normal group/school locks, start assigned learning in another connection, wait until `pg_blocking_pids` confirms the learner is blocked by the publisher, then run the publication RPC in the publisher transaction. Publication succeeded; assigned start failed with SQLSTATE **40P01**, `deadlock detected`. Reconcile lock order/modes with publication as well as cancellation and generic learning; preserve quarantine/revocation serialization. Add a deterministic regression and exercise both orders.
2. **P1 — completion still trusts mutable session status.** The 0035 start wrapper delegates unchanged progression to 0034 lines 94–105. After service-role issuance, setting only `sessions.status = 'submitted'` made a new start return `{"status":"completed","totalSteps":1,"completedSteps":1}` with **0 attempts and no session receipt**. Updating that row back to active while setting `integrity_version = 0` also succeeded: the trigger inherited from 0034 only fires for attribution/user columns, not status/integrity/mode. This demonstrates an internal data-integrity gap, **not an authenticated-browser exploit**. Derive completion from validated accepted facts, enforce the required immutable integrity/mode and submitted transitions, and prove valid submissions/skips/replays still work. Preserve 0034; corrections belong in 0035.
3. **P2 — rejoining a group can deny valid access.** 0035 lines 44–47 select a group-membership row without filtering ended rows. Ending the original relation and inserting a new active relation for the same pupil/group left exactly **1 active membership**, but `pilot_assignment_is_currently_eligible_v1` returned **false**. Select and lock the current relation deterministically while preserving revocation race safety. Cover historical ended relations plus a current active one.

**Execution order for Terra:** add the three regressions → correct B2 SQL without editing 0034 → finish the remaining B2 race/progression matrix → finish B1 audit/reference cleanup → implement B3 service → run the existing full gates sequentially → request Astra review. B3 is still absent (`lib/pilot/learning.ts` and `lib/pilot/repository.ts` do not exist).

**Verification limits:** this review reproduced the three failures; it did not rerun the full application/typecheck/lint/build or migration suites. Earlier migration-suite reset failures have no confirmed root cause; overlapping reset processes have not been ruled out. Do not attribute them to Docker/CLI instability without a clean sequential reproduction. Earlier green subsets do not establish B2/B3 acceptance.


### Astra unblock, after Terra commit `eda56f7`

**The RPC 404 is resolved locally; B2/B3 remain incomplete.** Do not investigate PostgREST cache or change hosted configuration for this failure. The response was PostgreSQL `42P01`, `missing FROM-clause entry for table "pilot_start_assigned_learning_v1"`; generic submission also failed with the corresponding `commit_learning_v1` message (8/17 atomic tests failed before the fix). Renaming a PL/pgSQL function preserves old function-qualified parameter references inside its body. Draft 0035 now rewrites those references for both renamed implementations, following the existing 0028 pattern.

### B2 integrity/authority slice, continued locally

Draft 0035 now additionally provides these local-only, tested protections:

- Assigned-start locks and rechecks assignment, programme, school, group, student membership, group membership and participant. Group removal now waits, commits, then returns `not-found` instead of issuing against a stale membership.
- Pilot attribution cannot be cleared, retargeted, or added to legacy sessions. A session item must match its attributed programme item. A malformed historical binding is rejected before attempts, rewards, audit, or a submit receipt can be written.
- Assigned submit locks the learner profile before authority and session rows, preserving the generic rewards path's lock prefix; identical accepted receipts still return before the current-access guard.
- A partial unique index prohibits two active/submitted sessions for the same participant/programme item, while expired replacement remains possible. Assigned-start removes the branch-only `sessionItemId` from its public result.

Each behavior had a focused real local DB regression. The clean current-schema suite is now `npm run test:db` → **111/111, 15 files**. `npm run typecheck`, `npm run lint`, and `git diff --check` pass. A new `0034 → 0035` populated-upgrade test passes independently: it preserves an active session, accepted fact and receipts. The older all-history `npm run test:db:migration` command still has two unrelated reset failures at the 0023 baseline (`supabase db reset --version 0023` exits during initialisation); its four later tests, including the new 0034 upgrade, passed. Do not call the all-history migration suite green until that Docker/CLI reset instability is reproduced and repaired or ruled out.

0034 remains unchanged, SHA-256 `934a447137ba6db18aea3087735a6a4ff696e53810c23ec2a7e3dcc26cf5d9f4`. Only local Docker was reset/applied. Draft 0035 is **not ready for hosted application** and has not been applied there by this work.

Evidence after the fix:

- `npx supabase db reset --local` — all migrations through 0035 applied successfully.
- `npm run test:db -- tests/db/pilot-learning-scope.test.ts tests/db/pilot-cleanup.test.ts tests/db/learning-atomic.test.ts` — **23/23**, 3 files.
- Subsequent `npm run test:db -- tests/db/pilot-learning-scope.test.ts tests/db/pilot-cleanup.test.ts` — **6/6**, 2 files, without another reset.
- `npm run typecheck`, `npm run lint`, `git diff --check` — passed.
- Full DB suite, populated-0034 upgrade, application suite and build have **not** been run for this draft. This is an unblock, not A3-B acceptance.

Test corrections: cleanup now asserts successful issuance and always closes its harness; previously it could pass with no created session. Fresh forbidden submit asserts HTTP 403 / SQLSTATE 42501 and unchanged learning facts. Added successful assigned skip, exact accepted-submit replay after withdrawal, payload conflict and unchanged facts. Start audit test now actually replays/reuses the session before asserting one event.

**Resume B2 here, before B3:**

1. Complete the deterministic authority-race matrix: cancellation, paused school, archived group, ended school membership and quarantine, including both winner orders and fresh submit. Current group-revocation regression proves the new lock behavior but does not cover that matrix.
2. Test lock order specifically against generic submit/start and cancellation, then add multi-item completion, active-reuse concurrency and expired replacement coverage. The unique index and sequential facts are in place; race proof remains incomplete.
3. Repair or isolate the older 0023 `supabase db reset --version` failure before claiming the full migration gate. The focused populated 0034 upgrade is green, but does not replace older-history coverage.
4. Then implement B3 server service and all listed gates. B1 cleanup still needs its planned synthetic audit/reference coverage; do not treat the earlier commit label as proof of every B1 requirement.

The original review evidence below is retained as the pre-correction baseline.

`npm run test:db -- tests/db/pilot-learning-scope.test.ts`: **1 test failed**, at `tests/db/helpers.ts:278` during synthetic Auth user deletion. This is not a green test suite.

Additional local PostgreSQL probes created synthetic fixtures in transactions and ended with `ROLLBACK`. Start/commit calls used `SET LOCAL ROLE service_role`; the write probe used authenticated plus the synthetic actor claim. These were diagnostic probes, not durable regression tests; turn them into the tests specified below.

| Priority | Finding | Evidence / code |
| --- | --- | --- |
| P1 | Fresh answer accepted after participant withdrawal | Start → set `withdrawn_at` → fresh `commit_learning_v1` returned an accepted receipt. 0034 never adds eligibility to the commit transaction; 0027/0028 commit checks know nothing about assignments. |
| P1 | Active start replay bypasses eligibility | Same start operation after withdrawal returned `status=active`. 0034 lines 71–75 return the receipt before checking participant/window; the owner state reader at `lib/learning/repository.ts:637` also has no assignment eligibility filter. |
| P1 | Quarantined programme content can be issued | Fresh start with the programme publication quarantined returned `status=active`. 0034 line 116 reads the version without publication validation. |
| P1 | Revocation can race with an accepted new start | Static finding: 0034 locks only the participant; assignment, school, group and student membership are read without locks. Ending group membership is not checked at all. Race order still needs deterministic regression tests. |
| P2 | Assigned issuance has no audit event | The fresh synthetic start had 0 `audit_events` for its session; 0034 has no audit insert. |
| P2 | Test teardown cannot remove new dependency graph | `pilot_learning_receipts.actor_id` restricts Auth deletion, and `session_items.session_id` restricts cascading session deletion. Cleanup handles neither new receipt nor issued-session dependencies. Fix synthetic teardown, not production retention. |

Countercheck: browser UPDATE of an issued v1 session affected **0 rows**. 0028 restricts browser INSERT/UPDATE to integrity_version=0; a table-level UPDATE grant alone is not evidence of an exploitable v1 write. Preserve and test this policy, and keep broad legacy cutover in A4.

Other completion requirements: consistent RPC response shape for new/reused sessions; explicit null hash rejection; immutable attribution; single accepted fact per participant/item; correct count derived from trusted accepted facts; session-item version matches the assigned item; current schema types; strict server input parsing.

## Review focus

1. Accepted submit replay after withdrawal succeeds unchanged; fresh submit fails without attempts/rewards/audit side effects.
2. Two tabs with distinct operation IDs reuse the same active step, including races with submission and expiry replacement.
3. Cancellation, school pause, group archive, membership ending and quarantine win or lose deterministically against start/submit.
4. A malformed legacy or partially attributed session cannot count as completed programme work.
5. Test teardown removes only its synthetic graph, works on older migration stages and twice consecutively, and does not mask failing assertions.

## Card B1 — repair the local harness

**Files:** `tests/db/helpers.ts`, `tests/db/pilot-cleanup.test.ts`, existing `tests/db/pilot-learning-scope.test.ts`.

- [ ] Add a regression that creates an assigned session and start receipt, calls `close()`, and checks that its synthetic user/dependencies are gone. Existing cleanup tests show the observer pattern. Include accepted submit facts once B2 provides them.
- [ ] Discover optional tables for old migration-path stages; scope deletions by the harness's `createdUserIds` and dependent session IDs. Delete attempts/reward ledger/operation receipts/pilot learning receipts, session items and sessions before participants/assignments/memberships/Auth users. Follow actual FK dependencies; handle relevant synthetic audits as well.
- [ ] Keep cleanup inside the existing local-only guarded harness. Do not weaken production FKs or immutability triggers; no broad TRUNCATE. Account for the existing replica-mode teardown and avoid leaving dangling references.
- [ ] Run twice sequentially:

```sh
npm run test:db -- tests/db/pilot-learning-scope.test.ts tests/db/pilot-cleanup.test.ts
```

- [ ] Commit only the completed harness card if independently green; do not label A3-B complete. Preserve the untracked 0034 history for the B2 change.

## Card B2 — finish database correctness in 0035

**Files:** new `supabase/migrations/0035_pilot_learning_binding_corrections.sql`; `tests/db/pilot-learning-scope.test.ts`; `tests/db/lock-barrier.ts`; `tests/fixtures/pilot-program.ts` if a two-item fixture is needed; migration-path tests where appropriate. Include the unchanged 0034 and its existing test in version control.

**Interface:** keep `pilot_start_assigned_learning_v1(actor_id uuid, operation_id uuid, payload_hash text, assignment_id uuid)` service-only. Normalize active result to `{status:'active',sessionId,totalSteps,completedSteps}` and completed result to `{status:'completed',totalSteps,completedSteps}`. Remove reliance on `sessionItemId`, which is absent on reuse; actual issued items are hydrated from stored rows.

- [ ] Add red tests for withdrawal before fresh submit, withdrawal before active start replay, quarantine before start and missing start audit. Use assertions on state AND attempts/receipts/rewards/audits, not just error strings.

```ts
// Using the existing DbHarness and seedPilotSchoolPair fixtures:
// after a valid assigned start, retain operation IDs and canonical payloads.
await db.execute('UPDATE public.assignment_participants SET withdrawn_at = clock_timestamp() WHERE assignment_id = $1', [assignmentId]);
const fresh = await db.rpc('service', 'commit_learning_v1', freshSubmitArgs);
expect(fresh.data).not.toHaveProperty('acceptedAt');
// The same scenario with an already accepted submit MUST return its exact
// receipt on the original operation and leave every fact count unchanged.
```

- [ ] Start and commit must lock/recheck all authority rows they depend on, using a documented consistent lock order. Include assignment, school/group, student membership, group membership and participant; preserve per-participant serialization. Account for 0028's profile lock, 0033 cancellation lock order and publication locks. Do not add a late session trigger that introduces session→participant versus participant→session deadlocks. Read existing functions before choosing a wrapper; preserve existing generic RPC callers and rewards.
- [ ] New writes require active current membership/group relation, active school/group, published assignment, eligible nonwithdrawn participant, opens_at ≤ current time < closes_at. Recheck wall-clock cutoff after waiting for locks; due_at never ends access early. School IDs, actor and participant must agree. Retired programmes cannot issue new work.
- [ ] Check approved RU practice publication under a lock that serializes quarantine. Reuse immutable versions and existing manifest computation. Do not return or issue an active quarantined step as usable work; historical accepted owner review still works.
- [ ] Implement fresh-submit eligibility inside the final DB transaction before scoring facts persist. **Accepted identical submit receipt lookup comes first**; changed-payload retries remain conflicts. Preserve canonical server grading/0028 reward transaction. Error messages/codes must map to the existing typed error union.
- [ ] Active start replay must check current eligibility, preserve its original session reference and never advance to the next step. Do not apply the special accepted-submit replay exception to active-start content. SQL/application hashing must bind assignment identity; explicit `payload_hash IS NULL` validation precedes storage.
- [ ] Enforce attribution all-or-none and immutable after issuance; require integrity v1, practice mode, participant/user/school/programme consistency, and the actual session item version equal to the assigned version. Clearing or retargeting attribution must fail. Legacy rows cannot acquire pilot attribution or contribute to progress.
- [ ] Prevent duplicate live/accepted participant-item facts with DB constraints and transaction logic. A partial unique constraint for active/submitted sessions can support expired replacements, but keep submitted history irreversible and test transitions. Derive completion from accepted trusted sessions/items/receipts, not arbitrary `status='submitted'` rows.
- [ ] Add exactly one privacy-safe start audit per newly issued session, with school/session attribution and allowed metadata; reused starts/replays do not duplicate it. Ensure accepted submission audit can be reconciled to its assignment through durable session attribution. Use explicit INSERT column lists.
- [ ] Durable DB matrix: own vs foreign vs nonparticipant/late join; withdrawal; ended school/group membership; archived group/paused school/cancelled assignment; before-open/after-due/before-close/after-close; quarantine; same operation retry/conflict; two simultaneous starts; submit/start and revoke/write both orders; accepted replay after access loss; null-answer skip; expired replacement; two ordered items and final completion; malformed attribution rejection; JWT denial of internal RPC and direct v1 writes. Use `pg_locks` barriers and settle outstanding promises before connection release.
- [ ] Apply 0035 to local Docker only, then run the focused tests. Test both a clean install and upgrade from populated 0034 (active session + accepted historical facts + receipts). Verify no destructive rewrite or automatic promotion of suspect facts.

## Card B3 — connect the server service; stop before UI

**Files:** create `lib/pilot/learning.ts`, `lib/pilot/repository.ts`, `lib/pilot/learning.test.ts`; modify `lib/pilot/contracts.ts`, `types/db.ts`, relevant `lib/learning/{repository,state,submit,review}.ts` and their tests.

**Contract:**

```ts
type AssignedStartInput = { operationId: string; assignmentId: string };
type AssignedStart =
  | { status: 'active'; learning: StartedLearning; totalSteps: number; completedSteps: number }
  | { status: 'completed'; totalSteps: number; completedSteps: number };
// server-only; getActor() owns actorId. Uses existing Result/StartedLearning.
async function startAssignedPractice(raw: unknown): Promise<Result<AssignedStart>>;
```

- [ ] Test strict rejection of extra actorId, schoolId, participantId, locale, topicSlug, versionId, score fields and missing Auth; no RPC on invalid input. Canonical hash identifies the assigned-start request, not its operation ID. Foreign assignment returns generic not-found.
- [ ] Decode RPC response with strict schemas and sensible bounded counts; malformed transport → temporarily-unavailable. Hydrate only the returned owner's stored session and public-question allowlist; never expose grading_body/correct/explanation before accepted submit.
- [ ] Guard active state/active replay using current assignment eligibility. Use a separate eligibility-aware reader where necessary: putting a blanket eligibility filter into the shared issued-session reader would incorrectly break accepted submit replays after revocation. Keep submitted owner state/review and accepted-submit retry available, foreign access denied.
- [ ] Generic `startLearning` still refuses assignment inputs. Reuse existing submit/grading/reward code; update old comments claiming school scopes do not exist. Update session/receipt schema types without an unrelated type-system rewrite.
- [ ] Run gates sequentially for DB/reset suites:

```sh
npm test -- lib/pilot/learning.test.ts lib/learning
npm run test:db -- tests/db/pilot-learning-scope.test.ts tests/db/pilot-cleanup.test.ts
npm run test:db
npm run test:db:migration
npm test
npm run typecheck
npm run lint
npm run build
```

- [ ] Record exact counts/commands/failures, commit the completed card(s), update this packet and TASKS. Request Astra review before A3-C. A partial test or successful SQL execution does not close the block. Hosted migration rollout follows review; preserve 0034 without asking the owner to undo it.

## Ready-to-paste Terra prompt

Work in `/Users/macbook/.codex/worktrees/trusted-practice/alemprep` on `codex/trusted-practice`. Read AGENTS.md and `docs/superpowers/plans/2026-10-01-a3b-correction-handoff.md`; implement B1 → B2 → B3 with regression tests. 0034 is already applied per owner and MUST remain byte-for-byte unchanged; SQL corrections belong in next unused 0035. Preserve and include the two current untracked A3-B files. Fix the reproduced revocation/replay/quarantine/audit gaps, finish the server service, and run the listed gates. Do not build UI, deploy, or apply hosted SQL in this pass. Report commits, exact test evidence and remaining limitations for Astra review.

## After A3-B acceptance

A3-C student entry/assigned lesson UI → A4 accessible legacy bypass closure → A5 reproducible class report → A6 integration, hosted schema verification and supervised rehearsal. Prepare the selected reviewed RU lesson and school logistics alongside coding. KK classes require an accepted KK programme; adding SQL is not a content or school-admission milestone.
