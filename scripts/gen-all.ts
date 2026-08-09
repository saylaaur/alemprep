/**
 * Orchestrator: transcribe → generate → check → insert (one command)
 *
 * Usage:
 *   npm run gen:all -- --dir <path> --subject <slug> [--variants N] [--limit N] [--sync]
 *
 * --subject can be omitted only together with --multi: the model then determines the
 * subject (math/physics/informatics/math-literacy) per extracted question on its own —
 * see scripts/lib/subject-filter.ts. In that mode gen:all runs transcription only, prints
 * a per-subject summary, and stops; run gen:variants/gen:verify/gen:insert by hand per
 * subject afterward (generate-variants.ts and verify-questions.ts still need one --subject
 * per invocation).
 *
 * Default mode batches each API-calling step through the Message Batches API (−50% cost).
 * --sync forwards to every sub-script and restores the old one-request-at-a-time loops.
 *
 * ⚠️  Uses paid Anthropic account — costs ~$0.01–0.10 per 10 questions depending on complexity
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { SUBJECT_VALUES, AUTO_SUBJECT_PREFIX, type TranscriptionItem } from './lib/schema';
import { summarizeBySubject } from './lib/subject-filter';

function expandPath(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

function parseArgs(): {
  dir: string;
  subject: string | undefined;
  variants: number;
  limit: number | undefined;
  noVerify: boolean;
  publish: boolean;
  sync: boolean;
  multi: boolean;
} {
  const args = process.argv.slice(2);
  let dir = '';
  let subject: string | undefined;
  let variants = 3;
  let limit: number | undefined;
  let noVerify = false;
  let publish = false;
  let sync = false;
  let multi = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = expandPath(args[++i]);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--variants' && args[i + 1]) variants = parseInt(args[++i], 10);
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--no-verify') noVerify = true;
    if (args[i] === '--publish') publish = true;
    if (args[i] === '--sync') sync = true;
    if (args[i] === '--multi') multi = true;
  }
  if (!dir) {
    console.error(
      'Usage: npm run gen:all -- --dir <path> [--subject <slug>] [--variants N] [--limit N] [--no-verify] [--publish] [--sync] [--multi]',
    );
    process.exit(1);
  }
  if (subject === undefined && !multi) {
    console.error(
      '\n❌  --subject обязателен без --multi (автоопределение предмета работает только в --multi режиме)\n',
    );
    process.exit(1);
  }
  return { dir, subject, variants, limit, noVerify, publish, sync, multi };
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
  const { dir, subject, variants, limit, noVerify, publish, sync, multi } = parseArgs();
  const tsx = 'npx tsx --tsconfig tsconfig.scripts.json';
  const steps = noVerify ? 3 : 4;
  const mode = sync ? 'sync' : 'batch (−50%)';
  const syncArg = sync ? ' --sync' : '';
  const multiArg = multi ? ' --multi' : '';

  console.log(`\n🚀  gen:all`);
  console.log(`   subject:  ${subject ?? 'auto (определяется по странице)'}`);
  console.log(`   dir:      ${dir}`);
  console.log(`   variants: ${variants}`);
  if (limit) console.log(`   limit:    ${limit}`);
  console.log(`   verify:   ${noVerify ? 'OFF (--no-verify)' : 'ON (Sonnet)'}`);
  console.log(`   mode:     ${mode}`);
  if (multi) console.log(`   multi:    ON (несколько заданий на фото)`);
  if (subject === undefined) {
    console.log(`   ⚠️  Без --subject выполняется только шаг 1 (транскрипция); дальше — вручную по предметам.`);
  }
  console.log('═══════════════════════════════════════════════════════════\n');

  // ── Step 1: Transcribe ──────────────────────────────────────────
  console.log(`STEP 1/${steps}  Transcription (PNG → reference JSON, ${mode})`);
  const limitArg = limit !== undefined ? ` --limit ${limit}` : '';
  const subjectArg = subject ? ` --subject ${subject}` : '';
  run(
    `${tsx} scripts/transcribe-questions.ts --dir "${dir}"${subjectArg}${limitArg}${syncArg}${multiArg}`,
  );

  const refDir = path.join(process.cwd(), 'scripts', 'references');
  const refFile = newestJson(refDir, subject ?? AUTO_SUBJECT_PREFIX);
  if (!refFile) {
    console.error('\n❌  No reference file found after transcription.\n');
    process.exit(1);
  }
  console.log(`\n   → Reference: ${refFile}`);

  if (subject === undefined) {
    const items = JSON.parse(fs.readFileSync(refFile, 'utf8')) as TranscriptionItem[];
    const summary = summarizeBySubject(items);
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊  Сводка по предметам:');
    for (const s of SUBJECT_VALUES) {
      console.log(`   ${s}: ${summary.bySubject[s]}`);
    }
    console.log(`   предмет не определён: ${summary.undetermined}`);
    console.log(
      `\n   Reference-файл готов: ${refFile}\n   Запусти gen:variants / gen:verify / gen:insert вручную для каждого предмета (--subject <slug> --input "${refFile}").\n`,
    );
    return;
  }

  // ── Step 2: Generate variants ───────────────────────────────────
  console.log(`\nSTEP 2/${steps}  Generation (reference JSON → variants + checks, ${mode})`);
  run(
    `${tsx} scripts/generate-variants.ts --input "${refFile}" --subject ${subject} --variants ${variants}${syncArg}`,
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
    console.log(
      `\nSTEP 3/${steps}  Verification (Sonnet независимо перерешивает, брак отсеивается, ${mode})`,
    );
    run(`${tsx} scripts/verify-questions.ts --input "${genFile}" --subject ${subject}${syncArg}`);
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
