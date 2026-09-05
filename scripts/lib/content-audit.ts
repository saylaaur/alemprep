import { referencesMissingVisual } from './checks';
import type { GeneratedQuestion, MatchingBody, MultiBody, QuestionBody, SingleBody } from './schema';

export type ContentAuditCode =
  | 'invalid_correct_answer'
  | 'contradictory_explanation'
  | 'duplicate_stem'
  | 'missing_visual_material';

export type ContentAuditSeverity = 'blocker' | 'review';

export interface ContentAuditFinding {
  questionIndex: number;
  code: ContentAuditCode;
  severity: ContentAuditSeverity;
  detail: string;
}

export interface ContentAuditResult {
  findings: ContentAuditFinding[];
}

export interface ContentAuditFile {
  filePath: string;
  questions: GeneratedQuestion[];
}

export interface ContentAuditFileFinding extends ContentAuditFinding {
  filePath: string;
}

export interface ContentAuditFilesResult {
  findings: ContentAuditFileFinding[];
  summary: {
    files: number;
    questions: number;
    blockers: number;
    reviews: number;
  };
}

const CONTRADICTORY_EXPLANATION_PATTERNS = [
  /такого\s+варианта\s+нет/i,
  /среди\s+вариант(?:ов|а).*нет/i,
  /принимаем\s+ответ\s+как\s+дан/i,
  /не\s+совпада(?:ет|ют)\s+с\s+(?:опци|вариант)/i,
  /ответ\s+должен\s+быть.*(?:нет|отсутств)/i,
];

function normalizedStem(question: GeneratedQuestion): string {
  return (question.body as { stem: string }).stem.replace(/\s+/g, ' ').trim().toLowerCase();
}

function auditSingleOrMultiAnswer(
  body: SingleBody | MultiBody,
  questionIndex: number,
): ContentAuditFinding[] {
  const optionIds = new Set(body.options.map((option) => option.id));
  const correctIds = Array.isArray(body.correct) ? body.correct : [body.correct];
  const invalidId = correctIds.find((id) => !optionIds.has(id));
  if (!invalidId) return [];

  return [
    {
      questionIndex,
      code: 'invalid_correct_answer',
      severity: 'blocker',
      detail: `correct id "${invalidId}" is absent from options`,
    },
  ];
}

function auditMatchingAnswer(body: MatchingBody, questionIndex: number): ContentAuditFinding[] {
  const leftIds = new Set(body.left.map((item) => item.id));
  const rightValues = new Set(body.right);
  const invalidKey = Object.keys(body.correct).find((id) => !leftIds.has(id));
  if (invalidKey) {
    return [
      {
        questionIndex,
        code: 'invalid_correct_answer',
        severity: 'blocker',
        detail: `correct key "${invalidKey}" is absent from left items`,
      },
    ];
  }

  const missingKey = body.left.map((item) => item.id).find((id) => !(id in body.correct));
  if (missingKey) {
    return [
      {
        questionIndex,
        code: 'invalid_correct_answer',
        severity: 'blocker',
        detail: `left item "${missingKey}" has no correct value`,
      },
    ];
  }

  const invalidValue = Object.entries(body.correct).find(([, value]) => !rightValues.has(value));
  if (invalidValue) {
    return [
      {
        questionIndex,
        code: 'invalid_correct_answer',
        severity: 'blocker',
        detail: `correct value "${invalidValue[1]}" is absent from right items`,
      },
    ];
  }

  return [];
}

function auditAnswer(body: QuestionBody, questionIndex: number): ContentAuditFinding[] {
  if ('options' in body) return auditSingleOrMultiAnswer(body, questionIndex);
  return auditMatchingAnswer(body, questionIndex);
}

function explanationIsContradictory(question: GeneratedQuestion): boolean {
  const explanation = question.explanation.blocks.map((block) => block.value).join(' ');
  return CONTRADICTORY_EXPLANATION_PATTERNS.some((pattern) => pattern.test(explanation));
}

/**
 * Проводит дешёвую детерминированную проверку перед ручной предметной вычиткой.
 * Результат не подтверждает математическую верность: finding с severity review
 * означает обязательную проверку редактором, blocker — запрет публикации.
 */
export function auditQuestions(questions: GeneratedQuestion[]): ContentAuditResult {
  const findings: ContentAuditFinding[] = [];
  const firstByStem = new Map<string, number>();

  for (const [questionIndex, question] of questions.entries()) {
    findings.push(...auditAnswer(question.body, questionIndex));

    if (referencesMissingVisual(question)) {
      findings.push({
        questionIndex,
        code: 'missing_visual_material',
        severity: 'blocker',
        detail: 'question references visual material that is not stored with it',
      });
    }

    if (explanationIsContradictory(question)) {
      findings.push({
        questionIndex,
        code: 'contradictory_explanation',
        severity: 'review',
        detail: 'explanation says that the available answer cannot be justified',
      });
    }

    const stem = normalizedStem(question);
    const firstIndex = firstByStem.get(stem);
    if (stem && firstIndex !== undefined) {
      findings.push({
        questionIndex,
        code: 'duplicate_stem',
        severity: 'review',
        detail: `same normalized stem as question ${firstIndex}`,
      });
    } else if (stem) {
      firstByStem.set(stem, questionIndex);
    }
  }

  return { findings };
}

/** Объединяет результаты по выгрузкам, включая дубли между разными файлами. */
export function auditQuestionFiles(files: ContentAuditFile[]): ContentAuditFilesResult {
  const entries = files.flatMap(({ filePath, questions }) =>
    questions.map((question, questionIndex) => ({ filePath, questionIndex, question })),
  );
  const audit = auditQuestions(entries.map((entry) => entry.question));
  const findings = audit.findings.map((finding) => {
    const entry = entries[finding.questionIndex];
    return {
      ...finding,
      filePath: entry.filePath,
      questionIndex: entry.questionIndex,
    };
  });

  return {
    findings,
    summary: {
      files: files.length,
      questions: entries.length,
      blockers: findings.filter((finding) => finding.severity === 'blocker').length,
      reviews: findings.filter((finding) => finding.severity === 'review').length,
    },
  };
}
