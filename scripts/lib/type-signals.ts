import { QUESTION_TYPES, type QuestionType, type QuestionBody, type TranscriptionItem } from './schema';

export { QUESTION_TYPES, type QuestionType };

/**
 * Признак по количеству вариантов ответа (см. buildMultiSystemInstruction): ровно 4 варианта
 * в профильном предмете — почти всегда single; 5 и больше — почти всегда multi. Не сигнал
 * для промежуточных значений (2-3 — там устройство не типовое, лучше довериться модели).
 */
export function inferTypeFromOptionCount(optionCount: number): 'single' | 'multi' | null {
  if (optionCount === 4) return 'single';
  if (optionCount >= 5) return 'multi';
  return null;
}

/**
 * Признак по структуре: два списка для сопоставления (left — пронумерованные подписи,
 * right — варианты значений), минимум по 2 элемента в каждом — иначе это случайные поля,
 * а не реальный список на сопоставление.
 */
export function looksLikeMatchingStructure(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    Array.isArray(b.left) && b.left.length >= 2 && Array.isArray(b.right) && b.right.length >= 2
  );
}

export interface TypeMismatch {
  reported: QuestionType;
  suggested: QuestionType;
  reason: string;
}

/**
 * Сверяет заявленный type с детерминантными признаками структуры тела — то, из-за чего
 * перекос 95/1.5/3.4% обнаружился слишком поздно (см. TASKS/CLAUDE.md по этой задаче).
 * НЕ переписывает данные: у нас нет достаточно информации, чтобы автоматически
 * досочинить body под другой тип (например, множество правильных ответов для multi по
 * одному найденному в single) — только сигнал в лог/сводку для человека.
 */
export function detectTypeMismatch(item: {
  type: QuestionType;
  body: QuestionBody;
}): TypeMismatch | null {
  if (looksLikeMatchingStructure(item.body) && item.type !== 'matching') {
    return {
      reported: item.type,
      suggested: 'matching',
      reason: 'body has left/right lists (structural match) but type is not "matching"',
    };
  }

  const options = (item.body as { options?: unknown }).options;
  if (Array.isArray(options) && (item.type === 'single' || item.type === 'multi')) {
    const hint = inferTypeFromOptionCount(options.length);
    if (hint && hint !== item.type) {
      return {
        reported: item.type,
        suggested: hint,
        reason: `${options.length} options is a strong signal for "${hint}" (reported "${item.type}")`,
      };
    }
  }

  return null;
}

export type TypeFilterResult = { keep: true } | { keep: false; reason: string };

/**
 * Пост-обработка --types: как applySubjectFilter в subject-filter.ts, только по type.
 * allowedTypes не задан (или пуст) — фильтра нет, оставляем всё (поведение по умолчанию).
 */
export function applyTypeFilter(
  type: QuestionType,
  allowedTypes: QuestionType[] | undefined,
): TypeFilterResult {
  if (!allowedTypes || allowedTypes.length === 0) return { keep: true };
  if (allowedTypes.includes(type)) return { keep: true };
  return {
    keep: false,
    reason: `Тип не входит в --types: ${type} (нужны: ${allowedTypes.join(',')})`,
  };
}

export interface ParsedTypesFlag {
  types: QuestionType[];
  invalid: string[];
}

/** Парсит "--types multi,matching" в валидные типы + список нераспознанных значений (для ошибки в CLI). */
export function parseTypesFlag(raw: string): ParsedTypesFlag {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const types: QuestionType[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if ((QUESTION_TYPES as readonly string[]).includes(p)) {
      if (!types.includes(p as QuestionType)) types.push(p as QuestionType);
    } else {
      invalid.push(p);
    }
  }
  return { types, invalid };
}

export type TypeSummary = Record<QuestionType, number>;

/** Разбивка извлечённых (не skip) заданий по типам — видно перекос сразу после транскрипции. */
export function summarizeByType(items: TranscriptionItem[]): TypeSummary {
  const summary = Object.fromEntries(QUESTION_TYPES.map((t) => [t, 0])) as TypeSummary;
  for (const item of items) {
    if ('skip' in item) continue;
    summary[item.type]++;
  }
  return summary;
}
