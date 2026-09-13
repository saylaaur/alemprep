import { z } from 'zod';
import type { StartInput, SubmitInput } from './contracts';

const MAX_PAYLOAD_BYTES = 64 * 1024;
const MAX_ITEM_COUNT = 80;
const MAX_OPTION_ID_LENGTH = 80;

const uuid = z.uuid();
const optionId = z.string().min(1).max(MAX_OPTION_ID_LENGTH);

function invalidInput(message: string): never {
  throw new z.ZodError([{ code: 'custom', path: [], message }]);
}

function assertPayloadSize(raw: unknown): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    invalidInput('input must be JSON-serializable');
  }

  if (!serialized || new TextEncoder().encode(serialized).byteLength > MAX_PAYLOAD_BYTES) {
    invalidInput('input exceeds the maximum payload size');
  }
}

function assertSafeObjectKeys(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const entry of value) assertSafeObjectKeys(entry, seen);
    return;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalidInput('input must contain plain JSON objects');
  }

  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      invalidInput('input contains an unsafe object key');
    }
    assertSafeObjectKeys((value as Record<string, unknown>)[key], seen);
  }
}

const matchingAnswer = z.record(optionId, optionId).superRefine((answer, context) => {
  const unsafeKeys = ['__proto__', 'prototype', 'constructor'];
  if (Object.keys(answer).some((key) => unsafeKeys.includes(key))) {
    context.addIssue({ code: 'custom', message: 'matching answer has an unsafe key' });
  }
  if (Object.keys(answer).length > 10) {
    context.addIssue({ code: 'too_big', maximum: 10, origin: 'object', inclusive: true, message: 'too many matching pairs' });
  }
});

const answer = z.union([
  z.null(),
  optionId,
  z.array(optionId).max(10).superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: 'custom', message: 'answer options must be unique' });
    }
  }),
  matchingAnswer,
]);

const startSchema = z.object({
  operationId: uuid,
  locale: z.enum(['ru', 'kk']),
  mode: z.enum(['practice', 'mock_exam', 'diagnostic', 'weekly']),
  topicSlug: z.string().trim().min(1).max(160).optional(),
  second: z.enum(['physics', 'informatics']).optional(),
  assignmentId: uuid.optional(),
}).strict();

const submitSchema = z.object({
  operationId: uuid,
  sessionId: uuid,
  answers: z.array(z.object({
    itemId: uuid,
    answer,
    timeSpentMs: z.number().finite().int().min(0).max(7_200_000),
  }).strict()).max(MAX_ITEM_COUNT),
}).strict().superRefine((input, context) => {
  const seen = new Set<string>();
  for (const [index, entry] of input.answers.entries()) {
    if (seen.has(entry.itemId)) {
      context.addIssue({ code: 'custom', path: ['answers', index, 'itemId'], message: 'item IDs must be unique' });
    }
    seen.add(entry.itemId);
  }
});

export function validateStart(raw: unknown): StartInput {
  assertSafeObjectKeys(raw);
  assertPayloadSize(raw);
  return startSchema.parse(raw);
}

export function validateSubmit(raw: unknown): SubmitInput {
  assertSafeObjectKeys(raw);
  assertPayloadSize(raw);
  return submitSchema.parse(raw);
}
