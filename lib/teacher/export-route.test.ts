import { beforeEach, describe, expect, it, vi } from 'vitest';
const read = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/queries/teacher', () => ({ getTeacherRoster: read }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
import { GET } from '@/app/[locale]/(app)/teacher/groups/[groupId]/export/route';
const id = '10000000-0000-4000-8000-000000000001';
const invoke = (locale = 'ru', groupId = id) => GET(new Request('https://example.com'), { params: Promise.resolve({ locale, groupId }) });
beforeEach(() => { read.mockReset(); });
describe('teacher report export access', () => {
  it.each([['unauthenticated', 401], ['not-found', 404], ['temporarily-unavailable', 503]])('does not export when reader says %s', async (error, status) => {
    read.mockResolvedValue({ error }); const response = await invoke();
    expect(response.status).toBe(status); expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Content-Disposition')).toBeNull();
  });
  it('validates locale/id before reading a roster', async () => {
    expect((await invoke('en')).status).toBe(404);
    expect((await invoke('ru', 'bad-id')).status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });
  it('reads fresh on every download and respects subsequent revocation', async () => {
    read.mockResolvedValueOnce({ data: { group: { id, name: '10 A', schoolName: 'School', locale: 'ru' }, students: [], asOf: '2026-10-09T12:00:00Z', periodDays: 30 } }).mockResolvedValueOnce({ error: 'not-found' });
    const success = await invoke('kk');
    expect(success.status).toBe(200); expect(success.headers.get('Content-Type')).toContain('text/csv');
    expect(success.headers.get('Content-Disposition')).toContain('attachment;');
    expect(success.headers.get('Cache-Control')).toContain('private');
    expect(success.headers.get('Cache-Control')).toContain('no-store');
    expect(success.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(await success.text()).toContain('teacher-self-study-v1');
    expect((await invoke()).status).toBe(404); expect(read).toHaveBeenCalledTimes(2);
  });
});
