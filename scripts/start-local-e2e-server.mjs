import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const target = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
if (process.env.APP_ENV !== 'local' || target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
  throw new Error('E2E requires a local loopback Supabase target');
}
const cliPath = `${process.cwd()}/node_modules/.bin/supabase`;
const { stdout } = await execFileAsync(cliPath, ['status', '--output', 'json'], {
  cwd: process.cwd(),
});
const status = JSON.parse(stdout);

if (status.API_URL !== target.origin || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
  throw new Error('local Supabase is not running or did not expose public test credentials');
}

process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
process.env.LEARNING_V1_ENABLED = process.env.LEARNING_V1_ENABLED === 'true' ? 'true' : 'false';
process.env.NEXT_PUBLIC_SITE_URL = 'http://127.0.0.1:3001';

const nextCli = `${process.cwd()}/node_modules/next/dist/bin/next`;
const child = spawn(process.execPath, [nextCli, 'dev', '--hostname', '127.0.0.1', '--port', '3001'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code) => resolve(code ?? 1));
});
process.exit(exitCode);
