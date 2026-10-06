import { describe, expect, it } from 'vitest';
import { validateKkCandidates, batchIdFromHash } from './translation-candidate';
import { executeContentCommand, parseContentCommand, parseRuImportArtifact } from './reviewed-content-import';
import { sourceHash } from './kazakh-coverage';

const topic = '10000000-0000-4000-8000-000000000001';
const contextId = '40000000-0000-4000-8000-000000000004';
const ruSnapshots = {
  single: { topic_id: topic, type: 'single', difficulty: 2,
    body: { stem: 'Найдите $x$, если $2x=10$', options: [{ id: 'a', content: '5' }, { id: 'b', content: '20' }], correct: 'a' },
    explanation: { blocks: [{ type: 'text', value: 'Делим на 2: $x=5$.' }, { type: 'latex', value: 'x=\\frac{10}{2}\\text{ и всё}' }] },
    context_id: null, context: null },
  multi: { topic_id: topic, type: 'multi', difficulty: 3,
    body: { stem: 'Выберите чётные числа', options: [{ id: 'a', content: '2' }, { id: 'b', content: '3' }, { id: 'c', content: '4' }], correct: ['a', 'c'] },
    explanation: { blocks: [{ type: 'text', value: '2 и 4 делятся на 2.' }] },
    context_id: contextId,
    context: { id: contextId, language: 'ru', title: 'Таблица', content: { blocks: [{ type: 'table', columns: ['Число', 'Остаток'], rows: [['2', '0'], ['3', '1']] }] } } },
  matching: { topic_id: topic, type: 'matching', difficulty: 2,
    body: { stem: 'Сопоставьте', left: [{ id: '1', content: 'Квадрат 3' }, { id: '2', content: 'Куб 2' }], right: ['девять', 'восемь'], correct: { '1': 'девять', '2': 'восемь' } },
    explanation: { blocks: [{ type: 'text', value: '$3^2=9$, $2^3=8$.' }] },
    context_id: contextId,
    context: { id: contextId, language: 'ru', title: 'Таблица', content: { blocks: [{ type: 'table', columns: ['Число', 'Остаток'], rows: [['2', '0'], ['3', '1']] }] } } },
};
const ids = { single: '30000000-0000-4000-8000-000000000001', multi: '30000000-0000-4000-8000-000000000002', matching: '30000000-0000-4000-8000-000000000003' };
const ru = parseRuImportArtifact({ schema: 'alemprep-reviewed-ru-content-v1', batchId: '20000000-0000-4000-8000-000000000002',
  entries: (Object.keys(ids) as (keyof typeof ids)[]).map(key => ({ sourceId: ids[key], sourceHash: sourceHash(ruSnapshots[key]), sourceSnapshot: ruSnapshots[key] })) });
const kkContext = { sourceContextId: contextId, title: 'Кесте', content: { blocks: [{ type: 'table', columns: ['Сан', 'Қалдық'], rows: [['2', '0'], ['3', '1']] }] } };
const translated = {
  single: { body: { stem: '$2x=10$ болса, $x$ табыңыз', options: [{ id: 'a', content: '5' }, { id: 'b', content: '20' }], correct: 'a' },
    explanation: { blocks: [{ type: 'text', value: '2-ге бөлеміз: $x=5$.' }, { type: 'latex', value: 'x=\\frac{10}{2}\\text{ болады}' }] }, context: null },
  multi: { body: { stem: 'Жұп сандарды таңдаңыз', options: [{ id: 'a', content: '2' }, { id: 'b', content: '3' }, { id: 'c', content: '4' }], correct: ['a', 'c'] },
    explanation: { blocks: [{ type: 'text', value: '2 және 4 сандары 2-ге бөлінеді.' }] }, context: kkContext },
  matching: { body: { stem: 'Сәйкестендіріңіз', left: [{ id: '1', content: '3 санының квадраты' }, { id: '2', content: '2 санының кубы' }], right: ['тоғыз', 'сегіз'], correct: { '1': 'тоғыз', '2': 'сегіз' } },
    explanation: { blocks: [{ type: 'text', value: '$3^2=9$, $2^3=8$.' }] }, context: kkContext },
};
type Key = keyof typeof ids;
type Option = { id: string; content: string };
type Block = { type?: string; value: string };
type Translated = {
  body: { stem: string; options: Option[]; left: Option[]; right: string[]; correct: unknown; [key: string]: unknown };
  explanation: { blocks: Block[] };
  context: unknown;
};
function file(change: (sources: Record<Key, ReturnType<typeof record>>) => void = () => {}, humanReviewed = false) {
  const sources = { single: record('single'), multi: record('multi'), matching: record('matching') };
  change(sources);
  return { schema: 'alemprep-kk-candidates-v1', method: 'claude-manual', humanReviewed, sources: Object.values(sources) };
}
function record(key: Key) {
  return { sourceId: ids[key], sourceHash: sourceHash(ruSnapshots[key]), translated: structuredClone(translated[key]) as unknown as Translated, issues: [] as { path: string; reason: string }[], machineChecked: true };
}

