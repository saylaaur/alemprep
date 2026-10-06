import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ next: undefined as string | undefined, exchange: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => mocks.next ? { value: mocks.next } : undefined }) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchange } }) }));
import { GET } from '@/app/auth/callback/route';
beforeEach(() => { mocks.next = undefined; mocks.exchange.mockResolvedValue({ error: null }); });
afterEach(() => vi.clearAllMocks());
const origin = 'https://alemprep.vercel.app';
describe('OAuth callback join destination', () => {
  it('returns to the stored class link and expires the handoff cookie', async () => {
    mocks.next = encodeURIComponent('/kk/join?code=abcdefghijklmnopqrstuvwxyz012345');
    const response = await GET(new Request(`${origin}/auth/callback?code=local-code&next=%2Fkk%2Fdashboard`));
    expect(response.headers.get('location')).toBe(`${origin}/kk/join?code=abcdefghijklmnopqrstuvwxyz012345`);
    expect(response.cookies.get('alemprep_auth_next')?.value).toBe('');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
  it('keeps the invite for retry after cancelled sign-in', async () => {
    mocks.next = encodeURIComponent('/kk/join?code=abcdefghijklmnopqrstuvwxyz012345');
    const response = await GET(new Request(`${origin}/auth/callback?next=%2Fkk%2Fdashboard&error=access_denied`));
    const target = new URL(response.headers.get('location')!);
    expect(target.pathname).toBe('/kk/login');
    expect(target.searchParams.get('error')).toBe('auth');
    expect(target.searchParams.get('next')).toBe('/kk/join?code=abcdefghijklmnopqrstuvwxyz012345');
    expect(mocks.exchange).not.toHaveBeenCalled();
  });
  it.each(['%ZZ', encodeURIComponent('https://evil.example/ru/dashboard')])('ignores malformed or external cookie targets %s', async (value) => {
    mocks.next = value;
    const response = await GET(new Request(`${origin}/auth/callback?code=local-code&next=%2Fkk%2Fdashboard`));
    expect(response.headers.get('location')).toBe(`${origin}/kk/dashboard`);
  });
  it('supports callbacks started before the cookie handoff existed', async () => {
    const response = await GET(new Request(`${origin}/auth/callback?code=local-code&next=%2Fkk%2Fdashboard`));
    expect(response.headers.get('location')).toBe(`${origin}/kk/dashboard`);
  });
});
