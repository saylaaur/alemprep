/**
 * Orchestrator: transcribe → generate → check → insert (one command)
 *
 * Usage:
 *   npm run gen:all -- --dir <path> --subject <slug> [--variants N] [--limit N]
 *
 * ⚠️  Uses paid Anthropic account — costs ~$0.01–0.10 per 10 questions depending on complexity
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

function expandPath(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

function parseArgs(): {
  dir: string;
  subject: string;
  variants: number;
  limit: number | undefined;
} {
  const args = process.argv.slice(2);
  let dir = '';
  let subject = 'math';
  let variants = 3;
  let limit: number | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = expandPath(args[++i]);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--variants' && args[i + 1]) variants = parseInt(args[++i], 10);
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
  }
  if (!dir) {
    console.error(
      'Usage: npm run gen:all -- --dir <path> --subject <slug> [--variants N] [--limit N]',
    );
    process.exit(1);
  }
  return { dir, subject, variants, limit };
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
  const { dir, subject, variants, limit } = parseArgs();
  const tsx = 'npx tsx --tsconfig tsconfig.scripts.json';

  console.log(`\n🚀  gen:all`);
  console.log(`   subject:  ${subject}`);
  console.log(`   dir:      ${dir}`);
  console.log(`   variants: ${variants}`);
  if (limit) console.log(`   limit:    ${limit}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── Step 1: Transcribe ──────────────────────────────────────────
  console.log('STEP 1/3  Transcription (PNG → reference JSON)');
  const limitArg = limit !== undefined ? ` --limit ${limit}` : '';
  run(
    `${tsx} scripts/transcribe-questions.ts --dir "${dir}" --subject ${subject}${limitArg}`,
  );

  const refDir = path.join(process.cwd(), 'scripts', 'references');
  const refFile = newestJson(refDir, subject);
  if (!refFile) {
    console.error('\n❌  No reference file found after transcription.\n');
    process.exit(1);
  }
  console.log(`\n   → Reference: ${refFile}`);

  // ── Step 2: Generate variants ───────────────────────────────────
  console.log('\nSTEP 2/3  Generation (reference JSON → variants + checks)');
  run(
    `${tsx} scripts/generate-variants.ts --input "${refFile}" --subject ${subject} --variants ${variants}`,
  );

  const genDir = path.join(process.cwd(), 'scripts', 'generated');
  const genFile = newestJson(genDir, subject);
  if (!genFile) {
    console.error('\n❌  No generated file found after generation.\n');
    process.exit(1);
  }
  console.log(`\n   → Generated: ${genFile}`);

  // ── Step 3: Insert to DB ────────────────────────────────────────
  console.log('\nSTEP 3/3  Insert to Supabase DB (is_published=false)');
  run(`${tsx} scripts/insert-to-db.ts --input "${genFile}" --subject ${subject}`);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅  Pipeline complete! Review at /admin/review\n');
}

main();
