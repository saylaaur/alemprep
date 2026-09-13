import type { PublicQuestion } from '@/lib/content/public-question';
import type { Explanation, QuestionBody } from '@/types/db';

export type Locale = 'ru' | 'kk';
export type LearningMode = 'practice' | 'mock_exam' | 'diagnostic' | 'weekly';
export type Answer = string | string[] | Record<string, string> | null;
export type LearningError =
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid-input'
  | 'not-found'
  | 'expired'
  | 'already-submitted'
  | 'operation-conflict'
  | 'content-unavailable'
  | 'rate-limited'
  | 'temporarily-unavailable';

export type Result<T> = { ok: true; value: T } | {
  ok: false;
  error: LearningError;
  requestId: string;
  retryAfterMs?: number;
};

export type StartInput = {
  operationId: string;
  locale: Locale;
  mode: LearningMode;
  topicSlug?: string;
  second?: 'physics' | 'informatics';
  assignmentId?: string;
};

export type SubmitInput = {
  operationId: string;
  sessionId: string;
  answers: { itemId: string; answer: Answer; timeSpentMs: number }[];
};

export type Receipt = {
  sessionId: string;
  acceptedAt: string;
  score: number;
  maxScore: number;
  correctCount: number;
  totalQuestions: number;
  xpAwarded: number;
  integrityVersion: 1;
  scoringVersion: 'ent-v1';
};

export type PublicSessionItem = { id: string; position: number; question: PublicQuestion };
export type StartedSession = { id: string; mode: LearningMode; expiresAt: string; items: PublicSessionItem[] };
export type StartedLearning = { sessions: StartedSession[] };
export type LearningReview = {
  receipt: Receipt;
  items: {
    itemId: string;
    answer: Answer;
    points: number;
    maxPoints: number;
    explanation: Explanation | null;
    gradingBody: QuestionBody;
  }[];
};
