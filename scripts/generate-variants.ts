/**
 * Step 2 — Generation
 * Reference JSON → N variants per question via Gemini (responseSchema) → insert-batch.sql
 *
 * Usage:
 *   npm run gen:variants -- --input scripts/references/math-YYYY-MM-DDTHH-MM.json [--variants 3]
 *
 * ℹ️  Gemini 2.5 Flash pricing: $0.075/1M input, $0.30/1M output
 *     Free tier: 15 RPM · 1M tokens/day · no charge under quota (~$0 for demo)
 */
import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  MATH_TOPIC_SLUGS,
  GeneratedQuestionSchema,
  ReferenceQuestionSchema,
  type GeneratedQuestion,
  type ReferenceQuestion,
  type TranscriptionItem,
} from './lib/schema';

// ---- Cost (Gemini 2.5 Flash, USD per 1M tokens) ----
const COST = { input: 0.075, output: 0.30 };

function calcCost(promptTok: number, outputTok: number): number {
  return (promptTok * COST.input + outputTok * COST.output) / 1_000_000;
}

// ---- Helpers ----

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

function parseArgs(): { input: string; variants: number } {
  const args = process.argv.slice(2);
  let input = '';
  let variants = 3;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = expandPath(args[++i]);
    if (args[i] === '--variants' && args[i + 1]) variants = parseInt(args[++i], 10);
  }
  if (!input) {
    console.error('Usage: npm run gen:variants -- --input <path.json> [--variants N]');
    process.exit(1);
  }
  return { input, variants };
}

// ---- SQL builder (dollar-quoted to handle apostrophes in JSON) ----

function toJsonDollar(obj: unknown): string {
  return `$alemprep$${JSON.stringify(obj)}$alemprep$`;
}

function buildSql(questions: GeneratedQuestion[], sourceFile: string): string {
  const timestamp = new Date().toISOString();
  const lines: string[] = [
    `-- AlemPrep content batch`,
    `-- Generated:  ${timestamp}`,
    `-- Source:     ${sourceFile}`,
    `-- Questions:  ${questions.length}`,
    `-- Apply in:   Supabase Studio › SQL Editor`,
    ``,
    `BEGIN;`,
    ``,
  ];

  questions.forEach((q, i) => {
    const sortOrder = 1000 + i + 1;
    lines.push(
      `INSERT INTO public.questions`,
      `  (topic_id, context_id, language, type, difficulty, body, explanation, source, is_published, sort_order)`,
      `SELECT`,
      `  (SELECT t.id FROM public.topics t`,
      `   JOIN public.subjects s ON t.subject_id = s.id`,
      `   WHERE s.slug = 'math' AND t.slug = '${q.topic_slug}'),`,
      `  NULL,`,
      `  'ru',`,
      `  '${q.type}',`,
      `  ${q.difficulty},`,
      `  ${toJsonDollar(q.body)}::jsonb,`,
      `  ${toJsonDollar(q.explanation)}::jsonb,`,
      `  'ai_rewritten',`,
      `  false,`,
      `  ${sortOrder};`,
      ``,
    );
  });

  lines.push(`COMMIT;`, ``);
  return lines.join('\n');
}

// ---- Schema builders for Gemini responseSchema ----
// Per-question-type schemas so `correct` is typed precisely.

const answerOptionSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    content: { type: Type.STRING },
  },
  required: ['id', 'content'],
};

const explanationBlockSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    type: { type: Type.STRING, format: 'enum', enum: ['text', 'latex'] },
    value: { type: Type.STRING },
  },
  required: ['value'],
};

const explanationSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    blocks: { type: Type.ARRAY, items: explanationBlockSchema },
  },
  required: ['blocks'],
};

function buildBodySchema(qType: 'single' | 'multi' | 'matching'): Schema {
  if (qType === 'single') {
    return {
      type: Type.OBJECT,
      description: 'Single-choice body: stem, 4 options (ids a/b/c/d), one correct id.',
      properties: {
        stem: { type: Type.STRING },
        options: { type: Type.ARRAY, items: answerOptionSchema },
        correct: { type: Type.STRING, description: 'id of the single correct option' },
      },
      required: ['stem', 'options', 'correct'],
    };
  }
  if (qType === 'multi') {
    return {
      type: Type.OBJECT,
      description: 'Multi-choice body: stem, 5–6 options, array of correct ids.',
      properties: {
        stem: { type: Type.STRING },
        options: { type: Type.ARRAY, items: answerOptionSchema },
        correct: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'ids of all correct options',
        },
      },
      required: ['stem', 'options', 'correct'],
    };
  }
  // matching — left ids standardised to "1","2","3","4"
  return {
    type: Type.OBJECT,
    description: 'Matching body: left items with ids 1–4, right text values, correct maps id→value.',
    properties: {
      stem: { type: Type.STRING },
      left: { type: Type.ARRAY, items: answerOptionSchema },
      right: { type: Type.ARRAY, items: { type: Type.STRING } },
      correct: {
        type: Type.OBJECT,
        description: 'Maps left id to right text, e.g. {"1":"А","2":"Б","3":"В","4":"Г"}',
        properties: {
          '1': { type: Type.STRING, nullable: true },
          '2': { type: Type.STRING, nullable: true },
          '3': { type: Type.STRING, nullable: true },
          '4': { type: Type.STRING, nullable: true },
        },
      },
    },
    required: ['stem', 'left', 'right', 'correct'],
  };
}

