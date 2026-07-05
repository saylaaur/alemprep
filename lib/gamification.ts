/**
 * Ядро геймификации: XP, уровни, достижения. Чистые функции — тестируются без БД.
 * Персистенция и подсчёт снапшотов — на сервере (practice-actions / queries).
 */

/** XP за верный ответ (практика и пробник). */
export const XP_PER_CORRECT = 10;
/** Разовый бонус за завершённый блок пробника. */
export const EXAM_BLOCK_BONUS = 50;

/**
 * Кумулятивный XP, чтобы быть НА уровне `level` (растущий порог).
 * total(L) = 50·L·(L−1): L1=0, L2=100, L3=300, L4=600, L5=1000.
 * Ширина уровня L = total(L+1) − total(L) = 100·L.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 50 * level * (level - 1);
}

/** Наибольший уровень ≥ 1, порог которого ≤ xp. */
export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  // Оценка из обращения total(L) ≤ xp, затем целочисленная коррекция от float.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * xp)) / 2));
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  return level;
}

export type LevelProgress = {
  level: number;
  xpIntoLevel: number;
  levelSpan: number;
  xpToNext: number;
  percentToNext: number;
};

/** Уровень и прогресс до следующего по текущему XP. */
export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const base = xpForLevel(level);
  const levelSpan = xpForLevel(level + 1) - base; // = 100·level
  const xpIntoLevel = xp - base;
  return {
    level,
    xpIntoLevel,
    levelSpan,
    xpToNext: levelSpan - xpIntoLevel,
    percentToNext: xpIntoLevel / levelSpan,
  };
}
