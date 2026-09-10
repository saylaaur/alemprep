import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeClient, type InMemoryState } from './testing/in-memory-db';
import type { Question } from '@/types/db';

const state = vi.hoisted(() => ({ store: {}, failOnce: null } as InMemoryState));
vi.mock('./server', () => ({ createClient: async () => makeClient(state), createAdminClient: () => makeClient(state) }));
vi.mock('./queries', () => ({ getPairExamBlocks: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { getPairExamBlocks } from './queries';
import { startPairExam } from './practice-actions';
import { startDiagnostic } from './diagnostic-actions';
import { startWeeklyTest } from './weekly-actions';

describe.each([
  ['mock', () => startPairExam({ second: 'physics', locale: 'kk' })],
  ['diagnostic', () => startDiagnostic({ locale: 'kk' })],
  ['weekly', () => startWeeklyTest({ locale: 'kk' })],
] as const)('%s content availability', (_name, start) => {
  beforeEach(() => {
    state.store = { profiles: [{ id: 'U1', second_subject: 'physics' }], sessions: [], attempts: [] };
    state.failOnce = null;
    vi.mocked(getPairExamBlocks).mockReset();
  });

  it.each(['empty', 'shortfall', 'missing block'] as const)('does not create sessions for %s', async (kind) => {
    const block = { subjectId: 'S1', subjectSlug: 'math', name_ru: 'Математика', name_kk: 'Математика', topics: [], questions: kind === 'empty' ? [] : [{ id: 'Q1' } as Question], shortfall: kind === 'shortfall' ? [{ type: 'single' as const, available: 1, required: 10 }] : [] };
    vi.mocked(getPairExamBlocks).mockResolvedValue({ blocks: kind === 'missing block' ? [block] : [block, { ...block, subjectId: 'S2', subjectSlug: 'physics' }], contexts: new Map() });
    expect(await start()).toEqual({ error: 'insufficient-content' });
    expect(state.store.sessions).toHaveLength(0);
  });

  it('reports a loading failure separately without creating sessions', async () => {
    vi.mocked(getPairExamBlocks).mockRejectedValue(new Error('database unavailable'));
    expect(await start()).toEqual({ error: 'content-unavailable' });
    expect(state.store.sessions).toHaveLength(0);
  });
});
