import { describe, it, expect } from 'vitest';
import {
  examStorageKey,
  readSavedExam,
  writeSavedExam,
  clearSavedExam,
  clearAllSavedExams,
  type SavedExam,
} from './exam-storage';

/**
 * Прогресс пробника в localStorage должен быть привязан к пользователю:
 * до фикса ключ был общим на устройство, и при смене аккаунта восстанавливался
 * чужой пробник (завершение падало на RLS чужой сессии).
 */

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    has: (k: string) => m.has(k),
  };
}

function makeSaved(sessionId = 'S1'): SavedExam {
  return {
    v: 1,
    second: 'physics',
    blocks: [
      {
        sessionId,
        subjectSlug: 'math',
        subjectId: 'SUB1',
        name_ru: 'Математика',
        name_kk: 'Математика',
        topics: [],
        questions: [],
        shortfall: [],
      },
    ],
    contexts: [],
    answers: {},
    flags: {},
    idx: 0,
    startTime: 1_000,
  };
}

describe('exam-storage — прогресс пробника привязан к пользователю', () => {
  it('ключ неймспейсится по user id', () => {
    expect(examStorageKey('U1')).toBe('alemprep:mock-exam:U1');
  });

  it('write/read round-trip для одного пользователя', () => {
    const storage = fakeStorage();
    writeSavedExam('U1', makeSaved(), storage);

    const saved = readSavedExam('U1', storage);
    expect(saved).not.toBeNull();
    expect(saved?.blocks[0].sessionId).toBe('S1');
    expect(saved?.startTime).toBe(1_000);
  });

  it('сохранённое одним пользователем не видно другому', () => {
    const storage = fakeStorage();
    writeSavedExam('U1', makeSaved(), storage);

    expect(readSavedExam('U2', storage)).toBeNull();
  });

  it('легаси-ключ без user id игнорируется', () => {
    const storage = fakeStorage({
      'alemprep:mock-exam': JSON.stringify(makeSaved()),
    });

    expect(readSavedExam('U1', storage)).toBeNull();
  });

  it('битый JSON, чужая версия и пустые блоки → null', () => {
    const storage = fakeStorage({
      [examStorageKey('U1')]: 'не json',
      [examStorageKey('U2')]: JSON.stringify({ ...makeSaved(), v: 2 }),
      [examStorageKey('U3')]: JSON.stringify({ ...makeSaved(), blocks: [] }),
    });

    expect(readSavedExam('U1', storage)).toBeNull();
    expect(readSavedExam('U2', storage)).toBeNull();
    expect(readSavedExam('U3', storage)).toBeNull();
  });

  it('clearSavedExam удаляет ключ пользователя и легаси-ключ, не трогая чужие', () => {
    const storage = fakeStorage({
      'alemprep:mock-exam': JSON.stringify(makeSaved()),
    });
    writeSavedExam('U1', makeSaved(), storage);
    writeSavedExam('U2', makeSaved('S2'), storage);

    clearSavedExam('U1', storage);

    expect(storage.has(examStorageKey('U1'))).toBe(false);
    expect(storage.has('alemprep:mock-exam')).toBe(false);
    expect(readSavedExam('U2', storage)).not.toBeNull();
  });

  it('clearAllSavedExams (выход из аккаунта) удаляет все ключи пробника, оставляя посторонние', () => {
    const storage = fakeStorage({
      'alemprep:mock-exam': JSON.stringify(makeSaved()),
      theme: 'dark',
    });
    writeSavedExam('U1', makeSaved(), storage);
    writeSavedExam('U2', makeSaved('S2'), storage);

    clearAllSavedExams(storage);

    expect(storage.has('alemprep:mock-exam')).toBe(false);
    expect(storage.has(examStorageKey('U1'))).toBe(false);
    expect(storage.has(examStorageKey('U2'))).toBe(false);
    expect(storage.getItem('theme')).toBe('dark');
  });
});
