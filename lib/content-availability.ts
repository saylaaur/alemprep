import type { QuestionType } from '@/types/db';

export function hasCompleteAssessment(blocks: ReadonlyArray<{
  questions: readonly unknown[];
  shortfall: readonly unknown[];
}>): boolean {
  return blocks.length === 2 && blocks.every((block) => block.questions.length > 0 && block.shortfall.length === 0);
}

export function hasAssessmentContent(
  availability: Record<string, Partial<Record<QuestionType, number>>>,
  second: string,
  blueprint: ReadonlyArray<{ type: QuestionType; count: number }>,
): boolean {
  return ['math', second].every((slug) =>
    blueprint.every((part) => (availability[slug]?.[part.type] ?? 0) >= part.count),
  );
}
