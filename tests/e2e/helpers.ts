import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Page } from '@playwright/test';
import { assertSafeDbTestTarget } from '../db/test-target';
import type { TestActor } from '../db/helpers';

const APP_ORIGIN = 'http://127.0.0.1:3001';
const execFileAsync = promisify(execFile);

function dbTargetEnv() {
  return {
    APP_ENV: process.env.APP_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

type SessionCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

async function readAnonKey(): Promise<string> {
  const cliPath = `${process.cwd()}/node_modules/.bin/supabase`;
  const { stdout } = await execFileAsync(cliPath, ['status', '--output', 'json'], {
    cwd: process.cwd(),
  });
  const status = JSON.parse(stdout) as { ANON_KEY?: string };
  if (!status.ANON_KEY) throw new Error('local Supabase status did not provide ANON_KEY');
  return status.ANON_KEY;
}

async function sessionCookies(actor: TestActor): Promise<SessionCookie[]> {
  const apiUrl = assertSafeDbTestTarget(dbTargetEnv());
  const emitted: SessionCookie[] = [];
  const supabase = createServerClient(apiUrl.origin, await readAnonKey(), {
    cookies: {
      getAll: () => [],
      setAll: (cookies: SessionCookie[]) => emitted.push(...cookies),
    },
  });
  const { error } = await supabase.auth.setSession({
    access_token: actor.accessToken,
    refresh_token: actor.refreshToken,
  });
  if (error) throw new Error(`could not create local browser session: ${error.message}`);
  if (emitted.length === 0) throw new Error('local browser session did not emit SSR cookies');
  return emitted;
}

/** Sets the same SSR session cookie shape that the application uses in a browser. */
export async function loginAs(page: Page, actor: TestActor): Promise<void> {
  const cookies = await sessionCookies(actor);
  await page.context().clearCookies();
  await page.context().addCookies(
    cookies.map(({ name, value }) => ({
      name,
      value,
      url: APP_ORIGIN,
    })),
  );
}
