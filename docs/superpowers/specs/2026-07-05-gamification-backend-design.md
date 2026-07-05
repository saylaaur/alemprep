# Геймификация — бэкенд (дизайн)

> Ветка `feature/emerald` от `main`. Один таск = один коммит. Гейты: `/verify` + `npm test`.
> Не мержить, не пушить.

## Цель

Серверный слой геймификации для AlemPrep: XP и уровни, дневной стрик с рекордом,
достижения (бейджи). Вся математика — чистыми функциями с тестами; персистенция и
подсчёт — на сервере (server actions на запись, `queries.ts` на чтение).

## Решения (подтверждены)

- **Кривая уровней:** `total(L) = 50·L·(L−1)` — кумулятивный XP, чтобы быть НА уровне `L`
  (L1=0, L2=100, L3=300, L4=600, L5=1000; ширина уровня `L` = `100·L`). Растущий порог.
- **XP:** `+10` за верный ответ. Пробник — то же `+10` за верный ответ **плюс `+50`
  бонус за завершённый блок**. Начисление пробника — в `finishExamSession`
  (в `recordAttempt` пробник не проходит).
- **«Решено»** для бейджей 100/500 и счётчика «решено сегодня» = **любая попытка**
  (ответил), без учёта верности.
- **Бейдж «90+ баллов»** = балл блока ≥ **90% от максимума блока** (per-block, честно
  масштабируется: ≥49.5 из 55).
- **Мастерство темы** = тема с `attempts ≥ 10` и `accuracy > 0.9`.
- **Стрик-бейджи** оцениваются по `current_streak`; раз полученный бейдж — навсегда (строка).

## Схема (миграция 0007)

```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS xp INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak INT NOT NULL DEFAULT 0;
UPDATE public.profiles SET longest_streak = current_streak WHERE longest_streak < current_streak;

CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_key)
);
-- RLS: select/insert только свои (по образцу attempts)
```

`types/db.ts`: `Profile += xp, longest_streak`; новый `UserAchievement`.
`run_all.sql` уже отстал от 0004–0006 — не трогаем; источник истины — файлы миграций.

## lib/gamification.ts (чистое ядро)

Константы: `XP_PER_CORRECT = 10`, `EXAM_BLOCK_BONUS = 50`,
`TOPIC_MASTERY_MIN_ATTEMPTS = 10`, `TOPIC_MASTERY_RATIO = 0.9`,
`EXAM_HIGH_SCORE_RATIO = 0.9`, пороги стрика `7/30`, пороги «решено» `100/500`.

Уровни:
- `xpForLevel(level)` = `50·level·(level−1)` (кумулятивный порог; L≤1 → 0).
- `levelFromXp(xp)` — наибольший `level ≥ 1` с `xpForLevel(level) ≤ xp`.
- `levelProgress(xp)` → `{ level, xpIntoLevel, levelSpan (=100·level), xpToNext, percentToNext }`.

Достижения — справочник ключей и **чистый** оценщик:
```ts
type AchievementKey =
  | 'first-question' | 'solved-100' | 'solved-500'
  | 'streak-7' | 'streak-30' | 'topic-mastery'
  | 'exam-complete' | 'exam-90';

type AchievementSnapshot = {
  totalAttempts: number;
  currentStreak: number;
  topicStats: { attempts: number; correct: number }[];
  exam?: { completed: boolean; scoreRatio: number }; // только в контексте пробника
};

function evaluateAchievements(s: AchievementSnapshot): AchievementKey[];
```
Условия: `first-question` (totalAttempts ≥ 1), `solved-100/500` (≥ 100 / 500),
`streak-7/30` (currentStreak ≥ 7 / 30), `topic-mastery` (∃ тема: attempts ≥ 10 и
correct/attempts > 0.9), `exam-complete` (exam.completed), `exam-90`
(exam.scoreRatio ≥ 0.9). Exam-ключи выдаются только когда `exam` присутствует.

## Персистенция

- **`recordAttempt`** (практика): при верном ответе `xp += 10`; `longest_streak =
  max(longest_streak, newStreak)` (в тот же `update`, добавив `xp, longest_streak` в
  select). После — `awardAchievements` со снапшотом БЕЗ `exam`.
- **`finishExamSession`** (пробник): `xp += 10·correctCount + 50`; затем
  `awardAchievements` со снапшотом С `exam = { completed: true, scoreRatio =
  score / maxBlockScore }`, где `maxBlockScore` = сумма `QUESTION_POINTS` по заданиям блока.
- **`awardAchievements(supabase, userId, snapshot)`**: `evaluateAchievements` → дифф с уже
  полученными (`user_achievements`) → вставка новых (`onConflict do nothing` через PK).

## queries.ts — `getGamification(userId)`

Читает на сервере и возвращает:
`xp`, `level`, `xpIntoLevel`, `levelSpan`, `xpToNext`, `percentToNext`,
`currentStreak`, `longestStreak`, `solvedToday` (локальная дата),
`earned[] {key, earnedAt}`, `upcoming[] {key, current, target, progress}` (ближайшие
незаработанные счётные бейджи), `topicMastery[] {topicId, nameRu, nameKk, total,
correct, accuracy, mastered}`.

## Тесты

- `lib/gamification.test.ts`: границы `xpForLevel` / `levelFromXp` / `levelProgress`
  (0, 99, 100, 299, 300, большие), все условия `evaluateAchievements` (включая min-sample
  темы и exam-контекст).

## План коммитов

1. `feat(db): миграция 0007 — xp, longest_streak, user_achievements + RLS; типы`
2. `feat(gamification): XP и уровни — чистые функции + начисление в recordAttempt`
3. `feat(gamification): достижения — справочник, оценщик, выдача в recordAttempt/finishExamSession`
4. `feat(gamification): getGamification — сводка для UI`
