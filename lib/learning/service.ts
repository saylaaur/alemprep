import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { QuestionVersion } from '@/lib/content/versions';
import type { Answer, LearningError, Receipt, Result, SubmitInput } from './contracts';
import { gradeVersionAnswer } from './grading';
import { validateSubmit } from './validation';

export type IssuedLearningSession = {
  id: string;
  scoringVersion: 'ent-v1';
  items: { id: string; version: QuestionVersion }[];
};

export type ServerGradedItem = {
  itemId: string;
  questionVersionId: string;
  answer: Answer;
  points: number;
  maxPoints: number;
  timeSpentMs: number;
};

export type LearningServiceDependencies = {
  actorId: () => Promise<string | null>;
  loadIssuedSession: (actorId: string, sessionId: string) => Promise<IssuedLearningSession | null>;
  commit: (input: {
    actorId: string;
    operationId: string;
    payloadHash: string;
    sessionId: string;
    scoringVersion: 'ent-v1';
    gradedItems: ServerGradedItem[];
  }) => Promise<Receipt | { error: Exclude<LearningError, 'unauthenticated' | 'invalid-input'> }>;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

function canonicalAnswer(answer: Answer): Answer {
  return Array.isArray(answer) ? [...answer].sort((left, right) => left.localeCompare(right)) : answer;
}

/** Hashes only the canonical browser answer envelope, never server grading. */
export function submitPayloadHash(input: SubmitInput): string {
  const canonical = {
    kind: 'learning.submit',
    sessionId: input.sessionId,
    answers: [...input.answers]
      .sort((left, right) => left.itemId.localeCompare(right.itemId))
      .map(({ itemId, answer, timeSpentMs }) => ({ itemId, answer: canonicalAnswer(answer), timeSpentMs })),
  };
  return createHash('sha256').update(stableJson(canonical)).digest('hex');
}

function failure(error: LearningError): Result<never> {
  return { ok: false, error, requestId: randomUUID() };
}

/**
 * The browser supplies answers only. This boundary retrieves issued immutable
 * versions, fills omitted items with null, grades on the server and sends the
 * resulting facts to the closed service-role RPC.
 */
export function createLearningService(dependencies: LearningServiceDependencies) {
  return {
    async submit(raw: unknown): Promise<Result<Receipt>> {
      let input: SubmitInput;
      try {
        input = validateSubmit(raw);
      } catch (error) {
        if (error instanceof ZodError) return failure('invalid-input');
        throw error;
      }
      const actorId = await dependencies.actorId();
      if (!actorId) return failure('unauthenticated');
      const issued = await dependencies.loadIssuedSession(actorId, input.sessionId);
      if (!issued) return failure('not-found');

      const answersByItem = new Map(input.answers.map((entry) => [entry.itemId, entry]));
      if (answersByItem.size !== input.answers.length || input.answers.some((entry) => !issued.items.some((item) => item.id === entry.itemId))) {
        return failure('invalid-input');
      }

      let gradedItems: ServerGradedItem[];
      try {
        gradedItems = issued.items.map((item) => {
          const answer = answersByItem.get(item.id);
          const normalizedAnswer = answer?.answer ?? null;
          const grade = gradeVersionAnswer(item.version, normalizedAnswer);
          return {
            itemId: item.id,
            questionVersionId: item.version.id,
            answer: normalizedAnswer,
            points: grade.points,
            maxPoints: grade.maxPoints,
            timeSpentMs: answer?.timeSpentMs ?? 0,
          };
        });
      } catch {
        return failure('invalid-input');
      }

      const committed = await dependencies.commit({
        actorId,
        operationId: input.operationId,
        payloadHash: submitPayloadHash(input),
        sessionId: issued.id,
        scoringVersion: issued.scoringVersion,
        gradedItems,
      });
      if ('error' in committed) return failure(committed.error);
      return { ok: true, value: committed };
    },
  };
}
