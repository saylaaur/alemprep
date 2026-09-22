import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { SelectedLearningSession } from '@/lib/content/learning-catalog';
import { toPublicQuestion } from '@/lib/content/public-question';
import type { QuestionVersion } from '@/lib/content/versions';
import type { StartedLearningReferences } from './repository';
import type { Answer, LearningError, LearningState, Receipt, Result, StartedLearning, StartInput, SubmitInput } from './contracts';
import { gradeVersionAnswer } from './grading';
import { validateSessionId, validateStart, validateSubmit } from './validation';

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
  start: (input: {
    actorId: string;
    operationId: string;
    payloadHash: string;
    request: Omit<StartInput, 'operationId'>;
  }) => Promise<StartedLearning | { error: Exclude<LearningError, 'unauthenticated' | 'invalid-input'> }>;
  getState: (input: {
    actorId: string;
    sessionId: string;
  }) => Promise<LearningState | { error: Exclude<LearningError, 'unauthenticated' | 'invalid-input'> }>;
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

/**
 * The idempotency operation identifies a delivery attempt; the hash identifies
 * the intended learning request. Keeping them separate lets the RPC reject a
 * changed request under the same operation ID without making retries random.
 */
export function startPayloadHash(input: StartInput): string {
  const canonical = {
    kind: 'learning.start',
    locale: input.locale,
    mode: input.mode,
    ...(input.topicSlug ? { topicSlug: input.topicSlug } : {}),
    ...(input.second ? { second: input.second } : {}),
    ...(input.assignmentId ? { assignmentId: input.assignmentId } : {}),
  };
  return createHash('sha256').update(stableJson(canonical)).digest('hex');
}

/**
 * Matches server-selected immutable versions to rows issued by the atomic RPC.
 * The mapping is positional and all public question fields pass through the
 * allowlist, so a malformed RPC response cannot expose grading data.
 */
export function materializeStartedLearning(input: {
  selected: readonly SelectedLearningSession[];
  issued: StartedLearningReferences;
}): StartedLearning | null {
  if (input.selected.length !== input.issued.sessions.length) return null;
  const sessionIds = new Set<string>();
  const sessions: StartedLearning['sessions'] = [];
  for (const [index, selected] of input.selected.entries()) {
    const issued = input.issued.sessions[index];
    if (!issued
      || sessionIds.has(issued.id)
      || selected.plan.mode !== issued.mode
      || new Date(selected.plan.expiresAt).getTime() !== new Date(issued.expiresAt).getTime()
      || selected.versions.length !== selected.plan.items.length
      || selected.versions.length !== issued.itemIds.length
      || new Set(issued.itemIds).size !== issued.itemIds.length
      || selected.versions.some((version, itemIndex) => version.id !== selected.plan.items[itemIndex]?.versionId)) {
      return null;
    }
    sessionIds.add(issued.id);
    sessions.push({
      id: issued.id,
      mode: issued.mode,
      expiresAt: issued.expiresAt,
      items: selected.versions.map((version, itemIndex) => ({
        id: issued.itemIds[itemIndex]!,
        position: itemIndex,
        question: toPublicQuestion(version),
      })),
    });
  }
  return { sessions };
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
    async start(raw: unknown): Promise<Result<StartedLearning>> {
      let input: StartInput;
      try {
        input = validateStart(raw);
      } catch (error) {
        if (error instanceof ZodError) return failure('invalid-input');
        throw error;
      }
      const actorId = await dependencies.actorId();
      if (!actorId) return failure('unauthenticated');
      // School assignments are introduced only with S02; accepting the UUID
      // earlier would let a browser claim an access scope that does not exist.
      if (input.assignmentId) return failure('forbidden');

      const started = await dependencies.start({
        actorId,
        operationId: input.operationId,
        payloadHash: startPayloadHash(input),
        request: {
          locale: input.locale,
          mode: input.mode,
          ...(input.topicSlug ? { topicSlug: input.topicSlug } : {}),
          ...(input.second ? { second: input.second } : {}),
        },
      });
      if ('error' in started) return failure(started.error);
      return { ok: true, value: started };
    },

    async getState(raw: unknown): Promise<Result<LearningState>> {
      let sessionId: string;
      try {
        sessionId = validateSessionId(raw);
      } catch (error) {
        if (error instanceof ZodError) return failure('invalid-input');
        throw error;
      }
      const actorId = await dependencies.actorId();
      if (!actorId) return failure('unauthenticated');
      const state = await dependencies.getState({ actorId, sessionId });
      if ('error' in state) return failure(state.error);
      return { ok: true, value: state };
    },

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
