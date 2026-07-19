import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeClient, type Store, type FailPoint } from './testing/in-memory-db';
import { localDateStr } from '@/lib/streak';
import { AI_DAILY_LIMIT } from '@/lib/assistant';

/**
 * askAssistant против общего in-memory «Supabase»-мока (см. practice-actions.test.ts).
 * Anthropic-клиент мокается отдельно — реальная сеть здесь недопустима.
 */

const h = vi.hoisted(() => ({
  store: {} as Store,
  failOnce: null as FailPoint | null,
  createSpy: vi.fn(),
}));

vi.mock('./server', () => ({
  createClient: async () => makeClient(h),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: h.createSpy };
  },
}));

import { askAssistant } from './assistant-actions';

const today = localDateStr();

function seed(): Store {
  return {
    questions: [
      {
        id: 'Q1',
        type: 'single',
        body: {
          stem: 'Найдите $\\log_2 8$',
          options: [
            { id: 'A', content: '2' },
            { id: 'B', content: '3' },
          ],
          correct: 'B',
        },
        explanation: null,
      },
    ],
    ai_usage: [],
  };
}

beforeEach(() => {
  h.store = seed();
  h.createSpy.mockReset();
  h.createSpy.mockResolvedValue({
    content: [{ type: 'text', text: 'Подумай, какая степень двойки даёт 8.' }],
  });
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

describe('askAssistant — дневной лимит', () => {
  it('первый запрос за день: заводит счётчик count=1 и зовёт модель', async () => {
    const res = await askAssistant({ questionId: 'Q1', mode: 'hint', userAnswer: null });

    expect(res).toMatchObject({ ok: true, remaining: AI_DAILY_LIMIT - 1 });
    expect(h.store.ai_usage).toMatchObject([{ user_id: 'U1', usage_date: today, count: 1 }]);
    expect(h.createSpy).toHaveBeenCalledTimes(1);
  });

  it('повторный запрос в тот же день инкрементирует существующий счётчик', async () => {
    h.store.ai_usage = [{ user_id: 'U1', usage_date: today, count: 2 }];

    const res = await askAssistant({ questionId: 'Q1', mode: 'hint', userAnswer: null });

    expect(res).toMatchObject({ ok: true, remaining: AI_DAILY_LIMIT - 3 });
    expect(h.store.ai_usage[0].count).toBe(3);
  });

  it('при исчерпании лимита отказывает и НЕ вызывает модель', async () => {
    h.store.ai_usage = [{ user_id: 'U1', usage_date: today, count: AI_DAILY_LIMIT }];

    const res = await askAssistant({ questionId: 'Q1', mode: 'hint', userAnswer: null });

    expect(res).toMatchObject({ ok: false, error: 'daily-limit' });
    expect(h.createSpy).not.toHaveBeenCalled();
    expect(h.store.ai_usage[0].count).toBe(AI_DAILY_LIMIT);
  });

  it('несуществующая задача → not-found, без обращения к лимиту и модели', async () => {
    const res = await askAssistant({ questionId: 'MISSING', mode: 'hint', userAnswer: null });

    expect(res).toMatchObject({ ok: false, error: 'not-found' });
    expect(h.createSpy).not.toHaveBeenCalled();
    expect(h.store.ai_usage).toHaveLength(0);
  });

  it('счётчик другого пользователя не влияет на лимит текущего', async () => {
    h.store.ai_usage = [{ user_id: 'OTHER_USER', usage_date: today, count: AI_DAILY_LIMIT }];

    const res = await askAssistant({ questionId: 'Q1', mode: 'hint', userAnswer: null });

    expect(res).toMatchObject({ ok: true, remaining: AI_DAILY_LIMIT - 1 });
    expect(h.store.ai_usage.find((r) => r.user_id === 'U1')).toMatchObject({ count: 1 });
    expect(h.store.ai_usage.find((r) => r.user_id === 'OTHER_USER')).toMatchObject({ count: AI_DAILY_LIMIT });
  });
});
