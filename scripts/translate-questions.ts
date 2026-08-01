/**
 * Перевод опубликованных ru-задач на казахский — один раз в базу, НЕ на лету.
 * Казахских задач в базе ноль, а казахских источников для транскрибации мало
 * (40 скриншотов) — зато 693 проверенные русские задачи уже есть.
 *
 * Usage:
 *   npm run gen:translate -- --subject <slug> [--limit N] [--sync]
 *
 * Читает из БД (service-role) опубликованные ru-вопросы предмета, у которых
 * ещё нет строки-перевода (нет questions.language='kk' с этим
 * source_question_id — см. миграцию 0017). Один вопрос — один batch-запрос
 * к Haiku (Message Batches API, −50%). Каждый перевод проходит
 * детерминантные проверки (scripts/lib/checks.ts: validateTranslation) —
 * не прошло, значит не сохраняется.
 *
 * ⚠️  Uses paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output (batch: half that)
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { validateTranslation, type TranslationOriginal } from './lib/checks';
import { resolveModel } from './lib/models';
import {
  collectBatchResults,
  describeFailure,
  indexCustomId,
  isSucceeded,
  mapResultsByCustomId,
  submitAndAwaitBatch,
} from './lib/batch';

const COST = { input: 1.0, output: 5.0 }; // USD per 1M tokens (standard rate; batch is half this)

function calcCost(inputTok: number, outputTok: number, costMultiplier: number): number {
  return ((inputTok * COST.input + outputTok * COST.output) / 1_000_000) * costMultiplier;
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

function parseArgs(): { subject: string; limit: number; sync: boolean } {
  const args = process.argv.slice(2);
  let subject = '';
  let limit = Infinity;
  let sync = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--sync') sync = true;
  }
  if (!subject) {
    console.error('Usage: npm run gen:translate -- --subject <slug> [--limit N] [--sync]');
    process.exit(1);
  }
  return { subject, limit, sync };
}

/**
 * Claude часто оборачивает JSON в ```-блоки или добавляет преамбулу.
 * Достаём чистый JSON-объект — как в transcribe/generate.
 */
function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return s;
}

function loadGlossary(): Record<string, string> {
  const file = path.join(process.cwd(), 'scripts', 'lib', 'kk-glossary.json');
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildSystemInstruction(glossary: Record<string, string>): string {
  const glossaryLines = Object.entries(glossary)
    .map(([ru, kk]) => `  "${ru}" → "${kk}"`)
    .join('\n');

  return `You are a professional translator turning ЕНТ (Kazakhstan Unified National Testing) exam questions from Russian into Kazakh. You will be given a JSON object with "type", "body", and "explanation". Return ONLY a JSON object of the exact same shape for "body" and "explanation" — no markdown, no code fences, no commentary.

HARD RULES — violating any of these makes the translation useless and it will be discarded:
1. Translate ONLY natural language: stem, option/left "content" text, "right" array strings, and explanation block "value" text (for blocks with type "text" or no type). Everything else is copied through unchanged.
2. LaTeX inside $...$ must NOT be touched in any way — copy it character-for-character, including inside translated sentences. Never translate variable names, numbers, or units inside $...$.
3. Explanation blocks with "type": "latex" contain ONLY a formula — copy their "value" through completely unchanged (byte-for-byte), do not translate anything in them.
4. Option ids and left-item ids (e.g. "a", "b", "1") must NEVER change.
5. "correct" for single/multi questions must be returned EXACTLY as given — these are option ids, not text, and never get translated.
6. For matching questions: "correct" maps a left-item id to a string that must appear verbatim in "right". Since you are translating "right", you MUST update each "correct" value to the exact translated string that now occupies the same position in your translated "right" array — never leave a "correct" value in Russian.
7. Use these approved terms EXACTLY as given wherever they appear — do not invent alternative translations for them:
${glossaryLines}

Output format: {"body": { ... same shape as input body ... }, "explanation": {"blocks": [{"type": "text"|"latex", "value": "..."}, ...]}}`;
}

interface Candidate {
  id: string;
  topic_id: string;
  context_id: string | null;
  type: 'single' | 'multi' | 'matching';
  difficulty: number;
  body: TranslationOriginal['body'];
  explanation: TranslationOriginal['explanation'];
  sort_order: number;
}

interface TranslatedQuestion {
  source_question_id: string;
  topic_id: string;
  context_id: string | null;
  type: 'single' | 'multi' | 'matching';
  difficulty: number;
  body: TranslationOriginal['body'];
  explanation: TranslationOriginal['explanation'];
  sort_order: number;
}

function buildTranslateParams(
  candidate: Candidate,
  model: string,
  system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'],
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const payload = JSON.stringify({
    type: candidate.type,
    body: candidate.body,
    explanation: candidate.explanation,
  });
  return {
    model,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: `Translate this ЕНТ question to Kazakh:\n\n${payload}` }],
  };
}

