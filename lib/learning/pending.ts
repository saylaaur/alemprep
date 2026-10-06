import { z } from 'zod';
import type { Answer, Locale, SubmitInput } from './contracts';
import type { PublicQuestion } from '@/lib/content/public-question';
import { validateSubmit } from './validation';

export const PENDING_KEY = 'alemprep.learning.pending.v1';
export type PendingScope = { owner: string; locale: Locale; topicSlug: string };
const id = z.uuid();
const text = z.string().max(80);
const matchingText = z.string().max(512);
const draftAnswer = z.union([z.null(), text, z.array(text).max(10), z.record(text, matchingText)]).superRefine((value, ctx) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length > 10 || keys.some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) {
      ctx.addIssue({ code: 'custom', message: 'invalid answer keys' });
    }
  }
});
const startSchema = z.object({ operationId: id, locale: z.enum(['ru', 'kk']), mode: z.literal('practice'), topicSlug: z.string().min(1).max(160) }).strict();
const schema = z.object({
  version: z.literal(1), owner: id, locale: z.enum(['ru', 'kk']), topicSlug: z.string().min(1).max(160),
  start: startSchema, sessionId: id.nullable(), itemId: id.nullable(),
  shownAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  answer: draftAnswer, submit: z.unknown(),
}).strict();
export type PendingLearning = Omit<z.infer<typeof schema>, 'submit'> & { submit: SubmitInput | null };

export function createPending(scope: PendingScope, operationId: string): PendingLearning {
  return parse({ ...scope, version: 1, start: { operationId, locale: scope.locale, mode: 'practice', topicSlug: scope.topicSlug }, sessionId: null, itemId: null, shownAt: null, answer: null, submit: null });
}

function parse(raw: unknown): PendingLearning {
  const parsed = schema.parse(raw);
  if (parsed.start.locale !== parsed.locale || parsed.start.topicSlug !== parsed.topicSlug) throw new Error('route mismatch');
  const bound = parsed.sessionId !== null;
  if (bound !== (parsed.itemId !== null) || bound !== (parsed.shownAt !== null)) throw new Error('incomplete binding');
  const submit = parsed.submit === null ? null : validateSubmit(parsed.submit);
  if (submit && (!bound || submit.sessionId !== parsed.sessionId || submit.answers.length !== 1 || submit.answers[0].itemId !== parsed.itemId)) throw new Error('submit mismatch');
  if (!bound && (parsed.answer !== null || submit !== null)) throw new Error('unbound draft');
  return { ...parsed, submit };
}

export function restorePending(raw: string | null, scope: PendingScope): PendingLearning | null {
  if (!raw || raw.length > 64 * 1024) return null;
  try {
    const pending = parse(JSON.parse(raw));
    return pending.owner === scope.owner && pending.locale === scope.locale && pending.topicSlug === scope.topicSlug ? pending : null;
  } catch { return null; }
}

export function bindSession(pending: PendingLearning, sessionId: string, itemId: string, now: number): PendingLearning {
  if (pending.sessionId && (pending.sessionId !== sessionId || pending.itemId !== itemId)) throw new Error('issued item changed');
  return parse({ ...pending, sessionId, itemId, shownAt: pending.shownAt ?? now });
}

export function updateDraft(pending: PendingLearning, answer: Answer): PendingLearning {
  return pending.submit ? pending : parse({ ...pending, answer });
}

export function freezeSubmit(pending: PendingLearning, operationId: string, now: number, skip = false): PendingLearning {
  if (pending.submit) return pending;
  if (!pending.sessionId || !pending.itemId || pending.shownAt === null) throw new Error('no issued item');
  const answer = skip ? null : pending.answer;
  if (!skip && (answer === null || answer === '' || (Array.isArray(answer) && answer.length === 0))) throw new Error('empty answer');
  return parse({ ...pending, submit: {
    operationId, sessionId: pending.sessionId,
    answers: [{ itemId: pending.itemId, answer, timeSpentMs: Math.min(7_200_000, Math.max(0, Math.floor(now - pending.shownAt))) }],
  } });
}

/** Completeness uses public options only; correctness is exclusively server-owned. */
export function hasCompleteAnswer(question: PublicQuestion, answer: Answer): boolean {
  const { body, type } = question;
  if ('options' in body) {
    const ids = new Set(body.options.map((option) => option.id));
    if (type === 'single') return typeof answer === 'string' && ids.has(answer);
    if (type === 'multi') return Array.isArray(answer) && answer.length > 0 && new Set(answer).size === answer.length && answer.every((value) => ids.has(value));
  }
  if (type === 'matching' && 'left' in body && answer !== null && typeof answer === 'object' && !Array.isArray(answer)) {
    return Object.keys(answer).length === body.left.length && body.left.every((item) => body.right.includes(answer[item.id]));
  }
  return false;
}
