import type { DbHarness } from '../db/helpers';

export type PilotProgram = {
  id: string;
  itemId: string;
  questionVersionId: string;
};

async function seedPilotProgram(db: DbHarness, status: 'approved' | 'draft'): Promise<PilotProgram> {
  const questionVersionId = await db.scalar<string>(
    `INSERT INTO public.question_versions (
       question_id, family_id, revision, locale, type, public_body, grading_body, content_hash
     )
     SELECT question.id, gen_random_uuid(),
       COALESCE((SELECT MAX(version.revision) + 1 FROM public.question_versions AS version WHERE version.question_id = question.id), 1),
       'ru', question.type, question.body - 'correct', question.body,
       'pilot-test-' || gen_random_uuid()::text
     FROM public.questions AS question
     WHERE question.language = 'ru'
     ORDER BY question.created_at ASC
     LIMIT 1
     RETURNING id`,
  );
  if (!questionVersionId) throw new Error('local seed has no Russian question for pilot programme tests');
  await db.execute(
    `INSERT INTO public.question_publications (question_version_id, status)
     VALUES ($1, 'approved')`,
    [questionVersionId],
  );
  const id = await db.scalar<string>(
    `INSERT INTO public.pilot_programs (title_ru, status, review_ref)
     VALUES ('Синтетическая пилотная программа', 'draft', 'TEST-REVIEW') RETURNING id`,
  );
  const itemId = await db.scalar<string>(
    `INSERT INTO public.pilot_program_items (program_id, position, question_version_id, locale, purpose)
     VALUES ($1, 0, $2, 'ru', 'practice') RETURNING id`,
    [id, questionVersionId],
  );
  if (status === 'approved') {
    await db.execute(`UPDATE public.pilot_programs SET status = 'approved' WHERE id = $1`, [id]);
  }
  return { id, itemId, questionVersionId };
}

/** Creates an approved, Russian practice programme backed by a real version row. */
export async function seedApprovedPilotProgram(db: DbHarness): Promise<PilotProgram> {
  return seedPilotProgram(db, 'approved');
}

/** Creates a mutable draft only for tests of the approval boundary. */
export async function seedDraftPilotProgram(db: DbHarness): Promise<PilotProgram> {
  return seedPilotProgram(db, 'draft');
}
