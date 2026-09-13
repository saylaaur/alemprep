import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  assertSafeDbConnectionString,
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
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      }),
    ).toThrow('production Supabase project is never a test target');
  });

  it('refuses every remote URL before any test client can connect', () => {
    expect(() =>
      assertSafeDbTestTarget({
        APP_ENV: 'staging',
        NEXT_PUBLIC_SUPABASE_URL: 'https://pilottest.supabase.co',
      }),
    ).toThrow('DB tests require APP_ENV=local');
  });

  it('refuses a staging target because the current DbHarness is local-only', () => {
    expect(() =>
      assertSafeDbTestTarget({
        APP_ENV: 'staging',
        NEXT_PUBLIC_SUPABASE_URL: 'https://pilottest.supabase.co',
      }),
    ).toThrow('DB tests require APP_ENV=local');
  });

  it('does not permit a remote target in local mode', () => {
    expect(() =>
      assertSafeDbTestTarget({
        APP_ENV: 'local',
        NEXT_PUBLIC_SUPABASE_URL: 'https://pilottest.supabase.co',
      }),
    ).toThrow('local DB tests require a loopback Supabase URL');
  });

  it('accepts only a loopback PostgreSQL connection for local SQL helpers', () => {
    expect(
      assertSafeDbConnectionString('postgresql://postgres:postgres@127.0.0.1:54322/postgres').hostname,
    ).toBe('127.0.0.1');
  });

  it('refuses remote PostgreSQL connections before a local SQL helper can connect', () => {
    expect(() =>
      assertSafeDbConnectionString('postgresql://postgres:password@db.euypaocjzcqlapfilrak.supabase.co:5432/postgres'),
    ).toThrow('local SQL helpers require a loopback PostgreSQL URL');
  });
});
