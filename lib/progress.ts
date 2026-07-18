/**
 * Траектория прогресса: завершённые diagnostic + weekly сессии → точки для
 * графика на /progress. Diagnostic и weekly используют структурно одинаковый
 * блюпринт (см. lib/exam.ts / lib/weekly.ts) — баллы напрямую сравнимы.
 * Чистая функция — тестируется без БД (см. lib/progress.test.ts).
 */
import { DIAGNOSTIC_PAIR_MAX_SCORE } from '@/lib/exam';
import { WEEKLY_PAIR_MAX_SCORE } from '@/lib/weekly';

export type TrajectorySessionMode = 'diagnostic' | 'weekly';

export type TrajectorySessionInput = {
  mode: TrajectorySessionMode;
  finishedAt: string | null;
  score: number | null;
};

/**
 * kind/weekIndex — не готовый текст: у диагностики и недель разные подписи,
 * и они должны переводиться (next-intl), поэтому точка несёт только данные,
 * а локализованную метку строит компонент (см. TrajectoryChart).
 */
export type TrajectoryPoint = {
  kind: TrajectorySessionMode;
  /** 0 для diagnostic; 1..N — порядковый номер среди weekly по дате завершения. */
  weekIndex: number;
  date: string;
  score: number;
  maxScore: number;
  /** Доля 0..1 — та же конвенция, что у ProgressRing/MasteryBar. */
  percent: number;
};

const MAX_SCORE_BY_MODE: Record<TrajectorySessionMode, number> = {
  diagnostic: DIAGNOSTIC_PAIR_MAX_SCORE,
  weekly: WEEKLY_PAIR_MAX_SCORE,
};

export function buildTrajectory(sessions: readonly TrajectorySessionInput[]): TrajectoryPoint[] {
  const finished = sessions.filter(
    (s): s is TrajectorySessionInput & { finishedAt: string } => s.finishedAt != null
  );
  const sorted = [...finished].sort(
    (a, b) => new Date(a.finishedAt).getTime() - new Date(b.finishedAt).getTime()
  );

  let weekCounter = 0;
  return sorted.map((s) => {
    if (s.mode === 'weekly') weekCounter++;
    const maxScore = MAX_SCORE_BY_MODE[s.mode];
    const score = s.score ?? 0;
    return {
      kind: s.mode,
      weekIndex: s.mode === 'diagnostic' ? 0 : weekCounter,
      date: s.finishedAt,
      score,
      maxScore,
      percent: maxScore > 0 ? score / maxScore : 0,
    };
  });
}
