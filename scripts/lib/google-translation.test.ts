import { describe, expect, it, vi } from 'vitest';
import { GoogleTranslationError, GoogleTranslationProvider, retryTranslation } from './google-translation';

describe('Google NMT provider', () => {
  it('returns translations in input order and rejects a missing response item', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ translations: [{ translatedText: 'бір' }, { translatedText: 'екі' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ translations: [{ translatedText: 'бір' }] }), { status: 200 }));
    const provider = new GoogleTranslationProvider({ projectId: 'pilot', accessToken: async () => 'token', fetchImpl });
    await expect(provider.translate([{ path: 'a', sourceText: 'один' }, { path: 'b', sourceText: 'два' }])).resolves.toEqual(['бір', 'екі']);
    await expect(provider.translate([{ path: 'a', sourceText: 'один' }, { path: 'b', sourceText: 'два' }])).rejects.toThrow('response count mismatch');
  });

  it('turns a transport timeout into a retryable provider error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException('timed out', 'AbortError'));
    const provider = new GoogleTranslationProvider({ projectId: 'pilot', accessToken: async () => 'token', fetchImpl });
    await expect(provider.translate([{ path: 'a', sourceText: 'один' }])).rejects.toMatchObject({ status: 408 });
    const operation = vi.fn().mockRejectedValueOnce(new GoogleTranslationError(408, 'request timeout')).mockResolvedValue(['бір']);
    await expect(retryTranslation(operation, () => 0, async () => undefined)).resolves.toEqual(['бір']);
  });

  it.each([429, 500, 503])('retries a transient %i error at most three times', async status => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new GoogleTranslationError(status, 'temporary'))
      .mockRejectedValueOnce(new GoogleTranslationError(status, 'temporary'))
      .mockResolvedValue(['аударма']);
    await expect(retryTranslation(operation, () => 0)).resolves.toEqual(['аударма']);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry a quota, auth or malformed response error', async () => {
    for (const status of [400, 401, 403, 429]) {
      const operation = vi.fn().mockRejectedValue(new GoogleTranslationError(status, status === 429 ? 'quota exhausted' : 'no'));
      await expect(retryTranslation(operation, () => 0)).rejects.toThrow();
      expect(operation).toHaveBeenCalledTimes(1);
    }
  });

  it('reports each retry so the operator artifact can disclose paid-attempt risk', async () => {
    const operation = vi.fn().mockRejectedValueOnce(new GoogleTranslationError(503, 'temporary')).mockResolvedValue(['аударма']);
    const retries: number[] = [];
    await retryTranslation(operation, () => 0, async () => undefined, attempt => retries.push(attempt));
    expect(retries).toEqual([1]);
  });
});
