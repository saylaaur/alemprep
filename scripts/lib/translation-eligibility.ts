export type QuestionTranslationEligibility = { contextId: string | null; stale: boolean; manual: boolean };

/** A shared context is billable only when it serves at least one question eligible for a draft. */
export function eligibleContextIds(questions: readonly QuestionTranslationEligibility[]): Set<string> {
  return new Set(questions.flatMap(question => !question.stale && !question.manual && question.contextId ? [question.contextId] : []));
}
