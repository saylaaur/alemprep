import { describe, it, expect } from 'vitest';
import {
  applyTypeFilter,
  detectTypeMismatch,
  inferTypeFromOptionCount,
  looksLikeMatchingStructure,
  parseTypesFlag,
  summarizeByType,
} from './type-signals';
import type { QuestionBody, ReferenceQuestion } from './schema';

function singleBody(optionCount: number): QuestionBody {
  return {
    stem: 'x',
    options: Array.from({ length: optionCount }, (_, i) => ({
      id: String.fromCharCode(97 + i),
      content: String(i),
    })),
    correct: 'a',
  };
}

function matchingBody(): QuestionBody {
  return {
    stem: 'x',
    left: [
      { id: '1', content: 'Гипотенуза' },
      { id: '2', content: 'Площадь' },
    ],
    right: ['10', '14', '24', '48'],
    correct: { '1': '10', '2': '24' },
  };
}

describe('inferTypeFromOptionCount', () => {
  it('treats exactly 4 options as a strong "single" signal', () => {
    expect(inferTypeFromOptionCount(4)).toBe('single');
  });

  it('treats 5 or more options as a strong "multi" signal', () => {
    expect(inferTypeFromOptionCount(5)).toBe('multi');
    expect(inferTypeFromOptionCount(6)).toBe('multi');
    expect(inferTypeFromOptionCount(8)).toBe('multi');
  });

  it('gives no signal for option counts outside the standard shapes', () => {
    expect(inferTypeFromOptionCount(2)).toBeNull();
    expect(inferTypeFromOptionCount(3)).toBeNull();
  });
});

describe('looksLikeMatchingStructure', () => {
  it('is true for a body with two paired lists (left + right, 2+ items each)', () => {
    expect(looksLikeMatchingStructure(matchingBody())).toBe(true);
  });

  it('is false for a plain options body', () => {
    expect(looksLikeMatchingStructure(singleBody(4))).toBe(false);
  });

  it('is false when left has fewer than 2 items (not really a list to match)', () => {
    expect(
      looksLikeMatchingStructure({
        stem: 'x',
        left: [{ id: '1', content: 'a' }],
        right: ['a', 'b'],
        correct: { '1': 'a' },
      }),
    ).toBe(false);
  });

  it('is false for a non-object body', () => {
    expect(looksLikeMatchingStructure(null)).toBe(false);
    expect(looksLikeMatchingStructure('nope')).toBe(false);
  });
});

function ref(type: 'single' | 'multi' | 'matching', body: QuestionBody): Pick<ReferenceQuestion, 'type' | 'body'> {
  return { type, body };
}

describe('detectTypeMismatch', () => {
  it('flags a "single" reported type whose body has 6 options as likely "multi"', () => {
    const mismatch = detectTypeMismatch(ref('single', singleBody(6)));
    expect(mismatch).not.toBeNull();
    expect(mismatch?.suggested).toBe('multi');
    expect(mismatch?.reported).toBe('single');
  });

  it('does not flag a "single" reported type with exactly 4 options', () => {
    expect(detectTypeMismatch(ref('single', singleBody(4)))).toBeNull();
  });

  it('flags a "multi" reported type whose body has exactly 4 options as likely "single"', () => {
    const mismatch = detectTypeMismatch(ref('multi', singleBody(4)));
    expect(mismatch).not.toBeNull();
    expect(mismatch?.suggested).toBe('single');
  });

  it('flags a matching-shaped body reported as "single"', () => {
    const mismatch = detectTypeMismatch(ref('single', matchingBody()));
    expect(mismatch).not.toBeNull();
    expect(mismatch?.suggested).toBe('matching');
  });

  it('does not flag a matching-shaped body correctly reported as "matching"', () => {
    expect(detectTypeMismatch(ref('matching', matchingBody()))).toBeNull();
  });
});

describe('parseTypesFlag', () => {
  it('parses a comma-separated list of valid types', () => {
    expect(parseTypesFlag('multi,matching')).toEqual({ types: ['multi', 'matching'], invalid: [] });
  });

  it('trims whitespace around entries', () => {
    expect(parseTypesFlag('multi, matching')).toEqual({ types: ['multi', 'matching'], invalid: [] });
  });

  it('separates unrecognized entries into invalid', () => {
    expect(parseTypesFlag('multi,bogus')).toEqual({ types: ['multi'], invalid: ['bogus'] });
  });

  it('dedupes repeated types', () => {
    expect(parseTypesFlag('multi,multi')).toEqual({ types: ['multi'], invalid: [] });
  });
});

describe('applyTypeFilter', () => {
  it('keeps everything when no --types filter is configured', () => {
    expect(applyTypeFilter('single', undefined)).toEqual({ keep: true });
    expect(applyTypeFilter('single', [])).toEqual({ keep: true });
  });

  it('keeps an item whose type is in the allowed list', () => {
    expect(applyTypeFilter('multi', ['multi', 'matching'])).toEqual({ keep: true });
  });

  it('filters out an item whose type is not in the allowed list', () => {
    const result = applyTypeFilter('single', ['multi', 'matching']);
    expect(result.keep).toBe(false);
    expect(result.keep === false && result.reason).toMatch(/single/);
  });
});

describe('summarizeByType', () => {
  it('tallies extracted items by type and ignores skip markers', () => {
    const items = [
      ref('single', singleBody(4)),
      ref('single', singleBody(4)),
      ref('multi', singleBody(6)),
      ref('matching', matchingBody()),
      { skip: 'graph' as const, reason: 'x', source_file: 'y' },
    ];
    const summary = summarizeByType(items as never);
    expect(summary.single).toBe(2);
    expect(summary.multi).toBe(1);
    expect(summary.matching).toBe(1);
  });
});
