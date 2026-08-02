/** Ниже которого не трогаем текущую тему задачи — лучше оставить как есть, чем переложить неверно. */
export const RECLASSIFY_CONFIDENCE_THRESHOLD = 0.6;

export type ClassificationOutcome =
  | { kind: 'classified'; topicSlug: string; confidence: number }
  | { kind: 'low_confidence'; topicSlug: string; confidence: number }
  | { kind: 'invalid_slug'; rawSlug: string; confidence: number }
  | { kind: 'parse_error'; reason: string };

/** Извлекаем JSON из хвоста ответа (после маркера ANSWER:), тот же приём, что в verify-questions.ts. */
function extractAnswerJson(raw: string): string {
  let s = raw.trim();
  const marker = s.lastIndexOf('ANSWER:');
  if (marker !== -1) s = s.slice(marker + 'ANSWER:'.length);
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return s.trim();
}

/**
 * Парсит ответ классификатора и детерминантно проверяет его: вернувшийся
 * topic_slug ОБЯЗАН быть в officialSlugs этого предмета, иначе — invalid_slug
 * (задача остаётся на прежней теме). confidence < RECLASSIFY_CONFIDENCE_THRESHOLD
 * — low_confidence (тоже не трогаем). Обе проверки отдельно от Zod: Zod не может
 * знать список слагов конкретного предмета на момент вызова.
 */
export function parseClassification(
  raw: string,
  officialSlugs: readonly string[],
): ClassificationOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractAnswerJson(raw));
  } catch {
    return { kind: 'parse_error', reason: `Not JSON: ${raw.slice(0, 80).replace(/\s+/g, ' ')}` };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { kind: 'parse_error', reason: 'Response was not a JSON object' };
  }

  const obj = parsed as Record<string, unknown>;
  const rawSlug = obj.topic_slug;
  const confidence = obj.confidence;

  if (typeof rawSlug !== 'string' || typeof confidence !== 'number' || Number.isNaN(confidence)) {
    return { kind: 'parse_error', reason: 'Missing or malformed topic_slug/confidence' };
  }

  if (!officialSlugs.includes(rawSlug)) {
    return { kind: 'invalid_slug', rawSlug, confidence };
  }

  if (confidence < RECLASSIFY_CONFIDENCE_THRESHOLD) {
    return { kind: 'low_confidence', topicSlug: rawSlug, confidence };
  }

  return { kind: 'classified', topicSlug: rawSlug, confidence };
}

export interface ReclassificationItem {
  questionId: string;
  currentTopicSlug: string;
  outcome: ClassificationOutcome;
}

export interface ReclassificationSummary {
  total: number;
  /** classified с новым слагом, отличным от текущего — единственное, что пишем в БД. */
  reclassified: number;
  /** classified, но слаг совпал с текущим — писать нечего. */
  confirmedUnchanged: number;
  lowConfidence: number;
  invalidSlug: number;
  parseErrors: number;
  /** lowConfidence + invalidSlug + parseErrors — «не удалось классифицировать». */
  unclassified: number;
  /** Итоговое распределение по темам (reclassified ∪ confirmedUnchanged). */
  distribution: Record<string, number>;
}

export function summarizeReclassification(items: ReclassificationItem[]): ReclassificationSummary {
  let reclassified = 0;
  let confirmedUnchanged = 0;
  let lowConfidence = 0;
  let invalidSlug = 0;
  let parseErrors = 0;
  const distribution: Record<string, number> = {};

  for (const item of items) {
    const { outcome } = item;
    if (outcome.kind === 'classified') {
      distribution[outcome.topicSlug] = (distribution[outcome.topicSlug] ?? 0) + 1;
      if (outcome.topicSlug === item.currentTopicSlug) {
        confirmedUnchanged++;
      } else {
        reclassified++;
      }
    } else if (outcome.kind === 'low_confidence') {
      lowConfidence++;
    } else if (outcome.kind === 'invalid_slug') {
      invalidSlug++;
    } else {
      parseErrors++;
    }
  }

  return {
    total: items.length,
    reclassified,
    confirmedUnchanged,
    lowConfidence,
    invalidSlug,
    parseErrors,
    unclassified: lowConfidence + invalidSlug + parseErrors,
    distribution,
  };
}
