import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDataMode, isContentEnabled, isLocalMode, isLocalUnsupportedPath } from './data-mode';

afterEach(() => vi.unstubAllEnvs());

describe('data mode', () => {
  it('defaults to supabase', () => {
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', '');
    expect(getDataMode()).toBe('supabase');
    expect(isLocalMode()).toBe(false);
  });

  it('switches to local only on the exact value', () => {
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'local');
    expect(isLocalMode()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'LOCAL');
    expect(isLocalMode()).toBe(false);
  });
});

describe('local unsupported paths', () => {
  it('blocks sections that need the database, with or without locale', () => {
    for (const p of ['/ru/subjects', '/kk/subjects/math', '/ru/practice/topic/x', '/ru/join-class', '/ru/join', '/ru/teacher/groups/1', '/ru/onboarding', '/subjects']) {
      expect(isLocalUnsupportedPath(p), p).toBe(true);
    }
  });

  it('keeps the supported sections open', () => {
    for (const p of ['/ru', '/ru/dashboard', '/kk/videos/newton-laws', '/ru/library/newton-laws', '/ru/progress', '/ru/settings', '/ru/login', '/ru/visualization']) {
      expect(isLocalUnsupportedPath(p), p).toBe(false);
    }
  });
});

describe('supplementary content rollout', () => {
  it('requires hosted opt-in and keeps the verified school pilot focused', () => {
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'supabase');
    vi.stubEnv('NEXT_PUBLIC_CONTENT_V1_ENABLED', '');
    expect(isContentEnabled()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_CONTENT_V1_ENABLED', 'true');
    expect(isContentEnabled()).toBe(true);
    expect(isContentEnabled(true)).toBe(false);
  });

  it('is available in the standalone demo', () => {
    vi.stubEnv('NEXT_PUBLIC_DATA_MODE', 'local');
    vi.stubEnv('NEXT_PUBLIC_CONTENT_V1_ENABLED', '');
    expect(isContentEnabled(true)).toBe(true);
  });
});
