import { reminderMessage, type ReminderBook } from './messages';
import type { Locale } from '@/types/db';

/**
 * Утренняя рассылка: каждому, кто привязал Telegram и кому сегодня есть что
 * повторить, — одно сообщение в день. Хранилище и отправка подставляются снаружи.
 */
export type ReminderTarget = { userId: string; chatId: number; locale: Locale };

export type ReminderDeps = {
  today: string;
  libraryUrl: (locale: Locale) => string;
  /** Привязки, которым сегодня ещё не напоминали. */
  loadTargets: (today: string) => Promise<ReminderTarget[]>;
  /** Книги к повторению (due_on <= today) по пользователям. */
  loadDue: (userIds: string[], today: string, locale: (userId: string) => Locale) => Promise<Map<string, ReminderBook[]>>;
  send: (chatId: number, text: string, button: { text: string; url: string }) => Promise<{ ok: true } | { ok: false; blocked: boolean }>;
  markReminded: (userId: string, today: string) => Promise<void>;
  /** Пользователь остановил бота — убрать привязку. */
  unlink: (userId: string) => Promise<void>;
};

export type ReminderReport = { targets: number; sent: number; nothingDue: number; failed: number; unlinked: number };

export async function runBookReminders(deps: ReminderDeps): Promise<ReminderReport> {
  const targets = await deps.loadTargets(deps.today);
  const report: ReminderReport = { targets: targets.length, sent: 0, nothingDue: 0, failed: 0, unlinked: 0 };
  if (targets.length === 0) return report;

  const locales = new Map(targets.map((t) => [t.userId, t.locale]));
  const due = await deps.loadDue(targets.map((t) => t.userId), deps.today, (id) => locales.get(id) ?? 'ru');

  for (const target of targets) {
    const books = due.get(target.userId) ?? [];
    if (books.length === 0) {
      report.nothingDue++;
      continue;
    }
    const msg = reminderMessage(target.locale, books);
    const res = await deps.send(target.chatId, msg.text, { text: msg.button, url: deps.libraryUrl(target.locale) });
    if (res.ok) {
      await deps.markReminded(target.userId, deps.today);
      report.sent++;
    } else if (res.blocked) {
      await deps.unlink(target.userId);
      report.unlinked++;
    } else {
      report.failed++;
    }
  }
  return report;
}
