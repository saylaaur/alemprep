import { describe, expect, it } from 'vitest';
import { collectText, estimateBudget, sourceHash, questionSourceHash, pairStatus, selectSample } from './kazakh-coverage';
import type { CoverageQuestion } from './kazakh-coverage';

const question: CoverageQuestion = {
  id: 'R1', topic_id: 'T1', language: 'ru', type: 'single', difficulty: 1,
  context_id: null, source_question_id: null, is_published: true,
  body: { stem: 'Найдите $x^2$', options: [{ id: 'A', content: 'Нет решения' }], correct: 'A' },
  explanation: { blocks: [{ type: 'text', value: 'Ответ' }] },
};

describe('Kazakh inventory and preliminary translation estimate', () => {
  it('counts Unicode code points, deduplicates exact text and skips only matching completed checkpoints', () => {
    const first = estimateBudget(['Қазақ 😀', 'Қазақ 😀', 'Ответ']);
    expect(first).toMatchObject({ rawCharacters: 19, uniqueCharacters: 12, remainingCharacters: 12 });
    const cached = [{ textHash: sourceHash('Қазақ 😀'), locale: 'kk' as const, status: 'completed' as const }];
    expect(estimateBudget(['Қазақ 😀', 'Ответ'], cached).remainingCharacters).toBe(5);
    expect(estimateBudget(['Қазақ 😀'], [{ ...cached[0], status: 'pending' }]).remainingCharacters).toBe(7);
    expect(estimateBudget(['Қазақ 😀'], [{ ...cached[0], locale: 'ru' }]).remainingCharacters).toBe(7);
    expect(estimateBudget(['Жаңа'], cached).remainingCharacters).toBe(4);
  });

  it('extracts table cells, matching labels, explanations and context but excludes IDs, answer keys, image URLs and math blocks', () => {
    const q: CoverageQuestion = { ...question, type: 'matching', body: { stem: 'hidden duplicate', stem_blocks: [{ type: 'table', columns: ['Название'], rows: [['Значение']] }], left: [{ id: 'L1', content: 'Левая' }], right: ['Правая'], correct: { L1: '1' } }, explanation: { blocks: [{ type: 'latex', value: 'x+1' }, { type: 'image', value: 'https://example.com/private.png' }, { value: 'Пояснение $x+1$' }] } };
    expect(collectText(q, { title: 'Контекст', content: { blocks: [{ value: 'Общий текст' }] } })).toEqual(['Название', 'Значение', 'Левая', 'Правая', 'Пояснение', 'Контекст', 'Общий текст']);
  });

  it('does not call drafts or unchecked published pairs ready, and detects changed sources', () => {
    const kk = { ...question, id: 'K1', language: 'kk' as const, source_question_id: 'R1' };
    expect(pairStatus(question, [], new Map())).toBe('missing');
    expect(pairStatus(question, [{ ...kk, is_published: false }], new Map())).toBe('draft');
    expect(pairStatus(question, [kk], new Map())).toBe('published-unverified');
    expect(pairStatus(question, [kk], new Map(), [{ translationId: 'K1', sourceHash: 'old' }])).toBe('stale');
    expect(pairStatus(question, [{ ...kk, source_question_id: 'other' }], new Map())).toBe('missing');
  });

  it('source revision includes shared context and ignores JSON object key order', () => {
    expect(sourceHash({ a: 1, b: 2 })).toBe(sourceHash({ b: 2, a: 1 }));
    const withContext = { ...question, context_id: 'C1' };
    const oldContexts = new Map([['C1', { title: 'Контекст', content: { blocks: [{ value: 'Старый текст' }] } }]]);
    const newContexts = new Map([['C1', { title: 'Контекст', content: { blocks: [{ value: 'Новый текст' }] } }]]);
    expect(questionSourceHash(withContext, oldContexts)).not.toBe(questionSourceHash(withContext, newContexts));
    const kk = { ...question, id: 'K1', language: 'kk' as const, source_question_id: 'R1' };
    expect(pairStatus(withContext, [kk], newContexts, [{ translationId: 'K1', sourceHash: questionSourceHash(withContext, oldContexts) }])).toBe('stale');
  });

  it('selects a deterministic preliminary sample with rare features and excludes drafts/non-Russian', () => {
    const pool = Array.from({ length: 40 }, (_, i) => ({ ...question, id: `R${String(i).padStart(2, '0')}`, topic_id: i === 39 ? 'radicals' : 'T1' }));
    const sample = selectSample([...pool, { ...question, id: 'draft', is_published: false }], new Map(), new Set(['radicals']));
    expect(sample.questions).toHaveLength(30);
    expect(new Set(sample.questions.map(q => q.id)).size).toBe(30);
    expect(sample.questions.some(q => q.id === 'R39')).toBe(true);
    expect(sample.questions.some(q => q.id === 'draft')).toBe(false);
    expect(sample.missingFeatures).toContain('table');
    expect(selectSample([...pool].reverse(), new Map(), new Set(['radicals'])).questions.map(q => q.id)).toEqual(sample.questions.map(q => q.id));
  });
});
