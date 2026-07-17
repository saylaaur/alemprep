/**
 * Step 2.5 — Verification
 * Generated JSON → independently re-solved by Claude Sonnet → mismatches rejected.
 *
 * Sonnet НЕ видит помеченный ответ: решает задачу с нуля и мы сверяем.
 * Это ловит фактические ошибки генерации (неверный correct, несколько верных
 * вариантов, битые системы), которые детерминантные проверки поймать не могут.
 *
 * Usage:
 *   npm run gen:verify -- --input scripts/generated/math-YYYY-MM-DDTHH-MM.json [--subject math] [--sync]
 *
 * Default mode batches one request per question into a single Message Batches API call
 * (−50% cost, separate rate limit). --sync falls back to the old one-request-per-question loop.
 *
 * ⚠️  Uses paid Anthropic account — Sonnet дороже Haiku, но точнее как проверяющий.
 *     Переопределить модель: VERIFIER_MODEL=<id> в .env.local
 */
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GeneratedQuestionSchema, type GeneratedQuestion } from './lib/schema';
import { resolveModel } from './lib/models';
import {
  collectBatchResults,
  describeFailure,
  indexCustomId,
  isSucceeded,
  mapResultsByCustomId,
  submitAndAwaitBatch,
} from './lib/batch';

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

/** Извлекаем JSON из хвоста ответа (после маркера ANSWER:). */
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

function parseArgs(): { input: string; subject: string; sync: boolean } {
  const args = process.argv.slice(2);
  let input = '';
  let subject = 'math';
  let sync = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = expandPath(args[++i]);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--sync') sync = true;
  }
  if (!input) {
    console.error('Usage: npm run gen:verify -- --input <path.json> [--subject math] [--sync]');
    process.exit(1);
  }
  return { input, subject, sync };
}

const SYSTEM_INSTRUCTION = `You are a rigorous mathematics examiner for ЕНТ (Kazakhstan). You are given a multiple-choice problem WITHOUT the marked answer. Solve it independently and precisely.

Work step by step, then on the LAST line output the answer as:
ANSWER: <json>

Answer JSON format by type:
• single   — {"correct": "<option id, e.g. b>"}   (exactly the single correct option)
• multi    — {"correct": ["<id>", "<id>"]}          (all correct options)
• matching — {"correct": {"1": "<exact text of the matching item from the right list>", "2": "..."}}

Rules:
- Compute exactly. Do not guess. If a single-choice problem has more than one option that satisfies it, output ALL such ids in a "flags" field: ANSWER: {"correct": "<best>", "flags": ["multiple options valid: a,b"]}.
- For matching, copy the right-list text VERBATIM.
- Output ONLY reasoning followed by the ANSWER line.`;

function describeQuestion(q: GeneratedQuestion): string {
  const b = q.body as Record<string, unknown>;
  const lines: string[] = [
    `Topic: ${q.topic_slug} | Type: ${q.type}`,
    `Problem: ${b.stem}`,
  ];
  if (Array.isArray(b.options)) {
    lines.push('Options:');
    for (const o of b.options as { id: string; content: string }[]) {
      lines.push(`  (${o.id}) ${o.content}`);
    }
  }
  if (Array.isArray(b.left)) {
    lines.push('Left items:');
    for (const l of b.left as { id: string; content: string }[]) {
      lines.push(`  ${l.id}) ${l.content}`);
    }
    lines.push(`Right list: ${JSON.stringify(b.right)}`);
  }
  return lines.join('\n');
}

function norm(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/** Сверяем ответ модели с помеченным correct. Возвращаем true если совпало. */
function answersMatch(
  type: string,
  marked: unknown,
  model: unknown,
): boolean {
  if (type === 'single') {
    return typeof marked === 'string' && typeof model === 'string' && norm(marked) === norm(model);
  }
  if (type === 'multi') {
    if (!Array.isArray(marked) || !Array.isArray(model)) return false;
    const a = marked.map(norm).sort().join(',');
    const b = model.map((x) => norm(String(x))).sort().join(',');
    return a === b;
  }
  if (type === 'matching') {
    if (typeof marked !== 'object' || typeof model !== 'object' || !marked || !model) return false;
    const mk = marked as Record<string, string>;
    const md = model as Record<string, string>;
    const keys = Object.keys(mk);
    if (keys.length !== Object.keys(md).length) return false;
    return keys.every((k) => md[k] !== undefined && norm(mk[k]) === norm(String(md[k])));
  }
  return false;
}

interface ParsedVerification {
  ok: boolean;
  reason: string;
  inputTok: number;
  outputTok: number;
  cacheRead: number;
  cacheWrite: number;
}

function buildVerifyParams(
  q: GeneratedQuestion,
  model: string,
  system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'],
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: describeQuestion(q) }],
  };
}

function parseVerifyResponse(
  message: Anthropic.Message,
  q: GeneratedQuestion,
): ParsedVerification {
  const inputTok = message.usage.input_tokens;
  const outputTok = message.usage.output_tokens;
  const cacheRead = message.usage.cache_read_input_tokens ?? 0;
  const cacheWrite = message.usage.cache_creation_input_tokens ?? 0;
  const raw = message.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let parsed: { correct?: unknown; flags?: unknown };
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return {
      ok: false,
      reason: 'verifier: не удалось распарсить ответ',
      inputTok,
      outputTok,
      cacheRead,
      cacheWrite,
    };
  }

  if (Array.isArray(parsed.flags) && parsed.flags.length > 0) {
    return {
      ok: false,
      reason: `verifier-flag: ${parsed.flags.join('; ')}`,
      inputTok,
      outputTok,
      cacheRead,
      cacheWrite,
    };
  }

  const marked = (q.body as { correct: unknown }).correct;
  const ok = answersMatch(q.type, marked, parsed.correct);
  const reason = ok
    ? 'ok'
    : `mismatch: помечено ${JSON.stringify(marked)} · Sonnet ${JSON.stringify(parsed.correct)}`;
  return { ok, reason, inputTok, outputTok, cacheRead, cacheWrite };
}

