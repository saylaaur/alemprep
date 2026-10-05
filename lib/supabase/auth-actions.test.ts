import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ oauth: vi.fn(), origin: '' }));
vi.mock('next/headers', () => ({ headers: async () => new Headers(mocks.origin ? { origin: mocks.origin } : {}) }));
vi.mock('./server', () => ({ createClient: async () => ({ auth: { signInWithOAuth: mocks.oauth } }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
import { signInWithGoogle } from './auth-actions';

const production = 'https://alemprep.vercel.app';
const deployment = 'alemprep-test-saylaaurs-projects.vercel.app';
const branch = 'alemprep-git-codex-trusted-practice-saylaaurs-projects.vercel.app';

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', production);
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('VERCEL_URL', deployment);
  vi.stubEnv('VERCEL_BRANCH_URL', branch);
  mocks.origin = `https://${deployment}`;
  mocks.oauth.mockResolvedValue({ data: { url: 'https://provider.example/authorize' }, error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

async function callback(next = '/ru/dashboard') {
  await expect(signInWithGoogle(next)).rejects.toThrow('redirect:https://provider.example/authorize');
  expect(mocks.oauth).toHaveBeenCalledTimes(1);
  return new URL(mocks.oauth.mock.calls[0][0].options.redirectTo as string);
}

describe('Google OAuth callback origin', () => {
  it('returns to the exact preview that owns the PKCE cookie', async () => {
    const url = await callback();
    expect(url.origin).toBe(`https://${deployment}`);
    expect(url.pathname).toBe('/auth/callback');
    expect(url.searchParams.get('next')).toBe('/ru/dashboard');
  });
  it('keeps the branch alias and Kazakh destination on that same origin', async () => {
    mocks.origin = `https://${branch}`;
    const url = await callback('/kk/dashboard');
    expect(url.origin).toBe(mocks.origin);
    expect(url.searchParams.get('next')).toBe('/kk/dashboard');
  });
  it('preserves the configured production origin', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    mocks.origin = production;
    expect((await callback()).origin).toBe(production);
  });
  it.each(['https://evil.example', 'https://different-project.vercel.app', 'null',
    `https://${deployment}.evil.example`, `https://user@${deployment}`, `https://${deployment}/path`])(
    'rejects unregistered or malformed request origin %s before OAuth', async (origin) => {
      mocks.origin = origin;
      await expect(signInWithGoogle('/ru/dashboard')).rejects.toThrow('Invalid authentication origin');
      expect(mocks.oauth).not.toHaveBeenCalled();
    },
  );
  it('does not silently send a preview with missing Origin to production', async () => {
    mocks.origin = '';
    await expect(signInWithGoogle('/ru/dashboard')).rejects.toThrow('Invalid authentication origin');
    expect(mocks.oauth).not.toHaveBeenCalled();
  });
  it('does not accept preview metadata as authority in a production deployment', async () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    await expect(signInWithGoogle('/ru/dashboard')).rejects.toThrow('Invalid authentication origin');
    expect(mocks.oauth).not.toHaveBeenCalled();
  });
  it('supports the configured local loopback server', async () => {
    vi.stubEnv('VERCEL_ENV', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://127.0.0.1:3001/');
    mocks.origin = 'http://127.0.0.1:3001';
    expect((await callback()).origin).toBe(mocks.origin);
  });
  it('never copies an external next destination into the callback', async () => {
    mocks.origin = production;
    const url = await callback('https://evil.example/kk/dashboard');
    expect(url.searchParams.get('next')).toBe('/ru/dashboard');
  });
});
