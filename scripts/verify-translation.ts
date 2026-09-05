/**
 * Независимая проверка перевода — Sonnet получает ОРИГИНАЛ и ПЕРЕВОД и
 * отвечает: сохранён ли смысл условия, остался ли правильный ответ
 * правильным, нет ли терминологических ошибок. Тот же принцип, что уже
 * применяется в verify-questions.ts: одна модель делает (Haiku
 * translate-questions.ts), другая независимо проверяет (Sonnet здесь).
 *
 * Детерминантные проверки (validateTranslation) ловят структурные ошибки
 * (id, correct, LaTeX). Этот шаг ловит смысловые: неверный перевод термина,
 * потеря отрицания, перепутанный порядок и т.п. — то, что структурные
 * проверки в принципе не видят.
 *
 * Usage:
 *   npm run gen:verify-translation -- --input scripts/translated/math-YYYY-MM-DDTHH-MM.json [--sync]
 *
 * Default mode batches one request per question into a single Message Batches API call
 * (−50% cost). --sync falls back to the old one-request-per-question loop.
 *
 * ⚠️  Uses paid Anthropic account — Sonnet как независимый проверяющий.
 *     Переопределить модель: VERIFIER_MODEL=<id> в .env.local
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { resolveModel } from './lib/models';
import {
  collectBatchResults,
  describeFailure,
  indexCustomId,
  isSucceeded,
  mapResultsByCustomId,
  submitAndAwaitBatch,
} from './lib/batch';
import type { QuestionBody, ExplanationType } from './lib/schema';

const COST = { input: 3.0, output: 15.0 }; // USD per 1M tokens (Sonnet, standard rate; batch is half)

function calcCost(inputTok: number, outputTok: number, costMultiplier: number): number {
  return ((inputTok * COST.input + outputTok * COST.output) / 1_000_000) * costMultiplier;
}

function expandPath(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

function loadEnv(): void {
  const envFile = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

function parseArgs(): { input: string; sync: boolean } {
  const args = process.argv.slice(2);
  let input = '';
  let sync = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = expandPath(args[++i]);
    if (args[i] === '--sync') sync = true;
  }
  if (!input) {
    console.error('Usage: npm run gen:verify-translation -- --input <path.json> [--sync]');
    process.exit(1);
  }
  return { input, sync };
}

/** Достаём JSON из хвоста ответа (после маркера ANSWER:) — как в verify-questions.ts. */
function extractJson(raw: string): string {
  let s = raw.trim();
  const marker = s.lastIndexOf('ANSWER:');
  if (marker !== -1) s = s.slice(marker + 'ANSWER:'.length);
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return s.trim();
}

const SYSTEM_INSTRUCTION = `You are a bilingual (Russian/Kazakh) ЕНТ exam reviewer. You are given an ORIGINAL Russian question and its KAZAKH TRANSLATION. Assess the translation independently — you already know both answers are marked the same (structurally verified elsewhere); your job is meaning, not structure.

Check:
1. Does the Kazakh stem preserve the exact meaning of the Russian original (no lost negation, no swapped comparison, no changed condition)?
2. Given the Kazakh translation as written, is the marked correct answer still actually correct? (A meaning-changing mistranslation can make a previously-correct answer wrong even if the id/value wasn't touched.)
3. Are mathematical/physics/CS terms translated correctly and consistently (no invented or wrong terminology)?

Work step by step, then on the LAST line output:
ANSWER: {"ok": true|false, "issues": ["<short description>", ...]}

"issues" must be empty when ok is true. Be strict: if in doubt, ok: false with a concrete issue.`;

interface StoredTranslation {
  source_question_id: string;
  topic_id: string;
  context_id: string | null;
  type: 'single' | 'multi' | 'matching';
  difficulty: number;
  body: QuestionBody;
  explanation: ExplanationType;
  sort_order: number;
}

interface OriginalRow {
  id: string;
  body: QuestionBody;
  explanation: ExplanationType;
}

