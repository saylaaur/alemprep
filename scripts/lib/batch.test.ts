import { describe, expect, it, vi } from 'vitest';
import Anthropic, {
  APIConnectionError,
  AuthenticationError,
  InternalServerError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import {
  collectBatchResults,
  DEFAULT_RETRY_DELAYS_MS,
  describeFailure,
  indexCustomId,
  isSucceeded,
  isTransientError,
  mapResultsByCustomId,
  pollUntilEnded,
  withRetry,
} from './batch';

type Batch = Anthropic.Messages.MessageBatch;
type Result = Anthropic.Messages.MessageBatchIndividualResponse;

function makeBatch(status: Batch['processing_status']): Batch {
  return {
    id: 'batch_1',
    archived_at: null,
    cancel_initiated_at: null,
    created_at: '2026-01-01T00:00:00Z',
    ended_at: null,
    expires_at: '2026-01-02T00:00:00Z',
    processing_status: status,
    request_counts: {
      canceled: 0,
      errored: 0,
      expired: 0,
      processing: status === 'ended' ? 0 : 1,
      succeeded: status === 'ended' ? 1 : 0,
    },
    results_url: null,
    type: 'message_batch',
  };
}

function succeeded(customId: string, text: string): Result {
  return {
    custom_id: customId,
    result: {
      type: 'succeeded',
      message: {
        id: 'msg_1',
        container: null,
        content: [{ type: 'text', text, citations: [] }],
        model: 'claude-haiku-4-5-20251001',
        role: 'assistant',
        stop_reason: 'end_turn',
        stop_sequence: null,
        stop_details: null,
        type: 'message',
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          cache_creation: null,
          inference_geo: null,
          output_tokens_details: null,
          server_tool_use: null,
          service_tier: null,
        },
      },
    },
  } as Result;
}

function errored(customId: string, message: string): Result {
  return {
    custom_id: customId,
    result: {
      type: 'errored',
      error: { type: 'error', request_id: null, error: { type: 'api_error', message } },
    },
  } as Result;
}

function expired(customId: string): Result {
  return { custom_id: customId, result: { type: 'expired' } };
}

function canceled(customId: string): Result {
  return { custom_id: customId, result: { type: 'canceled' } };
}

describe('indexCustomId', () => {
  it('zero-pads indices to a stable width', () => {
    expect(indexCustomId(0)).toBe('0000');
    expect(indexCustomId(7)).toBe('0007');
    expect(indexCustomId(123)).toBe('0123');
  });
});

describe('mapResultsByCustomId', () => {
  it('reassociates results that come back out of request order', () => {
    const items = [
      { customId: '0000', item: 'first' },
      { customId: '0001', item: 'second' },
      { customId: '0002', item: 'third' },
    ];
    // Results deliberately shuffled — batch results are not guaranteed in order.
    const results = new Map<string, Result>([
      ['0002', succeeded('0002', 'third-response')],
      ['0000', succeeded('0000', 'first-response')],
      ['0001', succeeded('0001', 'second-response')],
    ]);

    const mapped = mapResultsByCustomId(items, results);

    expect(mapped).toHaveLength(3);
    expect(mapped[0].item).toBe('first');
    expect(isSucceeded(mapped[0].result) && mapped[0].result.result.message.id).toBeTruthy();
    const texts = mapped.map((m) => {
      const r = m.result;
      return isSucceeded(r)
        ? (r.result.message.content[0] as { type: 'text'; text: string }).text
        : null;
    });
    expect(texts).toEqual(['first-response', 'second-response', 'third-response']);
  });

  it('maps a custom_id missing from the batch output to result: undefined, not a throw', () => {
    const items = [
      { customId: '0000', item: 'present' },
      { customId: '0001', item: 'never-returned' },
    ];
    const results = new Map<string, Result>([['0000', succeeded('0000', 'ok')]]);

    const mapped = mapResultsByCustomId(items, results);

    expect(mapped[0].result).toBeDefined();
    expect(mapped[1].result).toBeUndefined();
  });
});

