import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const cliPath = `${process.cwd()}/node_modules/.bin/supabase`;
const { stdout } = await execFileAsync(cliPath, ['status', '--output', 'json'], {
  cwd: process.cwd(),
});
const status = JSON.parse(stdout);

if (!status.API_URL || !status.ANON_KEY) {
  throw new Error('local Supabase is not running or did not expose public test credentials');
}

process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;
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
