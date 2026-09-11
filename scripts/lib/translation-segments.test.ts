import { describe, expect, it } from 'vitest';
import {
  applySegmentTranslations,
  extractQuestionSegments,
  applyContextTranslations,
  extractContextSegments,
  inspectManualReviewIssues,
  inspectContextManualReviewIssues,
} from './translation-segments';
import type { TranslationOriginal } from './checks';

const original: TranslationOriginal = {
  type: 'matching',
  body: {
    stem: 'Не найдите $x^2 = 4$ в 2026 году: https://example.test/a.',
    stem_blocks: [
      { type: 'text', value: 'Сопоставьте код `x = 2`.' },
      { type: 'table', columns: ['Число'], rows: [['12'], ['Ответ']] },
    ],
    left: [{ id: 'L1', content: 'Первое значение 2' }],
    right: ['два', 'три'],
    correct: { L1: 'два' },
  },
  explanation: {
    blocks: [
      { type: 'text', value: 'Ответ: два, так как $1 + 1 = 2$.' },
      { type: 'latex', value: '\\text{русский текст}' },
      { type: 'image', value: 'https://example.test/chart.png' },
    ],
  },
};

describe('structured Google translation segments', () => {
  it('translates one shared context once and keeps its table shape and formulae intact', () => {
    const context = { title: 'Жалпы контекст', content: { blocks: [{ type: 'table' as const, columns: ['Атауы'], rows: [['$x=2$'], ['Сөз']] }] } };
    const segments = extractContextSegments(context).segments;
    expect(segments.map(segment => segment.path)).toEqual(['context.title', 'context.content.blocks[0].columns[0]', 'context.content.blocks[0].rows[1][0]']);
    const result = applyContextTranslations(context, segments, segments.map(segment => `KK ${segment.sourceText}`));
    expect(result).toEqual({ ok: true, context: { title: 'KK Жалпы контекст', content: { blocks: [{ type: 'table', columns: ['KK Атауы'], rows: [['$x=2$'], ['KK Сөз']] }] } } });
  });

  it('flags an image or Russian formula text in a shared context for manual review', () => {
    expect(inspectContextManualReviewIssues({ title: 'Контекст $\\text{русский}$', content: { blocks: [{ type: 'image', value: 'https://example.test/image.png' }] } })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'russian-in-latex' }),
      expect.objectContaining({ code: 'image-text-unknown' }),
    ]));
  });

  it('sends only natural-language fields and protects formulae, numbers, code and URLs', () => {
    const extraction = extractQuestionSegments(original);

    expect(extraction.segments.map(segment => segment.path)).toEqual([
      'body.stem', 'body.stem_blocks[0].value', 'body.stem_blocks[1].columns[0]',
      'body.stem_blocks[1].rows[1][0]',
      'body.left[0].content', 'body.right[0]', 'body.right[1]', 'explanation.blocks[0].value',
    ]);
    expect(extraction.segments[0].sourceText).toContain('[[AP_0]]');
    expect(extraction.segments[0].sourceText).toContain('[[AP_1]]');
    expect(extraction.segments[0].sourceText).toContain('[[AP_2]]');
    expect(extraction.segments.find(segment => segment.path === 'body.left[0].content')!.sourceText).toContain('[[AP_0]]');
    expect(extraction.segments.map(segment => segment.sourceText).join(' ')).not.toContain('русский текст');
  });

  it('restores every protected token exactly and preserves matching answer mapping by right-side position', () => {
    const extraction = extractQuestionSegments(original);
    const translated = extraction.segments.map(segment => `KK ${segment.sourceText}`);

    const result = applySegmentTranslations(original, extraction.segments, translated);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.stem).toContain('$x^2 = 4$');
      expect(result.body.stem).toContain('2026');
      expect(result.body.stem).toContain('https://example.test/a.');
      if (!('right' in result.body)) throw new Error('matching body expected');
      expect(result.body.right).toEqual(['KK два', 'KK три']);
      expect(result.body.correct).toEqual({ L1: 'KK два' });
      expect(result.explanation.blocks[1]).toEqual({ type: 'latex', value: '\\text{русский текст}' });
    }
  });

  it.each([
    ['drops', (text: string) => text.replace('[[AP_0]]', '')],
    ['duplicates', (text: string) => `${text} [[AP_0]]`],
    ['alters', (text: string) => text.replace('[[AP_0]]', '[[AP_ZERO]]')],
  ])('rejects a translation that %s a protected placeholder', (_case, mutate) => {
    const extraction = extractQuestionSegments(original);
    const translations = extraction.segments.map(segment => `KK ${segment.sourceText}`);
    translations[0] = mutate(translations[0]);

    expect(applySegmentTranslations(original, extraction.segments, translations)).toMatchObject({ ok: false });
  });

  it('flags Russian formula text and an image for human review instead of silently sending them', () => {
    expect(inspectManualReviewIssues(original)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'russian-in-latex' }),
      expect.objectContaining({ code: 'image-text-unknown' }),
    ]));
  });

  it('inspects every answer and table leaf for protected Russian text and ambiguous units', () => {
    const question: TranslationOriginal = {
      type: 'matching',
      body: {
        stem: 'Сопоставьте значения.',
        stem_blocks: [{ type: 'table', columns: ['Заголовок $\\text{русский}$'], rows: [['12 кг']] }],
        left: [{ id: 'L1', content: 'Левая часть $\\text{русский}$' }],
        right: ['Правая часть 5 см'],
        correct: { L1: 'Правая часть 5 см' },
      },
      explanation: { blocks: [{ type: 'table', columns: ['Итог $\\text{русский}$'], rows: [['3 м']] }] },
    };

    expect(inspectManualReviewIssues(question)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'russian-in-latex', path: 'body.stem_blocks[0].columns[0]' }),
      expect.objectContaining({ code: 'ambiguous-unit', path: 'body.stem_blocks[0].rows[0][0]' }),
      expect.objectContaining({ code: 'russian-in-latex', path: 'body.left[0].content' }),
      expect.objectContaining({ code: 'ambiguous-unit', path: 'body.right[0]' }),
      expect.objectContaining({ code: 'russian-in-latex', path: 'explanation.blocks[0].columns[0]' }),
      expect.objectContaining({ code: 'ambiguous-unit', path: 'explanation.blocks[0].rows[0][0]' }),
    ]));
  });

  it('inspects table leaves in shared contexts', () => {
    const context = {
      title: 'Контекст',
      content: { blocks: [{ type: 'table' as const, columns: ['Атауы $\\text{русский}$'], rows: [['20 км']] }] },
    };
    expect(inspectContextManualReviewIssues(context)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'russian-in-latex', path: 'context.content.blocks[0].columns[0]' }),
      expect.objectContaining({ code: 'ambiguous-unit', path: 'context.content.blocks[0].rows[0][0]' }),
    ]));
  });

  it('uses an approved glossary only for an exact text leaf and flags a sentence that needs Kazakh inflection review', () => {
    const glossary = { Логарифмы: 'Логарифмдер' };
    const exact: TranslationOriginal = {
      type: 'single', body: { stem: 'Логарифмы', options: [{ id: 'A', content: '1' }], correct: 'A' },
      explanation: { blocks: [] },
    };
    const sentence: TranslationOriginal = {
      type: 'single', body: { stem: 'Найдите логарифмы в выражении.', options: [{ id: 'A', content: '1' }], correct: 'A' },
      explanation: { blocks: [] },
    };

    const exactSegments = extractQuestionSegments(exact, glossary).segments;
    expect(exactSegments[0]).toMatchObject({ sourceText: 'Логарифмы', fixedTranslation: 'Логарифмдер' });
    expect(applySegmentTranslations(exact, exactSegments, exactSegments.map(segment => segment.fixedTranslation ?? segment.sourceText))).toMatchObject({
      ok: true,
      body: expect.objectContaining({ stem: 'Логарифмдер' }),
    });
    expect(inspectManualReviewIssues(exact, glossary)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'glossary-inflection-review' }),
    ]));
    expect(inspectManualReviewIssues(sentence, glossary)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'glossary-inflection-review', path: 'body.stem' }),
    ]));
  });
});
