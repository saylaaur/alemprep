/**
 * Нормализация разбора задачи (questions.explanation, JSONB) для рендера.
 * Чистая функция — принимает unknown, потому что данные приходят из JSONB
 * и форма блока (types/db.ts ContentBlock) не гарантирована рантаймом.
 */

export type NormalizedExplanationBlock = { type: 'text' | 'latex'; value: string };

/**
 * Валидные блоки в исходном порядке. Блоки с type: 'image' пропускаются —
 * рендер картинок в разборе пока не поддерживается. Любые битые данные
 * (не объект, blocks не массив, value не непустая строка) отбрасываются
 * молча — вместо падения страницы или вывода «undefined».
 */
export function normalizeExplanationBlocks(explanation: unknown): NormalizedExplanationBlock[] {
  if (!explanation || typeof explanation !== 'object') return [];

  const blocks = (explanation as { blocks?: unknown }).blocks;
  if (!Array.isArray(blocks)) return [];

  const result: NormalizedExplanationBlock[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;

    const { type, value } = block as { type?: unknown; value?: unknown };
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    if (type === 'image') continue;

    result.push({ type: type === 'latex' ? 'latex' : 'text', value });
  }
  return result;
}
