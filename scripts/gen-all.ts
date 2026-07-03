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
  noVerify: boolean;
  publish: boolean;
} {
  const args = process.argv.slice(2);
  let dir = '';
  let subject = 'math';
  let variants = 3;
  let limit: number | undefined;
  let noVerify = false;
  let publish = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = expandPath(args[++i]);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--variants' && args[i + 1]) variants = parseInt(args[++i], 10);
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--no-verify') noVerify = true;
    if (args[i] === '--publish') publish = true;
  }
  if (!dir) {
    console.error(
      'Usage: npm run gen:all -- --dir <path> --subject <slug> [--variants N] [--limit N] [--no-verify] [--publish]',
    );
    process.exit(1);
  }
  return { dir, subject, variants, limit, noVerify, publish };
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
  const { dir, subject, variants, limit, noVerify, publish } = parseArgs();
  const tsx = 'npx tsx --tsconfig tsconfig.scripts.json';
  const steps = noVerify ? 3 : 4;

  console.log(`\n🚀  gen:all`);
  console.log(`   subject:  ${subject}`);
  console.log(`   dir:      ${dir}`);
  console.log(`   variants: ${variants}`);
  if (limit) console.log(`   limit:    ${limit}`);
  console.log(`   verify:   ${noVerify ? 'OFF (--no-verify)' : 'ON (Sonnet)'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── Step 1: Transcribe ──────────────────────────────────────────
  console.log(`STEP 1/${steps}  Transcription (PNG → reference JSON)`);
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
  console.log(`\nSTEP 2/${steps}  Generation (reference JSON → variants + checks)`);
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

  // ── Step 3: Verify (Sonnet re-solves, mismatches dropped) ───────
  let insertFile = genFile;
  if (!noVerify) {
    console.log(`\nSTEP 3/${steps}  Verification (Sonnet независимо перерешивает, брак отсеивается)`);
    run(`${tsx} scripts/verify-questions.ts --input "${genFile}" --subject ${subject}`);
    const verDir = path.join(process.cwd(), 'scripts', 'verified');
    const verFile = newestJson(verDir, subject);
    if (!verFile) {
      console.error('\n❌  No verified file found after verification.\n');
      process.exit(1);
    }
    console.log(`\n   → Verified: ${verFile}`);
    insertFile = verFile;
  }

  // ── Final: Insert to DB ─────────────────────────────────────────
  const publishArg = publish ? ' --publish' : '';
  console.log(
    `\nSTEP ${steps}/${steps}  Insert to Supabase DB (is_published=${publish})`,
  );
  run(`${tsx} scripts/insert-to-db.ts --input "${insertFile}" --subject ${subject}${publishArg}`);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅  Pipeline complete! Review at /admin/review\n');
}

main();
