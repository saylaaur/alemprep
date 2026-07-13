import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeClient, type Store } from './testing/in-memory-db';

const h = vi.hoisted(() => ({ store: {} as Store, failOnce: null }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('./server', () => ({
  createClient: async () => makeClient(h),
}));

// Импортируем ПОСЛЕ регистрации моков.
import { completeOnboarding } from './profile-actions';

function seed(): Store {
  return {
    profiles: [
      { id: 'U1', daily_goal: 20, second_subject: null, exam_date: null, target_score: null },
    ],
  };
}

describe('completeOnboarding', () => {
  beforeEach(() => {
    h.store = seed();
  });

  it('валидный ввод сохраняет все поля профиля', async () => {
    const res = await completeOnboarding({
      secondSubject: 'physics',
      examDate: '2027-01-01',
      targetScore: 80,
      dailyGoal: 25,
    });

    expect(res).toEqual({ ok: true });
    expect(h.store.profiles[0]).toMatchObject({
      second_subject: 'physics',
      exam_date: '2027-01-01',
      target_score: 80,
      daily_goal: 25,
    });
  });

  it('невалидный второй предмет — ошибка, профиль не меняется', async () => {
    const res = await completeOnboarding({
      secondSubject: 'chemistry',
      examDate: '2027-01-01',
      targetScore: 80,
      dailyGoal: 25,
    });

    expect(res).toEqual({ ok: false, error: 'invalid_subject' });
    expect(h.store.profiles[0].second_subject).toBeNull();
  });

  it('дата в прошлом — ошибка', async () => {
    const res = await completeOnboarding({
      secondSubject: 'physics',
      examDate: '2020-01-01',
      targetScore: 80,
      dailyGoal: 25,
    });

    expect(res).toEqual({ ok: false, error: 'invalid_exam_date' });
  });

  it('целевой балл вне диапазона клэмпится и сохраняется', async () => {
    const res = await completeOnboarding({
      secondSubject: 'informatics',
      examDate: '2027-01-01',
      targetScore: 999,
      dailyGoal: 25,
    });

    expect(res).toEqual({ ok: true });
    expect(h.store.profiles[0].target_score).toBe(110);
  });

  it('несуществующий профиль (0 строк обновлено) — ошибка', async () => {
    h.store.profiles = [];
    const res = await completeOnboarding({
      secondSubject: 'physics',
      examDate: '2027-01-01',
      targetScore: 80,
      dailyGoal: 25,
    });

    expect(res).toEqual({ ok: false, error: 'update_failed' });
  });
});
