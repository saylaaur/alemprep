import type { Locale } from '@/types/db';

/**
 * Тексты бота и разбор команд. Чистые функции — без сети и базы.
 * Сообщения отправляются с parse_mode HTML, поэтому всё пользовательское экранируем.
 */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const CODE_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** «/start CODE» из ссылки t.me/<bot>?start=CODE → CODE; иначе null. */
export function parseStartCode(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const m = text.trim().match(/^\/start(?:@\w+)?\s+(\S+)$/);
  return m && CODE_RE.test(m[1]) ? m[1] : null;
}

export function isStopCommand(text: unknown): boolean {
  return typeof text === 'string' && /^\/stop(?:@\w+)?\s*$/.test(text.trim());
}

export type ReminderBook = { slug: string; name: string; overdueDays: number };

const T = {
  ru: {
    title: (n: number) => `📚 Сегодня ${plural(n, 'книга', 'книги', 'книг')} к повторению`,
    overdue: (d: number) => ` — просрочено на ${d} ${plural(d, 'день', 'дня', 'дней', false)}`,
    more: (n: number) => `…и ещё ${n}`,
    tip: 'Прочитай, закрой и вспомни сам. 5 минут — и тема остаётся в голове до ЕНТ.',
    open: 'Открыть библиотеку',
    linked: 'Готово! Теперь я буду каждое утро напоминать, какие книги-конспекты пора повторить. Отключить: /stop',
    unlinked: 'Напоминания отключены. Включить снова можно в настройках AlemPrep.',
    badCode: 'Ссылка устарела. Открой «Настройки» в AlemPrep и нажми «Подключить Telegram» ещё раз.',
    help: 'Я присылаю напоминания о повторении книг AlemPrep. Подключить: «Настройки» → «Подключить Telegram». Отключить: /stop',
  },
  kk: {
    title: (n: number) => `📚 Бүгін ${n} кітапты қайталау керек`,
    overdue: (d: number) => ` — ${d} күнге кешікті`,
    more: (n: number) => `…тағы ${n}`,
    tip: 'Оқы, жап та, өзің есіңе түсір. 5 минут — тақырып ҰБТ-ға дейін есте қалады.',
    open: 'Кітапхананы ашу',
    linked: 'Дайын! Енді күн сайын таңертең қай конспект-кітаптарды қайталау керегін еске саламын. Өшіру: /stop',
    unlinked: 'Еске салғыштар өшірілді. Қайта қосу үшін AlemPrep баптауларына кір.',
    badCode: 'Сілтеменің мерзімі өтті. AlemPrep-те «Баптаулар» бөлімін ашып, «Telegram-ды қосу» батырмасын қайта бас.',
    help: 'Мен AlemPrep кітаптарын қайталау туралы еске саламын. Қосу: «Баптаулар» → «Telegram-ды қосу». Өшіру: /stop',
  },
} as const;

function plural(n: number, one: string, few: string, many: string, withNumber = true): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return withNumber ? `${n} ${word}` : word;
}

export function botText(locale: Locale, key: 'linked' | 'unlinked' | 'badCode' | 'help'): string {
  return T[locale][key];
}

/** Утреннее напоминание. Не больше 6 книг в списке, остальное — «и ещё N». */
export function reminderMessage(locale: Locale, books: readonly ReminderBook[]): { text: string; button: string } {
  const t = T[locale];
  const shown = books.slice(0, 6);
  const lines = shown.map((b) => `• ${escapeHtml(b.name)}${b.overdueDays > 0 ? t.overdue(b.overdueDays) : ''}`);
  if (books.length > shown.length) lines.push(t.more(books.length - shown.length));
  return { text: [`<b>${t.title(books.length)}</b>`, '', ...lines, '', t.tip].join('\n'), button: t.open };
}
