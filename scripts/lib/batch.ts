/**
 * Shared Message Batches helper: submit → poll → map results by custom_id.
 * Used by transcribe-questions.ts, generate-variants.ts, verify-questions.ts.
 */
import type Anthropic from '@anthropic-ai/sdk';

const DEFAULT_POLL_INTERVAL_MS = 20_000;
const DEFAULT_MAX_WAIT_MS = 24 * 60 * 60 * 1000; // batches expire 24h after creation anyway

export interface PollOptions {
  pollIntervalMs?: number;
  maxWaitMs?: number;
  onPoll?: (batch: Anthropic.Messages.MessageBatch) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Zero-padded index — safe, unique custom_id that doesn't depend on filename charset/length. */
export function indexCustomId(index: number): string {
  return String(index).padStart(4, '0');
}

export async function pollUntilEnded(
  retrieve: () => Promise<Anthropic.Messages.MessageBatch>,
  opts: PollOptions = {},
): Promise<Anthropic.Messages.MessageBatch> {
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxWaitMs = opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const start = Date.now();

  let batch = await retrieve();
  while (batch.processing_status !== 'ended') {
    if (Date.now() - start > maxWaitMs) {
      throw new Error(
        `Batch ${batch.id} did not finish within ${maxWaitMs}ms (status: ${batch.processing_status})`,
      );
    }
    opts.onPoll?.(batch);
    await sleep(pollIntervalMs);
    batch = await retrieve();
  }
  return batch;
}

export async function submitAndAwaitBatch(
  client: Anthropic,
  requests: Anthropic.Messages.BatchCreateParams['requests'],
  opts: PollOptions = {},
): Promise<Anthropic.Messages.MessageBatch> {
  const batch = await client.messages.batches.create({ requests });
  return pollUntilEnded(() => client.messages.batches.retrieve(batch.id), opts);
}

export async function collectBatchResults(
  client: Anthropic,
  batchId: string,
): Promise<Map<string, Anthropic.Messages.MessageBatchIndividualResponse>> {
  const map = new Map<string, Anthropic.Messages.MessageBatchIndividualResponse>();
  for await (const result of await client.messages.batches.results(batchId)) {
    map.set(result.custom_id, result);
  }
  return map;
}

export interface MappedBatchItem<T> {
  customId: string;
  item: T;
  result: Anthropic.Messages.MessageBatchIndividualResponse | undefined;
}

/**
 * Batch results are not guaranteed to come back in request order (and a custom_id can be
 * entirely absent). Re-associate each original item with its result by custom_id, never by index.
 */
export function mapResultsByCustomId<T>(
  items: { customId: string; item: T }[],
  results: Map<string, Anthropic.Messages.MessageBatchIndividualResponse>,
): MappedBatchItem<T>[] {
  return items.map(({ customId, item }) => ({ customId, item, result: results.get(customId) }));
}

export function isSucceeded(
  result: Anthropic.Messages.MessageBatchIndividualResponse | undefined,
): result is Anthropic.Messages.MessageBatchIndividualResponse & {
  result: Anthropic.Messages.MessageBatchSucceededResult;
} {
  return result?.result.type === 'succeeded';
}

/** One-line reason for logging why a batch item didn't produce a usable message. */
export function describeFailure(
  result: Anthropic.Messages.MessageBatchIndividualResponse | undefined,
): string {
  if (!result) return 'no result returned for this custom_id (missing from batch output)';
  switch (result.result.type) {
    case 'errored':
      return `errored: ${result.result.error.error.message}`;
    case 'expired':
      return 'expired';
    case 'canceled':
      return 'canceled';
    case 'succeeded':
      return 'succeeded';
  }
}
