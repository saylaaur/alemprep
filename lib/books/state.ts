import { MASTERED_STAGE } from './schedule';

export type BookState = 'locked' | 'not-ready' | 'available' | 'due' | 'scheduled' | 'mastered';

/** Состояние книги у ученика: нет записи — «можно получить» / «готовится», иначе по графику повторений. */
export function bookStateOf(hasContent: boolean, ub: { stage: number; dueOn: string | null } | undefined, today: string): BookState {
  if (!ub) return hasContent ? 'available' : 'not-ready';
  if (ub.stage >= MASTERED_STAGE || ub.dueOn === null) return 'mastered';
  return ub.dueOn <= today ? 'due' : 'scheduled';
}
