import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness, type TestActor } from './helpers';
import { assertSafeDbTestTarget } from './test-target';
import { seedApprovedPilotProgram } from '../fixtures/pilot-program';
import { seedPilotSchoolPair } from '../fixtures/pilot-school';

const execFileAsync = promisify(execFile);
const l01MigrationPath = `${process.cwd()}/supabase/migrations/0024_learning_integrity_schema.sql`;
const l02MigrationPath = `${process.cwd()}/supabase/migrations/0025_learning_integrity_rpc.sql`;
const l02aCorrectionMigrationPath = `${process.cwd()}/supabase/migrations/0027_learning_rpc_validation.sql`;
const l02bRewardsMigrationPath = `${process.cwd()}/supabase/migrations/0028_learning_rewards.sql`;
const pilotBindingCorrectionMigrationPath = `${process.cwd()}/supabase/migrations/0035_pilot_learning_binding_corrections.sql`;
const supabaseCli = `${process.cwd()}/node_modules/.bin/supabase`;

function testTargetEnv() {
  return {
    APP_ENV: process.env.APP_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

async function resetTo(version?: string): Promise<void> {
  assertSafeDbTestTarget(testTargetEnv());
  await execFileAsync(supabaseCli, [
    'db', 'reset', '--local', '--no-seed',
    ...(version ? ['--version', version] : []),
  ], { cwd: process.cwd() });
}

async function applyL01(db: DbHarness): Promise<void> {
  const sql = await readFile(l01MigrationPath, 'utf8');
  await db.execute(sql);
}

async function applyL02(db: DbHarness): Promise<void> {
  const sql = await readFile(l02MigrationPath, 'utf8');
  await db.execute(sql);
}

async function applyMigration(db: DbHarness, migrationPath: string): Promise<void> {
  await db.execute(await readFile(migrationPath, 'utf8'));
}

async function seedApprovedVersion(db: DbHarness): Promise<{
  versionId: string;
  topicId: string;
  subjectId: string;
  manifestHash: string;
}> {
  const suffix = crypto.randomUUID();
  const subjectId = await db.scalar<string>(
    `INSERT INTO public.subjects (slug, name_ru, name_kk, is_active)
     VALUES ($1, 'Upgrade subject', 'Upgrade пәні', true) RETURNING id`,
    [`upgrade-${suffix}`]
  );
  const topicId = await db.scalar<string>(
    `INSERT INTO public.topics (subject_id, slug, name_ru, name_kk)
     VALUES ($1, $2, 'Upgrade topic', 'Upgrade тақырыбы') RETURNING id`,
    [subjectId, `upgrade-${suffix}`]
  );
  const questionId = await db.scalar<string>(
    `INSERT INTO public.questions (topic_id, language, type, body, is_published)
     VALUES ($1, 'kk', 'single', $2::jsonb, true) RETURNING id`,
    [topicId, JSON.stringify({ stem: 'upgrade', options: [{ id: 'A', content: 'A' }], correct: 'A' })]
  );
  const versionId = await db.scalar<string>(
    `INSERT INTO public.question_versions
       (question_id, family_id, revision, locale, type, public_body, grading_body, content_hash)
     VALUES ($1, gen_random_uuid(), 1, 'kk', 'single', $2::jsonb, $3::jsonb, $4)
     RETURNING id`,
    [
      questionId,
      JSON.stringify({ stem: 'upgrade', options: [{ id: 'A', content: 'A' }] }),
      JSON.stringify({ stem: 'upgrade', options: [{ id: 'A', content: 'A' }], correct: 'A' }),
      `sha256:${suffix}`,
    ]
  );
  await db.execute(
    `INSERT INTO public.question_publications (question_version_id, status)
     VALUES ($1, 'approved')`,
    [versionId]
  );
  return {
    versionId,
    topicId,
    subjectId,
    manifestHash: `sha256:${createHash('sha256').update(`${versionId}:sha256:${suffix}`).digest('hex')}`,
  };
}

function trustedPlan(seeded: Awaited<ReturnType<typeof seedApprovedVersion>>) {
  return {
    sessions: [{
      mode: 'practice',
      topicId: seeded.topicId,
      subjectId: seeded.subjectId,
      locale: 'kk',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scoringVersion: 'ent-v1',
      manifestHash: seeded.manifestHash,
      items: [{ versionId: seeded.versionId }],
    }],
  };
}

async function seedLegacyHistory(db: DbHarness, actor: TestActor): Promise<{
  questionId: string;
  submittedSessionId: string;
  activeSessionId: string;
  attemptId: string;
}> {
  const suffix = crypto.randomUUID();
  const subjectId = await db.scalar<string>(
    `INSERT INTO public.subjects (slug, name_ru, name_kk, is_active)
     VALUES ($1, 'Legacy subject', 'Legacy пәні', true) RETURNING id`,
    [`l01-legacy-${suffix}`]
  );
  const topicId = await db.scalar<string>(
    `INSERT INTO public.topics (subject_id, slug, name_ru, name_kk)
     VALUES ($1, $2, 'Legacy topic', 'Legacy тақырыбы') RETURNING id`,
    [subjectId, `l01-legacy-${suffix}`]
  );
  const questionId = await db.scalar<string>(
    `INSERT INTO public.questions (topic_id, language, type, body, is_published)
     VALUES ($1, 'kk', 'single', $2::jsonb, true) RETURNING id`,
    [topicId, JSON.stringify({ stem: 'legacy', options: [{ id: 'A', content: 'A' }], correct: 'A' })]
  );
  const submittedSessionId = await db.scalar<string>(
    `INSERT INTO public.sessions (user_id, topic_id, mode, total_questions, finished_at)
     VALUES ($1, $2, 'practice', 1, now()) RETURNING id`,
    [actor.id, topicId]
  );
  const activeSessionId = await db.scalar<string>(
    `INSERT INTO public.sessions (user_id, topic_id, mode, total_questions)
     VALUES ($1, $2, 'practice', 1) RETURNING id`,
    [actor.id, topicId]
  );
  const attemptId = await db.scalar<string>(
    `INSERT INTO public.attempts (user_id, question_id, session_id, given_answer, is_correct)
     VALUES ($1, $2, $3, '"A"'::jsonb, true) RETURNING id`,
    [actor.id, questionId, submittedSessionId]
  );
  return { questionId, submittedSessionId, activeSessionId, attemptId };
}

describe('0024 learning integrity migration path', () => {
  afterAll(async () => {
    // Leave the shared local harness on the current schema for following files
    // and for any local operator using it after the test run.
    await resetTo();
  }, 90_000);

  it('applies to an empty learning-history baseline', async () => {
    await resetTo('0023');
    const db = await createDbHarness();
    try {
      await applyL01(db);
      expect(await db.scalar<string>(`SELECT to_regclass('public.question_versions')::text`))
        .toBe('question_versions');
      expect(await db.scalar<string>('SELECT count(*) FROM public.sessions')).toBe('0');
      expect(await db.scalar<string>('SELECT count(*) FROM public.attempts')).toBe('0');
    } finally {
      await db.close();
    }
  }, 90_000);

  it('preserves and labels populated 0023 history before protecting its question', async () => {
    await resetTo('0023');
    const db = await createDbHarness();
    try {
      const actor = await db.actor('migration-legacy');
      const legacy = await seedLegacyHistory(db, actor);

      await applyL01(db);

      expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [legacy.submittedSessionId]))
        .toBe('submitted');
      expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [legacy.activeSessionId]))
        .toBe('active');
      expect(await db.scalar<number>('SELECT integrity_version FROM public.sessions WHERE id = $1', [legacy.submittedSessionId]))
        .toBe(0);
      expect(await db.scalar<number>('SELECT integrity_version FROM public.attempts WHERE id = $1', [legacy.attemptId]))
        .toBe(0);
      expect(await db.scalar<string>('SELECT id FROM public.attempts WHERE id = $1', [legacy.attemptId]))
        .toBe(legacy.attemptId);
      await expect(db.scalar('DELETE FROM public.questions WHERE id = $1', [legacy.questionId]))
        .rejects.toThrow();
    } finally {
      await db.close();
    }
  }, 90_000);

  it('adds service-only RPC after the L01 schema without rewriting legacy history', async () => {
    await resetTo('0024');
    const db = await createDbHarness();
    try {
      const actor = await db.actor('migration-l02');
      const legacy = await seedLegacyHistory(db, actor);
      await applyL02(db);

      expect(await db.scalar<string>(
        `SELECT to_regprocedure('public.commit_learning_v1(uuid,uuid,text,uuid,jsonb,text)')::text`
      )).toBe('commit_learning_v1(uuid,uuid,text,uuid,jsonb,text)');
      expect(await db.scalar<number>('SELECT integrity_version FROM public.sessions WHERE id = $1', [legacy.submittedSessionId]))
        .toBe(0);
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('authenticated', 'public.commit_learning_v1(uuid,uuid,text,uuid,jsonb,text)', 'EXECUTE')`
      )).toBe(false);
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('service_role', 'public.commit_learning_v1(uuid,uuid,text,uuid,jsonb,text)', 'EXECUTE')`
      )).toBe(true);
    } finally {
      await db.close();
    }
  }, 90_000);

  it('preserves populated 0026 sessions and receipts when applying the 0027 correction', async () => {
    await resetTo('0026');
    const db = await createDbHarness();
    let actor: TestActor | undefined;
    try {
      actor = await db.actor('migration-l02a-r');
      const seeded = await seedApprovedVersion(db);
      const firstOperationId = crypto.randomUUID();
      const firstStart = await db.rpc('service', 'start_learning_v1', {
        actor_id: actor.id,
        operation_id: firstOperationId,
        payload_hash: 'start:before-0027:first',
        plan: trustedPlan(seeded),
      });
      expect(firstStart.status, JSON.stringify(firstStart.data)).toBe(200);
      const firstSession = (firstStart.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;
      const submitOperationId = crypto.randomUUID();
      const submitArgs = {
        actor_id: actor.id,
        operation_id: submitOperationId,
        payload_hash: 'submit:before-0027',
        session_id: firstSession.id,
        scoring_version: 'ent-v1',
        graded_items: [{
          itemId: firstSession.itemIds[0],
          questionVersionId: seeded.versionId,
          answer: 'A',
          points: 1,
          maxPoints: 1,
          timeSpentMs: 1_000,
        }],
      };
      const acceptedBeforeUpgrade = await db.rpc('service', 'commit_learning_v1', submitArgs);
      expect(acceptedBeforeUpgrade.status, JSON.stringify(acceptedBeforeUpgrade.data)).toBe(200);

      const activeStartOperationId = crypto.randomUUID();
      const activeStart = await db.rpc('service', 'start_learning_v1', {
        actor_id: actor.id,
        operation_id: activeStartOperationId,
        payload_hash: 'start:before-0027:active',
        plan: trustedPlan(seeded),
      });
      expect(activeStart.status, JSON.stringify(activeStart.data)).toBe(200);
      const activeSession = (activeStart.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;

      await applyMigration(db, l02aCorrectionMigrationPath);

      expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [firstSession.id]))
        .toBe('submitted');
      expect(await db.scalar<boolean>('SELECT receipt IS NOT NULL FROM public.sessions WHERE id = $1', [firstSession.id]))
        .toBe(true);
      expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [activeSession.id]))
        .toBe('active');

      const activeSubmit = await db.rpc('service', 'commit_learning_v1', {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: 'submit:after-0027:issued-before-upgrade',
        session_id: activeSession.id,
        scoring_version: 'ent-v1',
        graded_items: [{
          itemId: activeSession.itemIds[0],
          questionVersionId: seeded.versionId,
          answer: 'A',
          points: 1,
          maxPoints: 1,
          timeSpentMs: 1_000,
        }],
      });
      expect(activeSubmit.status, JSON.stringify(activeSubmit.data)).toBe(200);
      expect(activeSubmit.data).toMatchObject({ score: 1, maxScore: 1 });
      expect(await db.scalar<number>(
        'SELECT count(*)::int FROM public.session_items WHERE session_id = $1 AND question_version_id = $2',
        [activeSession.id, seeded.versionId]
      )).toBe(1);
      expect(await db.scalar<number>('SELECT total_questions FROM public.sessions WHERE id = $1', [activeSession.id]))
        .toBe(1);
      expect(await db.scalar<string>('SELECT manifest_hash FROM public.sessions WHERE id = $1', [activeSession.id]))
        .toBe(seeded.manifestHash);

      const startReplayAfterUpgrade = await db.rpc('service', 'start_learning_v1', {
        actor_id: actor.id,
        operation_id: activeStartOperationId,
        payload_hash: 'start:before-0027:active',
        plan: trustedPlan(seeded),
      });
      expect(startReplayAfterUpgrade.status, JSON.stringify(startReplayAfterUpgrade.data)).toBe(200);
      expect(startReplayAfterUpgrade.data).toEqual(activeStart.data);
      const replayAfterUpgrade = await db.rpc('service', 'commit_learning_v1', submitArgs);
      expect(replayAfterUpgrade.status, JSON.stringify(replayAfterUpgrade.data)).toBe(200);
      expect(replayAfterUpgrade.data).toEqual(acceptedBeforeUpgrade.data);
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('authenticated', 'public.commit_learning_v1(uuid,uuid,text,uuid,jsonb,text)', 'EXECUTE')`
      )).toBe(false);
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('anon', 'public.commit_learning_v1(uuid,uuid,text,uuid,jsonb,text)', 'EXECUTE')`
      )).toBe(false);
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('service_role', 'public.commit_learning_v1(uuid,uuid,text,uuid,jsonb,text)', 'EXECUTE')`
      )).toBe(true);
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('authenticated', 'public.start_learning_v1(uuid,uuid,text,jsonb)', 'EXECUTE')`
      )).toBe(false);
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('anon', 'public.start_learning_v1(uuid,uuid,text,jsonb)', 'EXECUTE')`
      )).toBe(false);
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('service_role', 'public.start_learning_v1(uuid,uuid,text,jsonb)', 'EXECUTE')`
      )).toBe(true);
    } finally {
      if (actor) {
        await db.execute('DELETE FROM public.attempts WHERE user_id = $1', [actor.id]);
        await db.execute(
          `DELETE FROM public.session_items
           WHERE session_id IN (SELECT id FROM public.sessions WHERE user_id = $1)`,
          [actor.id]
        );
        await db.execute('DELETE FROM public.reward_ledger WHERE user_id = $1', [actor.id]);
        await db.execute('DELETE FROM public.operation_receipts WHERE actor_id = $1', [actor.id]);
        await db.execute('DELETE FROM public.audit_events WHERE actor_id = $1', [actor.id]);
        await db.execute('DELETE FROM public.sessions WHERE user_id = $1', [actor.id]);
      }
      await db.close();
    }
  }, 90_000);

  it('preserves an accepted 0027 receipt and applies L02b rewards to an active issued session', async () => {
    await resetTo('0027');
    const db = await createDbHarness();
    let actor: TestActor | undefined;
    try {
      actor = await db.actor('migration-l02b');
      const seeded = await seedApprovedVersion(db);
      const acceptedStart = await db.rpc('service', 'start_learning_v1', {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: 'start:before-0028:accepted',
        plan: trustedPlan(seeded),
      });
      expect(acceptedStart.status, JSON.stringify(acceptedStart.data)).toBe(200);
      const acceptedSession = (acceptedStart.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;
      const acceptedSubmitArgs = {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: 'submit:before-0028:accepted',
        session_id: acceptedSession.id,
        scoring_version: 'ent-v1',
        graded_items: [{
          itemId: acceptedSession.itemIds[0], questionVersionId: seeded.versionId,
          answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1_000,
        }],
      };
      const acceptedBeforeUpgrade = await db.rpc('service', 'commit_learning_v1', acceptedSubmitArgs);
      expect(acceptedBeforeUpgrade.status, JSON.stringify(acceptedBeforeUpgrade.data)).toBe(200);

      const activeStart = await db.rpc('service', 'start_learning_v1', {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: 'start:before-0028:active',
        plan: trustedPlan(seeded),
      });
      expect(activeStart.status, JSON.stringify(activeStart.data)).toBe(200);
      const activeSession = (activeStart.data as { sessions: { id: string; itemIds: string[] }[] }).sessions[0]!;

      await applyMigration(db, l02bRewardsMigrationPath);

      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('authenticated', 'public.commit_learning_v1_l02a(uuid,uuid,text,uuid,jsonb,text)', 'EXECUTE')`
      )).toBe(false);
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('anon', 'public.commit_learning_v1_l02a(uuid,uuid,text,uuid,jsonb,text)', 'EXECUTE')`
      )).toBe(false);
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('service_role', 'public.commit_learning_v1_l02a(uuid,uuid,text,uuid,jsonb,text)', 'EXECUTE')`
      )).toBe(true);

      const receiptReplay = await db.rpc('service', 'commit_learning_v1', acceptedSubmitArgs);
      expect(receiptReplay.status, JSON.stringify(receiptReplay.data)).toBe(200);
      expect(receiptReplay.data).toEqual(acceptedBeforeUpgrade.data);

      const activeSubmit = await db.rpc('service', 'commit_learning_v1', {
        actor_id: actor.id,
        operation_id: crypto.randomUUID(),
        payload_hash: 'submit:after-0028:issued-before-upgrade',
        session_id: activeSession.id,
        scoring_version: 'ent-v1',
        graded_items: [{
          itemId: activeSession.itemIds[0], questionVersionId: seeded.versionId,
          answer: 'A', points: 1, maxPoints: 1, timeSpentMs: 1_000,
        }],
      });
      expect(activeSubmit.status, JSON.stringify(activeSubmit.data)).toBe(200);
      expect(await db.scalar<number>('SELECT current_streak FROM public.profiles WHERE id = $1', [actor.id])).toBe(1);
      expect(await db.scalar<number>(
        `SELECT count(*)::int FROM public.user_achievements
         WHERE user_id = $1 AND achievement_key = 'first-question'`, [actor.id]
      )).toBe(1);
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('authenticated', 'public.commit_learning_v1(uuid,uuid,text,uuid,jsonb,text)', 'EXECUTE')`
      )).toBe(false);
    } finally {
      if (actor) {
        await db.execute('DELETE FROM public.user_achievements WHERE user_id = $1', [actor.id]);
        await db.execute('DELETE FROM public.attempts WHERE user_id = $1', [actor.id]);
        await db.execute(
          `DELETE FROM public.session_items
           WHERE session_id IN (SELECT id FROM public.sessions WHERE user_id = $1)`,
          [actor.id]
        );
        await db.execute('DELETE FROM public.reward_ledger WHERE user_id = $1', [actor.id]);
        await db.execute('DELETE FROM public.operation_receipts WHERE actor_id = $1', [actor.id]);
        await db.execute('DELETE FROM public.audit_events WHERE actor_id = $1', [actor.id]);
        await db.execute('DELETE FROM public.sessions WHERE user_id = $1', [actor.id]);
      }
      await db.close();
    }
  }, 90_000);

  it('preserves populated 0034 pilot sessions, facts, and receipts when applying 0035', async () => {
    await resetTo('0034');
    const db = await createDbHarness();
    try {
      const school = await seedPilotSchoolPair(db);
      const program = await seedApprovedPilotProgram(db);
      const publish = async () => db.rpc(school.teacherA, 'pilot_publish_assignment_v1', {
        operation_id: crypto.randomUUID(), group_id: school.groupA, program_id: program.id,
        opens_at: new Date(Date.now() - 60_000).toISOString(),
        due_at: new Date(Date.now() + 3_600_000).toISOString(),
        closes_at: new Date(Date.now() + 7_200_000).toISOString(),
      });
      const acceptedAssignment = await publish();
      expect(acceptedAssignment.status, JSON.stringify(acceptedAssignment.data)).toBe(200);
      const acceptedStart = await db.rpc('service', 'pilot_start_assigned_learning_v1', {
        actor_id: school.studentA.id, operation_id: crypto.randomUUID(), payload_hash: 'a'.repeat(64),
        assignment_id: (acceptedAssignment.data as { assignmentId: string }).assignmentId,
      });
      expect(acceptedStart.status, JSON.stringify(acceptedStart.data)).toBe(200);
      const acceptedSessionId = (acceptedStart.data as { sessionId: string }).sessionId;
      const acceptedItemId = (acceptedStart.data as { sessionItemId: string }).sessionItemId;
      const versionType = await db.scalar<string>('SELECT type::text FROM public.question_versions WHERE id = $1', [program.questionVersionId]);
      const acceptedSubmitArgs = {
        actor_id: school.studentA.id, operation_id: crypto.randomUUID(), payload_hash: 'b'.repeat(64),
        session_id: acceptedSessionId, scoring_version: 'ent-v1',
        graded_items: [{ itemId: acceptedItemId, questionVersionId: program.questionVersionId, answer: null,
          points: 0, maxPoints: versionType === 'matching' || versionType === 'multi' ? 2 : 1, timeSpentMs: 0 }],
      };
      const acceptedBeforeUpgrade = await db.rpc('service', 'commit_learning_v1', acceptedSubmitArgs);
      expect(acceptedBeforeUpgrade.status, JSON.stringify(acceptedBeforeUpgrade.data)).toBe(200);

      const activeAssignment = await publish();
      expect(activeAssignment.status, JSON.stringify(activeAssignment.data)).toBe(200);
      const activeStartArgs = {
        actor_id: school.studentA.id, operation_id: crypto.randomUUID(), payload_hash: 'c'.repeat(64),
        assignment_id: (activeAssignment.data as { assignmentId: string }).assignmentId,
      };
      const activeBeforeUpgrade = await db.rpc('service', 'pilot_start_assigned_learning_v1', activeStartArgs);
      expect(activeBeforeUpgrade.status, JSON.stringify(activeBeforeUpgrade.data)).toBe(200);
      const activeSessionId = (activeBeforeUpgrade.data as { sessionId: string }).sessionId;

      await applyMigration(db, pilotBindingCorrectionMigrationPath);

      expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [acceptedSessionId])).toBe('submitted');
      expect(await db.scalar<string>('SELECT status FROM public.sessions WHERE id = $1', [activeSessionId])).toBe('active');
      expect(await db.scalar<number>(
        'SELECT count(*)::integer FROM public.attempts WHERE session_id = $1 AND integrity_version = 1', [acceptedSessionId],
      )).toBe(1);
      expect(await db.scalar<number>(
        `SELECT count(*)::integer FROM public.pilot_learning_receipts
         WHERE actor_id = $1 AND operation_id = $2`, [school.studentA.id, activeStartArgs.operation_id],
      )).toBe(1);

      const acceptedReplay = await db.rpc('service', 'commit_learning_v1', acceptedSubmitArgs);
      expect(acceptedReplay.status, JSON.stringify(acceptedReplay.data)).toBe(200);
      expect(acceptedReplay.data).toEqual(acceptedBeforeUpgrade.data);
      const activeReplay = await db.rpc('service', 'pilot_start_assigned_learning_v1', activeStartArgs);
      expect(activeReplay.status, JSON.stringify(activeReplay.data)).toBe(200);
      expect(activeReplay.data).toMatchObject({ status: 'active', sessionId: activeSessionId });
      expect(activeReplay.data).not.toHaveProperty('sessionItemId');
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('authenticated', 'public.pilot_start_assigned_learning_v1(uuid,uuid,text,uuid)', 'EXECUTE')`,
      )).toBe(false);
      expect(await db.scalar<boolean>(
        `SELECT has_function_privilege('service_role', 'public.pilot_start_assigned_learning_v1(uuid,uuid,text,uuid)', 'EXECUTE')`,
      )).toBe(true);
    } finally {
      await db.close();
    }
  }, 90_000);
});
