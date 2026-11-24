import { z } from 'zod';
import math from './bank/math.json';
import physics from './bank/physics.json';
import informatics from './bank/informatics.json';
import { shuffleMask, shuffleOptions } from '@/lib/lessons/shuffle';
import type { ResolvedQuestion } from '@/lib/lessons/catalog';
import type { Locale } from '@/types/db';

/**
 * Банк задач из генератора content-studio/problems: каждая задача сделана по шаблону,
 * ответ посчитан кодом. Файлы bank/*.json не правим руками — только через build.py.
 */
const text = z.string().trim().min(1).max(900);
const side = z
  .object({
    context: text.optional(),
    question: text,
    options: z.array(z.string().trim().min(1).max(200)).min(5).max(6),
    /** single — всегда 0 (верный первым, перемешивает сайт); multi — маска верных. */
    correct: z.number().int().min(0),
    solution: text,
  })
  .strict();

export const bankItemSchema = z
  .object({
    id: z.string().min(1).max(60),
    template: z.string().min(1),
    subject: z.enum(['math', 'physics', 'informatics']),
    topic: z.string().regex(/^[a-z0-9-]+$/),
    level: z.enum(['easy', 'medium', 'hard']),
    kind: z.enum(['single', 'multi']),
    /** Задачи одного контекстного блока: показываются подряд и в одном наборе. */
    group: z.string().optional(),
    ru: side,
    kk: side.optional(),
  })
  .strict()
  .refine((it) => (it.kind === 'single' ? it.ru.correct === 0 : it.ru.correct > 0 && it.ru.correct < 1 << it.ru.options.length), {
    message: 'correct не соответствует kind',
  });

export type BankItem = z.infer<typeof bankItemSchema>;

export const BANK: BankItem[] = z.array(bankItemSchema).parse([...math, ...physics, ...informatics]);

export const SET_SIZE = 15;
const LEVEL_ORDER = { easy: 0, medium: 1, hard: 2 } as const;

/** Сколько задач банка в каждой теме: slug темы → число. */
export function bankCounts(items: BankItem[] = BANK): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) m.set(it.topic, (m.get(it.topic) ?? 0) + 1);
  return m;
}

/** Единица набора: одна задача или целый контекстный блок. */
function units(topic: string, items: BankItem[]): BankItem[][] {
  const byTemplate = new Map<string, BankItem[][]>();
  const groups = new Map<string, BankItem[]>();
  for (const it of items) {
    if (it.topic !== topic) continue;
    let unit: BankItem[];
    if (it.group) {
      const g = groups.get(it.group);
      if (g) {
        g.push(it);
        continue;
      }
      unit = [it];
      groups.set(it.group, unit);
    } else unit = [it];
    byTemplate.set(it.template, [...(byTemplate.get(it.template) ?? []), unit]);
  }
  // по очереди из каждого шаблона, чтобы в наборе были разные типы задач
  const queues = [...byTemplate.values()];
  const out: BankItem[][] = [];
  const longest = Math.max(0, ...queues.map((q) => q.length));
  for (let i = 0; i < longest; i++) for (const q of queues) if (q[i]) out.push(q[i]);
  return out;
}

/** Наборы темы: до SET_SIZE задач, контекстный блок никогда не разрывается. */
function sets(topic: string, items: BankItem[]): BankItem[][] {
  const out: BankItem[][] = [];
  let cur: BankItem[] = [];
  for (const u of units(topic, items)) {
    if (cur.length > 0 && cur.length + u.length > SET_SIZE) {
      out.push(cur);
      cur = [];
    }
    cur.push(...u);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * Набор задач темы (set = 0, 1, 2… — без повторов между наборами), от лёгких к сложным.
 * Сортировка устойчивая, поэтому задачи контекстного блока остаются подряд.
 */
export function topicSet(topic: string, set: number, items: BankItem[] = BANK): BankItem[] {
  return [...(sets(topic, items)[set] ?? [])].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

export function setCount(topic: string, items: BankItem[] = BANK): number {
  return sets(topic, items).length;
}

/** Задача на языке страницы (казахский — если есть, иначе русский) с перемешанными вариантами. */
export function resolveBankItem(it: BankItem, locale: Locale): ResolvedQuestion {
  const side = (locale === 'kk' && it.kk) || it.ru;
  const multi = it.kind === 'multi';
  const s = multi ? shuffleMask(it.id, side.options, side.correct) : shuffleOptions(it.id, side.options, side.correct);
  return {
    id: it.id,
    level: it.level,
    question: side.question,
    solution: side.solution,
    options: s.options,
    correct: s.correct,
    ...(multi ? { multi: true } : {}),
    ...(side.context ? { context: side.context } : {}),
  };
}
