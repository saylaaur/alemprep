import { describe, expect, it } from 'vitest';
import { auditQuestionFiles, auditQuestions, isEligibleForPublication } from './content-audit';
import type { GeneratedQuestion } from './schema';

function question(overrides: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
  return {
    topic_slug: 'algebraic-expressions',
    type: 'single',
    difficulty: 2,
    body: {
      stem: 'Найдите $2 + 2$.',
      options: [
        { id: 'a', content: '3' },
        { id: 'b', content: '4' },
      ],
      correct: 'b',
    },
    explanation: {
      blocks: [{ type: 'text', value: 'Складываем числа: $2 + 2 = 4$.' }],
    },
    variant_of: 'source-1.jpg',
    ...overrides,
  };
}

describe('auditQuestions', () => {
  it('blocks a single-choice question whose correct id is not an option', () => {
    const bad = question({
      body: {
        stem: 'Найдите $2 + 2$.',
        options: [
          { id: 'a', content: '3' },
          { id: 'b', content: '4' },
        ],
        correct: 'c',
      },
    });

    expect(auditQuestions([bad]).findings).toContainEqual({
      questionIndex: 0,
      code: 'invalid_correct_answer',
      severity: 'blocker',
      detail: 'correct id "c" is absent from options',
    });
  });

  it('sends self-contradictory explanations to manual review', () => {
    const doubtful = question({
      explanation: {
        blocks: [
          {
            type: 'text',
            value: 'Получили 5, но такого варианта нет. Принимаем ответ как дан.',
          },
        ],
      },
    });

    expect(auditQuestions([doubtful]).findings).toContainEqual({
      questionIndex: 0,
      code: 'contradictory_explanation',
      severity: 'review',
      detail: 'explanation says that the available answer cannot be justified',
    });
  });

  it('blocks a matching question with a left item that has no correct value', () => {
    const incomplete = question({
      type: 'matching',
      body: {
        stem: 'Установите соответствие.',
        left: [
          { id: '1', content: 'один' },
          { id: '2', content: 'два' },
        ],
        right: ['I', 'II'],
        correct: { '1': 'I' },
      },
    });

    expect(auditQuestions([incomplete]).findings).toContainEqual({
      questionIndex: 0,
      code: 'invalid_correct_answer',
      severity: 'blocker',
      detail: 'left item "2" has no correct value',
    });
  });

  it('flags the later exact duplicate stem for review', () => {
    const first = question();
    const duplicate = question({ variant_of: 'source-2.jpg' });

    expect(auditQuestions([first, duplicate]).findings).toContainEqual({
      questionIndex: 1,
      code: 'duplicate_stem',
      severity: 'review',
      detail: 'same normalized stem as question 0',
    });
  });

  it('does not flag a complete and internally consistent question', () => {
    expect(auditQuestions([question()]).findings).toEqual([]);
  });
});

describe('auditQuestionFiles', () => {
  it('reports duplicate stems across different source files', () => {
    const result = auditQuestionFiles([
      { filePath: 'first.json', questions: [question()] },
      { filePath: 'second.json', questions: [question({ variant_of: 'source-2.jpg' })] },
    ]);

    expect(result.summary).toEqual({ files: 2, questions: 2, blockers: 0, reviews: 1 });
    expect(result.findings).toContainEqual({
      filePath: 'second.json',
      questionIndex: 0,
      code: 'duplicate_stem',
      severity: 'review',
      detail: 'same normalized stem as question 0',
    });
  });
});

describe('isEligibleForPublication', () => {
  it('rejects a question whose explanation admits the answer is unjustified', () => {
    const doubtful = question({
      explanation: {
        blocks: [{ type: 'text', value: 'Получили 5, но такого варианта нет. Принимаем ответ как дан.' }],
      },
    });

    expect(isEligibleForPublication(doubtful)).toEqual({
      eligible: false,
      reason: 'contradictory_explanation',
    });
  });

  it('accepts a complete and internally consistent question', () => {
    expect(isEligibleForPublication(question())).toEqual({ eligible: true });
  });
});
