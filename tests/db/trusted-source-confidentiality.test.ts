import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDbHarness, type DbHarness } from './helpers';

let db: DbHarness;
afterEach(async () => { await db?.close(); });

async function fixture() {
  db = await createDbHarness();
  const pupil = await db.actor('source-key-pupil');
  const admin = await db.actor('source-key-editor');
  await db.execute('UPDATE public.profiles SET is_admin=true WHERE id=$1', [admin.id]);
  const topic = await db.scalar<string>('SELECT id FROM public.topics ORDER BY id LIMIT 1');
  const source = await db.scalar<string>(`INSERT INTO public.questions(topic_id,language,type,body,explanation,is_published)
    VALUES($1,'ru','single','{"stem":"synthetic key protection","options":[{"id":"A","content":"4"}],"correct":"A"}',
    '{"blocks":[{"value":"the answer is 4"}]}',true) RETURNING id`, [topic]);
  const path = `/questions?select=id,body,explanation&id=eq.${source}`;
  expect((await db.rest(pupil, path)).data).toHaveLength(1);
  const version = await db.scalar<string>(`INSERT INTO public.question_versions(question_id,family_id,revision,locale,type,public_body,grading_body,content_hash)
    SELECT id,gen_random_uuid(),1,'ru','single',body-'correct',body,$2 FROM public.questions WHERE id=$1 RETURNING id`, [source, 'synthetic-'+crypto.randomUUID()]);
  await db.execute("INSERT INTO public.question_publications(question_version_id,status) VALUES($1,'draft')", [version]);
  return { pupil, admin, source, version, path, topic };
}

describe('trusted-source answer confidentiality through legacy REST', () => {
  it('hides key-bearing sources in draft, approved and quarantine, while preserving service/editor access and trusted counts', async () => {
    const { pupil, admin, source, version, path, topic } = await fixture();
    for (const status of ['draft', 'approved', 'quarantined']) {
      await db.execute('UPDATE public.question_publications SET status=$2 WHERE question_version_id=$1', [version,status]);
      const leaked = await db.rest(pupil, path);
      expect(leaked.status).toBe(200);
      expect(leaked.data, `legacy key exposed in ${status}`).toEqual([]);
      expect((await db.rest(null, path)).data).toEqual([]);
      expect((await db.rest(admin, path)).data).toHaveLength(1);
      expect(await db.scalar<string>("SELECT body->>'correct' FROM public.questions WHERE id=$1", [source])).toBe('A');
      if (status === 'approved') {
        const counts = await db.rpc(pupil,'content_topic_counts_v1',{content_locale:'ru'});
        expect(counts.status).toBe(200);
        expect(counts.data).toEqual(expect.arrayContaining([expect.objectContaining({topic_id:topic})]));
      }
    }
  });

  it('restrictive policy survives permissive legacy policy reapplication and repeated 0041, without changing snapshots', async () => {
    const { pupil, admin, version, path } = await fixture();
    const before = await db.scalar<string>('SELECT row_to_json(v)::text FROM public.question_versions v WHERE id=$1', [version]);
    const sql = readFileSync('supabase/migrations/0041_trusted_source_confidentiality.sql','utf8');
    await db.execute(sql); await db.execute(sql);
    await db.execute(`DROP POLICY IF EXISTS questions_select_published ON public.questions;
      CREATE POLICY questions_select_published ON public.questions FOR SELECT TO authenticated USING(is_published=true)`);
    expect((await db.rest(pupil,path)).data).toEqual([]);
    expect((await db.rest(admin,path)).data).toHaveLength(1);
    expect(await db.scalar<string>('SELECT row_to_json(v)::text FROM public.question_versions v WHERE id=$1',[version])).toBe(before);
  });
});
