/**
 * Step 2.5 — Verification
 * Generated JSON → independently re-solved by Claude Sonnet → mismatches rejected.
 *
 * Sonnet НЕ видит помеченный ответ: решает задачу с нуля и мы сверяем.
 * Это ловит фактические ошибки генерации (неверный correct, несколько верных
 * вариантов, битые системы), которые детерминантные проверки поймать не могут.
 *
 * Usage:
 *   npm run gen:verify -- --input scripts/generated/math-YYYY-MM-DDTHH-MM.json [--subject math]
 *
 * ⚠️  Uses paid Anthropic account — Sonnet дороже Haiku, но точнее как проверяющий.
 *     Переопределить модель: VERIFIER_MODEL=<id> в .env.local
 */
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GeneratedQuestionSchema, type GeneratedQuestion } from './lib/schema';

const MODEL = process.env.VERIFIER_MODEL || 'claude-sonnet-4-6';
const COST = { input: 3.0, output: 15.0 }; // USD per 1M tokens (Sonnet, ориентировочно)

function calcCost(inputTok: number, outputTok: number): number {
  return (inputTok * COST.input + outputTok * COST.output) / 1_000_000;
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

function parseArgs(): { input: string; subject: string } {
  const args = process.argv.slice(2);
  let input = '';
  let subject = 'math';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = expandPath(args[++i]);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
  }
  if (!input) {
    console.error('Usage: npm run gen:verify -- --input <path.json> [--subject math]');
    process.exit(1);
  }
  return { input, subject };
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

async function verifyOne(
  client: Anthropic,
  q: GeneratedQuestion,
): Promise<{ ok: boolean; reason: string; inputTok: number; outputTok: number }> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: describeQuestion(q) }],
  });

  const inputTok = response.usage.input_tokens;
  const outputTok = response.usage.output_tokens;
  const raw = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let parsed: { correct?: unknown; flags?: unknown };
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { ok: false, reason: 'verifier: не удалось распарсить ответ', inputTok, outputTok };
  }

  if (Array.isArray(parsed.flags) && parsed.flags.length > 0) {
    return { ok: false, reason: `verifier-flag: ${parsed.flags.join('; ')}`, inputTok, outputTok };
  }

  const marked = (q.body as { correct: unknown }).correct;
  const ok = answersMatch(q.type, marked, parsed.correct);
  const reason = ok
    ? 'ok'
    : `mismatch: помечено ${JSON.stringify(marked)} · Sonnet ${JSON.stringify(parsed.correct)}`;
  return { ok, reason, inputTok, outputTok };
}

async function main() {
  loadEnv();
  const { input, subject } = parseArgs();

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

  console.log(`\n🔎  Verifying ${questions.length} questions  [model: ${MODEL}]`);
  console.log(`   ⚠️  Paid Anthropic account (Sonnet as independent solver)\n`);

  const client = new Anthropic({ apiKey });
  const verified: GeneratedQuestion[] = [];
  const rejected: { q: GeneratedQuestion; reason: string }[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (const [i, q] of questions.entries()) {
    const stem = ((q.body as { stem?: string }).stem ?? '').slice(0, 55);
    process.stdout.write(`  [${i + 1}/${questions.length}] ${q.topic_slug} "${stem}…"  …  `);
    try {
      const { ok, reason, inputTok, outputTok } = await verifyOne(client, q);
      totalInput += inputTok;
      totalOutput += outputTok;
      if (ok) {
        verified.push(q);
        console.log('✓');
      } else {
        rejected.push({ q, reason });
        console.log(`✗ ${reason}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      rejected.push({ q, reason: `API error: ${msg}` });
      console.log(`❌ ${msg}`);
    }
  }

  const outDir = path.join(process.cwd(), 'scripts', 'verified');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const outFile = path.join(outDir, `${subject}-${ts}.json`);
  fs.writeFileSync(outFile, JSON.stringify(verified, null, 2));

  const totalCost = calcCost(totalInput, totalOutput);
  const rate = ((verified.length / questions.length) * 100).toFixed(0);
  console.log(
    `\n✅  Verified ${verified.length}/${questions.length} passed (${rate}%), ${rejected.length} rejected`,
  );
  console.log(
    `💰  Tokens: ${totalInput} in / ${totalOutput} out  ~$${totalCost.toFixed(4)} USD  [${MODEL}]`,
  );
  console.log(`📄  Verified → ${outFile}`);
  console.log(`   → передай этот файл в insert-to-db.ts (gen:insert)\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
