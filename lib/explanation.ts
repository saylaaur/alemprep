/**
 * Нормализация разбора задачи (questions.explanation, JSONB) для рендера.
 * Чистая функция — принимает unknown, потому что данные приходят из JSONB
 * и форма блока (types/db.ts ContentBlock) не гарантирована рантаймом.
 */

export type NormalizedExplanationBlock =
  | { type: 'text' | 'latex' | 'image'; value: string }
  | { type: 'table'; columns: string[]; rows: string[][] };

function isSafeImageSource(value: string): boolean {
  if (value.startsWith('/')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Валидные блоки в исходном порядке. Картинки принимаются только с http(s)
 * или относительным URL; таблица требует одинаковое число строк в каждой
 * строке. Любые битые данные отбрасываются молча, чтобы не сломать страницу.
 */
export function normalizeExplanationBlocks(explanation: unknown): NormalizedExplanationBlock[] {
  if (!explanation || typeof explanation !== 'object') return [];

  const blocks = (explanation as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return [];

  const result: NormalizedExplanationBlock[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;

    const { type, value } = block as { type?: unknown; value?: unknown };
    if (type === 'table') {
      const { columns, rows } = block as { columns?: unknown; rows?: unknown };
      if (
        !Array.isArray(columns) ||
        columns.length === 0 ||
        !columns.every((column) => typeof column === 'string') ||
        !Array.isArray(rows) ||
        !rows.every(
          (row) =>
            Array.isArray(row) &&
            row.length === columns.length &&
            row.every((cell) => typeof cell === 'string'),
        )
      ) {
        continue;
      }
      result.push({ type: 'table', columns, rows });
      continue;
    }
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    if (type === 'image' && !isSafeImageSource(value)) continue;

    result.push({ type: type === 'latex' || type === 'image' ? type : 'text', value });
  }
  return result;
}