describe('KK candidate validator (alemprep-kk-candidates-v1)', () => {
  it('accepts a faithful translation, keeps keys and tolerates \\text{} changes inside latex', () => {
    const result = validateKkCandidates(file(), ru);
    expect(result.entries.map(entry => entry.sourceId)).toEqual(Object.values(ids));
    expect(result.entries[0]).toEqual({ sourceId: ids.single, sourceHash: ru.entries[0].sourceHash, ...translated.single });
  });

  it('fails a corrupted option ID, single/multi key, number, math segment or latex', () => {
    const corruptions: ((s: Record<Key, ReturnType<typeof record>>) => void)[] = [
      s => { s.single.translated.body.options[1].id = 'c'; },
      s => { s.single.translated.body.correct = 'b'; },
      s => { s.multi.translated.body.correct = ['a']; },
      s => { s.single.translated.body.options[1].content = '21'; },
      s => { s.multi.translated.explanation.blocks[0].value = '2 және 6 сандары 2-ге бөлінеді.'; },
      s => { s.single.translated.body.stem = '$2x = 10$ болса, $x$ табыңыз'; },
      s => { s.single.translated.explanation.blocks[1].value = 'x=\\frac{10}{3}\\text{ болады}'; },
      s => { s.single.translated.explanation.blocks[1].type = 'text'; },
      s => { s.single.translated.explanation.blocks.pop(); },
    ];
    for (const corrupt of corruptions) expect(() => validateKkCandidates(file(corrupt), ru)).toThrow(/KK candidates rejected/);
  });

  it('fails a broken matching link, merged right labels or swapped right order', () => {
    expect(() => validateKkCandidates(file(s => { s.matching.translated.body.correct = { '1': 'сегіз', '2': 'сегіз' }; }), ru)).toThrow(/matching link/);
    expect(() => validateKkCandidates(file(s => { s.matching.translated.body.right = ['тоғыз', 'тоғыз']; }), ru)).toThrow(/merged right labels/);
    expect(() => validateKkCandidates(file(s => { s.matching.translated.body.right = ['сегіз', 'тоғыз']; }), ru)).toThrow(/matching link/);
  });

  it('fails table shape changes, invented or diverging shared context and stale or unknown sources', () => {
    const corruptions: ((s: Record<Key, ReturnType<typeof record>>) => void)[] = [
      s => { s.multi.translated.context = { ...kkContext, content: { blocks: [{ type: 'table', columns: ['Сан'], rows: [['2'], ['3']] }] } }; },
      s => { s.matching.translated.context = { ...kkContext, title: 'Басқа кесте' }; },
      s => { s.single.translated.context = kkContext; },
      s => { s.multi.translated.context = { ...kkContext, sourceContextId: '40000000-0000-4000-8000-000000000009' }; },
      s => { s.multi.sourceHash = 'f'.repeat(64); },
      s => { s.multi.sourceId = '30000000-0000-4000-8000-000000000009'; },
      s => { s.single.translated.body.hidden = 'x'; },
    ];
    for (const corrupt of corruptions) expect(() => validateKkCandidates(file(corrupt), ru)).toThrow();
    expect(() => validateKkCandidates({ ...file(), sources: [record('single'), record('single')] }, ru)).toThrow(/duplicate/);
    expect(() => validateKkCandidates({ ...file(), approved: true }, ru)).toThrow();
  });

  it('reports untranslated text as warnings and issues without blocking structure', () => {
    const result = validateKkCandidates(file(s => {
      s.multi.translated.body.stem = 'Выберите чётные числа';
      s.single.issues.push({ path: 'body.stem', reason: 'check term' });
    }), ru);
    expect(result.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: ids.multi, message: 'unchanged Cyrillic' })]));
    expect(result.withIssues).toEqual([ids.single]);
  });
});

