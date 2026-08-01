import { ReferenceQuestionSchema, SkipItemSchema, type TranscriptionItem } from './schema';

/**
 * Claude часто оборачивает JSON-массив в ```-блоки или добавляет преамбулу/эпилог.
 * Достаём чистый JSON-массив: снимаем code fences и берём срез от первой [ до последней ].
 */
export function extractJsonArray(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return s;
}

export interface MultiParseResult {
  items: TranscriptionItem[];
  discardedReasons: string[];
  /** Set when the raw text could not be parsed as a JSON array at all. */
  parseError?: string;
}

/**
 * Parses the model's raw text response for --multi mode into validated items.
 * Each array element is checked against SkipItemSchema then ReferenceQuestionSchema
 * (same as single-item mode); elements matching neither are discarded with a reason.
 */
export function parseMultiItems(raw: string, sourceFile: string): MultiParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonArray(raw));
  } catch {
    return {
      items: [],
      discardedReasons: [],
      parseError: `Not JSON: ${raw.slice(0, 80).replace(/\s+/g, ' ')}`,
    };
  }

  if (!Array.isArray(parsed)) {
    return { items: [], discardedReasons: [], parseError: 'Response was not a JSON array' };
  }

  const items: TranscriptionItem[] = [];
  const discardedReasons: string[] = [];

  parsed.forEach((entry, i) => {
    if (typeof entry === 'object' && entry !== null) {
      (entry as Record<string, unknown>).source_file = sourceFile;
    }

    const skipResult = SkipItemSchema.safeParse(entry);
    if (skipResult.success) {
      items.push(skipResult.data);
      return;
    }

    const refResult = ReferenceQuestionSchema.safeParse(entry);
    if (refResult.success) {
      items.push(refResult.data);
      return;
    }

    const msg = refResult.error.issues[0]?.message ?? 'unknown';
    discardedReasons.push(`item[${i}]: ${msg}`);
  });

  return { items, discardedReasons };
}
