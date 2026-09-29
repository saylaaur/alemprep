# A3 — First Class Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give one Russian pilot class a server-enforced school, group, fixed approved program and participant scope, so every trusted session has a durable classroom attribution.

**Architecture:** A browser never chooses a school, participant, content version, or programme. An operator creates the school context through server-only tooling; an authenticated student joins a group with a one-time secret invite. A published assignment snapshots the eligible group and its immutable question-version list; trusted learning receives only an assignment ID and resolves the rest under database locks. Existing `lib/learning` remains the sole start/submit/review path.

**Tech Stack:** Next.js 16 Server Actions, Supabase/PostgreSQL migrations and SECURITY DEFINER RPCs, TypeScript strict, Zod, Vitest, local Supabase DB harness, Playwright.

**Spec:** `docs/superpowers/plans/2026-09-27-first-class-rebaseline.md` §A3; `docs/superpowers/specs/2026-09-09-production-pilot-architecture.md` §§5.2, 6–7; `docs/pilot/SUPERVISED_PILOT.md`.

## Global Constraints

- Scope is one supervised **RU** practice assignment, one school and one group at a time. KK, Desmos, AI, mock exams, weekly and diagnostic remain unavailable in the pilot path.
- A real lesson requires an approved content batch and named external school decisions D02–D06. Synthetic fixtures are the only data used in development and CI.
- Legacy published questions are never silently treated as approved pilot content. Assignment items reference immutable `question_versions` whose publication status is `approved` and whose locale is `ru`.
- The next migration numbers are `0029_pilot_school_access.sql` and `0030_pilot_assignments.sql`; the historical cutover reservation does not own an unused number. A4 must use the next free number when its packet begins.
- No browser payload contains an actor ID, school ID, membership ID, user list, score, correct answer, grading body, or arbitrary version IDs.
- All database changes are forward migrations. RLS is enabled before UI; privileged functions use `SECURITY DEFINER`, fixed `search_path`, explicit `auth.uid()` checks and narrowly granted EXECUTE rights.
- A revoked membership blocks new starts and submits. An already committed receipt stays readable to its authenticated owner; a retry with the same accepted operation must return that receipt without a second write.
- Messages are added to both `messages/ru.json` and `messages/kk.json` in the same commit. User-visible text never falls back from KK to RU.

## Review Focus

- A student submits a foreign assignment UUID: start must return `not-found` without revealing the school, group, programme or participants. Covered by Task 4 DB and browser tests.
- A teacher from school A attempts to create or inspect school B: mutation and read must reject with the same non-enumerating result. Covered by Tasks 2 and 5.
- A revoked student retries a network-unknown submission: an already committed receipt replays, but a not-yet-committed answer is rejected. Covered by Task 4 concurrency tests.
- An invite token is replayed, expired, revoked, or used concurrently at its maximum: no extra membership is created and no plaintext token appears in logs or persistent tables. Covered by Task 2 DB tests.
- A programme item is quarantined or differs in locale after assignment publish: a new start is refused; a historical submitted session keeps its immutable facts. Covered by Tasks 3 and 4.

---

## Data model and public service contracts

`0029_pilot_school_access.sql` creates `schools`, `school_memberships`, `school_groups`, `group_memberships`, `group_teachers`, and `group_invites`. `schools.timezone` is fixed to `Asia/Almaty`; active membership uniqueness is partial on `(school_id,user_id) WHERE ended_at IS NULL`; all group links use `(school_id, group_id)` to prevent cross-school joins.

`0030_pilot_assignments.sql` creates `pilot_programs`, `pilot_program_items`, `assignments`, and `assignment_participants`; it adds nullable `assignment_id` and `school_membership_id` to trusted `sessions`. A programme can be approved only after its immutable RU version IDs pass the publication check. Publishing an assignment snapshots active group membership in `assignment_participants` inside the same transaction.

The client-facing contracts are deliberately small:

```ts
type JoinGroupInput = { operationId: string; token: string };
type StartAssignedPracticeInput = { operationId: string; assignmentId: string };
type AssignmentState = 'assigned' | 'started' | 'submitted' | 'closed';
type MyAssignment = {
  id: string; title: string; locale: 'ru'; opensAt: string; closesAt: string;
  state: AssignmentState; totalSteps: number; completedSteps: number;
};
```