async function verifyOne(
  client: Anthropic,
  q: GeneratedQuestion,
  model: string,
  system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'],
): Promise<ParsedVerification> {
  const params = buildVerifyParams(q, model, system);
  const response = await client.messages.create(params);
  return parseVerifyResponse(response, q);
}

async function main() {
  loadEnv();
  const { input, subject, sync } = parseArgs();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('\n❌  ANTHROPIC_API_KEY not found in .env.local\n');
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`\n❌  Input file not found: ${input}\n`);
    process.exit(1);
  }

  const rawItems = JSON.parse(fs.readFileSync(input, 'utf8')) as unknown[];
  const questions: GeneratedQuestion[] = [];
  for (const item of rawItems) {
    const r = GeneratedQuestionSchema.safeParse(item);
    if (r.success) questions.push(r.data);
  }

  if (questions.length === 0) {
    console.error('\n❌  No valid generated questions in input file.\n');
    process.exit(1);
  }

  const model = resolveModel('VERIFIER_MODEL', 'claude-sonnet-4-6');
  const mode = sync ? 'sync' : 'batch (−50%)';

  console.log(`\n🔎  Verifying ${questions.length} questions  [model: ${model}, mode: ${mode}]`);
  console.log(`   ⚠️  Paid Anthropic account (Sonnet as independent solver)\n`);

  const client = new Anthropic({ apiKey });
  const system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'] = [
    { type: 'text', text: SYSTEM_INSTRUCTION, cache_control: { type: 'ephemeral' } },
  ];
  const verified: GeneratedQuestion[] = [];
  const rejected: { q: GeneratedQuestion; reason: string }[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  const costMultiplier = sync ? 1 : 0.5;

  function record(
    q: GeneratedQuestion,
    ok: boolean,
    reason: string,
    inputTok: number,
    outputTok: number,
    cacheRead: number,
    cacheWrite: number,
  ): void {
    totalInput += inputTok;
    totalOutput += outputTok;
    totalCacheRead += cacheRead;
    totalCacheWrite += cacheWrite;
    if (ok) {
      verified.push(q);
      console.log('✓');
    } else {
      rejected.push({ q, reason });
      console.log(`✗ ${reason}`);
    }
  }

  if (sync) {
    for (const [i, q] of questions.entries()) {
      const stem = ((q.body as { stem?: string }).stem ?? '').slice(0, 55);
      process.stdout.write(`  [${i + 1}/${questions.length}] ${q.topic_slug} "${stem}…"  …  `);
      try {
        const { ok, reason, inputTok, outputTok, cacheRead, cacheWrite } = await verifyOne(
          client,
          q,
          model,
          system,
        );
        record(q, ok, reason, inputTok, outputTok, cacheRead, cacheWrite);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        record(q, false, `API error: ${msg}`, 0, 0, 0, 0);
      }
    }
  } else {
    const built = questions.map((q, i) => ({
      customId: indexCustomId(i),
      q,
      params: buildVerifyParams(q, model, system),
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
      built.map(({ customId, q }) => ({ customId, item: q })),
      resultsMap,
    );

    for (const [i, { item: q, result }] of mapped.entries()) {
      const stem = ((q.body as { stem?: string }).stem ?? '').slice(0, 55);
      process.stdout.write(`  [${i + 1}/${mapped.length}] ${q.topic_slug} "${stem}…"  …  `);
      if (isSucceeded(result)) {
        const { ok, reason, inputTok, outputTok, cacheRead, cacheWrite } = parseVerifyResponse(
          result.result.message,
          q,
        );
        record(q, ok, reason, inputTok, outputTok, cacheRead, cacheWrite);
      } else {
        record(q, false, `batch: ${describeFailure(result)}`, 0, 0, 0, 0);
      }
    }
  }

  const outDir = path.join(process.cwd(), 'scripts', 'verified');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const outFile = path.join(outDir, `${subject}-${ts}.json`);
  fs.writeFileSync(outFile, JSON.stringify(verified, null, 2));

  const totalCost = calcCost(totalInput, totalOutput, costMultiplier);
  const rate = ((verified.length / questions.length) * 100).toFixed(0);
  console.log(
    `\n✅  Verified ${verified.length}/${questions.length} passed (${rate}%), ${rejected.length} rejected`,
  );
  console.log(
    `💰  Tokens: ${totalInput} in / ${totalOutput} out  ~$${totalCost.toFixed(4)} USD  [${model}, ${sync ? 'standard' : 'batch −50%'} rate]`,
  );
  console.log(
    `🗄️  Cache: ${totalCacheWrite} written / ${totalCacheRead} read (system prompt cache_control — no effect until the prompt clears the model's minimum cacheable prefix)`,
  );
  console.log(`📄  Verified → ${outFile}`);
  console.log(`   → передай этот файл в insert-to-db.ts (gen:insert)\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
