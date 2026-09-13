import type {
  ContextContent,
  Explanation,
  Locale,
  QuestionBody,
  QuestionType,
} from '@/types/db';

export type PublicSingleBody = Omit<Extract<QuestionBody, { correct: string }>, 'correct'>;
export type PublicMultiBody = Omit<Extract<QuestionBody, { correct: string[] }>, 'correct'>;
export type PublicMatchingBody = Omit<Extract<QuestionBody, { correct: Record<string, string> }>, 'correct'>;
export type PublicQuestionBody = PublicSingleBody | PublicMultiBody | PublicMatchingBody;

/** Immutable server-side snapshot of one reviewed question revision. */
export type QuestionVersion = {
  id: string;
  questionId: string;
  familyId: string;
  revision: number;
  locale: Locale;
  type: QuestionType;
  /** Derived from the topic join; not stored in the immutable JSON snapshot. */
  topicLabel: string;
  publicBody: PublicQuestionBody;
  gradingBody: QuestionBody;
  explanation: Explanation | null;
  contextSnapshot: ContextContent | null;
  contentHash: string;
};
