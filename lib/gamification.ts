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

// ---- Достижения ----

/** Справочник ключей бейджей (порядок = порядок выдачи/отображения). */
export const ACHIEVEMENT_KEYS = [
  'first-question',
  'solved-100',
  'solved-500',
  'streak-7',
  'streak-30',
  'topic-mastery',
  'exam-complete',
  'exam-90',
] as const;

export type AchievementKey = (typeof ACHIEVEMENT_KEYS)[number];

/** Тема считается освоенной при ≥ N попыток и точности строго выше порога. */
export const TOPIC_MASTERY_MIN_ATTEMPTS = 10;
export const TOPIC_MASTERY_RATIO = 0.9;
/** Порог «высокого балла» блока пробника (доля от максимума). */
export const EXAM_HIGH_SCORE_RATIO = 0.9;

/** Счётные пороги «решено» → ключ бейджа (для проверки и подсказки «ближайшие»). */
export const SOLVED_THRESHOLDS: ReadonlyArray<{ key: AchievementKey; target: number }> = [
  { key: 'solved-100', target: 100 },
  { key: 'solved-500', target: 500 },
];
/** Счётные пороги стрика → ключ бейджа. */
export const STREAK_THRESHOLDS: ReadonlyArray<{ key: AchievementKey; target: number }> = [
  { key: 'streak-7', target: 7 },
  { key: 'streak-30', target: 30 },
];

export type AchievementSnapshot = {
  /** Всего попыток (любых, независимо от верности). */
  totalAttempts: number;
  currentStreak: number;
  topicStats: { attempts: number; correct: number }[];
  /** Присутствует только в контексте завершения блока пробника. */
  exam?: { completed: boolean; scoreRatio: number };
};

/** Проходит ли хоть одна тема порог мастерства. */
export function hasTopicMastery(topicStats: { attempts: number; correct: number }[]): boolean {
  return topicStats.some(
    (t) => t.attempts >= TOPIC_MASTERY_MIN_ATTEMPTS && t.correct / t.attempts > TOPIC_MASTERY_RATIO
  );
}

/**
 * Все ключи, условие которых выполнено для снапшота. Идемпотентно: возвращает и
 * уже полученные — сервер сам вставляет только новые. Exam-ключи выдаются только
 * когда передан контекст `exam`.
 */
export function evaluateAchievements(s: AchievementSnapshot): AchievementKey[] {
  const earned: AchievementKey[] = [];
  if (s.totalAttempts >= 1) earned.push('first-question');
  for (const { key, target } of SOLVED_THRESHOLDS) {
    if (s.totalAttempts >= target) earned.push(key);
  }
  for (const { key, target } of STREAK_THRESHOLDS) {
    if (s.currentStreak >= target) earned.push(key);
  }
  if (hasTopicMastery(s.topicStats)) earned.push('topic-mastery');
  if (s.exam) {
    if (s.exam.completed) earned.push('exam-complete');
    if (s.exam.scoreRatio >= EXAM_HIGH_SCORE_RATIO) earned.push('exam-90');
  }
  return earned;
}