function describeSide(label: string, body: QuestionBody, explanation: ExplanationType): string {
  const b = body as Record<string, unknown>;
  const lines: string[] = [`${label} stem: ${b.stem}`];
  if (Array.isArray(b.options)) {
    lines.push(`${label} options:`);
    for (const o of b.options as { id: string; content: string }[]) lines.push(`  (${o.id}) ${o.content}`);
    lines.push(`${label} correct: ${JSON.stringify(b.correct)}`);
  }
  if (Array.isArray(b.left)) {
    lines.push(`${label} left:`);
    for (const l of b.left as { id: string; content: string }[]) lines.push(`  ${l.id}) ${l.content}`);
    lines.push(`${label} right: ${JSON.stringify(b.right)}`);
    lines.push(`${label} correct: ${JSON.stringify(b.correct)}`);
  }
  if (explanation.blocks.length > 0) {
    lines.push(
      `${label} explanation: ${explanation.blocks
        .map((block) => ('value' in block ? block.value : [block.columns, ...block.rows].flat().join(' | ')))
        .join(' ')}`,
    );
  }
  return lines.join('\n');
}

function describePair(original: OriginalRow, translated: StoredTranslation): string {
  return [
    describeSide('RUSSIAN (original)', original.body, original.explanation),
    '',
    describeSide('KAZAKH (translation)', translated.body, translated.explanation),
  ].join('\n');
}

interface ParsedVerification {
  ok: boolean;
  issues: string[];
  inputTok: number;
  outputTok: number;
  cacheRead: number;
  cacheWrite: number;
}

function buildVerifyParams(
  pairText: string,
  model: string,
  system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'],
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return { model, max_tokens: 1500, system, messages: [{ role: 'user', content: pairText }] };
}

function parseVerifyResponse(message: Anthropic.Message): ParsedVerification {
  const inputTok = message.usage.input_tokens;
  const outputTok = message.usage.output_tokens;
  const cacheRead = message.usage.cache_read_input_tokens ?? 0;
  const cacheWrite = message.usage.cache_creation_input_tokens ?? 0;
  const raw = message.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let parsed: { ok?: unknown; issues?: unknown };
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { ok: false, issues: ['verifier: не удалось распарсить ответ'], inputTok, outputTok, cacheRead, cacheWrite };
  }

  const issues = Array.isArray(parsed.issues) ? parsed.issues.map(String) : [];
  const ok = parsed.ok === true && issues.length === 0;
  return { ok, issues: ok ? [] : issues.length > 0 ? issues : ['verifier: ok=false без issues'], inputTok, outputTok, cacheRead, cacheWrite };
}

