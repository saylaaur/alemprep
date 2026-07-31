/**
 * Orchestrator: translate → verify → insert (one command) — как gen-all.ts,
 * но для перевода уже опубликованных ru-задач на казахский вместо генерации
 * новых задач из скриншотов.
 *
 * Usage:
 *   npm run gen:translate-all -- --subject <slug> [--limit N] [--sync] [--publish]
 *
 * Default mode batches each API-calling step through the Message Batches API (−50% cost).
 * --sync forwards to every sub-script and restores the old one-request-at-a-time loops.
 *
 * ⚠️  Uses paid Anthropic account — Haiku translates, Sonnet verifies meaning.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

function parseArgs(): {
  subject: string;
  limit: number | undefined;
  publish: boolean;
  sync: boolean;
} {
  const args = process.argv.slice(2);
  let subject = 'math';
  let limit: number | undefined;
  let publish = false;
  let sync = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--publish') publish = true;
    if (args[i] === '--sync') sync = true;
  }
  return { subject, limit, publish, sync };
}

function newestJson(dir: string, prefix: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('.json'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] ? path.join(dir, files[0].name) : null;
}

function run(cmd: string): void {
  console.log(`\n$ ${cmd}\n`);
  execSync(cmd, { stdio: 'inherit' });
}

function main() {
  const { subject, limit, publish, sync } = parseArgs();
  const tsx = 'npx tsx --tsconfig tsconfig.scripts.json';
  const mode = sync ? 'sync' : 'batch (−50%)';
  const syncArg = sync ? ' --sync' : '';

  console.log(`\n🚀  gen:translate-all`);
  console.log(`   subject:  ${subject}`);
  if (limit) console.log(`   limit:    ${limit}`);
  console.log(`   mode:     ${mode}`);
  console.log(`   publish:  ${publish}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── Step 1: Translate (Haiku) ───────────────────────────────────
  console.log(`STEP 1/3  Translation (ru → kk, ${mode})`);
  const limitArg = limit !== undefined ? ` --limit ${limit}` : '';
  run(`${tsx} scripts/translate-questions.ts --subject ${subject}${limitArg}${syncArg}`);

  const translatedDir = path.join(process.cwd(), 'scripts', 'translated');
  const translatedFile = newestJson(translatedDir, subject);
  if (!translatedFile) {
    console.error('\n❌  No translated file found after translation (nothing to translate?).\n');
    process.exit(1);
  }
  console.log(`\n   → Translated: ${translatedFile}`);

  // ── Step 2: Verify meaning (Sonnet) ─────────────────────────────
  console.log(`\nSTEP 2/3  Verification (Sonnet проверяет смысл перевода, ${mode})`);
  run(`${tsx} scripts/verify-translation.ts --input "${translatedFile}"${syncArg}`);

  const verifiedDir = path.join(process.cwd(), 'scripts', 'verified-translations');
  const verifiedFile = newestJson(verifiedDir, subject);
  if (!verifiedFile) {
    console.error('\n❌  No verified file found after verification.\n');
    process.exit(1);
  }
  console.log(`\n   → Verified: ${verifiedFile}`);

  // ── Step 3: Insert to DB ────────────────────────────────────────
  const publishArg = publish ? ' --publish' : '';
  console.log(`\nSTEP 3/3  Insert to Supabase DB (language=kk, is_published=${publish})`);
  run(
    `${tsx} scripts/insert-to-db.ts --input "${verifiedFile}" --subject ${subject} --language kk${publishArg}`,
  );

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅  Pipeline complete! Review at /admin/review\n');
}

main();
