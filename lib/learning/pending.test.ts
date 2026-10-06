import { expect, it } from 'vitest';
import { createPending, restorePending, freezeSubmit, bindSession, updateDraft } from './pending';

const owner = '11111111-1111-4111-8111-111111111111';
const op = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const itemId = '44444444-4444-4444-8444-444444444444';
const submitId = '55555555-5555-4555-8555-555555555555';
const scope = { owner, locale: 'ru' as const, topicSlug: 'logarithms' };
const draft = () => bindSession(createPending(scope, op), sessionId, itemId, 1000);

it('restores only the owner and route that created the draft', () => {
  const raw = JSON.stringify(draft());
  expect(restorePending(raw, scope)?.itemId).toBe(itemId);
  expect(restorePending(raw, { ...scope, owner: op })).toBeNull();
  expect(restorePending(raw, { ...scope, locale: 'kk' })).toBeNull();
  expect(restorePending(raw, { ...scope, topicSlug: 'other' })).toBeNull();
});

it('freezes exactly one submit including time and preserves it across retries', () => {
  const pending = freezeSubmit(updateDraft(draft(), ['A', 'B']), submitId, 2345);
  const restored = restorePending(JSON.stringify(pending), scope)!;
  expect(restored.submit).toEqual({ operationId: submitId, sessionId, answers: [{ itemId, answer: ['A', 'B'], timeSpentMs: 1345 }] });
  expect(freezeSubmit(restored, op, 9999)).toEqual(restored);
  expect(updateDraft(restored, ['C'])).toEqual(restored);
});

it('rejects private fields, malformed identifiers and crossed submit/session IDs', () => {
  const pending = freezeSubmit(updateDraft(draft(), 'A'), submitId, 2345);
  for (const bad of [
    { ...pending, correct: 'A' }, { ...pending, owner: 'bad' }, { ...pending, shownAt: -1 },
    { ...pending, start: { ...pending.start, actor: owner } },
    { ...pending, start: { ...pending.start, topicSlug: 'other' } },
    { ...pending, submit: { ...pending.submit, sessionId: op } },
    { ...pending, submit: { ...pending.submit, answers: [{ itemId: op, answer: 'A', timeSpentMs: 1 }] } },
    { ...pending, submit: { ...pending.submit, answers: [{ itemId, answer: 'A', timeSpentMs: 7_200_001 }] } },
  ]) expect(restorePending(JSON.stringify(bad), scope)).toBeNull();
  expect(restorePending('{broken', scope)).toBeNull();
});

it('allows explicit skip, bounds elapsed time and rejects empty normal submits', () => {
  expect(() => freezeSubmit(draft(), submitId, 2000)).toThrow();
  expect(freezeSubmit(draft(), submitId, 99_999_999, true).submit?.answers).toEqual([{ itemId, answer: null, timeSpentMs: 7_200_000 }]);
});

it('stores no question data and permits partial matching drafts', () => {
  const pending = updateDraft(draft(), { A: 'one', B: '' });
  expect(restorePending(JSON.stringify(pending), scope)?.answer).toEqual({ A: 'one', B: '' });
  expect(Object.keys(pending).sort()).toEqual(['answer', 'itemId', 'locale', 'owner', 'sessionId', 'shownAt', 'start', 'submit', 'topicSlug', 'version']);
  expect(() => bindSession(pending, op, itemId, 2000)).toThrow();
});

it('keeps a long matching label in the frozen draft', () => {
  const label = 'ұзын жауап '.repeat(12);
  const pending = updateDraft(draft(), { left: label });
  expect(restorePending(JSON.stringify(pending), scope)?.answer).toEqual({ left: label });
});