interface ParsedTranslation {
  ok: boolean;
  reason: string;
  translated: TranslatedQuestion | null;
  inputTok: number;
  outputTok: number;
  cacheRead: number;
  cacheWrite: number;
}

function parseTranslateResponse(message: Anthropic.Message, candidate: Candidate): ParsedTranslation {
  const inputTok = message.usage.input_tokens;
  const outputTok = message.usage.output_tokens;
  const cacheRead = message.usage.cache_read_input_tokens ?? 0;
  const cacheWrite = message.usage.cache_creation_input_tokens ?? 0;
  const raw = message.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return {
      ok: false,
      reason: `not JSON: ${raw.slice(0, 80).replace(/\s+/g, ' ')}`,
      translated: null,
      inputTok,
      outputTok,
      cacheRead,
      cacheWrite,
    };
  }

  const original: TranslationOriginal = {
    type: candidate.type,
    body: candidate.body,
    explanation: candidate.explanation,
  };
  const check = validateTranslation(original, parsed);
  if (!check.ok) {
    return { ok: false, reason: check.reason, translated: null, inputTok, outputTok, cacheRead, cacheWrite };
  }

  return {
    ok: true,
    reason: 'ok',
    translated: {
      source_question_id: candidate.id,
      topic_id: candidate.topic_id,
      context_id: candidate.context_id,
      type: candidate.type,
      difficulty: candidate.difficulty,
      body: check.body,
      explanation: check.explanation,
      sort_order: candidate.sort_order,
    },
    inputTok,
    outputTok,
    cacheRead,
    cacheWrite,
  };
}