`startAssignedPractice` derives the actor from Auth and the participant, school, programme and next immutable item from the database. It accepts no topic slug or locale. It produces the existing `StartedLearning` public DTO. `submitLearning`, `getLearningState` and `getLearningReview` enforce the session's historical assignment/membership before exposing an active item, accepting a write, or showing a review.

## Task 1: Create the red access-policy and schema tests

**Files:**
- Create: `tests/db/pilot-school-access.test.ts`
- Create: `tests/fixtures/pilot-school.ts`
- Modify: `package.json` only if the DB harness needs this test included

**Consumes:** current local Supabase DB harness and migrations through `0028_learning_rewards.sql`.

**Produces:** `seedPilotSchoolPair(db)` fixture with two schools, operator, teacher A, teacher B, student A, student B, group A and group B; failing executable requirements for Task 2.

- [ ] **Step 1: Write the school-pair fixture with generated UUIDs and synthetic names.**

```ts
export async function seedPilotSchoolPair(db: TestDb) {
  // Insert two active schools, scoped teacher/student memberships and two groups.
  // Return opaque IDs only; never use names/emails from a real class.
}
```

- [ ] **Step 2: Write failing DB cases for RLS and access helpers.**

```ts
it('does not let an authenticated student read a group roster', async () => {
  const fixture = await seedPilotSchoolPair(db);
  await expect(asUser(fixture.studentA).from('group_memberships').select('*'))
    .resolves.toEqual({ data: [], error: null });
});

it('does not let teacher A access school B through a forged group ID', async () => {
  await expect(callAs(fixture.teacherA, 'pilot_create_invite_v1', { group_id: fixture.groupB, operation_id: uuid() }))
    .resolves.toMatchObject({ error: 'not-found' });
});
```

- [ ] **Step 3: Run the new file before implementing the migration.**

Run: `npm run test:db -- tests/db/pilot-school-access.test.ts`

Expected: FAIL because the pilot tables/RPCs do not exist.

- [ ] **Step 4: Commit only the fixture and red test.**

```bash
git add tests/db/pilot-school-access.test.ts tests/fixtures/pilot-school.ts
git commit -m "test: define pilot school access contract"
```

## Task 2: Implement school membership, group access and invitable student entry

**Files:**
- Create: `supabase/migrations/0029_pilot_school_access.sql`
- Create: `lib/pilot/contracts.ts`
- Create: `lib/pilot/access.ts`
- Create: `lib/pilot/access.test.ts`
- Create: `scripts/pilot/provision-school.ts`
- Modify: `types/db.ts`
- Modify: `tests/db/pilot-school-access.test.ts`

**Consumes:** Task 1's fixture and the established `Result<T>` / error vocabulary in `lib/learning/contracts.ts`.

**Produces:** service-only provisioning, authenticated join RPC, non-recursive RLS helpers and `joinGroup(input: JoinGroupInput): Promise<Result<{groupId:string}>>`.

- [ ] **Step 1: Add failing unit tests for token validation and server-only actor ownership.**

```ts
expect(parseJoinInput({ operationId: uuid(), token: 'short' })).toBeNull();
expect(parseJoinInput({ operationId: uuid(), token: randomBase64Url(22), actorId: uuid() })).toBeNull();
```

- [ ] **Step 2: Implement `0029` with the access tables, constraints, indexes and RLS.**

```sql
CREATE FUNCTION public.pilot_has_active_school_role_v1(target_school_id uuid, allowed_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_memberships m
    WHERE m.school_id = target_school_id AND m.user_id = auth.uid()
      AND m.ended_at IS NULL AND m.role = ANY (allowed_roles)
  )
$$;
REVOKE ALL ON FUNCTION public.pilot_has_active_school_role_v1(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pilot_has_active_school_role_v1(uuid, text[]) TO authenticated;
```

