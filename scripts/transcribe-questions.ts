/**
 * Step 1 — Transcription
 * PNG files → reference JSON via Gemini vision.
 *
 * Usage:
 *   npm run gen:transcribe -- --dir "~/Desktop/unt recources/math unt 1" [--limit 5]
 *
 * ℹ️  Gemini 2.5 Flash pricing: $0.075/1M input, $0.30/1M output
 *     Free tier: 15 RPM · 1M tokens/day · 1500 req/day (demo costs ~$0)
 */
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ReferenceQuestionSchema,
  SkipItemSchema,
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

function parseArgs(): { dir: string; limit: number } {
  const args = process.argv.slice(2);
  let dir = '';
  let limit = Infinity;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = expandPath(args[++i]);
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
  }
  if (!dir) {
    console.error('Usage: npm run gen:transcribe -- --dir <path> [--limit N]');
    process.exit(1);
  }
  return { dir, limit };
}

function getMediaType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

// ---- System instruction ----

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

// ---- Core transcription ----

async function transcribeImage(
  genAI: GoogleGenAI,
  imagePath: string,
): Promise<{ item: TranscriptionItem; promptTok: number; outputTok: number }> {
  const filename = path.basename(imagePath);
  const imageData = fs.readFileSync(imagePath).toString('base64');
  const mimeType = getMediaType(imagePath);

  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { text: `Transcribe this ЕНТ math problem. Set source_file to "${filename}".` },
      { inlineData: { data: imageData, mimeType } },
    ],
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      // No responseSchema — skip | question is a union; handled via prompt + Zod
    },
  });

  const promptTok = response.usageMetadata?.promptTokenCount ?? 0;
  const outputTok = response.usageMetadata?.candidatesTokenCount ?? 0;
  const raw = (response.text ?? '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      item: { skip: 'unsupported', reason: 'Response is not valid JSON', source_file: filename },
      promptTok,
      outputTok,
    };
  }

  // Always stamp source_file from our known filename
  if (typeof parsed === 'object' && parsed !== null) {
    (parsed as Record<string, unknown>).source_file = filename;
  }

  const skipResult = SkipItemSchema.safeParse(parsed);
  if (skipResult.success) return { item: skipResult.data, promptTok, outputTok };

  const refResult = ReferenceQuestionSchema.safeParse(parsed);
  if (refResult.success) return { item: refResult.data, promptTok, outputTok };

  const msg = refResult.error.issues[0]?.message ?? 'unknown';
  return {
    item: { skip: 'unsupported', reason: `Zod: ${msg}`, source_file: filename },
    promptTok,
    outputTok,
  };
}

// ---- Main ----

async function main() {
  loadEnv();

  const { dir, limit } = parseArgs();

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('\n❌  GOOGLE_API_KEY not found in .env.local');
    console.error('   Add: GOOGLE_API_KEY=...');
    console.error('   ℹ️  Free tier: 15 RPM · 1M tokens/day · no charge under quota\n');
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
  console.log(`📋  Processing ${files.length} image(s)  [model: gemini-2.5-flash]\n`);

  const genAI = new GoogleGenAI({ apiKey });
  const results: TranscriptionItem[] = [];
  let totalPrompt = 0;
  let totalOutput = 0;
  let skipped = 0;
  let graphs = 0;

  for (const file of files) {
    process.stdout.write(`  ${file}  …  `);
    try {
      const { item, promptTok, outputTok } = await transcribeImage(
        genAI,
        path.join(dir, file),
      );
      results.push(item);
      totalPrompt += promptTok;
      totalOutput += outputTok;

      if ('skip' in item) {
        skipped++;
        if (item.skip === 'graph') graphs++;
        console.log(`⏭  skip(${item.skip}): ${item.reason}`);
      } else {
        const cost = calcCost(promptTok, outputTok);
        console.log(
          `✓  ${item.topic_slug} / ${item.type} / diff=${item.difficulty}  [${promptTok}in ${outputTok}out ~$${cost.toFixed(4)}]`,
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
  const outFile = path.join(outDir, `math-${ts}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

  const totalCost = calcCost(totalPrompt, totalOutput);
  const transcribed = files.length - skipped;
  console.log(
    `\n✅  ${transcribed} transcribed, ${skipped} skipped (${graphs} graph, ${skipped - graphs} other)`,
  );
  console.log(
    `💰  Tokens: ${totalPrompt} in / ${totalOutput} out  ~$${totalCost.toFixed(4)}  (free tier ≤ 1M tok/day = $0)`,
  );
  console.log(`📄  Saved → ${outFile}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
