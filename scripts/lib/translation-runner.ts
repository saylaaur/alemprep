import type { TranslationInput } from './google-translation';

export const NMT_USD_PER_MILLION_CHARACTERS = 20;

export function estimateRun(segments: readonly TranslationInput[]) {
  const characters = segments.reduce((sum, segment) => sum + [...segment.sourceText].length, 0);
  const maximumChargedCharacters = characters * 3;
  return {
    characters,
    maximumChargedCharacters,
    usd: characters / 1_000_000 * NMT_USD_PER_MILLION_CHARACTERS,
    maximumUsd: maximumChargedCharacters / 1_000_000 * NMT_USD_PER_MILLION_CHARACTERS,
  };
}

export function requireExecutionBudget(
  estimate: { maximumChargedCharacters: number; maximumUsd: number },
  options: { execute: boolean; maxChars?: number; maxUsd?: number },
): void {
  if (!options.execute) return;
  if (options.maxChars === undefined) throw new Error('--execute requires --max-chars');
  if (options.maxUsd === undefined) throw new Error('--execute requires --max-usd');
  if (estimate.maximumChargedCharacters > options.maxChars) throw new Error(`max-chars exceeded: ${estimate.maximumChargedCharacters} > ${options.maxChars}`);
  // Compare in character space so IEEE-754 does not reject an exact decimal cap.
  const affordableCharacters = options.maxUsd * 1_000_000 / NMT_USD_PER_MILLION_CHARACTERS;
  if (estimate.maximumChargedCharacters > affordableCharacters + 1e-9) throw new Error(`max-usd exceeded: ${estimate.maximumUsd.toFixed(6)} > ${options.maxUsd.toFixed(6)}`);
}

export function chunkSegments(
  segments: readonly TranslationInput[],
  limits: { maxRequestChars: number; maxSegmentChars: number },
): TranslationInput[][] {
  const batches: TranslationInput[][] = [];
  let batch: TranslationInput[] = [];
  let batchChars = 0;
  for (const segment of segments) {
    const chars = [...segment.sourceText].length;
    if (chars > limits.maxSegmentChars) throw new Error(`${segment.path} exceeds automatic translation limit; manual review required`);
    if (batch.length && batchChars + chars > limits.maxRequestChars) {
      batches.push(batch);
      batch = [];
      batchChars = 0;
    }
    batch.push(segment);
    batchChars += chars;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