describe('isSucceeded / describeFailure', () => {
  it('isSucceeded is true only for the succeeded variant', () => {
    expect(isSucceeded(succeeded('a', 'x'))).toBe(true);
    expect(isSucceeded(errored('a', 'boom'))).toBe(false);
    expect(isSucceeded(expired('a'))).toBe(false);
    expect(isSucceeded(canceled('a'))).toBe(false);
    expect(isSucceeded(undefined)).toBe(false);
  });

  it('describeFailure renders one line per MessageBatchResult variant', () => {
    expect(describeFailure(errored('a', 'model overloaded'))).toContain('model overloaded');
    expect(describeFailure(expired('a'))).toBe('expired');
    expect(describeFailure(canceled('a'))).toBe('canceled');
    expect(describeFailure(undefined)).toMatch(/missing/);
  });
});

describe('pollUntilEnded', () => {
  it('polls until processing_status reaches "ended"', async () => {
    const statuses: Batch['processing_status'][] = ['in_progress', 'in_progress', 'ended'];
    const retrieve = vi.fn(async () => makeBatch(statuses.shift() ?? 'ended'));

    const result = await pollUntilEnded(retrieve, { pollIntervalMs: 1 });

    expect(result.processing_status).toBe('ended');
    expect(retrieve).toHaveBeenCalledTimes(3);
  });

  it('calls onPoll once per non-terminal status observed', async () => {
    const statuses: Batch['processing_status'][] = ['in_progress', 'ended'];
    const retrieve = vi.fn(async () => makeBatch(statuses.shift() ?? 'ended'));
    const onPoll = vi.fn();

    await pollUntilEnded(retrieve, { pollIntervalMs: 1, onPoll });

    expect(onPoll).toHaveBeenCalledTimes(1);
  });

  it('throws once maxWaitMs is exceeded without reaching "ended"', async () => {
    const retrieve = vi.fn(async () => makeBatch('in_progress'));

    await expect(
      pollUntilEnded(retrieve, { pollIntervalMs: 2, maxWaitMs: 5 }),
    ).rejects.toThrow(/did not finish/);
  });

  it('retries a transient failure on retrieve() and still succeeds', async () => {
    let calls = 0;
    const retrieve = vi.fn(async () => {
      calls++;
      if (calls <= 2) throw new APIConnectionError({ message: 'network blip' });
      return makeBatch('ended');
    });

    const result = await pollUntilEnded(retrieve, {
      pollIntervalMs: 1,
      retry: { retryDelaysMs: [1, 1] },
    });

    expect(result.processing_status).toBe('ended');
    expect(calls).toBe(3);
  });

  it('does not retry a fatal error (401) on retrieve()', async () => {
    const retrieve = vi.fn(async () => {
      throw new AuthenticationError(401, {}, 'bad key', new Headers());
    });

    await expect(
      pollUntilEnded(retrieve, { pollIntervalMs: 1, retry: { retryDelaysMs: [1, 1] } }),
    ).rejects.toThrow(AuthenticationError);
    expect(retrieve).toHaveBeenCalledTimes(1);
  });

  it('resets the retry counter after each successful poll — failures in separate polls do not accumulate', async () => {
    // Each poll cycle fails twice then succeeds. Budget per call is 2 retries (retryDelaysMs
    // has length 2), so 3 poll cycles × 2 failures = 6 total failures would exceed a *shared*
    // budget of 2, but must succeed if the counter resets after every successful retrieve().
    const script: (() => Anthropic.Messages.MessageBatch)[] = [];
    let failuresThisCycle = 0;
    const statuses: Anthropic.Messages.MessageBatch['processing_status'][] = [
      'in_progress',
      'in_progress',
      'ended',
    ];
    const retrieve = vi.fn(async () => {
      if (failuresThisCycle < 2) {
        failuresThisCycle++;
        throw new APIConnectionError({ message: 'blip' });
      }
      failuresThisCycle = 0;
      return makeBatch(statuses.shift() ?? 'ended');
    });

    const result = await pollUntilEnded(retrieve, {
      pollIntervalMs: 1,
      retry: { retryDelaysMs: [1, 1] },
    });

    expect(result.processing_status).toBe('ended');
    // 3 poll cycles × (2 failures + 1 success) = 9 calls total.
    expect(retrieve).toHaveBeenCalledTimes(9);
    void script;
  });
});

