import { z } from 'zod';
import type { Locale, SecondSubject } from '@/types/db';

/**
 * Данные ученика в локальном режиме (без Supabase). Хранятся в одной cookie
 * браузера: сервер читает её при отрисовке страниц, а изменяют её server actions.
 * Формат в cookie — компактный (base64url от короткого JSON), чтобы влезало
 * несколько десятков книг в лимит ~4 КБ. Этот модуль чистый: без next/headers.
 */
export const LOCAL_USER_ID = 'local-user';
export const LOCAL_COOKIE = 'alemprep-local-v1';
/** Лимит браузера на cookie — 4096 байт; оставляем запас на имя и атрибуты. */
export const MAX_COOKIE_VALUE = 3600;

export type LocalProfile = {
  locale: Locale | null;
  dailyGoal: number;
  secondSubject: SecondSubject | null;
  examDate: string | null;
  targetScore: number | null;
};

export type LocalBook = {
  stage: number;
  dueOn: string | null;
  receivedOn: string;
  reviewsCount: number;
  lapses: number;
};

/** Что сделано за день: решённые задачи, просмотренные уроки, засчитанные повторения книг. */
export type DayActivity = { date: string; problems: number; lessons: number; cards: number };

/** Сколько последних дней активности держим в cookie (хватает на неделю и серию до трёх недель). */
export const ACTIVITY_DAYS = 21;

/** Результат теста без базы: диагностика, недельный тест или полный пробник. */
export const TEST_KINDS = ['diagnostic', 'weekly', 'full'] as const;
export type TestKind = (typeof TEST_KINDS)[number];
export type TestResult = { date: string; kind: TestKind; correct: number; total: number };
/** Сколько последних результатов тестов держим в cookie. */
export const MAX_TEST_RESULTS = 12;

export type LocalState = {
  profile: LocalProfile;
  /** slug книги → состояние у ученика */
  books: Record<string, LocalBook>;
  /** Дни с активностью, старые → новые. День без действий здесь не хранится. */
  activity: DayActivity[];
  /** Лучшая серия за всё время (в `activity` помнится только последние дни). */
  bestStreak: number;
  /** Результаты тестов, старые → новые. */
  tests: TestResult[];
};

export const DEFAULT_DAILY_GOAL = 20;

export function emptyState(): LocalState {
  return {
    profile: { locale: null, dailyGoal: DEFAULT_DAILY_GOAL, secondSubject: null, examDate: null, targetScore: null },
    books: {},
    activity: [],
    bestStreak: 0,
    tests: [],
  };
}

export class LocalStateTooLargeError extends Error {
  constructor() {
    super('local state does not fit into one cookie');
    this.name = 'LocalStateTooLargeError';
  }
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);

/** Книга в cookie: [стадия, следующее повторение или 0, дата получения, повторений, провалов]. */
const wireBook = z.tuple([z.number().int().min(0).max(99), z.union([date, z.literal(0)]), date, z.number().int().min(0), z.number().int().min(0)]);

/** День с активностью: [число дней от 1970-01-01, задачи, уроки, карточки]. */
const wireDay = z.tuple([z.number().int().min(0).max(100_000), z.number().int().min(0), z.number().int().min(0), z.number().int().min(0)]);

/** Тест: [число дней от 1970-01-01, вид 0|1|2 (диагностика/неделя/пробник), верно, всего]. */
const wireTest = z.tuple([z.number().int().min(0).max(100_000), z.number().int().min(0).max(2), z.number().int().min(0).max(200), z.number().int().min(1).max(200)]);

const wire = z.object({
  v: z.literal(1),
  /** [язык, цель в день, предмет, дата ЕНТ, целевой балл] */
  p: z.tuple([
    z.union([z.enum(['ru', 'kk']), z.literal(0)]),
    z.number().int().min(1).max(1000),
    z.union([z.enum(['physics', 'informatics']), z.literal(0)]),
    z.union([date, z.literal(0)]),
    z.number().int().min(0).max(1000),
  ]),
  b: z.record(slug, wireBook),
  /** Старые cookie без этих полей читаются как «активности нет». */
  a: z.array(wireDay).max(ACTIVITY_DAYS).default([]),
  q: z.number().int().min(0).max(100_000).default(0),
  t: z.array(wireTest).max(MAX_TEST_RESULTS).default([]),
});

export const toEpochDay = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
export const fromEpochDay = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

export function encodeState(state: LocalState): string {
  const p = state.profile;
  const payload: z.infer<typeof wire> = {
    v: 1,
    p: [p.locale ?? 0, p.dailyGoal, p.secondSubject ?? 0, p.examDate ?? 0, p.targetScore ?? 0],
    b: Object.fromEntries(
      Object.entries(state.books).map(([k, b]) => [k, [b.stage, b.dueOn ?? 0, b.receivedOn, b.reviewsCount, b.lapses] as const])
    ),
    a: state.activity.slice(-ACTIVITY_DAYS).map((d) => [toEpochDay(d.date), d.problems, d.lessons, d.cards] as const),
    q: state.bestStreak,
    t: state.tests.slice(-MAX_TEST_RESULTS).map((r) => [toEpochDay(r.date), TEST_KINDS.indexOf(r.kind), r.correct, r.total] as const),
  };
  const value = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  if (value.length > MAX_COOKIE_VALUE) throw new LocalStateTooLargeError();
  return value;
}

/** Разбор cookie. Любая порча данных → чистое состояние, а не ошибка страницы. */
export function decodeState(raw: string | undefined | null): LocalState {
  if (!raw) return emptyState();
  try {
    const parsed = wire.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    if (!parsed.success) return emptyState();
    const { p, b, a, q, t } = parsed.data;
    return {
      profile: {
        locale: p[0] === 0 ? null : p[0],
        dailyGoal: p[1],
        secondSubject: p[2] === 0 ? null : p[2],
        examDate: p[3] === 0 ? null : p[3],
        targetScore: p[4] === 0 ? null : p[4],
      },
      books: Object.fromEntries(
        Object.entries(b).map(([k, v]) => [k, { stage: v[0], dueOn: v[1] === 0 ? null : v[1], receivedOn: v[2], reviewsCount: v[3], lapses: v[4] }])
      ),
      activity: a.map((d) => ({ date: fromEpochDay(d[0]), problems: d[1], lessons: d[2], cards: d[3] })),
      bestStreak: q,
      tests: t.map((r) => ({ date: fromEpochDay(r[0]), kind: TEST_KINDS[r[1]], correct: Math.min(r[2], r[3]), total: r[3] })),
    };
  } catch {
    return emptyState();
  }
}
