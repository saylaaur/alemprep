import { describe, it, expect } from 'vitest';
import {
  xpForLevel,
  levelFromXp,
  levelProgress,
  evaluateAchievements,
  upcomingBadges,
  XP_PER_CORRECT,
  EXAM_BLOCK_BONUS,
} from './gamification';

describe('константы XP', () => {
  it('верный ответ = 10 XP, бонус за блок пробника = 50', () => {
    expect(XP_PER_CORRECT).toBe(10);
    expect(EXAM_BLOCK_BONUS).toBe(50);
  });
});

describe('xpForLevel — кумулятивный порог 50·L·(L−1)', () => {
  it('первые уровни', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(300);
    expect(xpForLevel(4)).toBe(600);
    expect(xpForLevel(5)).toBe(1000);
  });
  it('уровень ≤ 1 → порог 0', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-3)).toBe(0);
  });
});

describe('levelFromXp — наибольший уровень с порогом ≤ xp', () => {
  it('границы уровней', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(99)).toBe(1);
    expect(levelFromXp(100)).toBe(2);
    expect(levelFromXp(299)).toBe(2);
    expect(levelFromXp(300)).toBe(3);
    expect(levelFromXp(599)).toBe(3);
    expect(levelFromXp(600)).toBe(4);
    expect(levelFromXp(1000)).toBe(5);
  });
  it('отрицательный XP — уровень 1, без крэша', () => {
    expect(levelFromXp(-50)).toBe(1);
  });
  it('большие значения корректны (без ошибок округления)', () => {
    // xpForLevel(100) = 50·100·99 = 495000
    expect(levelFromXp(495000)).toBe(100);
    expect(levelFromXp(494999)).toBe(99);
  });
});

describe('levelProgress', () => {
  it('ровно на пороге уровня — прогресс 0', () => {
    expect(levelProgress(100)).toEqual({
      level: 2,
      xpIntoLevel: 0,
      levelSpan: 200,
      xpToNext: 200,
      percentToNext: 0,
    });
  });
  it('уровень 1, старт', () => {
    expect(levelProgress(0)).toEqual({
      level: 1,
      xpIntoLevel: 0,
      levelSpan: 100,
      xpToNext: 100,
      percentToNext: 0,
    });
  });
  it('середина уровня 2', () => {
    expect(levelProgress(150)).toEqual({
      level: 2,
      xpIntoLevel: 50,
      levelSpan: 200,
      xpToNext: 150,
      percentToNext: 0.25,
    });
  });
  it('почти следующий уровень', () => {
    const p = levelProgress(299);
    expect(p.level).toBe(2);
    expect(p.xpIntoLevel).toBe(199);
    expect(p.xpToNext).toBe(1);
    expect(p.percentToNext).toBeCloseTo(0.995);
  });
});

