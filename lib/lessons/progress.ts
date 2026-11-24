/**
 * Прогресс по видеоуроку: какие задачи решены, посмотрено ли видео, результат пробника.
 * Пока хранится в браузере (localStorage); запись в базу — следующий шаг.
 */
export type LessonProgress = {
  /** id задачи → индекс выбранного ответа (в порядке показа). */
  answers: Record<string, number>;
  watched: boolean;
  /** Лучший результат пробника. */
  mock: { score: number; total: number } | null;
};

export const EMPTY_PROGRESS: LessonProgress = { answers: {}, watched: false, mock: null };

export const progressKey = (lessonId: string) => `alemprep:lesson:${lessonId}:v1`;

export function parseProgress(raw: string | null): LessonProgress {
  if (!raw) return EMPTY_PROGRESS;
  try {
    const v = JSON.parse(raw) as Partial<LessonProgress>;
    const answers: Record<string, number> = {};
    if (v.answers && typeof v.answers === 'object') {
      for (const [k, n] of Object.entries(v.answers)) if (Number.isInteger(n) && (n as number) >= 0) answers[k] = n as number;
    }
    const m = v.mock;
    const mock = m && Number.isInteger(m.score) && Number.isInteger(m.total) && m.total > 0 ? { score: m.score, total: m.total } : null;
    return { answers, watched: v.watched === true, mock };
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function loadProgress(lessonId: string): LessonProgress {
  try {
    return parseProgress(window.localStorage.getItem(progressKey(lessonId)));
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function saveProgress(lessonId: string, p: LessonProgress): void {
  try {
    window.localStorage.setItem(progressKey(lessonId), JSON.stringify(p));
  } catch {
    /* приватный режим: прогресс живёт только на этой странице */
  }
}

type Q = { id: string; correct: number };

export function answeredCount(problems: Q[], p: LessonProgress): number {
  return problems.filter((q) => p.answers[q.id] !== undefined).length;
}

export function correctCount(problems: Q[], p: LessonProgress): number {
  return problems.filter((q) => p.answers[q.id] === q.correct).length;
}

/** Тема закрыта, когда все задачи решены (верно или нет — важно пройти все). Тогда открывается пробник. */
export function isTopicClosed(problems: Q[], p: LessonProgress): boolean {
  return problems.length > 0 && answeredCount(problems, p) === problems.length;
}

/** Доля пройденного для карточки в списке: задачи + видео + пробник. */
export function lessonPercent(problems: Q[], p: LessonProgress): number {
  const parts = problems.length + 2;
  const done = answeredCount(problems, p) + (p.watched ? 1 : 0) + (p.mock ? 1 : 0);
  return Math.round((done / parts) * 100);
}

/** Подставляет {name} в шаблон. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in values ? String(values[k]) : `{${k}}`));
}
