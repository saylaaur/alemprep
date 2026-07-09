import { describe, it, expect } from 'vitest';
import { advanceStreak, previousDateStr, localDateStr } from './streak';

describe('previousDateStr', () => {
  it('обычный день', () => {
    expect(previousDateStr('2026-07-04')).toBe('2026-07-03');
  });
  it('граница месяца', () => {
    expect(previousDateStr('2026-07-01')).toBe('2026-06-30');
  });
  it('граница года', () => {
    expect(previousDateStr('2026-01-01')).toBe('2025-12-31');
  });
  it('високосный февраль', () => {
    expect(previousDateStr('2024-03-01')).toBe('2024-02-29');
    expect(previousDateStr('2026-03-01')).toBe('2026-02-28');
  });
});

describe('localDateStr', () => {
  it('формат YYYY-MM-DD с ведущими нулями', () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('использует локальную дату, а не UTC', () => {
    // 00:30 локального времени: toISOString() дал бы предыдущий день в TZ восточнее UTC
    const d = new Date(2026, 6, 4, 0, 30);
    expect(localDateStr(d)).toBe('2026-07-04');
  });
});

describe('advanceStreak', () => {
  it('первая активность (lastActiveDate = null) — стрик 1', () => {
    expect(
      advanceStreak({ lastActiveDate: null, currentStreak: 0, today: '2026-07-04' })
    ).toEqual({ streak: 1, lastActiveDate: '2026-07-04' });
  });
  it('вчера была активность — стрик +1', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-03', currentStreak: 5, today: '2026-07-04' })
    ).toEqual({ streak: 6, lastActiveDate: '2026-07-04' });
  });
  it('сегодня уже была активность — обновлять нечего', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-04', currentStreak: 5, today: '2026-07-04' })
    ).toBeNull();
  });
  it('сегодня уже активны, но стрик аномально 0 — самоисправление в 1, не застревает', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-04', currentStreak: 0, today: '2026-07-04' })
    ).toEqual({ streak: 1, lastActiveDate: '2026-07-04' });
  });
  it('пропуск дня — стрик сбрасывается в 1', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-01', currentStreak: 10, today: '2026-07-04' })
    ).toEqual({ streak: 1, lastActiveDate: '2026-07-04' });
  });
  it('продление через границу месяца', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-06-30', currentStreak: 2, today: '2026-07-01' })
    ).toEqual({ streak: 3, lastActiveDate: '2026-07-01' });
  });
  it('lastActiveDate в будущем (рассинхрон часов) — сброс в 1, не крэш', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-05', currentStreak: 4, today: '2026-07-04' })
    ).toEqual({ streak: 1, lastActiveDate: '2026-07-04' });
  });
});
