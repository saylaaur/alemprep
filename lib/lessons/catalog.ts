import newtonLaws from './data/newton-laws.json';
import acceleratedMotion from './data/accelerated-motion.json';
import { lessonSchema, type LessonData, type LessonQuestion } from './schema';
import { shuffleOptions } from './shuffle';
import type { Locale } from '@/types/db';

export type LessonSubject = LessonData['subject'];

/** Все видеоуроки. Новый урок = новый JSON в lib/lessons/data + строка здесь. */
const RAW: unknown[] = [acceleratedMotion, newtonLaws];
export const LESSONS: LessonData[] = RAW.map((r) => lessonSchema.parse(r));

export type ResolvedQuestion = Omit<LessonQuestion, 'correct' | 'options'> & {
  options: string[];
  /** Индекс верного варианта; для multi — битовая маска верных вариантов. */
  correct: number;
  /** Несколько верных ответов: ученик отмечает все и жмёт «Проверить», ответ — маска отмеченных. */
  multi?: boolean;
  /** Общее условие контекстного блока — показывается над вопросом. */
  context?: string;
};

export type ResolvedLesson = {
  id: string;
  subject: LessonSubject;
  bookSlug: string;
  video: string;
  poster: string;
  durationSec: number;
  title: string;
  problems: ResolvedQuestion[];
  mock: ResolvedQuestion[];
  /** Задачи пока только на русском, хотя выбран другой язык. */
  textFallback: boolean;
};

function mix(q: LessonQuestion): ResolvedQuestion {
  const s = shuffleOptions(q.id, q.options, q.correct);
  return { ...q, options: s.options, correct: s.correct };
}

export function getLesson(id: string): LessonData | null {
  return LESSONS.find((l) => l.id === id) ?? null;
}

export function resolveLesson(lesson: LessonData, locale: Locale): ResolvedLesson {
  const kk = locale === 'kk' ? lesson.kk : undefined;
  const problems = kk?.problems ?? lesson.ru.problems;
  const mock = kk?.mock ?? lesson.ru.mock;
  return {
    id: lesson.id,
    subject: lesson.subject,
    bookSlug: lesson.bookSlug,
    video: lesson.video,
    poster: lesson.poster,
    durationSec: lesson.durationSec,
    title: kk?.title ?? lesson.ru.title,
    problems: problems.map(mix),
    mock: mock.map(mix),
    textFallback: locale === 'kk' && !(kk?.problems && kk?.mock),
  };
}
