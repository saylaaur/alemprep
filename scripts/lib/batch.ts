/**
 * Shared Message Batches helper: submit → poll → map results by custom_id.
 * Used by transcribe-questions.ts, generate-variants.ts, verify-questions.ts.
 */
import Anthropic, { APIConnectionError, APIError } from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_POLL_INTERVAL_MS = 20_000;
const DEFAULT_MAX_WAIT_MS = 24 * 60 * 60 * 1000; // batches expire 24h after creation anyway

/** 5s, 15s, 45s, 2m — 4 retries (5 attempts total) before giving up on a transient error. */
export const DEFAULT_RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 120_000];

const TRANSIENT_NODE_ERROR_CODES = new Set(['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT']);

export interface RetryOptions {
  retryDelaysMs?: number[];
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

export interface PollOptions {
  pollIntervalMs?: number;
  maxWaitMs?: number;
  onPoll?: (batch: Anthropic.Messages.MessageBatch) => void;
  retry?: RetryOptions;
}

export interface SubmitOptions extends PollOptions {
  /** Skip batch creation and resume polling/collecting an already-submitted batch. */
  resumeBatchId?: string;
  /** Fires right after a fresh batch is created — the only point to persist its id. */
  onSubmitted?: (batch: Anthropic.Messages.MessageBatch) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Distinguishes network hiccups worth retrying (DNS failures, resets, timeouts, rate limits,
 * server errors) from permanent failures (bad auth, missing batch) that should fail fast.
 */
export function isTransientError(err: unknown): boolean {
  if (err instanceof APIError) {
    if (err instanceof APIConnectionError) return true;
    return err.status === 429 || (typeof err.status === 'number' && err.status >= 500);
  }
  const code = errorCode(err) ?? errorCode((err as { cause?: unknown } | null)?.cause);
  return code !== undefined && TRANSIENT_NODE_ERROR_CODES.has(code);
}

/** Retries `fn` on transient errors with exponential backoff; fatal errors throw immediately. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const delays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientError(err) || attempt >= delays.length) {
        throw err;
      }
      const delayMs = delays[attempt];
      attempt++;
      opts.onRetry?.({ attempt, delayMs, error: err });
      await sleep(delayMs);
    }
  }
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

  let batch = await withRetry(retrieve, opts.retry);
  while (batch.processing_status !== 'ended') {
    if (Date.now() - start > maxWaitMs) {
      throw new Error(
        `Batch ${batch.id} did not finish within ${maxWaitMs}ms (status: ${batch.processing_status})`,
      );
    }
    opts.onPoll?.(batch);
    await sleep(pollIntervalMs);
    batch = await withRetry(retrieve, opts.retry);
  }
  return batch;
}

export async function submitAndAwaitBatch(
  client: Anthropic,
  requests: Anthropic.Messages.BatchCreateParams['requests'],
  opts: SubmitOptions = {},
): Promise<Anthropic.Messages.MessageBatch> {
  if (opts.resumeBatchId) {
    const resumeId = opts.resumeBatchId;
    return pollUntilEnded(() => client.messages.batches.retrieve(resumeId), opts);
  }
  const batch = await client.messages.batches.create({ requests });
  opts.onSubmitted?.(batch);
  return pollUntilEnded(() => client.messages.batches.retrieve(batch.id), opts);
}

export async function collectBatchResults(
  client: Anthropic,
  batchId: string,
  opts: RetryOptions = {},
): Promise<Map<string, Anthropic.Messages.MessageBatchIndividualResponse>> {
  return withRetry(async () => {
    const map = new Map<string, Anthropic.Messages.MessageBatchIndividualResponse>();
    for await (const result of await client.messages.batches.results(batchId)) {
      map.set(result.custom_id, result);
    }
    return map;
  }, opts);
}

export type BatchStep = 'transcribe' | 'generate' | 'verify';

export interface BatchState {
  batchId: string;
  step: BatchStep;
  subject: string | undefined;
  dir: string;
  createdAt: string;
}

const BATCHES_DIR = path.join(process.cwd(), 'scripts', '.batches');

/** Persists a submitted batch's id to disk so a fatal crash mid-poll doesn't lose track of it. */
export function saveBatchState(state: BatchState): string {
  fs.mkdirSync(BATCHES_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(BATCHES_DIR, `${ts}-${state.step}.json`);
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
  return file;
}

/** Printed on fatal failure so the batch (already paid for) isn't resubmitted. */
export function printResumeHint(npmScript: string, batchId: string): void {
  console.error(`\n⚠️  Батч ${batchId} отправлен. Продолжить: npm run ${npmScript} -- --resume ${batchId}\n`);
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