describe('KK import command', () => {
  const args = ['--mode', 'import-kk', '--file', '/private/tmp/kk.json', '--source', '/private/tmp/ru.json', '--review-ref', 'reviews/kk-001.md'];
  it('requires a source and a non-empty review reference and keeps KK flags out of other modes', () => {
    expect(() => parseContentCommand(['--mode', 'import-kk', '--file', '/private/tmp/kk.json', '--source', '/private/tmp/ru.json'])).toThrow();
    expect(() => parseContentCommand(['--mode', 'import-kk', '--file', '/private/tmp/kk.json', '--source', '/private/tmp/ru.json', '--review-ref', '  '])).toThrow();
    expect(() => parseContentCommand(['--mode', 'import-kk', '--file', '/private/tmp/kk.json', '--review-ref', 'r'])).toThrow();
    expect(() => parseContentCommand(['--file', '/private/tmp/ru.json', '--review-ref', 'r'])).toThrow();
    expect(() => parseContentCommand([...args, '--batch-id', 'not-a-uuid'])).toThrow();
    expect(parseContentCommand(args)).toMatchObject({ mode: 'import-kk', apply: false, reviewRef: 'reviews/kk-001.md' });
  });

  it('dry-runs by default without RPC and never treats a forged humanReviewed flag as approval', async () => {
    const command = parseContentCommand(args);
    const calls: string[] = [];
    const rpc = async (name: string, input: Record<string, unknown>) => {
      calls.push(name);
      const entries = input.entries as { sourceId: string }[];
      return { data: { batchId: input.batch_id, locale: 'kk', versions: entries.map((entry, i) => ({ sourceId: entry.sourceId,
        questionId: `60000000-0000-4000-8000-00000000000${i}`, versionId: `70000000-0000-4000-8000-00000000000${i}`,
        familyId: `80000000-0000-4000-8000-00000000000${i}`, contentHash: 'sha256:' + 'a'.repeat(64), locale: 'kk' })) }, error: null };
    };
    const forged = file(undefined, true);
    const dry = await executeContentCommand(command, forged, 'https://example.supabase.co', rpc, ru) as { dryRun: boolean; batchId: string; batchHash: string; count: number };
    expect(dry).toMatchObject({ dryRun: true, count: 3, locale: 'kk' });
    expect(dry.batchId).toBe(batchIdFromHash(dry.batchHash));
    expect(calls).toEqual([]);
    await expect(executeContentCommand({ ...command, apply: true }, forged, 'https://example.supabase.co', rpc, ru)).rejects.toThrow(/confirm-project/);
    expect(calls).toEqual([]);
    const applied = await executeContentCommand({ ...command, apply: true, confirmProject: 'example' }, forged, 'https://example.supabase.co', rpc, ru);
    expect(calls).toEqual(['content_import_reviewed_kk_v1']);
    expect(applied).toMatchObject({ batchId: dry.batchId, publication: 'draft', versions: [{ locale: 'kk' }, { locale: 'kk' }, { locale: 'kk' }] });
    await expect(executeContentCommand({ ...command, apply: true, confirmProject: 'example' }, forged, 'https://example.supabase.co',
      async () => ({ data: { batchId: dry.batchId, versions: [] }, error: null }), ru)).rejects.toThrow('Invalid import result');
  });

  it('approves KK versions only through the KK acceptance function with explicit review refs', async () => {
    const versionId = '50000000-0000-4000-8000-000000000005', contentHash = 'sha256:' + 'b'.repeat(64);
    const review = { reviewer: 'Synthetic reviewer', reviewedAt: '2026-10-05T10:00:00Z', status: 'accepted', mathRef: 'fixture/math', languageRef: 'fixture/kk', sourceRef: 'fixture/source' };
    const calls: string[] = [];
    const rpc = async (name: string) => { calls.push(name); return { data: { versionId, contentHash, status: 'approved', locale: 'kk' }, error: null }; };
    const command = { ...parseContentCommand(['--mode', 'accept', '--file', '/private/tmp/a.json']), apply: true, confirmProject: 'example' };
    const accepted = await executeContentCommand(command, { schema: 'alemprep-content-acceptance-v1', versions: [{ versionId, contentHash, locale: 'kk', review }] }, 'https://example.supabase.co', rpc);
    expect(calls).toEqual(['content_accept_version_kk_v1']);
    expect(accepted).toEqual({ accepted: [{ versionId, contentHash, status: 'approved', locale: 'kk' }] });
    await expect(executeContentCommand(command, { schema: 'alemprep-content-acceptance-v1', versions: [{ versionId, contentHash, locale: 'kk', review: { ...review, languageRef: '' } }] }, 'https://example.supabase.co', rpc)).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});

describe('KK candidate validator: images', () => {
  const image = { type: 'image', value: 'https://example.test/q/1.png' };
  const snapshot = structuredClone(ruSnapshots.single);
  snapshot.explanation.blocks.push(image);
  const source = parseRuImportArtifact({ schema: 'alemprep-reviewed-ru-content-v1', batchId: '20000000-0000-4000-8000-000000000003',
    entries: [{ sourceId: ids.single, sourceHash: sourceHash(snapshot), sourceSnapshot: snapshot }] });
  const candidate = (value: string) => {
    const translatedSingle = structuredClone(translated.single);
    translatedSingle.explanation.blocks.push({ type: 'image', value });
    return { schema: 'alemprep-kk-candidates-v1', method: 'claude-manual', humanReviewed: false,
      sources: [{ sourceId: ids.single, sourceHash: sourceHash(snapshot), translated: translatedSingle, issues: [], machineChecked: true }] };
  };
  it('keeps the image URL and rejects a swapped one', () => {
    expect(() => validateKkCandidates(candidate(image.value), source)).not.toThrow();
    expect(() => validateKkCandidates(candidate('https://other.test/q/1.png'), source)).toThrow(/KK candidates rejected/);
  });
});