The join RPC hashes a 128-bit-or-stronger base64url token with SHA-256, locks the invite row, verifies expiry/revocation/max uses, locks the caller's active membership state, inserts only a student group membership and increments `uses` once. It returns a stable receipt for an identical `(actor, operationId)` retry. It never returns the token hash or a roster.

- [ ] **Step 3: Implement pure parsing and the operator-only provisioning script.**

```ts
export function parseJoinInput(raw: unknown): JoinGroupInput | null;
export async function provisionSchool(input: {
  schoolName: string; operatorId: string; coordinatorId: string; dryRun: boolean;
}): Promise<{ schoolId: string; created: boolean }>;
```

The script requires `SUPABASE_SERVICE_ROLE_KEY`, refuses non-local execution unless `PILOT_PROVISION_CONFIRM` equals the exact school ID, prints only IDs/counts, and is never run against a real school without the operator decision.

- [ ] **Step 4: Run the focused unit and DB cases.**

Run: `npm test -- lib/pilot/access.test.ts && npm run test:db -- tests/db/pilot-school-access.test.ts`

Expected: all school-A/B, revoked/expired/replayed invite and max-use concurrency tests pass.

- [ ] **Step 5: Commit the access boundary.**

```bash
git add supabase/migrations/0029_pilot_school_access.sql lib/pilot types/db.ts scripts/pilot/provision-school.ts tests
git commit -m "feat: add pilot school access controls"
```

## Task 3: Create an immutable approved RU programme and assignment publication boundary

**Files:**
- Create: `supabase/migrations/0030_pilot_assignments.sql`
- Create: `lib/pilot/programs.ts`
- Create: `lib/pilot/assignments.ts`
- Create: `lib/pilot/assignments.test.ts`
- Create: `tests/db/pilot-assignments.test.ts`
- Modify: `types/db.ts`

**Consumes:** Task 2 school/group membership and existing immutable `question_versions` / `question_publications`.

**Produces:** operator-created approved programme and teacher/coordinator-published assignment with an immutable participant snapshot.

- [ ] **Step 1: Write red tests for programme and assignment invariants.**

```ts
it('refuses an assignment that contains an unpublished, quarantined or KK version', async () => {
  await expect(publishAssignment(fixture.teacherA, { programId: fixture.badProgram, groupId: fixture.groupA }))
    .resolves.toMatchObject({ ok: false, error: 'content-unavailable' });
});

it('snapshots active group members once and does not add a later join automatically', async () => {
  const assignment = await publishAssignment(fixture.teacherA, fixture.validInput);
  await joinStudentAfterPublication(fixture.groupA);
  expect(await assignmentParticipants(assignment.id)).toHaveLength(fixture.activeAtPublish.length);
});
```

- [ ] **Step 2: Implement `0030` tables and restricted publication RPC.**

The migration enforces `opens_at <= due_at <= closes_at`, a maximum 90-day assignment span, `locale='ru'`, `purpose='practice'`, one position per item and a programme review reference. The publishing RPC locks the group and active membership rows, inserts the assignment and `assignment_participants`, records one allowlisted `assignment.published` audit event and persists an operation receipt. A user list from the browser is never accepted.

- [ ] **Step 3: Implement Zod contracts and server-only actions.**

```ts
export type PublishAssignmentInput = {
  operationId: string; groupId: string; programId: string;
  opensAt: string; dueAt: string; closesAt: string;
};
export async function publishPilotAssignment(raw: unknown): Promise<Result<{ assignmentId: string; participants: number }>>;
```

All IDs and times are validated; action actor comes from `getActor()`. Cross-school, wrong-role and absent resources collapse to `not-found`/`forbidden` without a resource detail.

- [ ] **Step 4: Execute unit and DB acceptance.**

Run: `npm test -- lib/pilot/assignments.test.ts && npm run test:db -- tests/db/pilot-assignments.test.ts`

Expected: immutable version, fixed participant, date, duplicate-operation and school-isolation cases pass.

- [ ] **Step 5: Commit assignment publication.**

```bash
git add supabase/migrations/0030_pilot_assignments.sql lib/pilot types/db.ts tests
git commit -m "feat: add immutable pilot assignments"
```

## Task 4: Bind trusted learning to the assignment, participant and fixed programme order

