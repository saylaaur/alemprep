import { describe, expect, it } from 'vitest';
import { escapeHtml, isStopCommand, parseStartCode, reminderMessage } from './messages';

describe('telegram commands', () => {
  it('reads the link code from /start', () => {
    expect(parseStartCode('/start abcdefghijklmnop_123')).toBe('abcdefghijklmnop_123');
    expect(parseStartCode('/start@AlemPrepBot abcdefghijklmnop')).toBe('abcdefghijklmnop');
    expect(parseStartCode('/start')).toBeNull();
    expect(parseStartCode('/start short')).toBeNull();
    expect(parseStartCode('/start abcdefghijklmnop; drop')).toBeNull();
    expect(parseStartCode('hello')).toBeNull();
    expect(parseStartCode(42)).toBeNull();
  });

  it('recognises /stop', () => {
    expect(isStopCommand('/stop')).toBe(true);
    expect(isStopCommand(' /stop@AlemPrepBot ')).toBe(true);
    expect(isStopCommand('/stopnow')).toBe(false);
  });
});

describe('reminder message', () => {
  const books = [
    { slug: 'newton-laws', name: 'Законы Ньютона', overdueDays: 0 },
    { slug: 'logarithm-properties', name: 'Логарифм <и> свойства', overdueDays: 2 },
  ];

  it('lists books, marks overdue ones and escapes HTML', () => {
    const m = reminderMessage('ru', books);
    expect(m.text).toContain('<b>📚 Сегодня 2 книги к повторению</b>');
    expect(m.text).toContain('• Законы Ньютона\n');
    expect(m.text).toContain('Логарифм &lt;и&gt; свойства — просрочено на 2 дня');
    expect(m.button).toBe('Открыть библиотеку');
  });

  it('caps the list at six books', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ slug: `b${i}`, name: `Книга ${i}`, overdueDays: 0 }));
    const m = reminderMessage('kk', many);
    expect(m.text).toContain('Бүгін 9 кітапты қайталау керек');
    expect(m.text.match(/^• /gm)).toHaveLength(6);
    expect(m.text).toContain('…тағы 3');
  });

  it('uses correct Russian plurals', () => {
    expect(reminderMessage('ru', books.slice(0, 1)).text).toContain('1 книга');
    const five = Array.from({ length: 5 }, (_, i) => ({ slug: `b${i}`, name: 'x', overdueDays: 11 }));
    expect(reminderMessage('ru', five).text).toContain('5 книг');
    expect(reminderMessage('ru', five).text).toContain('просрочено на 11 дней');
  });

  it('escapes all HTML special characters', () => {
    expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;');
  });
});
