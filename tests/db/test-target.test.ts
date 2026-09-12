import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  assertSafeDbTestTarget,
} from './test-target';

describe('assertSafeDbTestTarget', () => {
  it('accepts a loopback Supabase target for local integration tests', () => {
    expect(
      assertSafeDbTestTarget({
        APP_ENV: 'local',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      }).origin,
    ).toBe('http://127.0.0.1:54321');
  });

  it('refuses the production project before any test client can connect', () => {
    expect(() =>
      assertSafeDbTestTarget({
        APP_ENV: 'staging',
        ALEMPREP_TEST_STAGING_REF: PRODUCTION_SUPABASE_PROJECT_REF,
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      }),
    ).toThrow('production Supabase project is never a test target');
  });

  it('refuses a remote URL unless staging is explicitly named and allowlisted', () => {
    expect(() =>
      assertSafeDbTestTarget({
        APP_ENV: 'staging',
        NEXT_PUBLIC_SUPABASE_URL: 'https://pilottest.supabase.co',
      }),
    ).toThrow('ALEMPREP_TEST_STAGING_REF');
  });

  it('accepts only the named non-production staging project', () => {
    expect(
      assertSafeDbTestTarget({
        APP_ENV: 'staging',
        ALEMPREP_TEST_STAGING_REF: 'pilottest',
        NEXT_PUBLIC_SUPABASE_URL: 'https://pilottest.supabase.co',
      }).hostname,
    ).toBe('pilottest.supabase.co');
  });

  it('does not permit a remote target in local mode', () => {
    expect(() =>
      assertSafeDbTestTarget({
        APP_ENV: 'local',
        NEXT_PUBLIC_SUPABASE_URL: 'https://pilottest.supabase.co',
      }),
    ).toThrow('local DB tests require a loopback Supabase URL');
  });
});
