import { describe, expect, it } from 'vitest';
import { QUOTES, dailyQuoteIndex } from './quotes';

describe('quotes', () => {
  it('has unique ids and non-empty texts in both languages', () => {
    const ids = new Set(QUOTES.map((q) => q.id));
    expect(ids.size).toBe(QUOTES.length);
    for (const q of QUOTES) {
      expect(q.text.trim()).not.toBe('');
      expect(q.ru.trim()).not.toBe('');
      expect(q.author.kk.trim()).not.toBe('');
      expect(q.author.ru.trim()).not.toBe('');
    }
  });

  it('keeps the same quote for the whole day and moves to the next one tomorrow', () => {
    const a = dailyQuoteIndex('2026-11-16');
    expect(dailyQuoteIndex('2026-11-16')).toBe(a);
    expect(dailyQuoteIndex('2026-11-17')).toBe((a + 1) % QUOTES.length);
  });

  it('always returns a valid index', () => {
    for (const d of ['1970-01-01', '2026-02-29', '2030-12-31', 'not-a-date']) {
      const i = dailyQuoteIndex(d);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(QUOTES.length);
    }
    expect(dailyQuoteIndex('2026-11-16', 0)).toBe(0);
  });
});
