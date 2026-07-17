import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import {
  describeFailure,
  indexCustomId,
  isSucceeded,
  mapResultsByCustomId,
  pollUntilEnded,
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
});