describe('isTransientError', () => {
  it('treats APIConnectionError (DNS/network failures) as transient', () => {
    expect(isTransientError(new APIConnectionError({ message: 'getaddrinfo ENOTFOUND' }))).toBe(
      true,
    );
  });

  it('treats 429 rate limits as transient', () => {
    expect(isTransientError(new RateLimitError(429, {}, 'slow down', new Headers()))).toBe(true);
  });

  it('treats 5xx server errors as transient', () => {
    expect(isTransientError(new InternalServerError(503, {}, 'overloaded', new Headers()))).toBe(
      true,
    );
  });

  it('treats 401/403 auth errors as fatal, not transient', () => {
    expect(isTransientError(new AuthenticationError(401, {}, 'bad key', new Headers()))).toBe(
      false,
    );
    expect(
      isTransientError(new PermissionDeniedError(403, {}, 'forbidden', new Headers())),
    ).toBe(false);
  });

  it('treats 404 (batch not found) as fatal, not transient', () => {
    expect(isTransientError(new NotFoundError(404, {}, 'no such batch', new Headers()))).toBe(
      false,
    );
  });

  it('treats raw Node network error codes as transient', () => {
    expect(isTransientError(Object.assign(new Error('boom'), { code: 'ENOTFOUND' }))).toBe(true);
    expect(isTransientError(Object.assign(new Error('boom'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isTransientError(Object.assign(new Error('boom'), { code: 'ETIMEDOUT' }))).toBe(true);
  });

  it('treats an unrecognized error as fatal, not transient', () => {
    expect(isTransientError(new Error('something unexpected'))).toBe(false);
  });
});

describe('DEFAULT_RETRY_DELAYS_MS', () => {
  it('is the specified exponential backoff schedule: 5s, 15s, 45s, 2m', () => {
    expect(DEFAULT_RETRY_DELAYS_MS).toEqual([5_000, 15_000, 45_000, 120_000]);
  });
});

describe('withRetry', () => {
  it('retries a transient error using the delays in order, then succeeds', async () => {
    const delaysSeen: number[] = [];
    let attempts = 0;
    const fn = vi.fn(async () => {
      attempts++;
      if (attempts <= 2) throw new APIConnectionError({ message: 'blip' });
      return 'ok';
    });

    const result = await withRetry(fn, {
      retryDelaysMs: [10, 20, 30],
      onRetry: ({ delayMs }) => delaysSeen.push(delayMs),
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
    expect(delaysSeen).toEqual([10, 20]);
  });

  it('throws immediately on a fatal error without waiting or retrying', async () => {
    const fn = vi.fn(async () => {
      throw new NotFoundError(404, {}, 'batch not found', new Headers());
    });

    await expect(withRetry(fn, { retryDelaysMs: [10, 20] })).rejects.toThrow(NotFoundError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up once the retry budget is exhausted', async () => {
    const fn = vi.fn(async () => {
      throw new APIConnectionError({ message: 'always down' });
    });

    await expect(withRetry(fn, { retryDelaysMs: [1, 1] })).rejects.toThrow(APIConnectionError);
    // initial attempt + 2 retries = 3 calls
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('collectBatchResults', () => {
  function makeFakeClient(behaviors: (() => AsyncIterable<Result>)[]): Anthropic {
    let call = 0;
    return {
      messages: {
        batches: {
          results: vi.fn(async () => {
            const behavior = behaviors[Math.min(call, behaviors.length - 1)];
            call++;
            return behavior();
          }),
        },
      },
    } as unknown as Anthropic;
  }

  it('retries a transient failure raised while iterating results, then succeeds', async () => {
    const client = makeFakeClient([
      () => ({
        [Symbol.asyncIterator]: async function* () {
          throw new APIConnectionError({ message: 'dropped mid-stream' });
        },
      }),
      () => ({
        [Symbol.asyncIterator]: async function* () {
          yield succeeded('0000', 'ok');
        },
      }),
    ]);

    const map = await collectBatchResults(client, 'batch_1', { retryDelaysMs: [1] });

    expect(map.get('0000')).toBeDefined();
    expect(client.messages.batches.results).toHaveBeenCalledTimes(2);
  });

  it('does not retry a fatal error while collecting results', async () => {
    const client = makeFakeClient([
      () => ({
        [Symbol.asyncIterator]: async function* () {
          throw new NotFoundError(404, {}, 'no such batch', new Headers());
        },
      }),
    ]);

    await expect(
      collectBatchResults(client, 'batch_1', { retryDelaysMs: [1, 1] }),
    ).rejects.toThrow(NotFoundError);
    expect(client.messages.batches.results).toHaveBeenCalledTimes(1);
  });
});
