import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';
const sql = readFileSync('docs/pilot/quarantine-ambiguous-ru.sql', 'utf8');
const version = sql.match(/WHERE v.id='([^']+)'/)![1]!;
const source = sql.match(/v.question_id='([^']+)'/)![1]!;
const hash = sql.match(/v.content_hash='([^']+)'/)![1]!;

describe('exact ambiguous-content quarantine transaction', () => {
  let db: DbHarness;
  beforeEach(async () => {
    db = await createDbHarness();
    const topic = await db.scalar<string>('SELECT id FROM public.topics ORDER BY id LIMIT 1');
    await db.execute(`INSERT INTO public.questions(id,topic_id,language,type,body,is_published)
      VALUES($1,$2,'ru','single','{"stem":"synthetic quarantine fixture","options":[{"id":"A","content":"4"}],"correct":"A"}',true)`, [source, topic]);
    await db.execute(`INSERT INTO public.question_versions(id,question_id,family_id,revision,locale,type,public_body,grading_body,content_hash)
      SELECT $1,id,gen_random_uuid(),1,'ru','single',body-'correct',body,$3 FROM public.questions WHERE id=$2`, [version, source, hash]);
    await db.execute("INSERT INTO public.question_publications(question_version_id,status) VALUES($1,'approved')", [version]);
  });
  afterEach(async () => {
    if (!db) return;
    const c = await db.connection();
    try {
      await c.execute('DROP TRIGGER IF EXISTS quarantine_audit_failure ON public.audit_events; DROP FUNCTION IF EXISTS public.quarantine_audit_failure()');
      await c.execute("BEGIN; SET LOCAL session_replication_role='replica'");
      await c.execute("DELETE FROM public.audit_events WHERE entity_type='question_version' AND entity_id=$1", [version]);
      await c.execute('DELETE FROM public.question_publications WHERE question_version_id=$1', [version]);
      await c.execute('DELETE FROM public.question_versions WHERE id=$1', [version]);
      await c.execute('DELETE FROM public.questions WHERE id=$1', [source]);
      await c.execute('COMMIT');
    } finally { await c.execute('ROLLBACK'); c.release(); await db.close(); }
  });
  it('quarantines exact version once with one audit, preserving immutable source/snapshot', async () => {
    const before = await db.scalar<string>('SELECT row_to_json(v)::text FROM public.question_versions v WHERE id=$1', [version]);
    await db.execute(sql); await db.execute(sql);
    expect(await db.scalar<string>('SELECT status FROM public.question_publications WHERE question_version_id=$1', [version])).toBe('quarantined');
    expect(await db.scalar<number>("SELECT count(*)::int FROM public.audit_events WHERE entity_id=$1 AND event_type='content.version.quarantined.ambiguous-sum'", [version])).toBe(1);
    expect(await db.scalar<string>('SELECT row_to_json(v)::text FROM public.question_versions v WHERE id=$1', [version])).toBe(before);
    expect(await db.scalar<boolean>('SELECT is_published FROM public.questions WHERE id=$1', [source])).toBe(true);
  });
  it('rolls back publication when mandatory audit cannot be inserted', async () => {
    await db.execute(`CREATE FUNCTION public.quarantine_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.event_type='content.version.quarantined.ambiguous-sum' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END; $$;
      CREATE TRIGGER quarantine_audit_failure BEFORE INSERT ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.quarantine_audit_failure()`);
    const c = await db.connection();
    try { await expect(c.execute(sql)).rejects.toThrow('synthetic audit failure'); }
    finally { await c.execute('ROLLBACK'); c.release(); }
    expect(await db.scalar<string>('SELECT status FROM public.question_publications WHERE question_version_id=$1', [version])).toBe('approved');
    expect(await db.scalar<number>("SELECT count(*)::int FROM public.audit_events WHERE entity_id=$1 AND event_type='content.version.quarantined.ambiguous-sum'", [version])).toBe(0);
  });
});