**Files:**
- Modify: `lib/learning/contracts.ts`
- Modify: `lib/learning/validation.ts`
- Modify: `lib/learning/service.ts`
- Modify: `lib/learning/start.ts`
- Modify: `lib/learning/state.ts`
- Modify: `lib/learning/submit.ts`
- Modify: `lib/learning/review.ts`
- Modify: `lib/learning/repository.ts`
- Modify: `lib/supabase/learning-actions.ts`
- Modify: `components/practice/LearningPracticeView.tsx`
- Create: `lib/learning/assignment-access.test.ts`
- Create: `tests/db/pilot-learning-scope.test.ts`
- Modify: `tests/e2e/trusted-practice.spec.ts`

**Consumes:** Task 3's assignment/participant/program tables and current `start_learning_v1` / `commit_learning_v1` compatibility design.

**Produces:** `startAssignedPractice({operationId,assignmentId})`, one server-selected next programme step per session, and owner/membership enforcement on all learning reads/writes.

- [ ] **Step 1: Add red service and DB tests before changing signatures.**

```ts
it('does not accept topicSlug, locale or version ID for an assigned start', async () => {
  expect(await startAssignedPractice({ operationId: uuid(), assignmentId: fixture.assignmentA, topicSlug: 'forged' }))
    .toMatchObject({ ok: false, error: 'invalid-input' });
});

it('rejects a pending submit after membership revocation but replays an accepted receipt', async () => {
  // first commit, revoke, retry same operation -> same receipt;
  // start a second session, revoke, submit -> forbidden.
});
```

- [ ] **Step 2: Extend the learning RPCs in a new migration, never by changing 0025–0028.**

Start locks `assignment_participants`, confirms server `actor_id`, assignment status/window, programme item and active membership, stores `sessions.assignment_id` and `sessions.school_membership_id`, and makes the next step deterministic from accepted programme positions. Commit locks the stored membership/assignment; it returns the existing accepted receipt before applying revocation to a retry, otherwise rejects a new write after revocation/closure. State/review are owner-scoped and may return the historical receipt after assignment closure.

- [ ] **Step 3: Implement the two explicit action paths and UI routing.**

```ts
export async function startAssignedPractice(raw: unknown): Promise<Result<StartedLearning>>;
export async function getMyPilotAssignments(): Promise<MyAssignment[]>;
```

The assignment page starts only `startAssignedPractice`. It displays a generic unavailable state for a forged/closed/foreign assignment and never falls back to legacy `PracticeView` or topic practice. The existing topic path stays feature-flagged and is not called by the pilot route.

- [ ] **Step 4: Run the assignment/revocation/retry test matrix.**

Run: `npm test -- lib/learning/assignment-access.test.ts && npm run test:db -- tests/db/pilot-learning-scope.test.ts && APP_ENV=local LEARNING_V1_ENABLED=true npm run test:e2e -- tests/e2e/trusted-practice.spec.ts --workers=1`

Expected: foreign UUID, URL mutation, locale mutation, pending lost response, revoked access, duplicate receipt and ordered-step tests pass.

- [ ] **Step 5: Commit learning scope binding.**

```bash
git add supabase/migrations lib/learning lib/supabase/learning-actions.ts components/practice tests
git commit -m "feat: scope trusted learning to pilot assignments"
```

## Task 5: Add minimal operator and student read models without a teacher dashboard

**Files:**
- Create: `lib/supabase/queries/pilot-assignments.ts`
- Create: `app/[locale]/(app)/assignments/page.tsx`
- Create: `app/[locale]/(app)/assignments/[assignmentId]/page.tsx`
- Create: `components/pilot/AssignmentList.tsx`
- Create: `components/pilot/AssignmentCard.tsx`
- Create: `tests/e2e/pilot-assignment.spec.ts`
- Modify: `i18n/routing.ts`
- Modify: `messages/ru.json`
- Modify: `messages/kk.json`

**Consumes:** Task 4 server-owned assignment DTO and read authorization.

**Produces:** student list/detail pages for assignments they are participants of. The operator uses scripts and database-protected actions; the full teacher dashboard is deferred to B1/S03.