async function main() {
  loadEnv();
  const { subject, limit, sync } = parseArgs();

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

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: subjectRow, error: subjectErr } = await supabase
    .from('subjects')
    .select('id')
    .eq('slug', subject)
    .single<{ id: string }>();
  if (subjectErr || !subjectRow) {
    console.error(`\n❌  Subject "${subject}" not found in DB: ${subjectErr?.message ?? 'no data'}\n`);
    process.exit(1);
  }

  const { data: topicRows, error: topicsErr } = await supabase
    .from('topics')
    .select('id')
    .eq('subject_id', subjectRow.id);
  if (topicsErr || !topicRows || topicRows.length === 0) {
    console.error(`\n❌  Failed to fetch topics for "${subject}": ${topicsErr?.message ?? 'none found'}\n`);
    process.exit(1);
  }
  const topicIds = (topicRows as { id: string }[]).map((t) => t.id);

  const { data: ruQuestions, error: qErr } = await supabase
    .from('questions')
    .select('id, topic_id, context_id, type, difficulty, body, explanation, sort_order')
    .eq('language', 'ru')
    .eq('is_published', true)
    .in('topic_id', topicIds)
    .order('sort_order', { ascending: true });
  if (qErr || !ruQuestions) {
    console.error(`\n❌  Failed to fetch ru questions: ${qErr?.message ?? 'no data'}\n`);
    process.exit(1);
  }

  const { data: kkTranslations, error: kkErr } = await supabase
    .from('questions')
    .select('source_question_id')
    .eq('language', 'kk')
    .not('source_question_id', 'is', null);
  if (kkErr) {
    console.error(`\n❌  Failed to fetch existing kk translations: ${kkErr.message}\n`);
    process.exit(1);
  }
  const alreadyTranslated = new Set(
    (kkTranslations as { source_question_id: string }[]).map((r) => r.source_question_id),
  );

  const candidates = (ruQuestions as Candidate[])
    .filter((q) => !alreadyTranslated.has(q.id))
    .slice(0, limit);

  console.log(`\n📚  ${subject}: ${ruQuestions.length} published ru question(s), ${alreadyTranslated.size} already translated`);
  if (candidates.length === 0) {
    console.log(`✅  Nothing to translate — all published "${subject}" questions already have a kk version.\n`);
    return;
  }

  const glossary = loadGlossary();
  const model = resolveModel('TRANSLATE_MODEL', 'claude-haiku-4-5-20251001');
  const mode = sync ? 'sync' : 'batch (−50%)';

  console.log(`📋  Translating ${candidates.length} question(s)  [model: ${model}, mode: ${mode}, glossary: ${Object.keys(glossary).length} terms]`);
  console.log(`   ⚠️  Paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output\n`);

  const anthropic = new Anthropic({ apiKey });
  const system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'] = [
    { type: 'text', text: buildSystemInstruction(glossary), cache_control: { type: 'ephemeral' } },
  ];

  const translated: TranslatedQuestion[] = [];
  const rejected: { id: string; reason: string }[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  const costMultiplier = sync ? 1 : 0.5;

  function record(candidate: Candidate, result: ParsedTranslation): void {
    totalInput += result.inputTok;
    totalOutput += result.outputTok;
    totalCacheRead += result.cacheRead;
    totalCacheWrite += result.cacheWrite;
    if (result.ok && result.translated) {
      translated.push(result.translated);
      console.log('✓');
    } else {
      rejected.push({ id: candidate.id, reason: result.reason });
      console.log(`✗  ${result.reason}`);
    }
  }

  if (sync) {
    for (const [i, candidate] of candidates.entries()) {
      const stem = (candidate.body as { stem: string }).stem.slice(0, 55);
      process.stdout.write(`  [${i + 1}/${candidates.length}] "${stem}…"  …  `);
      try {
        const params = buildTranslateParams(candidate, model, system);
        const response = await anthropic.messages.create(params);
        record(candidate, parseTranslateResponse(response, candidate));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        record(candidate, {
          ok: false,
          reason: `API error: ${msg}`,
          translated: null,
          inputTok: 0,
          outputTok: 0,
          cacheRead: 0,
          cacheWrite: 0,
        });
      }
    }
  } else {
    const built = candidates.map((candidate, i) => ({
      customId: indexCustomId(i),
      candidate,
      params: buildTranslateParams(candidate, model, system),
    }));

    console.log(`📦  Submitting batch of ${built.length} request(s)…`);
    const batch = await submitAndAwaitBatch(
      anthropic,
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

    const resultsMap = await collectBatchResults(anthropic, batch.id);
    const mapped = mapResultsByCustomId(
      built.map(({ customId, candidate }) => ({ customId, item: candidate })),
      resultsMap,
    );

    for (const [i, { item: candidate, result }] of mapped.entries()) {
      const stem = (candidate.body as { stem: string }).stem.slice(0, 55);
      process.stdout.write(`  [${i + 1}/${mapped.length}] "${stem}…"  …  `);
      if (isSucceeded(result)) {
        record(candidate, parseTranslateResponse(result.result.message, candidate));
      } else {
        record(candidate, {
          ok: false,
          reason: `batch: ${describeFailure(result)}`,
          translated: null,
          inputTok: 0,
          outputTok: 0,
          cacheRead: 0,
          cacheWrite: 0,
        });
      }
    }
  }

  const outDir = path.join(process.cwd(), 'scripts', 'translated');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const outFile = path.join(outDir, `${subject}-${ts}.json`);
  fs.writeFileSync(outFile, JSON.stringify(translated, null, 2));

  const totalCost = calcCost(totalInput, totalOutput, costMultiplier);
  const rate = ((translated.length / candidates.length) * 100).toFixed(0);
  console.log(`\n✅  Translated ${translated.length}/${candidates.length} passed (${rate}%), ${rejected.length} rejected`);
  if (rejected.length > 0) {
    console.log('   Rejection reasons:');
    for (const r of rejected.slice(0, 20)) console.log(`     - ${r.id}: ${r.reason}`);
    if (rejected.length > 20) console.log(`     … and ${rejected.length - 20} more`);
  }
  console.log(
    `💰  Tokens: ${totalInput} in / ${totalOutput} out  ~$${totalCost.toFixed(4)} USD  [${model}, ${sync ? 'standard' : 'batch −50%'} rate]`,
  );
  console.log(
    `🗄️  Cache: ${totalCacheWrite} written / ${totalCacheRead} read (system prompt cache_control — no effect until the prompt clears the model's minimum cacheable prefix)`,
  );
  console.log(`📄  Saved → ${outFile}`);
  console.log(`   → передай этот файл в verify-translation.ts (gen:verify-translation)\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
