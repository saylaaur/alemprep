import type { StudyCard } from './content';

/**
 * Один заход по карточкам: открыл ответ → отметил «вспомнил / не вспомнил».
 * Чистая логика без React, чтобы её можно было тестировать.
 * Доля вспомненного за ПЕРВЫЙ проход уходит в расписание книги (1-3-7-10-14-30-60);
 * повтор забытых — тренировка, график не меняет.
 */
export type Session = {
  deck: StudyCard[];
  index: number;
  flipped: boolean;
  /** Ответы по порядку колоды. */
  results: boolean[];
  /** 0 — основной проход, 1+ — повтор забытых. */
  pass: number;
};

export function startSession(cards: StudyCard[], pass = 0): Session {
  return { deck: cards, index: 0, flipped: false, results: [], pass };
}

export function isFinished(s: Session): boolean {
  return s.index >= s.deck.length;
}

export function currentCard(s: Session): StudyCard | null {
  return s.deck[s.index] ?? null;
}

export function flip(s: Session): Session {
  if (isFinished(s)) return s;
  return { ...s, flipped: !s.flipped };
}

/** Ответить можно только после того, как открыт ответ. */
export function answer(s: Session, recalled: boolean): Session {
  if (isFinished(s) || !s.flipped) return s;
  return { ...s, index: s.index + 1, flipped: false, results: [...s.results, recalled] };
}

export type Summary = { recalled: number; total: number; ratio: number; missed: StudyCard[] };

export function summary(s: Session): Summary {
  const total = s.results.length;
  const recalled = s.results.filter(Boolean).length;
  const missed = s.deck.filter((_, i) => s.results[i] === false);
  return { recalled, total, ratio: total === 0 ? 0 : recalled / total, missed };
}

/** Новый проход только по забытым; null — забытых нет. */
export function retryMissed(s: Session): Session | null {
  const { missed } = summary(s);
  return missed.length === 0 ? null : startSession(missed, s.pass + 1);
}
