import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createDbHarness, type DbHarness } from './helpers';
import { seedPilotSchoolPair } from '../fixtures/pilot-school';
import { createLearningStartService } from '@/lib/learning/start';
import { createLearningSubmitService } from '@/lib/learning/submit';
import { createSupabaseLearningContentClient, createSupabaseLearningStateClient, createSupabaseLearningReplayClient, loadStartReplay } from '@/lib/learning/repository';

let db: DbHarness;
afterEach(async () => { await db?.close(); });

type Imported = { batchId: string; versions: { sourceId: string; questionId: string; versionId: string; familyId: string; contentHash: string; locale?: string }[] };
const HASH = 'a'.repeat(64);
const ruBody = { stem: '2+2?', options: [{ id: 'A', content: '4' }, { id: 'B', content: '5' }], correct: 'A' };
const kkBody = { stem: '2+2 неге тең?', options: [{ id: 'A', content: '4' }, { id: 'B', content: '5' }], correct: 'A' };
const kkExplanation = { blocks: [{ type: 'text', value: '2+2=4 болады' }] };

async function topic() {
  const slug = 'import-kk-' + crypto.randomUUID();
  const id = await db.scalar<string>(`WITH subject AS (
    INSERT INTO public.subjects(slug,name_ru,name_kk,is_active) VALUES($1,'Test','Test',true) RETURNING id
  ) INSERT INTO public.topics(subject_id,slug,name_ru,name_kk) SELECT id,$1,'Test','Test' FROM subject RETURNING id`, [slug]);
  return { id, slug };
}

/** An RU question imported by 0038 (draft) and, unless asked otherwise, approved. */
async function ruSource(options: { topicId?: string; contextId?: string | null; type?: string; body?: object; approve?: boolean } = {}) {
  const topicId = options.topicId ?? (await topic()).id;
  const sourceId = await db.scalar<string>(`INSERT INTO public.questions(topic_id,language,type,difficulty,body,explanation,is_published,context_id)
    VALUES($1,'ru',$2::public.question_type,2,$3,'{"blocks":[{"type":"text","value":"2+2=4"}]}',true,$4) RETURNING id`,
    [topicId, options.type ?? 'single', JSON.stringify(options.body ?? ruBody), options.contextId ?? null]);
  const snapshot = JSON.parse(await db.scalar<string>('SELECT public.content_source_snapshot_v1($1)::text', [sourceId]));
  const ru = await db.rpc('service', 'content_import_reviewed_v1', { batch_id: crypto.randomUUID(), batch_hash: 'b'.repeat(64), locale: 'ru',
    entries: [{ sourceId, sourceHash: HASH, sourceSnapshot: snapshot }] });
  expect(ru.status, JSON.stringify(ru.data)).toBe(200);
  const version = (ru.data as Imported).versions[0];
  if (options.approve !== false) {
    const accepted = await db.rpc('service', 'content_accept_version_v1', { version_id: version.versionId, content_hash: version.contentHash,
      math_review_ref: 'synthetic:math', language_review_ref: 'synthetic:ru', source_rights_ref: 'synthetic:rights' });
    expect(accepted.status, JSON.stringify(accepted.data)).toBe(200);
  }
  return { sourceId, topicId, ruVersion: version };
}
function kkEntry(sourceId: string, change: Record<string, unknown> = {}) {
  return { sourceId, sourceHash: HASH, body: kkBody, explanation: kkExplanation, context: null, ...change };
}
function kkInput(entries: object[]) {
  return { batch_id: crypto.randomUUID(), batch_hash: 'c'.repeat(64), review_ref: 'reviews/kk-synthetic.md', entries };
}
const accept = (v: Imported['versions'][number], change: Record<string, unknown> = {}) => db.rpc('service', 'content_accept_version_kk_v1', {
  version_id: v.versionId, content_hash: v.contentHash, math_review_ref: 'synthetic:math', language_review_ref: 'synthetic:kk',
  source_rights_ref: 'synthetic:rights', ...change });

