import { QUESTION_POINTS, scoreAnswer } from '@/lib/exam';
import type { Answer } from './contracts';
import type { QuestionVersion } from '@/lib/content/versions';

function invalidAnswer(): never {
  throw new Error('invalid answer for issued question version');
}

/**
 * Validates variant IDs against the immutable item that was issued, then grades
 * only from that version's private grading body.
 */
export function gradeVersionAnswer(version: QuestionVersion, answer: Answer): {
  points: number;
  maxPoints: number;
} {
  if (answer !== null) {
    if (version.type === 'single') {
      if (!('options' in version.gradingBody)) invalidAnswer();
      const valid = version.gradingBody.options.map((option) => option.id);
      if (typeof answer !== 'string' || !valid.includes(answer)) invalidAnswer();
    } else if (version.type === 'multi') {
      if (!('options' in version.gradingBody)) invalidAnswer();
      const valid = new Set(version.gradingBody.options.map((option) => option.id));
      if (!Array.isArray(answer) || new Set(answer).size !== answer.length || answer.some((id) => !valid.has(id))) {
        invalidAnswer();
      }
    } else {
      const body = version.gradingBody;
      if (!('left' in body) || !('right' in body)) invalidAnswer();
      const validLeft = new Set(body.left.map((option) => option.id));
      const validRight = new Set(body.right);
      if (
        typeof answer !== 'object' ||
        Array.isArray(answer) ||
        Object.entries(answer).some(([left, right]) => !validLeft.has(left) || !validRight.has(right))
      ) {
        invalidAnswer();
      }
    }
  }

  return {
    points: scoreAnswer(version.type, version.gradingBody, answer),
    maxPoints: QUESTION_POINTS[version.type],
  };
}
