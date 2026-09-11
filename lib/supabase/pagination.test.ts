import { describe, expect, it, vi } from 'vitest';
import { readAllPages } from './pagination';

describe('readAllPages', () => {
  it('does not return the first page as success if a later page fails', async () => {
    const page = vi.fn().mockResolvedValueOnce({ data: Array(500).fill(1), error: null }).mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(readAllPages(page, 'content')).rejects.toThrow('Could not load content');
    expect(page).toHaveBeenLastCalledWith(500, 999);
  });
  it('distinguishes a valid empty result from a missing response body', async () => {
    expect(await readAllPages(async () => ({ data: [], error: null }), 'content')).toEqual([]);
    await expect(readAllPages(async () => ({ data: null, error: null }), 'content')).rejects.toThrow();
  });
  it('handles exact page boundaries without duplicating rows', async () => {
    const rows = Array.from({ length: 1000 }, (_, id) => id);
    expect(await readAllPages(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }), 'content')).toEqual(rows);
  });
});