async function main() {
  loadEnv();
  const { input, sync } = parseArgs();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!apiKey) {
    console.error('\n❌  ANTHROPIC_API_KEY not found in .env.local\n');
    process.exit(1);
  }
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('\n❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n');
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`\n❌  Input file not found: ${input}\n`);
    process.exit(1);
  }

  const translations = JSON.parse(fs.readFileSync(input, 'utf8')) as StoredTranslation[];
  if (translations.length === 0) {
    console.error('\n❌  No translations in input file.\n');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const sourceIds = [...new Set(translations.map((t) => t.source_question_id))];
  const { data: originalsData, error: origErr } = await supabase
    .from('questions')
    .select('id, body, explanation')
    .in('id', sourceIds);
  if (origErr || !originalsData) {
    console.error(`\n❌  Failed to fetch originals: ${origErr?.message ?? 'no data'}\n`);
    process.exit(1);
  }
  const originalsById = new Map((originalsData as OriginalRow[]).map((o) => [o.id, o]));

  const pairs: { translation: StoredTranslation; original: OriginalRow }[] = [];
  for (const t of translations) {
    const original = originalsById.get(t.source_question_id);
    if (original) pairs.push({ translation: t, original });
    else console.warn(`  ⚠️  Original ${t.source_question_id} not found in DB — skipped`);
  }

  const model = resolveModel('VERIFIER_MODEL', 'claude-sonnet-4-6');
  const mode = sync ? 'sync' : 'batch (−50%)';

  console.log(`\n🔎  Verifying ${pairs.length} translation(s)  [model: ${model}, mode: ${mode}]`);
  console.log(`   ⚠️  Paid Anthropic account (Sonnet as independent bilingual reviewer)\n`);

  const client = new Anthropic({ apiKey });
  const system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'] = [
    { type: 'text', text: SYSTEM_INSTRUCTION, cache_control: { type: 'ephemeral' } },
  ];

  const verified: StoredTranslation[] = [];
  const rejected: { source_question_id: string; issues: string[] }[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  const costMultiplier = sync ? 1 : 0.5;

  function record(t: StoredTranslation, result: ParsedVerification): void {
    totalInput += result.inputTok;
    totalOutput += result.outputTok;
    totalCacheRead += result.cacheRead;
    totalCacheWrite += result.cacheWrite;
    if (result.ok) {
      verified.push(t);
      console.log('✓');
    } else {
      rejected.push({ source_question_id: t.source_question_id, issues: result.issues });
      console.log(`✗  ${result.issues.join('; ')}`);
    }
  }

  if (sync) {
    for (const [i, { translation, original }] of pairs.entries()) {
      process.stdout.write(`  [${i + 1}/${pairs.length}] ${translation.source_question_id}  …  `);
      try {
        const params = buildVerifyParams(describePair(original, translation), model, system);
        const response = await client.messages.create(params);
        record(translation, parseVerifyResponse(response));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        record(translation, { ok: false, issues: [`API error: ${msg}`], inputTok: 0, outputTok: 0, cacheRead: 0, cacheWrite: 0 });
      }
    }
  } else {
    const built = pairs.map(({ translation, original }, i) => ({
      customId: indexCustomId(i),
      translation,
      params: buildVerifyParams(describePair(original, translation), model, system),
    }));

    console.log(`📦  Submitting batch of ${built.length} request(s)…`);
    const batch = await submitAndAwaitBatch(
      client,
      built.map(({ customId, params }) => ({ custom_id: customId, params })),
      {
        onPoll: (b) =>
          console.log(
            `   …  batch ${b.id} still ${b.processing_status} (${b.request_counts.succeeded} done, ${b.request_counts.processing} processing)`,
          ),
      },
    );
    console.log(
      `   ✓  batch ${batch.id} ended — ${batch.request_counts.succeeded} succeeded, ${batch.request_counts.errored} errored, ${batch.request_counts.expired} expired, ${batch.request_counts.canceled} canceled\n`,
    );

    const resultsMap = await collectBatchResults(client, batch.id);
    const mapped = mapResultsByCustomId(
      built.map(({ customId, translation }) => ({ customId, item: translation })),
      resultsMap,
    );

    for (const [i, { item: translation, result }] of mapped.entries()) {
      process.stdout.write(`  [${i + 1}/${mapped.length}] ${translation.source_question_id}  …  `);
      if (isSucceeded(result)) {
        record(translation, parseVerifyResponse(result.result.message));
      } else {
        record(translation, { ok: false, issues: [`batch: ${describeFailure(result)}`], inputTok: 0, outputTok: 0, cacheRead: 0, cacheWrite: 0 });
      }
    }
  }

  const outDir = path.join(process.cwd(), 'scripts', 'verified-translations');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const base = path.basename(input, '.json');
  const outFile = path.join(outDir, `${base}-verified-${ts}.json`);
  fs.writeFileSync(outFile, JSON.stringify(verified, null, 2));

  const totalCost = calcCost(totalInput, totalOutput, costMultiplier);
  const rate = pairs.length > 0 ? ((verified.length / pairs.length) * 100).toFixed(0) : '0';
  console.log(`\n✅  Verified ${verified.length}/${pairs.length} passed (${rate}%), ${rejected.length} rejected`);
  if (rejected.length > 0) {
    console.log('   Rejection reasons:');
    for (const r of rejected.slice(0, 20)) console.log(`     - ${r.source_question_id}: ${r.issues.join('; ')}`);
    if (rejected.length > 20) console.log(`     … and ${rejected.length - 20} more`);
  }
  console.log(
    `💰  Tokens: ${totalInput} in / ${totalOutput} out  ~$${totalCost.toFixed(4)} USD  [${model}, ${sync ? 'standard' : 'batch −50%'} rate]`,
  );
  console.log(
    `🗄️  Cache: ${totalCacheWrite} written / ${totalCacheRead} read (system prompt cache_control — no effect until the prompt clears the model's minimum cacheable prefix)`,
  );
  console.log(`📄  Verified → ${outFile}`);
  console.log(`   → передай этот файл в insert-to-db.ts --language kk (gen:insert)\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