function buildVariantsSchema(qType: 'single' | 'multi' | 'matching'): Schema {
  const variantSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      topic_slug: {
        type: Type.STRING,
        format: 'enum',
        enum: [...MATH_TOPIC_SLUGS],
        description: 'Math topic — must match the reference topic',
      },
      type: {
        type: Type.STRING,
        format: 'enum',
        enum: [qType],
        description: 'Must match reference type',
      },
      difficulty: {
        type: Type.INTEGER,
        description: 'Difficulty 1–5, similar to reference',
      },
      body: buildBodySchema(qType),
      explanation: explanationSchema,
    },
    required: ['topic_slug', 'type', 'difficulty', 'body', 'explanation'],
  };

  return {
    type: Type.OBJECT,
    properties: {
      variants: { type: Type.ARRAY, items: variantSchema },
    },
    required: ['variants'],
  };
}

// ---- System instruction (cached via model creation, same for all calls) ----

const SYSTEM_INSTRUCTION = `You are an expert math teacher creating original practice problems for Kazakhstani high school students preparing for ЕНТ (Unified National Testing).

TASK: Given a reference math problem, generate NEW variants using completely different numbers, coefficients, and contexts.

RULES:
1. Change ALL specific values — numbers, roots, exponents, angles, etc. Never copy originals.
2. Keep the same mathematical topic, question structure (single/multi/matching), and similar difficulty.
3. Use $...$ for inline LaTeX: $x^2 - 5x + 6 = 0$, $\\log_3 27$, $\\sin\\frac{\\pi}{4}$, $\\frac{a+b}{2}$.
4. All text in Russian.
5. single type: exactly 4 options (ids a/b/c/d), exactly one correct, wrong = plausible mistakes.
6. multi type: 5–6 options, 2–3 correct.
7. matching type: left items use ids "1","2","3","4"; at least 4 right texts (one extra distractor).
8. explanation.blocks: full step-by-step solution with text and LaTeX blocks.
9. Each variant is self-contained.
10. NEVER reproduce verbatim content from actual ЕНТ/НЦТ exam papers.`;

// ---- Generation ----

async function generateVariants(
  genAI: GoogleGenAI,
  reference: ReferenceQuestion,
  n: number,
): Promise<{ variants: GeneratedQuestion[]; promptTok: number; outputTok: number }> {
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

Generate ${n} NEW variants with completely different numbers. Return them via the variants array.`;

  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: userMessage,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseSchema: buildVariantsSchema(reference.type),
    },
  });

  const promptTok = response.usageMetadata?.promptTokenCount ?? 0;
  const outputTok = response.usageMetadata?.candidatesTokenCount ?? 0;

  let parsed: { variants?: unknown[] };
  try {
    parsed = JSON.parse(response.text ?? '') as { variants?: unknown[] };
  } catch {
    console.warn('      ⚠️  Response JSON parse failed');
    return { variants: [], promptTok, outputTok };
  }

  const rawVariants = parsed.variants ?? [];
  const validated: GeneratedQuestion[] = [];

  for (const [i, raw] of rawVariants.entries()) {
    const withMeta = { ...(raw as Record<string, unknown>), variant_of: reference.source_file };
    const result = GeneratedQuestionSchema.safeParse(withMeta);
    if (result.success) {
      validated.push(result.data);
    } else {
      const msg = result.error.issues[0]?.message ?? 'unknown';
      console.warn(`      ⚠️  variant ${i + 1} failed Zod: ${msg} — skipped`);
    }
  }

  return { variants: validated, promptTok, outputTok };
}

// ---- Main ----

async function main() {
  loadEnv();

  const { input, variants: numVariants } = parseArgs();

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('\n❌  GOOGLE_API_KEY not found in .env.local');
    console.error('   Add: GOOGLE_API_KEY=...');
    console.error('   ℹ️  Free tier: 15 RPM · 1M tokens/day · no charge under quota\n');
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
  console.log(`📋  ${references.length} references → ${numVariants} variants each  [model: gemini-2.5-flash]\n`);

  const genAI = new GoogleGenAI({ apiKey });
  const allGenerated: GeneratedQuestion[] = [];
  let totalPrompt = 0;
  let totalOutput = 0;

  for (const ref of references) {
    process.stdout.write(`  ${ref.source_file}  (${ref.topic_slug})  …  `);
    try {
      const { variants, promptTok, outputTok } = await generateVariants(genAI, ref, numVariants);
      allGenerated.push(...variants);
      totalPrompt += promptTok;
      totalOutput += outputTok;

      const cost = calcCost(promptTok, outputTok);
      console.log(
        `✓  ${variants.length}/${numVariants} variants  [${promptTok}in ${outputTok}out ~$${cost.toFixed(4)}]`,
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

  // Save generated JSON
  const genDir = path.join(process.cwd(), 'scripts', 'generated');
  fs.mkdirSync(genDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const genFile = path.join(genDir, `math-${ts}.json`);
  fs.writeFileSync(genFile, JSON.stringify(allGenerated, null, 2));

  // Save SQL
  const sqlFile = path.join(process.cwd(), 'scripts', 'insert-batch.sql');
  fs.writeFileSync(sqlFile, buildSql(allGenerated, input));

  const totalCost = calcCost(totalPrompt, totalOutput);
  console.log(
    `\n✅  Generated ${allGenerated.length} questions from ${references.length} references`,
  );
  console.log(`💰  Tokens: ${totalPrompt} in / ${totalOutput} out  ~$${totalCost.toFixed(4)}  (free tier ≤ 1M tok/day = $0)`);
  console.log(`📄  JSON → ${genFile}`);
  console.log(`📄  SQL  → ${sqlFile}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
