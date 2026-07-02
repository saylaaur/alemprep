/**
 * Step 1 — Transcription
 * PNG files → reference JSON via Claude Haiku vision.
 *
 * Usage:
 *   npm run gen:transcribe -- --dir "~/Desktop/images" [--subject math] [--limit 5]
 *
 * ⚠️  Uses paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output
 */
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ReferenceQuestionSchema,
  SkipItemSchema,
  type TranscriptionItem,
} from './lib/schema';

const MODEL = 'claude-haiku-4-5-20251001';
const COST = { input: 1.0, output: 5.0 }; // USD per 1M tokens

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

function parseArgs(): { dir: string; limit: number; subject: string } {
  const args = process.argv.slice(2);
  let dir = '';
  let limit = Infinity;
  let subject = 'math';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = expandPath(args[++i]);
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
  }
  if (!dir) {
    console.error('Usage: npm run gen:transcribe -- --dir <path> [--subject math] [--limit N]');
    process.exit(1);
  }
  return { dir, limit, subject };
}

function getMediaType(
  filePath: string,
): 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/png' {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

const SYSTEM_INSTRUCTION = `You are a math teacher transcribing ЕНТ (Unified National Testing, Kazakhstan) math problems into structured JSON.

Output ONLY a valid JSON object — no markdown, no code fences, just raw JSON.

If the image contains a graph, chart, coordinate plane, or any visual diagram that cannot be fully described in text/LaTeX:
{"skip": "graph", "reason": "<brief reason>", "source_file": "<PLACEHOLDER>"}

If the image is unclear, has multiple problems, or is not a recognizable math question:
{"skip": "unsupported", "reason": "<brief reason>", "source_file": "<PLACEHOLDER>"}

Otherwise transcribe the problem:
{
  "topic_slug": "<algebra|equations|functions|logarithms|trigonometry|progressions|planimetry|stereometry|derivatives|combinatorics|statistics|text_problems>",
  "type": "<single|multi|matching>",
  "difficulty": <1–5: 1=trivial, 2=easy, 3=typical ЕНТ, 4=hard, 5=olympiad>,
  "body": { ... see formats below ... },
  "explanation": { "blocks": [{"type": "text"|"latex", "value": "..."}] },
  "source_file": "<PLACEHOLDER>"
}

Body formats:
• single  — {"stem":"...","options":[{"id":"a","content":"..."},{"id":"b","content":"..."},{"id":"c","content":"..."},{"id":"d","content":"..."}],"correct":"b"}
• multi   — {"stem":"...","options":[...],"correct":["a","c"]}
• matching — {"stem":"...","left":[{"id":"1","content":"..."},...],"right":["А текст","Б текст",...],"correct":{"1":"А","2":"Б",...}}

Rules:
- All text in Russian
- Use $...$ for inline LaTeX: $x^2 + 1$, $\\log_2 8$, $\\sin\\frac{\\pi}{6}$
- Pick the most specific matching topic_slug
- difficulty: honest assessment — typical ЕНТ = 3`;

async function transcribeImage(
  client: Anthropic,
  imagePath: string,
): Promise<{ item: TranscriptionItem; inputTok: number; outputTok: number }> {
  const filename = path.basename(imagePath);
  const imageData = fs.readFileSync(imagePath).toString('base64');
  const mediaType = getMediaType(imagePath);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM_INSTRUCTION,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageData },
          },
          {
            type: 'text',
            text: `Transcribe this ЕНТ math problem. Set source_file to "${filename}".`,
          },
        ],
      },
    ],
  });

  const inputTok = response.usage.input_tokens;
  const outputTok = response.usage.output_tokens;
  const raw = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      item: { skip: 'unsupported', reason: 'Response is not valid JSON', source_file: filename },
      inputTok,
      outputTok,
    };
  }

  if (typeof parsed === 'object' && parsed !== null) {
    (parsed as Record<string, unknown>).source_file = filename;
  }

  const skipResult = SkipItemSchema.safeParse(parsed);
  if (skipResult.success) return { item: skipResult.data, inputTok, outputTok };

  const refResult = ReferenceQuestionSchema.safeParse(parsed);
  if (refResult.success) return { item: refResult.data, inputTok, outputTok };

  const msg = refResult.error.issues[0]?.message ?? 'unknown';
  return {
    item: { skip: 'unsupported', reason: `Zod: ${msg}`, source_file: filename },
    inputTok,
    outputTok,
  };
}

async function main() {
  loadEnv();

  const { dir, limit, subject } = parseArgs();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('\n❌  ANTHROPIC_API_KEY not found in .env.local');
    console.error('   ⚠️  Paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output\n');
    process.exit(1);
  }

  if (!fs.existsSync(dir)) {
    console.error(`\n❌  Directory not found: ${dir}\n`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f))
    .sort()
    .slice(0, limit);

  if (files.length === 0) {
    console.error(`\n❌  No image files found in: ${dir}\n`);
    process.exit(1);
  }

  console.log(`\n📂  ${dir}`);
  console.log(`📋  Processing ${files.length} image(s)  [model: ${MODEL}]`);
  console.log(`   ⚠️  Paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output\n`);

  const anthropic = new Anthropic({ apiKey });
  const results: TranscriptionItem[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let skipped = 0;
  let graphs = 0;

  for (const file of files) {
    process.stdout.write(`  ${file}  …  `);
    try {
      const { item, inputTok, outputTok } = await transcribeImage(
        anthropic,
        path.join(dir, file),
      );
      results.push(item);
      totalInput += inputTok;
      totalOutput += outputTok;

      if ('skip' in item) {
        skipped++;
        if (item.skip === 'graph') graphs++;
        console.log(`⏭  skip(${item.skip}): ${item.reason}`);
      } else {
        const cost = calcCost(inputTok, outputTok);
        console.log(
          `✓  ${item.topic_slug} / ${item.type} / diff=${item.difficulty}  [${inputTok}in ${outputTok}out ~$${cost.toFixed(5)}]`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ skip: 'unsupported', reason: `API error: ${msg}`, source_file: file });
      skipped++;
      console.log(`❌  ${msg}`);
    }
  }

  const outDir = path.join(process.cwd(), 'scripts', 'references');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const outFile = path.join(outDir, `${subject}-${ts}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

  const totalCost = calcCost(totalInput, totalOutput);
  const transcribed = files.length - skipped;
  console.log(
    `\n✅  ${transcribed} transcribed, ${skipped} skipped (${graphs} graph, ${skipped - graphs} other)`,
  );
  console.log(
    `💰  Tokens: ${totalInput} in / ${totalOutput} out  ~$${totalCost.toFixed(4)} USD  [Haiku 4.5]`,
  );
  console.log(`📄  Saved → ${outFile}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