- [ ] **Step 1: Write browser tests for own versus foreign assignment views.**

```ts
await page.goto(`/ru/assignments/${fixture.assignmentB}`);
await expect(page.getByText(fixture.schoolBName)).not.toBeVisible();
await expect(page.getByText(messages.assignmentUnavailable)).toBeVisible();
```

- [ ] **Step 2: Implement server-only query DTOs and pages.**

```ts
export async function getMyPilotAssignments(actorId: string): Promise<MyAssignment[]>;
export async function getMyPilotAssignment(actorId: string, assignmentId: string): Promise<MyAssignment | null>;
```

Select explicit fields only, order by server timestamp, set `no-store` for participant-specific responses and do not return classmates, email, invite token or full answer data. The action button begins the explicit assigned practice flow from Task 4.

- [ ] **Step 3: Add RU/KK message parity and keyboard/mobile states.**

Both locales include unavailable, opens/closes, completed progress, begin, retry and generic safe error strings. Test a 360px viewport and a keyboard-visible begin button.

- [ ] **Step 4: Run focused E2E.**

Run: `APP_ENV=local LEARNING_V1_ENABLED=true npm run test:e2e -- tests/e2e/pilot-assignment.spec.ts --workers=1`

Expected: a student sees only own active assignment, follows it to trusted practice and receives no foreign assignment detail.

- [ ] **Step 5: Commit the student entry point.**

```bash
git add app components/pilot lib/supabase/queries/pilot-assignments.ts i18n messages tests
git commit -m "feat: add scoped pilot assignment entry"
```

## Task 6: Run A3 evidence, update the gate and prepare migration handoff

**Files:**
- Modify: `docs/pilot/RELEASE.md`
- Modify: `docs/production/EXECUTION_LOG.md`
- Modify: `TASKS.md`

**Consumes:** Tasks 1–5 and a local Supabase stack with only synthetic fixtures.

**Produces:** exact candidate SHA, test evidence and two explicit un-applied hosted migration files for the owner to apply only after D02–D06.

- [ ] **Step 1: Run all code and DB quality gates.**

Run: `npm run typecheck && npm run lint && npm test && npm run test:db && npm run test:db:migration && npm run build`

Expected: every command exits zero. Record the command, SHA and date; do not describe an unrun hosted migration as applied.

- [ ] **Step 2: Run local browser evidence with clean flag processes.**

Run: `APP_ENV=local LEARNING_V1_ENABLED=true npm run test:e2e -- tests/e2e/trusted-practice.spec.ts tests/e2e/pilot-assignment.spec.ts --workers=1 && APP_ENV=local LEARNING_V1_ENABLED=false npm run test:e2e -- tests/e2e/legacy-practice.spec.ts --workers=1`

Expected: the scoped path and legacy compatibility both pass under their explicit flags.

- [ ] **Step 3: Update evidence truthfully and commit it.**

`RELEASE.md` marks A3 code candidate as PASS only when the commands pass, and keeps hosted migration, school decisions, approved real content, A4–A6 and pilot admission as NOT CHECKED. `EXECUTION_LOG.md` includes no user identifiers, secrets or answers.

```bash
git add docs/pilot/RELEASE.md docs/production/EXECUTION_LOG.md TASKS.md
git commit -m "docs: record A3 pilot scope evidence"
```

## Self-review

Spec coverage is complete: Tasks 1–2 cover the school/group/role/invite boundary; Task 3 covers frozen RU programme and participants; Task 4 connects those facts to all trusted learning operations and the explicit revoke/retry policy; Task 5 provides a student entry point without prematurely claiming a teacher dashboard; Task 6 records release truth and migration handoff. A3 does not implement reports, capacity, restore, Desmos or KK content because they belong to A5, A6 and B2/B3 and remain named gates.

The plan contains no runtime placeholders: all new public contracts, migration numbers, test commands and commit boundaries are explicit. The review-focus cases are assigned to Tasks 2–5. Field names used by later tasks are defined in the data model/contracts section. The browser route intentionally waits for Task 4, so no Task can accidentally expose unscoped legacy practice as the school pilot.
