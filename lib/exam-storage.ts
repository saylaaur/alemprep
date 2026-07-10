import type { ExamSecondSubject } from '@/lib/exam';
import type { AnswerState } from '@/lib/practice';
import type { PairExamBlock } from '@/lib/supabase/practice-actions';
import type { ExamContext } from '@/lib/supabase/queries';

// ── Сохранение незавершённого пробника (localStorage) ────────────────────────
// Ключ неймспейсится по user id: общий на устройство ключ приводил к тому,
// что при смене аккаунта восстанавливался чужой пробник, а его завершение
// падало на RLS чужой сессии. Легаси-ключ без user id больше не читается,
// только подчищается.

export type QuestionFlag = 'none' | 'answered' | 'flagged';

export type SavedExam = {
  v: 1;
  second: ExamSecondSubject;
  blocks: PairExamBlock[];
  contexts: [string, ExamContext][];
  answers: Record<string, AnswerState>;
  flags: Record<string, QuestionFlag>;
  idx: number;
  /** Абсолютное время старта (ms) — из него пересчитываем остаток таймера. */
  startTime: number;
};

const LEGACY_KEY = 'alemprep:mock-exam';

/** Минимум от Storage — чтобы в тестах подставлять in-memory замену. */
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export function examStorageKey(userId: string): string {
  return `${LEGACY_KEY}:${userId}`;
}

function resolveStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function readSavedExam(userId: string, storage?: StorageLike): SavedExam | null {
  const s = resolveStorage(storage);
  if (!s) return null;
  try {
    const raw = s.getItem(examStorageKey(userId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedExam;
    if (saved?.v !== 1 || !Array.isArray(saved.blocks) || saved.blocks.length === 0) {
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

export function writeSavedExam(userId: string, saved: SavedExam, storage?: StorageLike): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.setItem(examStorageKey(userId), JSON.stringify(saved));
  } catch {
    /* приватный режим / переполнение — тихо игнорируем */
  }
}

export function clearSavedExam(userId: string, storage?: StorageLike): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.removeItem(examStorageKey(userId));
    s.removeItem(LEGACY_KEY);
  } catch {
    /* приватный режим — тихо игнорируем */
  }
}

/** При выходе из аккаунта: удаляет сохранённые пробники всех пользователей на устройстве. */
export function clearAllSavedExams(storage?: StorageLike): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key === LEGACY_KEY || key?.startsWith(`${LEGACY_KEY}:`)) doomed.push(key);
    }
    for (const key of doomed) s.removeItem(key);
  } catch {
    /* приватный режим — тихо игнорируем */
  }
}
