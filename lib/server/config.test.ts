import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getSupabaseAdminConfig } from './config';

describe('getSupabaseAdminConfig', () => {
  it('keeps the service-role configuration module behind Next server-only boundary', () => {
    const source = readFileSync(path.join(process.cwd(), 'lib/server/config.ts'), 'utf8');
    expect(source.startsWith("import 'server-only';")).toBe(true);
  });

  it('rejects missing configuration without echoing a secret', () => {
    expect(() => getSupabaseAdminConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: '',
    })).toThrow('missing Supabase server configuration');
  });

  it('returns validated values without making a network request', () => {
    expect(getSupabaseAdminConfig({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'not-printed',
    })).toEqual({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'not-printed',
    });
  });
});
