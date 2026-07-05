import { describe, it, expect } from 'vitest';
import { xpForLevel, levelFromXp, levelProgress, XP_PER_CORRECT, EXAM_BLOCK_BONUS } from './gamification';

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