describe('reviewed KK translation import (0039)', () => {
  it('imports a KK draft into the approved RU family and replays without duplicates', async () => {
    db = await createDbHarness();
    const source = await ruSource();
    const args = kkInput([kkEntry(source.sourceId)]);
    const [a, b] = await Promise.all([db.rpc('service', 'content_import_reviewed_kk_v1', args), db.rpc('service', 'content_import_reviewed_kk_v1', args)]);
    expect(a.status, JSON.stringify(a.data)).toBe(200);
    expect(b).toEqual(a);
    const v = (a.data as Imported).versions[0];
    expect(v).toMatchObject({ sourceId: source.sourceId, familyId: source.ruVersion.familyId, locale: 'kk' });
    expect(v.questionId).not.toBe(source.sourceId);
    expect(JSON.parse(await db.scalar<string>(`SELECT jsonb_build_object('src',source_question_id,'lang',language,'pub',is_published,'topic',topic_id)::text
      FROM public.questions WHERE id=$1`, [v.questionId]))).toEqual({ src: source.sourceId, pub: false, lang: 'kk', topic: source.topicId });
    expect(await db.scalar<string>("SELECT locale||':'||status||':'||(public_body ? 'correct')::text FROM public.question_versions v JOIN public.question_publications p ON p.question_version_id=v.id WHERE v.id=$1", [v.versionId])).toBe('kk:draft:false');
    expect(await db.scalar<number>('SELECT count(DISTINCT family_id)::int FROM public.question_versions WHERE family_id=$1', [source.ruVersion.familyId])).toBe(1);
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.question_versions WHERE family_id=$1', [source.ruVersion.familyId])).toBe(2);
    // Same batch id, different payload: conflict, never a second write.
    expect((await db.rpc('service', 'content_import_reviewed_kk_v1', { ...args, batch_hash: 'd'.repeat(64) })).data).toEqual({ error: 'operation-conflict' });
    expect((await db.rpc('service', 'content_import_reviewed_kk_v1', { ...args, review_ref: 'other' })).data).toEqual({ error: 'operation-conflict' });
    // An RU importer replay of a KK batch id is a conflict too (shared receipts).
    expect((await db.rpc('service', 'content_import_reviewed_v1', { batch_id: args.batch_id, batch_hash: args.batch_hash, locale: 'ru',
      entries: [{ sourceId: source.sourceId, sourceHash: HASH, sourceSnapshot: {} }] })).data).toEqual({ error: 'operation-conflict' });
    // A new batch with identical content reuses the same version.
    const again = await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(source.sourceId)]));
    expect((again.data as Imported).versions).toEqual((a.data as Imported).versions);
    expect(await db.scalar<number>("SELECT count(*)::int FROM public.questions WHERE source_question_id=$1 AND language='kk'", [source.sourceId])).toBe(1);
    // A corrected translation becomes a new draft revision of the same KK row and family.
    const fixed = await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(source.sourceId, { body: { ...kkBody, stem: '2+2 нешеге тең?' } })]));
    const f = (fixed.data as Imported).versions[0];
    expect(f).toMatchObject({ questionId: v.questionId, familyId: v.familyId });
    expect(f.versionId).not.toBe(v.versionId);
    expect(await db.scalar<number>('SELECT revision FROM public.question_versions WHERE id=$1', [f.versionId])).toBe(2);
    expect(await db.scalar<number>("SELECT count(*)::int FROM public.audit_events WHERE event_type='content.translation.imported' AND entity_id=$1", [args.batch_id])).toBe(1);
    expect(await db.scalar<string>("SELECT metadata::text FROM public.audit_events WHERE event_type='content.translation.imported' AND entity_id=$1", [args.batch_id])).not.toContain('2+2');
  });

  it('rejects a stale or unapproved source atomically without orphan rows or receipts', async () => {
    db = await createDbHarness();
    const good = await ruSource(), stale = await ruSource(), draft = await ruSource({ approve: false });
    await db.execute('UPDATE public.questions SET difficulty=3 WHERE id=$1', [stale.sourceId]);
    const counts = () => db.scalar<string>(`SELECT jsonb_build_array(
      (SELECT count(*) FROM public.questions WHERE language='kk' AND source_question_id = ANY($1::uuid[])),
      (SELECT count(*) FROM public.question_versions WHERE locale='kk' AND family_id IN (SELECT family_id FROM public.question_versions WHERE question_id = ANY($1::uuid[]))),
      (SELECT count(*) FROM public.content_translation_sources WHERE source_question_id = ANY($1::uuid[])))::text`, [[good.sourceId, stale.sourceId, draft.sourceId]]);
    const before = await counts();
    const staleArgs = kkInput([kkEntry(good.sourceId), kkEntry(stale.sourceId)]);
    const rejected = await db.rpc('service', 'content_import_reviewed_kk_v1', staleArgs);
    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.data).toMatchObject({ message: 'stale-source' });
    expect((await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(good.sourceId), kkEntry(draft.sourceId)]))).data).toMatchObject({ message: 'source-not-approved' });
    expect((await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(good.sourceId, { sourceHash: 'e'.repeat(64) })]))).data).toMatchObject({ message: 'stale-source' });
    expect(await counts()).toBe(before);
    expect(before).toBe('[0, 0, 0]');
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.content_import_receipts WHERE batch_id=$1', [staleArgs.batch_id])).toBe(0);
    // The RU source itself was not touched by the KK importer.
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.question_versions WHERE question_id=$1', [good.sourceId])).toBe(1);
  });

  it('rejects changed grading keys, option IDs, matching links and invented context in the database too', async () => {
    db = await createDbHarness();
    const single = await ruSource();
    const matchingBody = { stem: 'Match', left: [{ id: '1', content: 'a' }, { id: '2', content: 'b' }], right: ['x', 'y'], correct: { 1: 'x', 2: 'y' } };
    const matching = await ruSource({ type: 'matching', body: matchingBody });
    const bad = [
      kkEntry(single.sourceId, { body: { ...kkBody, correct: 'B' } }),
      kkEntry(single.sourceId, { body: { ...kkBody, options: [{ id: 'A', content: '4' }, { id: 'C', content: '5' }] } }),
      kkEntry(single.sourceId, { body: { ...kkBody, hidden: true } }),
      kkEntry(single.sourceId, { context: { sourceContextId: crypto.randomUUID(), title: null, content: { blocks: [] } } }),
      kkEntry(single.sourceId, { explanation: null }),
      kkEntry(matching.sourceId, { body: { ...matchingBody, right: ['икс', 'игрек'], correct: { 1: 'игрек', 2: 'икс' } } }),
      kkEntry(matching.sourceId, { body: { ...matchingBody, right: ['икс', 'икс'], correct: { 1: 'икс', 2: 'икс' } } }),
    ];
    for (const entry of bad) {
      const response = await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([entry]));
      expect(response.status, JSON.stringify(entry)).toBeGreaterThanOrEqual(400);
      expect(response.data).toMatchObject({ message: 'invalid-content' });
    }
    const ok = await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(matching.sourceId, { body: { ...matchingBody, right: ['икс', 'игрек'], correct: { 1: 'икс', 2: 'игрек' } } })]));
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    for (const input of [{ ...kkInput([kkEntry(single.sourceId)]), review_ref: ' ' }, kkInput([kkEntry(single.sourceId), kkEntry(single.sourceId)]),
      kkInput([{ ...kkEntry(single.sourceId), humanReviewed: true }]), kkInput([])]) {
      expect((await db.rpc('service', 'content_import_reviewed_kk_v1', input)).data).toMatchObject({ message: 'invalid-input' });
    }
  });

  it('creates one KK context per shared source context and keeps the RU context untouched', async () => {
    db = await createDbHarness();
    const t = await topic();
    const contextId = await db.scalar<string>("INSERT INTO public.contexts(topic_id,language,title,content) VALUES($1,'ru','Общий текст','{\"blocks\":[{\"value\":\"Текст\"}]}') RETURNING id", [t.id]);
    const first = await ruSource({ topicId: t.id, contextId }), second = await ruSource({ topicId: t.id, contextId });
    const context = { sourceContextId: contextId, title: 'Ортақ мәтін', content: { blocks: [{ value: 'Мәтін' }] } };
    expect((await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(first.sourceId), kkEntry(second.sourceId, { context })]))).data).toMatchObject({ message: 'invalid-content' });
    expect((await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(first.sourceId, { context }), kkEntry(second.sourceId, { context: { ...context, title: 'Басқа' } })]))).data).toMatchObject({ message: 'invalid-input' });
    expect((await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(first.sourceId, { context: { ...context, title: null } })]))).data).toMatchObject({ message: 'invalid-content' });
    const result = await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(first.sourceId, { context }), kkEntry(second.sourceId, { context })]));
    expect(result.status, JSON.stringify(result.data)).toBe(200);
    const versions = (result.data as Imported).versions;
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.content_translation_contexts WHERE source_context_id=$1', [contextId])).toBe(1);
    const kkContext = await db.scalar<string>('SELECT context_id FROM public.content_translation_contexts WHERE source_context_id=$1', [contextId]);
    expect(await db.scalar<string>("SELECT language||':'||title FROM public.contexts WHERE id=$1", [kkContext])).toBe('kk:Ортақ мәтін');
    expect(await db.scalar<number>('SELECT count(DISTINCT context_id)::int FROM public.questions WHERE id = ANY($1::uuid[])', [versions.map(v => v.questionId)])).toBe(1);
    expect(await db.scalar<string>('SELECT context_id FROM public.questions WHERE id=$1', [versions[0].questionId])).toBe(kkContext);
    expect(await db.scalar<string>("SELECT context_snapshot->'blocks'->0->>'value' FROM public.question_versions WHERE id=$1", [versions[0].versionId])).toBe('Ортақ мәтін');
    expect(await db.scalar<string>("SELECT language||':'||title FROM public.contexts WHERE id=$1", [contextId])).toBe('ru:Общий текст');
    // A later batch with the same translation reuses the context row.
    await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(first.sourceId, { context, body: { ...kkBody, stem: 'Өзгерген' } })]));
    expect(await db.scalar<number>('SELECT count(*)::int FROM public.content_translation_contexts WHERE source_context_id=$1', [contextId])).toBe(1);
  });

  it('reuses an existing legacy KK row without modifying it', async () => {
    db = await createDbHarness();
    const source = await ruSource();
    const legacy = await db.scalar<string>(`INSERT INTO public.questions(topic_id,language,type,difficulty,body,source_question_id,source,is_published)
      VALUES($1,'kk','single',2,'{"stem":"legacy","options":[{"id":"A","content":"4"}],"correct":"A"}',$2,'ai_haiku_translation',true) RETURNING id`, [source.topicId, source.sourceId]);
    const before = await db.scalar<string>('SELECT to_jsonb(q)::text FROM public.questions q WHERE id=$1', [legacy]);
    const result = await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(source.sourceId)]));
    expect(result.status, JSON.stringify(result.data)).toBe(200);
    expect((result.data as Imported).versions[0].questionId).toBe(legacy);
    expect(await db.scalar<string>('SELECT to_jsonb(q)::text FROM public.questions q WHERE id=$1', [legacy])).toBe(before);
  });

  it('accepts a KK version only with the exact hash, review refs and a still-approved RU source', async () => {
    db = await createDbHarness();
    const pupil = await db.actor('kk-counts');
    const source = await ruSource();
    const imported = await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(source.sourceId)]));
    const v = (imported.data as Imported).versions[0];
    for (const change of [{ content_hash: 'sha256:' + 'f'.repeat(64) }, { content_hash: source.ruVersion.contentHash }, { math_review_ref: '' }, { language_review_ref: ' ' }, { source_rights_ref: null }]) {
      expect((await accept(v, change)).status, JSON.stringify(change)).toBeGreaterThanOrEqual(400);
    }
    // The RU acceptance function does not approve KK versions, and vice versa.
    expect((await db.rpc('service', 'content_accept_version_v1', { version_id: v.versionId, content_hash: v.contentHash, math_review_ref: 'm', language_review_ref: 'l', source_rights_ref: 's' })).data).toMatchObject({ message: 'not-found' });
    expect((await accept(source.ruVersion)).data).toMatchObject({ message: 'not-found' });
    expect(await db.scalar<string>('SELECT status FROM public.question_publications WHERE question_version_id=$1', [v.versionId])).toBe('draft');
    expect((await db.rpc(pupil, 'content_topic_counts_v1', { content_locale: 'kk' })).data).not.toEqual(expect.arrayContaining([expect.objectContaining({ topic_id: source.topicId })]));
    const accepted = await accept(v);
    expect(accepted.status, JSON.stringify(accepted.data)).toBe(200);
    expect(accepted.data).toEqual({ versionId: v.versionId, contentHash: v.contentHash, status: 'approved', locale: 'kk' });
    expect(await accept(v)).toEqual(accepted);
    expect((await accept(v, { language_review_ref: 'other' })).data).toEqual({ error: 'operation-conflict' });
    expect(await db.scalar<number>("SELECT count(*)::int FROM public.audit_events WHERE entity_id=$1 AND event_type='content.translation.approved'", [v.versionId])).toBe(1);
    expect((await db.rpc(pupil, 'content_topic_counts_v1', { content_locale: 'kk' })).data).toEqual(expect.arrayContaining([{ topic_id: source.topicId, type: 'single', question_count: 1 }]));
    // A quarantined RU source blocks further KK approvals from it.
    const second = await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(source.sourceId, { body: { ...kkBody, stem: 'Жаңа' } })]));
    const sv = (second.data as Imported).versions[0];
    await db.execute("UPDATE public.question_publications SET status='quarantined' WHERE question_version_id=$1", [source.ruVersion.versionId]);
    expect((await accept(sv)).data).toMatchObject({ message: 'source-not-approved' });
    // A changed RU source blocks approval as stale.
    await db.execute("UPDATE public.question_publications SET status='approved' WHERE question_version_id=$1", [source.ruVersion.versionId]);
    await db.execute('UPDATE public.questions SET difficulty=4 WHERE id=$1', [source.sourceId]);
    expect((await accept(sv)).data).toMatchObject({ message: 'stale-source' });
    expect(await db.scalar<string>('SELECT status FROM public.question_publications WHERE question_version_id=$1', [sv.versionId])).toBe('draft');
  });

  it('denies anonymous and pupil import, approval and lineage reads', async () => {
    db = await createDbHarness();
    const pupil = await db.actor('kk-import-pupil');
    const source = await ruSource();
    for (const actor of ['anon', pupil] as const) {
      expect((await db.rpc(actor, 'content_import_reviewed_kk_v1', kkInput([kkEntry(source.sourceId)]))).status).toBeGreaterThanOrEqual(400);
      expect((await db.rpc(actor, 'content_accept_version_kk_v1', { version_id: crypto.randomUUID(), content_hash: 'h', math_review_ref: 'm', language_review_ref: 'l', source_rights_ref: 's' })).status).toBeGreaterThanOrEqual(400);
      expect((await db.rpc(actor, 'content_sha256_v1', { value: 'x' })).status).toBeGreaterThanOrEqual(400);
      expect((await db.rest(actor === 'anon' ? null : actor, '/content_translation_sources?select=*')).status).toBeGreaterThanOrEqual(400);
      expect((await db.rest(actor === 'anon' ? null : actor, '/content_translation_contexts?select=*')).status).toBeGreaterThanOrEqual(400);
    }
    expect(await db.scalar<number>("SELECT count(*)::int FROM public.questions WHERE source_question_id=$1", [source.sourceId])).toBe(0);
    expect(await db.scalar<boolean>("SELECT relrowsecurity FROM pg_class WHERE oid='public.content_translation_sources'::regclass")).toBe(true);
    expect(await db.scalar<boolean>("SELECT relrowsecurity FROM pg_class WHERE oid='public.content_translation_contexts'::regclass")).toBe(true);
  });

  it('counts an RU answer and a KK answer of one family as one first-family score in the teacher report', async () => {
    db = await createDbHarness();
    const school = await seedPilotSchoolPair(db);
    const t = await topic();
    const source = await ruSource({ topicId: t.id });
    const imported = await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(source.sourceId)]));
    expect((await accept((imported.data as Imported).versions[0])).status).toBe(200);
    const admin = db.adminClient();
    const replay = createSupabaseLearningReplayClient(admin);
    const start = createLearningStartService({ actorId: async () => school.studentA.id, content: createSupabaseLearningContentClient(admin), rpc: admin, now: () => new Date(), findReplay: ({ actorId, operationId, payloadHash }) => loadStartReplay(replay, actorId, operationId, payloadHash) });
    const submit = createLearningSubmitService({ actorId: async () => school.studentA.id, issued: createSupabaseLearningStateClient(admin), rpc: admin });
    for (const [locale, answer] of [['ru', 'A'], ['kk', 'A']] as const) {
      const issued = await start.startLearning({ operationId: crypto.randomUUID(), locale, mode: 'practice', topicSlug: t.slug });
      expect(issued.ok, JSON.stringify(issued)).toBe(true);
      if (!issued.ok) throw new Error('start rejected');
      const session = issued.value.sessions[0];
      expect(await db.scalar<string>('SELECT v.locale FROM public.session_items i JOIN public.question_versions v ON v.id=i.question_version_id WHERE i.id=$1', [session.items[0].id])).toBe(locale);
      const result = await submit.submitLearning({ operationId: crypto.randomUUID(), sessionId: session.id, answers: [{ itemId: session.items[0].id, answer, timeSpentMs: 100 }] });
      expect(result.ok, JSON.stringify(result)).toBe(true);
    }
    const report = await db.rpc(school.teacherA, 'pilot_teacher_dashboard_v1', { target_group_id: school.groupA });
    expect(report.status).toBe(200);
    expect(report.data).toMatchObject({ students: [{ id: school.studentA.id, attempts: 2, uniqueQuestions: 1, firstPoints: 1, firstMaxPoints: 1 }] });
    // Both answers are correct, but XP for the family is paid once.
    expect(await db.scalar<number>("SELECT coalesce(sum(amount),0)::int FROM public.reward_ledger WHERE user_id=$1 AND reward_key LIKE 'correct-family:%'", [school.studentA.id])).toBe(10);
    // The pupil's own progress still finds the topic of the hidden (unpublished) KK row.
    const questionIds = JSON.parse(await db.scalar<string>("SELECT jsonb_agg(DISTINCT question_id)::text FROM public.attempts WHERE user_id=$1", [school.studentA.id])) as string[];
    expect(questionIds).toHaveLength(2);
    const visible = await db.rest(school.studentA, `/questions?select=id&id=in.(${questionIds.join(',')})`);
    expect((visible.data as unknown[]).length).toBe(1);
    const topics = await db.rpc(school.studentA, 'my_attempted_question_topics_v1', { question_ids: questionIds });
    expect(topics.status, JSON.stringify(topics.data)).toBe(200);
    expect((topics.data as { topic_id: string }[]).map((row) => row.topic_id)).toEqual([t.id, t.id]);
    // Another pupil learns nothing about questions they never attempted; anon cannot call it.
    expect((await db.rpc(school.studentB, 'my_attempted_question_topics_v1', { question_ids: questionIds })).data).toEqual([]);
    expect((await db.rpc('anon', 'my_attempted_question_topics_v1', { question_ids: questionIds })).status).toBeGreaterThanOrEqual(400);
  });

  it('approves at most one KK version per family until the old one is quarantined', async () => {
    db = await createDbHarness();
    const source = await ruSource();
    const first = (await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(source.sourceId)]))).data as Imported;
    expect((await accept(first.versions[0])).status).toBe(200);
    const fixed = (await db.rpc('service', 'content_import_reviewed_kk_v1', kkInput([kkEntry(source.sourceId, { body: { ...kkBody, stem: '2+2 нешеге тең?' } })]))).data as Imported;
    expect((await accept(fixed.versions[0])).data).toEqual({ error: 'kk-already-approved' });
    expect(await db.scalar<string>('SELECT status FROM public.question_publications WHERE question_version_id=$1', [fixed.versions[0].versionId])).toBe('draft');
    // Re-accepting the already approved version stays idempotent.
    expect((await accept(first.versions[0])).status).toBe(200);
    await db.execute("UPDATE public.question_publications SET status='quarantined' WHERE question_version_id=$1", [first.versions[0].versionId]);
    expect((await accept(fixed.versions[0])).data).toMatchObject({ status: 'approved', locale: 'kk' });
  });

  it('can reapply the whole 0039 without changing imported versions or receipts', async () => {
    db = await createDbHarness();
    const source = await ruSource();
    const args = kkInput([kkEntry(source.sourceId)]);
    const before = await db.rpc('service', 'content_import_reviewed_kk_v1', args);
    expect(before.status).toBe(200);
    const sql = await readFile('supabase/migrations/0039_reviewed_content_import_kk.sql', 'utf8');
    await db.execute(sql); await db.execute(sql);
    expect(await db.rpc('service', 'content_import_reviewed_kk_v1', args)).toEqual(before);
    expect(await db.scalar<number>("SELECT count(*)::int FROM public.question_versions v JOIN public.questions q ON q.id=v.question_id WHERE q.source_question_id=$1", [source.sourceId])).toBe(1);
  });
});
