import { afterEach, describe, expect, it } from 'vitest';
import { createDbHarness, type DbHarness } from './helpers';
import { readFile } from 'node:fs/promises';

let db: DbHarness;
afterEach(async () => { await db?.close(); });

async function source(contextId: string | null = null) {
  const slug = 'import-' + crypto.randomUUID();
  const id = await db.scalar<string>(`WITH subject AS (
    INSERT INTO public.subjects(slug,name_ru,name_kk,is_active) VALUES($1,'Test','Test',true) RETURNING id
  ), topic AS (
    INSERT INTO public.topics(subject_id,slug,name_ru,name_kk) SELECT id,$1,'Test','Test' FROM subject RETURNING id
  ) INSERT INTO public.questions(topic_id,language,type,difficulty,body,explanation,is_published,context_id)
    SELECT id,'ru','single',2,
    '{"stem":"2+2?","options":[{"id":"A","content":"4"},{"id":"B","content":"5"}],"correct":"A"}',
    '{"blocks":[{"type":"text","value":"2+2=4"}]}',true,$2 FROM topic RETURNING id`, [slug,contextId]);
  const snapshot = await db.scalar<string>(`SELECT jsonb_build_object(
    'topic_id',q.topic_id,'type',q.type,'difficulty',q.difficulty,'body',q.body,
    'explanation',q.explanation,'context_id',q.context_id,'context',
    CASE WHEN c.id IS NULL THEN null ELSE jsonb_build_object('id',c.id,'language',c.language,'title',c.title,'content',c.content) END)::text
    FROM public.questions q LEFT JOIN public.contexts c ON c.id=q.context_id WHERE q.id=$1`, [id]);
  return { sourceId: id, sourceHash: 'a'.repeat(64), sourceSnapshot: JSON.parse(snapshot) };
}
type Imported = { versions: { sourceId: string; versionId: string; familyId: string; contentHash: string }[] };
function input(entry: Awaited<ReturnType<typeof source>>) {
  return { batch_id: crypto.randomUUID(), batch_hash: 'b'.repeat(64), locale: 'ru', entries: [entry] };
}

