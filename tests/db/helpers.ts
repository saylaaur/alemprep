import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import { assertSafeDbConnectionString, assertSafeDbTestTarget } from './test-target';

const execFileAsync = promisify(execFile);

type LocalSupabaseStatus = {
  API_URL?: string;
  ANON_KEY?: string;
  DB_URL?: string;
  SERVICE_ROLE_KEY?: string;
};

export type TestActor = {
  id: string;
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
};

export type DbResponse = {
  status: number;
  data: unknown;
};

export type DbHarness = {
  actor(label: string): Promise<TestActor>;
  rest(actor: TestActor | null, path: string, init?: RequestInit): Promise<DbResponse>;
  rpc(actor: TestActor | 'service', name: string, args: Record<string, unknown>): Promise<DbResponse>;
  scalar<T extends string | number | boolean | null>(sql: string, params?: unknown[]): Promise<T>;
  close(): Promise<void>;
};

function requireStatusValue(status: LocalSupabaseStatus, key: keyof LocalSupabaseStatus): string {
  const value = status[key];
  if (!value) throw new Error(`local Supabase status did not provide ${key}`);
  return value;
}

function dbTargetEnv() {
  return {
    APP_ENV: process.env.APP_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

async function readLocalStatus(): Promise<Required<LocalSupabaseStatus>> {
  const cliPath = `${process.cwd()}/node_modules/.bin/supabase`;
  const { stdout } = await execFileAsync(cliPath, ['status', '--output', 'json'], {
    cwd: process.cwd(),
  });
  const status = JSON.parse(stdout) as LocalSupabaseStatus;
  return {
    API_URL: requireStatusValue(status, 'API_URL'),
    ANON_KEY: requireStatusValue(status, 'ANON_KEY'),
    DB_URL: requireStatusValue(status, 'DB_URL'),
    SERVICE_ROLE_KEY: requireStatusValue(status, 'SERVICE_ROLE_KEY'),
  };
}

function parseResponse(text: string): unknown {
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function requestUrl(apiUrl: URL, path: string): URL {
  if (!path.startsWith('/')) throw new Error('test REST paths must start with /');
  const url = new URL(path, apiUrl);
  if (url.origin !== apiUrl.origin) throw new Error('test REST path must stay on the local API origin');
  return url;
}

function authHeaders(apiKey: string, accessToken: string, init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  headers.set('apikey', apiKey);
  headers.set('authorization', `Bearer ${accessToken}`);
  headers.set('accept', 'application/json');
  return headers;
}

/**
 * Creates only local synthetic accounts. assertSafeDbTestTarget executes before
 * the CLI status call, client construction, or any request.
 */
export async function createDbHarness(): Promise<DbHarness> {
  const apiUrl = assertSafeDbTestTarget(dbTargetEnv());
  const status = await readLocalStatus();
  if (status.API_URL !== apiUrl.origin) {
    throw new Error('local Supabase CLI status does not match the guarded test target');
  }
  const dbUrl = assertSafeDbConnectionString(status.DB_URL);

  const admin = createClient(apiUrl.origin, status.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const pool = new Pool({ connectionString: dbUrl.toString() });
  const createdUserIds: string[] = [];
  let closed = false;

  return {
    async actor(label) {
      if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('test actor label must be alphanumeric or hyphenated');
      const id = randomUUID();
      const email = `e02-${label}-${id}@example.test`;
      const password = `AlemPrep-${id}-9a!`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error(error?.message ?? 'local synthetic user was not created');
      createdUserIds.push(data.user.id);

      const client = createClient(apiUrl.origin, status.ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const login = await client.auth.signInWithPassword({ email, password });
      const accessToken = login.data.session?.access_token;
      const refreshToken = login.data.session?.refresh_token;
      if (login.error || !accessToken || !refreshToken) {
        throw new Error(login.error?.message ?? 'local synthetic user did not receive a session');
      }
      return { id: data.user.id, email, password, accessToken, refreshToken };
    },

    async rest(actor, path, init) {
      const response = await fetch(requestUrl(apiUrl, `/rest/v1${path}`), {
        ...init,
        headers: authHeaders(status.ANON_KEY, actor?.accessToken ?? status.ANON_KEY, init),
      });
      return { status: response.status, data: parseResponse(await response.text()) };
    },

    async rpc(actor, name, args) {
      if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error('test RPC name is invalid');
      const accessToken = actor === 'service' ? status.SERVICE_ROLE_KEY : actor.accessToken;
      const response = await fetch(requestUrl(apiUrl, `/rest/v1/rpc/${name}`), {
        method: 'POST',
        headers: {
          ...Object.fromEntries(authHeaders(status.ANON_KEY, accessToken)),
          'content-type': 'application/json',
        },
        body: JSON.stringify(args),
      });
      return { status: response.status, data: parseResponse(await response.text()) };
    },

    async scalar<T extends string | number | boolean | null>(sql: string, params: unknown[] = []) {
      const result = await pool.query<Record<string, T>>(sql, params);
      const row = result.rows[0];
      if (!row) return null as T;
      const [value] = Object.values(row);
      return value ?? (null as T);
    },

    async close() {
      if (closed) return;
      closed = true;
      try {
        for (const id of createdUserIds) {
          const { error } = await admin.auth.admin.deleteUser(id);
          if (error) throw new Error(`failed to delete local synthetic user: ${error.message}`);
        }
      } finally {
        await pool.end();
      }
    },
  };
}
