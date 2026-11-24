import { describe, expect, it } from 'vitest';
import { runBookReminders, type ReminderDeps } from './reminders';

function deps(over: Partial<ReminderDeps> = {}) {
  const sent: Array<{ chatId: number; text: string; url: string }> = [];
  const reminded: string[] = [];
  const unlinked: string[] = [];
  const d: ReminderDeps = {
    today: '2026-11-17',
    libraryUrl: (l) => `https://alemprep.example/${l}/library`,
    loadTargets: async () => [
      { userId: 'a', chatId: 1, locale: 'ru' },
      { userId: 'b', chatId: 2, locale: 'kk' },
      { userId: 'c', chatId: 3, locale: 'ru' },
    ],
    loadDue: async () =>
      new Map([
        ['a', [{ slug: 'newton-laws', name: 'Законы Ньютона', overdueDays: 0 }]],
        ['b', [{ slug: 'newton-laws', name: 'Ньютон заңдары', overdueDays: 1 }]],
      ]),
    send: async (chatId, text, button) => {
      sent.push({ chatId, text, url: button.url });
      return { ok: true };
    },
    markReminded: async (u) => void reminded.push(u),
    unlink: async (u) => void unlinked.push(u),
    ...over,
  };
  return { d, sent, reminded, unlinked };
}

describe('runBookReminders', () => {
  it('messages only users with books due, in their language, with a library link', async () => {
    const { d, sent, reminded } = deps();
    expect(await runBookReminders(d)).toEqual({ targets: 3, sent: 2, nothingDue: 1, failed: 0, unlinked: 0 });
    expect(sent.map((s) => s.chatId)).toEqual([1, 2]);
    expect(sent[1].text).toContain('Ньютон заңдары');
    expect(sent[1].url).toBe('https://alemprep.example/kk/library');
    expect(reminded).toEqual(['a', 'b']);
  });

  it('unlinks users who blocked the bot and retries failures tomorrow', async () => {
    const { d, reminded, unlinked } = deps({
      send: async (chatId) => (chatId === 1 ? { ok: false, blocked: true } : { ok: false, blocked: false }),
    });
    expect(await runBookReminders(d)).toEqual({ targets: 3, sent: 0, nothingDue: 1, failed: 1, unlinked: 1 });
    expect(unlinked).toEqual(['a']);
    expect(reminded).toEqual([]);
  });

  it('does nothing when nobody is linked', async () => {
    let loaded = false;
    const { d } = deps({ loadTargets: async () => [], loadDue: async () => ((loaded = true), new Map()) });
    expect((await runBookReminders(d)).targets).toBe(0);
    expect(loaded).toBe(false);
  });
});
