import { describe, expect, it } from 'vitest';
import { sourceHash } from './kazakh-coverage';
import { buildSourceBundles, parseExportCommand, sourceSnapshot, splitSourceManifests, type ExportContext, type ExportQuestion, type ExportTopic, type LineageRow } from './translation-source-bundle';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const topics: ExportTopic[] = [
  { id: uuid(901), subject_id: uuid(900), slug: 'progressions', name_ru: 'Прогрессии', name_kk: null },
  { id: uuid(902), subject_id: uuid(900), slug: 'powers', name_ru: 'Степени', name_kk: null },
];
const context: ExportContext = { id: uuid(800), language: 'ru', title: 'Таблица', content: { blocks: [{ type: 'text', value: 'Данные' }] } };
function question(n: number, topic = uuid(901), extra: Partial<ExportQuestion> = {}): ExportQuestion {
  return {
    id: uuid(n), topic_id: topic, context_id: null, language: 'ru', type: 'single', difficulty: 2, is_published: true,
    body: { stem: `Задача ${n}`, options: [{ id: 'a', content: '1' }, { id: 'b', content: '2' }], correct: 'a' },
    explanation: { blocks: [{ type: 'text', value: 'Решение' }] }, ...extra,
  } as ExportQuestion;
}
const build = (questions: ExportQuestion[], lineage: LineageRow[] = [], selection = {}) => buildSourceBundles({
  questions, topics, contexts: [context], lineage, glossary: { 'Прогрессии': 'Прогрессиялар' }, generatedAt: '2026-10-05T00:00:00.000Z',
  selection: { topicSlugs: ['progressions'], maxPerTopic: 100, includeImages: false, ...selection },
});

describe('translation source export (KT1)', () => {
  it('splits 61 unique sources into 30/30/1 and never makes an empty batch', () => {
    const refs = Array.from({ length: 61 }, (_, i) => ({ id: uuid(i + 1), sourceHash: 'h' + i }));
    expect(splitSourceManifests(refs).map(m => m.questions.length)).toEqual([30, 30, 1]);
    expect(splitSourceManifests([])).toEqual([]);
    expect(() => splitSourceManifests([refs[0], refs[0]])).toThrow('Duplicate');
    const { bundles } = build(Array.from({ length: 61 }, (_, i) => question(i + 1)));
    expect(bundles.map(b => b.sources.length)).toEqual([30, 30, 1]);
    expect(new Set(bundles.flatMap(b => b.sources.map(s => s.sourceId))).size).toBe(61);
  });

  it('hashes the same snapshot as SQL content_source_snapshot_v1, context included', () => {
    const q = question(1, uuid(901), { context_id: context.id });
    const [source] = build([q]).bundles[0].sources;
    expect(source.sourceHash).toBe(sourceHash({ topic_id: q.topic_id, type: q.type, difficulty: q.difficulty, body: q.body, explanation: q.explanation, context_id: context.id, context }));
    expect(source.question.body).toEqual(q.body);
    const changed = buildSourceBundles({ ...{ questions: [q], topics, lineage: [], glossary: {}, generatedAt: 'x' }, contexts: [{ ...context, title: 'Другая' }], selection: { topicSlugs: ['progressions'], maxPerTopic: 5, includeImages: false } });
    expect(changed.bundles[0].sources[0].sourceHash).not.toBe(source.sourceHash);
  });

  it('puts RU sources approved at the same hash first and marks them', () => {
    const qs = [question(1, uuid(901), { difficulty: 1 }), question(2, uuid(901), { difficulty: 5 })];
    const hash = sourceHash(sourceSnapshot(qs[1], new Map()));
    const lineage: LineageRow[] = [
      { questionVersionId: uuid(500), sourceQuestionId: uuid(2), sourceHash: hash, locale: 'ru', status: 'approved' },
      { questionVersionId: uuid(501), sourceQuestionId: uuid(1), sourceHash: 'stale', locale: 'ru', status: 'approved' },
    ];
    const { bundles, summary } = build(qs, lineage, { maxPerTopic: 1 });
    expect(bundles[0].sources.map(s => [s.sourceId, s.sourceAcceptance])).toEqual([[uuid(2), 'ru-approved-same-hash']]);
    expect(summary[0]).toMatchObject({ available: 2, approvedRu: 1, selected: 1 });
  });

  it('keeps every approved source even above the per-topic cap', () => {
    const qs = [question(1), question(2), question(3)];
    const lineage = qs.map((q, i) => ({ questionVersionId: uuid(600 + i), sourceQuestionId: q.id, sourceHash: sourceHash(sourceSnapshot(q, new Map())), locale: 'ru' as const, status: 'approved' as const }));
    expect(build(qs, lineage, { maxPerTopic: 1 }).bundles[0].sources).toHaveLength(3);
  });

  it('selects only published RU of the chosen topics and skips images unless asked', () => {
    const image = question(4, uuid(901), { body: { stem: '', stem_blocks: [{ type: 'image', value: 'https://x/y.png' }], options: [{ id: 'a', content: '1' }], correct: 'a' } as ExportQuestion['body'] });
    const qs = [question(1), question(2, uuid(902)), question(3, uuid(901), { is_published: false }), question(5, uuid(901), { language: 'kk' }), image];
    expect(build(qs).bundles[0].sources.map(s => s.sourceId)).toEqual([uuid(1)]);
    expect(build(qs, [], { includeImages: true }).bundles[0].sources.map(s => s.sourceId)).toEqual([uuid(1), uuid(4)]);
    expect(() => build(qs, [], { topicSlugs: ['nope'] })).toThrow('Unknown topics');
  });

  it('parses the command with the pilot default scope and rejects unknown flags', () => {
    expect(parseExportCommand(['--out-dir', '/tmp/x']).selection).toMatchObject({ maxPerTopic: 30, includeImages: false, topicSlugs: expect.arrayContaining(['progressions']) });
    expect(parseExportCommand(['--out-dir', '/tmp/x', '--topics', 'powers, progressions', '--include-images']).selection).toMatchObject({ topicSlugs: ['powers', 'progressions'], includeImages: true });
    expect(() => parseExportCommand(['--topics', 'powers'])).toThrow('--out-dir');
    expect(() => parseExportCommand(['--out-dir', '/tmp/x', '--apply'])).toThrow('Usage');
  });
});
