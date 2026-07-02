/**
 * Step 2 — Generation
 * Reference JSON → N variants per question via Claude Haiku.
 * Applies deterministic checks (dedup + LaTeX sanity) before saving.
 *
 * Usage:
 *   npm run gen:variants -- --input scripts/references/math-YYYY-MM-DDTHH-MM.json [--subject math] [--variants 3]
 *
 * ⚠️  Uses paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output
 */
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  GeneratedQuestionSchema,
  ReferenceQuestionSchema,
  type GeneratedQuestion,
  type ReferenceQuestion,
  type TranscriptionItem,
} from './lib/schema';
import { validateAndFilter } from './lib/checks';

const MODEL = 'claude-haiku-4-5-20251001';
const COST = { input: 1.0, output: 5.0 }; // USD per 1M tokens

function calcCost(inputTok: number, outputTok: number): number {
  return (inputTok * COST.input + outputTok * COST.output) / 1_000_000;
}

function expandPath(p: string): string {
  return p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
}

/**
 * Claude часто оборачивает JSON в ```-блоки или добавляет преамбулу.
 * Снимаем code fences и берём срез от первой { до последней }.
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

function parseArgs(): { input: string; variants: number; subject: string } {
  const args = process.argv.slice(2);
  let input = '';
  let variants = 3;
  let subject = 'math';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = expandPath(args[++i]);
    if (args[i] === '--variants' && args[i + 1]) variants = parseInt(args[++i], 10);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
  }
  if (!input) {
    console.error(
      'Usage: npm run gen:variants -- --input <path.json> [--subject math] [--variants N]',
    );
    process.exit(1);
  }
  return { input, variants, subject };
}

const SYSTEM_INSTRUCTION = `You are an expert math teacher creating original practice problems for Kazakhstani high school students preparing for ЕНТ (Unified National Testing).

TASK: Given a reference math problem, generate NEW variants using completely different numbers, coefficients, and contexts.

Output ONLY a valid JSON object with this exact structure (no markdown, no code fences):
{"variants": [<variant1>, <variant2>, ...]}

Each variant must have:
{
  "topic_slug": "<algebra|equations|functions|logarithms|trigonometry|progressions|planimetry|stereometry|derivatives|combinatorics|statistics|text_problems>",
  "type": "<single|multi|matching — must match reference>",
  "difficulty": <integer 1-5, similar to reference>,
  "body": <body object>,
  "explanation": {"blocks": [{"type": "text"|"latex", "value": "..."}]}
}

Body formats:
• single: {"stem":"...","options":[{"id":"a","content":"..."},{"id":"b","content":"..."},{"id":"c","content":"..."},{"id":"d","content":"..."}],"correct":"<id>"}
• multi: {"stem":"...","options":[{"id":"a",...},...],"correct":["<id1>","<id2>"]}
• matching: {"stem":"...","left":[{"id":"1","content":"..."},{"id":"2","content":"..."},{"id":"3","content":"..."},{"id":"4","content":"..."}],"right":["А ...","Б ...","В ...","Г ...","Д ..."],"correct":{"1":"А","2":"Б","3":"В","4":"Г"}}

RULES:
1. Change ALL specific values — numbers, roots, exponents, angles. NEVER copy originals.
2. Keep the same mathematical topic, question structure, and similar difficulty.
3. Use $...$ for inline LaTeX: $x^2 - 5x + 6 = 0$, $\\log_3 27$, $\\sin\\frac{\\pi}{4}$.
4. All text in Russian.
5. single: exactly 4 options (ids a/b/c/d), exactly one correct; wrong options must be plausible mistakes.
6. multi: 5–6 options, 2–3 correct.
7. matching: left items use ids "1","2","3","4"; include one extra distractor in right list.
8. explanation.blocks: full step-by-step solution alternating text and LaTeX blocks.
9. Each variant is completely self-contained.
10. NEVER reproduce verbatim content from actual ЕНТ/НЦТ exam papers.`;

async function generateVariants(
  client: Anthropic,
  reference: ReferenceQuestion,
  n: number,
): Promise<{ variants: GeneratedQuestion[]; inputTok: number; outputTok: number }> {
  // Fewer variants for questions with accompanying images (Epic C forward compat)
  const count = reference.has_image ? Math.min(n, 2) : n;

  const userMessage = `Reference problem (source: ${reference.source_file}):
${JSON.stringify(
  {
    topic_slug: reference.topic_slug,
    type: reference.type,
    difficulty: reference.difficulty,
    body: reference.body,
    explanation: reference.explanation,
  },
  null,
  2,
)}

Generate ${count} NEW variants with completely different numbers. Return them in the variants array.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_INSTRUCTION,
    messages: [{ role: 'user', content: userMessage }],
  });

  const inputTok = response.usage.input_tokens;
  const outputTok = response.usage.output_tokens;
  const raw = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let parsed: { variants?: unknown[] };
  try {
    parsed = JSON.parse(extractJson(raw)) as { variants?: unknown[] };
  } catch {
    console.warn(`      ⚠️  Response JSON parse failed: ${raw.slice(0, 60).replace(/\s+/g, ' ')}`);
    return { variants: [], inputTok, outputTok };
  }

  const rawVariants = parsed.variants ?? [];
  const validated: GeneratedQuestion[] = [];

  for (const [i, rawVariant] of rawVariants.entries()) {
    const withMeta = {
      ...(rawVariant as Record<string, unknown>),
      variant_of: reference.source_file,
    };
    const result = GeneratedQuestionSchema.safeParse(withMeta);
    if (result.success) {
      validated.push(result.data);
    } else {
      const msg = result.error.issues[0]?.message ?? 'unknown';
      console.warn(`      ⚠️  variant ${i + 1} failed Zod: ${msg} — skipped`);
    }
  }

  return { variants: validated, inputTok, outputTok };
}

async function main() {
  loadEnv();

  const { input, variants: numVariants, subject } = parseArgs();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('\n❌  ANTHROPIC_API_KEY not found in .env.local');
    console.error('   ⚠️  Paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output\n');
    process.exit(1);
  }

  if (!fs.existsSync(input)) {
    console.error(`\n❌  Input file not found: ${input}\n`);
    process.exit(1);
  }

  const rawBatch = JSON.parse(fs.readFileSync(input, 'utf8')) as TranscriptionItem[];

  const references: ReferenceQuestion[] = [];
  for (const item of rawBatch) {
    if ('skip' in item) continue;
    const r = ReferenceQuestionSchema.safeParse(item);
    if (r.success) {
      references.push(r.data);
    } else {
      const msg = r.error.issues[0]?.message ?? 'unknown';
      console.warn(
        `⚠️  Skipping invalid reference (${(item as { source_file?: string }).source_file ?? '?'}): ${msg}`,
      );
    }
  }

  if (references.length === 0) {
    console.error('\n❌  No valid references found in input file.\n');
    process.exit(1);
  }

  console.log(`\n📥  ${input}`);
  console.log(
    `📋  ${references.length} references → up to ${numVariants} variants each  [model: ${MODEL}]`,
  );
  console.log(`   ⚠️  Paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output\n`);

  const anthropic = new Anthropic({ apiKey });
  const allGenerated: GeneratedQuestion[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (const ref of references) {
    process.stdout.write(`  ${ref.source_file}  (${ref.topic_slug})  …  `);
    try {
      const { variants, inputTok, outputTok } = await generateVariants(
        anthropic,
        ref,
        numVariants,
      );
      allGenerated.push(...variants);
      totalInput += inputTok;
      totalOutput += outputTok;

      const cost = calcCost(inputTok, outputTok);
      console.log(
        `✓  ${variants.length}/${numVariants} variants  [${inputTok}in ${outputTok}out ~$${cost.toFixed(5)}]`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`❌  ${msg}`);
    }
  }

  if (allGenerated.length === 0) {
    console.error('\n❌  No variants generated.\n');
    process.exit(1);
  }

  // Deterministic checks: dedup + LaTeX sanity
  console.log(`\n🔍  Running deterministic checks on ${allGenerated.length} questions…`);
  const { valid, rejected } = validateAndFilter(allGenerated);
  if (rejected.length > 0) {
    for (const r of rejected) {
      const stem = ((r.question.body as { stem?: string }).stem ?? '').slice(0, 60);
      console.warn(`  ⚠️  Rejected: ${r.reason}  ("${stem}…")`);
    }
  }
  console.log(`  ✓  ${valid.length} passed, ${rejected.length} rejected\n`);

  if (valid.length === 0) {
    console.error('\n❌  No questions passed checks.\n');
    process.exit(1);
  }

  const genDir = path.join(process.cwd(), 'scripts', 'generated');
  fs.mkdirSync(genDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const genFile = path.join(genDir, `${subject}-${ts}.json`);
  fs.writeFileSync(genFile, JSON.stringify(valid, null, 2));

  const totalCost = calcCost(totalInput, totalOutput);
  console.log(
    `✅  Generated ${valid.length} questions from ${references.length} references`,
  );
  console.log(
    `💰  Tokens: ${totalInput} in / ${totalOutput} out  ~$${totalCost.toFixed(4)} USD  [Haiku 4.5]`,
  );
  console.log(`📄  Saved → ${genFile}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
