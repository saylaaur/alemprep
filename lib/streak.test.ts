import { describe, it, expect } from 'vitest';
import { advanceStreak, previousDateStr, localDateStr, MAX_STREAK_FREEZES } from './streak';

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

describe('advanceStreak — базовая логика (без заморозок)', () => {
  it('первая активность (lastActiveDate = null) — стрик 1, заморозки не трогает', () => {
    expect(
      advanceStreak({ lastActiveDate: null, currentStreak: 0, today: '2026-07-04', streakFreezes: 1 })
    ).toEqual({ streak: 1, lastActiveDate: '2026-07-04', streakFreezes: 1, freezeUsed: false });
  });

  it('вчера была активность — стрик +1, заморозки не начисляются (не кратно 7)', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-03', currentStreak: 5, today: '2026-07-04', streakFreezes: 1 })
    ).toEqual({ streak: 6, lastActiveDate: '2026-07-04', streakFreezes: 1, freezeUsed: false });
  });

  it('сегодня уже была активность — обновлять нечего', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-04', currentStreak: 5, today: '2026-07-04', streakFreezes: 1 })
    ).toBeNull();
  });

  it('сегодня уже активны, но стрик аномально 0 — самоисправление в 1, не застревает', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-04', currentStreak: 0, today: '2026-07-04', streakFreezes: 2 })
    ).toEqual({ streak: 1, lastActiveDate: '2026-07-04', streakFreezes: 2, freezeUsed: false });
  });

  it('пропуск двух и более дней — сброс в 1 даже при наличии заморозки (не тратится)', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-01', currentStreak: 10, today: '2026-07-04', streakFreezes: 2 })
    ).toEqual({ streak: 1, lastActiveDate: '2026-07-04', streakFreezes: 2, freezeUsed: false });
  });

  it('продление через границу месяца', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-06-30', currentStreak: 2, today: '2026-07-01', streakFreezes: 0 })
    ).toEqual({ streak: 3, lastActiveDate: '2026-07-01', streakFreezes: 0, freezeUsed: false });
  });

  it('lastActiveDate в будущем (рассинхрон часов) — сброс в 1, не крэш', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-05', currentStreak: 4, today: '2026-07-04', streakFreezes: 1 })
    ).toEqual({ streak: 1, lastActiveDate: '2026-07-04', streakFreezes: 1, freezeUsed: false });
  });
});

describe('advanceStreak — заморозка', () => {
  it('пропущен ровно один день, есть заморозка — тратится 1, серия продолжает расти (N → N+1)', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-02', currentStreak: 5, today: '2026-07-04', streakFreezes: 1 })
    ).toEqual({ streak: 6, lastActiveDate: '2026-07-04', streakFreezes: 0, freezeUsed: true });
  });

  it('пропущен ровно один день, заморозок нет — обычный сброс в 1', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-02', currentStreak: 5, today: '2026-07-04', streakFreezes: 0 })
    ).toEqual({ streak: 1, lastActiveDate: '2026-07-04', streakFreezes: 0, freezeUsed: false });
  });
});

describe('advanceStreak — начисление заморозок (каждые 7 дней, потолок 3)', () => {
  it('серия пересекает границу 7 (6→7 обычным днём) — начисляется +1 заморозка', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-03', currentStreak: 6, today: '2026-07-04', streakFreezes: 1 })
    ).toEqual({ streak: 7, lastActiveDate: '2026-07-04', streakFreezes: 2, freezeUsed: false });
  });

  it('начисление упирается в потолок MAX_STREAK_FREEZES', () => {
    expect(MAX_STREAK_FREEZES).toBe(3);
    expect(
      advanceStreak({ lastActiveDate: '2026-07-03', currentStreak: 13, today: '2026-07-04', streakFreezes: 3 })
    ).toEqual({ streak: 14, lastActiveDate: '2026-07-04', streakFreezes: 3, freezeUsed: false });
  });

  it('заморозка тратится и в тот же день серия пересекает границу 7 — сначала списание, потом начисление', () => {
    expect(
      advanceStreak({ lastActiveDate: '2026-07-02', currentStreak: 6, today: '2026-07-04', streakFreezes: 1 })
    ).toEqual({ streak: 7, lastActiveDate: '2026-07-04', streakFreezes: 1, freezeUsed: true });
  });
});