describe('evaluateAchievements', () => {
  const empty = { totalAttempts: 0, currentStreak: 0, topicStats: [] };

  it('нет достижений при пустом снапшоте', () => {
    expect(evaluateAchievements(empty)).toEqual([]);
  });

  it('первая попытка → first-question', () => {
    const r = evaluateAchievements({ ...empty, totalAttempts: 1 });
    expect(r).toContain('first-question');
    expect(r).not.toContain('solved-100');
  });

  it('пороги «решено» 100 и 500', () => {
    expect(evaluateAchievements({ ...empty, totalAttempts: 99 })).not.toContain('solved-100');
    const at100 = evaluateAchievements({ ...empty, totalAttempts: 100 });
    expect(at100).toContain('solved-100');
    expect(at100).not.toContain('solved-500');
    expect(evaluateAchievements({ ...empty, totalAttempts: 500 })).toContain('solved-500');
  });

  it('пороги стрика 7 и 30', () => {
    expect(evaluateAchievements({ ...empty, currentStreak: 6 })).not.toContain('streak-7');
    const at7 = evaluateAchievements({ ...empty, currentStreak: 7 });
    expect(at7).toContain('streak-7');
    expect(at7).not.toContain('streak-30');
    expect(evaluateAchievements({ ...empty, currentStreak: 30 })).toContain('streak-30');
  });

  it('мастерство темы: ≥10 попыток и точность строго > 0.9', () => {
    // 10/10 = 1.0 → да
    expect(
      evaluateAchievements({ ...empty, topicStats: [{ attempts: 10, correct: 10 }] })
    ).toContain('topic-mastery');
    // 9/10 = 0.9 (не > 0.9) → нет
    expect(
      evaluateAchievements({ ...empty, topicStats: [{ attempts: 10, correct: 9 }] })
    ).not.toContain('topic-mastery');
    // 9/9 = 1.0, но попыток < 10 → нет
    expect(
      evaluateAchievements({ ...empty, topicStats: [{ attempts: 9, correct: 9 }] })
    ).not.toContain('topic-mastery');
    // хотя бы одна тема проходит → да
    expect(
      evaluateAchievements({
        ...empty,
        topicStats: [
          { attempts: 20, correct: 5 },
          { attempts: 50, correct: 46 },
        ],
      })
    ).toContain('topic-mastery');
  });

  it('exam-ключи только когда есть контекст пробника', () => {
    // без exam — не появляются
    const noExam = evaluateAchievements({ ...empty, totalAttempts: 40 });
    expect(noExam).not.toContain('exam-complete');
    expect(noExam).not.toContain('exam-90');
    // завершён, но балл < 90%
    const low = evaluateAchievements({
      ...empty,
      exam: { completed: true, scoreRatio: 0.5 },
    });
    expect(low).toContain('exam-complete');
    expect(low).not.toContain('exam-90');
    // ровно 0.9 → exam-90
    expect(
      evaluateAchievements({ ...empty, exam: { completed: true, scoreRatio: 0.9 } })
    ).toContain('exam-90');
    // 0.89 → нет
    expect(
      evaluateAchievements({ ...empty, exam: { completed: true, scoreRatio: 0.89 } })
    ).not.toContain('exam-90');
  });

  it('возвращает ключи в порядке справочника', () => {
    const r = evaluateAchievements({
      totalAttempts: 500,
      currentStreak: 30,
      topicStats: [{ attempts: 10, correct: 10 }],
      exam: { completed: true, scoreRatio: 1 },
    });
    expect(r).toEqual([
      'first-question',
      'solved-100',
      'solved-500',
      'streak-7',
      'streak-30',
      'topic-mastery',
      'exam-complete',
      'exam-90',
    ]);
  });
});

describe('upcomingBadges — ближайшие незаработанные счётные бейджи', () => {
  it('сортирует по близости (прогресс убыв.) и режет по лимиту', () => {
    const r = upcomingBadges({ totalAttempts: 90, currentStreak: 5 }, ['first-question']);
    expect(r).toEqual([
      { key: 'solved-100', current: 90, target: 100, progress: 0.9 },
      { key: 'streak-7', current: 5, target: 7, progress: 5 / 7 },
      { key: 'solved-500', current: 90, target: 500, progress: 0.18 },
    ]);
  });

  it('исключает уже полученные бейджи', () => {
    const r = upcomingBadges(
      { totalAttempts: 150, currentStreak: 10 },
      ['first-question', 'solved-100', 'streak-7']
    );
    expect(r).toEqual([
      { key: 'streak-30', current: 10, target: 30, progress: 10 / 30 },
      { key: 'solved-500', current: 150, target: 500, progress: 0.3 },
    ]);
  });

  it('current не превышает target', () => {
    const r = upcomingBadges({ totalAttempts: 900, currentStreak: 0 }, ['solved-100']);
    const solved500 = r.find((b) => b.key === 'solved-500');
    expect(solved500).toEqual({ key: 'solved-500', current: 500, target: 500, progress: 1 });
  });

  it('уважает лимит', () => {
    expect(upcomingBadges({ totalAttempts: 0, currentStreak: 0 }, [], 2)).toHaveLength(2);
  });
});
