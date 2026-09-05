import { describe, expect, it } from 'vitest';
import { validateProductionConfig } from './production-config';

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://project-id.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  NEXT_PUBLIC_SITE_URL: 'https://alemprep.kz',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  ANTHROPIC_API_KEY: 'anthropic-key',
};

describe('validateProductionConfig', () => {
  it('accepts complete HTTPS production configuration', () => {
    expect(validateProductionConfig(validEnv)).toEqual([]);
  });

  it('rejects localhost and missing server-only secrets', () => {
    expect(
      validateProductionConfig({
        ...validEnv,
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
        SUPABASE_SERVICE_ROLE_KEY: '',
        ANTHROPIC_API_KEY: undefined,
      }),
    ).toEqual(
      expect.arrayContaining([
        'NEXT_PUBLIC_SITE_URL must use https',
        'NEXT_PUBLIC_SITE_URL must not point to a local host',
        'SUPABASE_SERVICE_ROLE_KEY is missing',
        'ANTHROPIC_API_KEY is missing',
      ]),
    );
  });

  it('rejects a project URL that is not a Supabase host and a site URL with a path', () => {
    expect(
      validateProductionConfig({
        ...validEnv,
        NEXT_PUBLIC_SUPABASE_URL: 'https://example.com',
        NEXT_PUBLIC_SITE_URL: 'https://alemprep.kz/demo',
      }),
    ).toEqual(
      expect.arrayContaining([
        'NEXT_PUBLIC_SUPABASE_URL must use a Supabase project host',
        'NEXT_PUBLIC_SITE_URL must be an origin without a path',
      ]),
    );
  });
});
