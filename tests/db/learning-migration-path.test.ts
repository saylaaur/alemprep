import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness, type TestActor } from './helpers';
import { assertSafeDbTestTarget } from './test-target';

const execFileAsync = promisify(execFile);
const migrationPath = `${process.cwd()}/supabase/migrations/0024_learning_integrity_schema.sql`;
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
  const sql = await readFile(migrationPath, 'utf8');
  await db.execute(sql);
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
});