describe('reviewed RU content import', () => {
  it('imports drafts once under concurrent retries and binds the complete batch payload', async () => {
    db = await createDbHarness();
    const entry = await source();
    const args = input(entry);
    const [a,b] = await Promise.all([db.rpc('service','content_import_reviewed_v1',args),db.rpc('service','content_import_reviewed_v1',args)]);
    expect(a.status,JSON.stringify(a.data)).toBe(200);
    expect(b).toEqual(a);
    const version = (a.data as Imported).versions[0];
    expect(version.sourceId).toBe(entry.sourceId);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.question_versions WHERE question_id=$1',[entry.sourceId])).toBe(1);
    expect(await db.scalar<string>('SELECT status FROM public.question_publications WHERE question_version_id=$1',[version.versionId])).toBe('draft');
    expect(await db.scalar<boolean>("SELECT public_body ? 'correct' FROM public.question_versions WHERE id=$1",[version.versionId])).toBe(false);
    const other = await source();
    expect((await db.rpc('service','content_import_reviewed_v1',{...args,entries:[other]})).data).toMatchObject({error:'operation-conflict'});
    const again = await db.rpc('service','content_import_reviewed_v1',{...args,batch_id:crypto.randomUUID()});
    expect((again.data as Imported).versions).toEqual((a.data as Imported).versions);
  });

  it('rejects a stale source atomically without orphan versions or receipts', async () => {
    db = await createDbHarness();
    const first = await source(), second = await source();
    await db.execute("UPDATE public.questions SET difficulty=3 WHERE id=$1",[second.sourceId]);
    const args = {...input(first),entries:[first,second]};
    const response = await db.rpc('service','content_import_reviewed_v1',args);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.data).toMatchObject({message:'stale-source'});
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.question_versions WHERE question_id=ANY($1::uuid[])',[[first.sourceId,second.sourceId]])).toBe(0);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.content_import_receipts WHERE batch_id=$1',[args.batch_id])).toBe(0);
  });

  it('requires exact version hash and review references, keeps approval replay idempotent and quarantined content closed', async () => {
    db = await createDbHarness();
    const entry = await source();
    const result = await db.rpc('service','content_import_reviewed_v1',input(entry));
    expect(result.status,JSON.stringify(result.data)).toBe(200);
    const version = (result.data as Imported).versions[0];
    const acceptance = {version_id:version.versionId,content_hash:version.contentHash,math_review_ref:'synthetic:math',language_review_ref:'synthetic:ru',source_rights_ref:'synthetic:rights'};
    for (const change of [{content_hash:'wrong'},{math_review_ref:''},{language_review_ref:''},{source_rights_ref:''}]) {
      expect((await db.rpc('service','content_accept_version_v1',{...acceptance,...change})).status).toBeGreaterThanOrEqual(400);
    }
    const accepted = await db.rpc('service','content_accept_version_v1',acceptance);
    expect(accepted.status,JSON.stringify(accepted.data)).toBe(200);
    expect(accepted.data).toMatchObject({versionId:version.versionId,status:'approved'});
    expect(await db.rpc('service','content_accept_version_v1',acceptance)).toEqual(accepted);
    expect(await db.scalar<number>("SELECT count(*)::int FROM public.audit_events WHERE entity_id=$1 AND event_type='content.version.approved'",[version.versionId])).toBe(1);
    await db.execute("UPDATE public.question_publications SET status='quarantined' WHERE question_version_id=$1",[version.versionId]);
    expect((await db.rpc('service','content_accept_version_v1',acceptance)).data).toEqual({error:'content-quarantined'});
  });

  it('denies publication if source changed after draft import', async () => {
    db = await createDbHarness();
    const entry = await source();
    const result = await db.rpc('service','content_import_reviewed_v1',input(entry));
    expect(result.status,JSON.stringify(result.data)).toBe(200);
    const version = (result.data as Imported).versions[0];
    await db.execute("UPDATE public.questions SET explanation='{\"blocks\":[{\"value\":\"changed\"}]}' WHERE id=$1",[entry.sourceId]);
    expect((await db.rpc('service','content_accept_version_v1',{version_id:version.versionId,content_hash:version.contentHash,math_review_ref:'math',language_review_ref:'ru',source_rights_ref:'rights'})).status).toBeGreaterThanOrEqual(400);
    expect(await db.scalar<string>('SELECT status FROM public.question_publications WHERE question_version_id=$1',[version.versionId])).toBe('draft');
  });

  it('denies anonymous and pupil import, approval and receipt reads', async () => {
    db = await createDbHarness();
    const pupil = await db.actor('content-import-pupil');
    const entry = await source();
    for (const actor of ['anon',pupil] as const) {
      expect((await db.rpc(actor,'content_import_reviewed_v1',input(entry))).status).toBeGreaterThanOrEqual(400);
      expect((await db.rpc(actor,'content_accept_version_v1',{version_id:crypto.randomUUID(),content_hash:'hash',math_review_ref:'math',language_review_ref:'ru',source_rights_ref:'rights'})).status).toBeGreaterThanOrEqual(400);
    }
    expect((await db.rest(pupil,'/content_import_receipts?select=*')).status).toBeGreaterThanOrEqual(400);
    expect((await db.rest(null,'/content_version_sources?select=*')).status).toBeGreaterThanOrEqual(400);
  });

  it('preserves shared context title and blocks stale context approval', async () => {
    db=await createDbHarness();
    const contextId=await db.scalar<string>("INSERT INTO public.contexts(language,title,content) VALUES('ru','Shared title','{\"blocks\":[{\"value\":\"Shared text\"}]}') RETURNING id");
    const first=await source(contextId),second=await source(contextId);
    const result=await db.rpc('service','content_import_reviewed_v1',{...input(first),entries:[first,second]});
    expect(result.status,JSON.stringify(result.data)).toBe(200);
    const v=(result.data as Imported).versions[0];
    expect(await db.scalar<string>("SELECT context_snapshot->'blocks'->0->>'value' FROM public.question_versions WHERE id=$1",[v.versionId])).toBe('Shared title');
    await db.execute("UPDATE public.contexts SET title='Changed' WHERE id=$1",[contextId]);
    const response=await db.rpc('service','content_accept_version_v1',{version_id:v.versionId,content_hash:v.contentHash,math_review_ref:'math',language_review_ref:'ru',source_rights_ref:'rights'});
    expect(response.data).toMatchObject({message:'stale-source'});
    expect(await db.scalar<string>('SELECT status FROM public.question_publications WHERE question_version_id=$1',[v.versionId])).toBe('draft');
  });

  it('can reapply the whole 0038 without changing imported versions or receipts', async () => {
    db=await createDbHarness();
    const entry=await source(),args=input(entry);
    const before=await db.rpc('service','content_import_reviewed_v1',args);
    expect(before.status).toBe(200);
    const sql=await readFile('supabase/migrations/0038_reviewed_content_import.sql','utf8');
    await db.execute(sql);await db.execute(sql);
    expect(await db.rpc('service','content_import_reviewed_v1',args)).toEqual(before);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.question_versions WHERE question_id=$1',[entry.sourceId])).toBe(1);
  });

  it('exposes only approved locale counts to a pupil, never keys or drafts', async () => {
    db=await createDbHarness();
    const pupil=await db.actor('approved-counts');
    const entry=await source();
    const imported=await db.rpc('service','content_import_reviewed_v1',input(entry));
    expect(imported.status).toBe(200);
    const v=(imported.data as Imported).versions[0];
    const topic=entry.sourceSnapshot.topic_id;
    const before=await db.rpc(pupil,'content_topic_counts_v1',{content_locale:'ru'});
    expect(before.status,JSON.stringify(before.data)).toBe(200);
    expect((before.data as {topic_id:string}[]).some(row=>row.topic_id===topic)).toBe(false);
    const accepted=await db.rpc('service','content_accept_version_v1',{version_id:v.versionId,content_hash:v.contentHash,math_review_ref:'math',language_review_ref:'ru',source_rights_ref:'rights'});
    expect(accepted.status,JSON.stringify(accepted.data)).toBe(200);
    const after=await db.rpc(pupil,'content_topic_counts_v1',{content_locale:'ru'});
    expect(after.data).toEqual(expect.arrayContaining([{topic_id:topic,type:'single',question_count:1}]));
    expect(JSON.stringify(after.data)).not.toContain('correct');
    expect((await db.rpc(pupil,'content_topic_counts_v1',{content_locale:'kk'})).data).not.toEqual(expect.arrayContaining([expect.objectContaining({topic_id:topic})]));
    expect((await db.rpc('anon','content_topic_counts_v1',{content_locale:'ru'})).status).toBeGreaterThanOrEqual(400);
  });
});
