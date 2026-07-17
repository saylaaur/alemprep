/**
 * Step 1 — Transcription
 * PNG files → reference JSON via Claude Haiku vision.
 *
 * Usage:
 *   npm run gen:transcribe -- --dir "~/Desktop/images" [--subject math] [--limit 5] [--sync]
 *
 * Default mode batches all images into one Message Batches API call (−50% cost, separate rate
 * limit, may take a few minutes to finish processing). --sync falls back to the old one-request-
 * per-image loop.
 *
 * ⚠️  Uses paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output (batch: half that)
 */
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  ReferenceQuestionSchema,
  SkipItemSchema,
  getTopicSlugs,
  SUBJECT_LABEL,
  type TranscriptionItem,
} from './lib/schema';
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

function parseArgs(): { dir: string; limit: number; subject: string; sync: boolean } {
  const args = process.argv.slice(2);
  let dir = '';
  let limit = Infinity;
  let subject = 'math';
  let sync = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = expandPath(args[++i]);
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--sync') sync = true;
  }
  if (!dir) {
    console.error(
      'Usage: npm run gen:transcribe -- --dir <path> [--subject math] [--limit N] [--sync]',
    );
    process.exit(1);
  }
  return { dir, limit, subject, sync };
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

/**
 * Claude (в отличие от Gemini responseSchema) часто оборачивает JSON в ```-блоки
 * или добавляет преамбулу. Достаём чистый JSON-объект: снимаем code fences и
 * берём срез от первой { до последней }.
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

function buildSystemInstruction(subject: string): string {
  const label = SUBJECT_LABEL[subject] ?? 'mathematics';
  const slugs = getTopicSlugs(subject).join('|');
  return `You are a ${label} teacher transcribing ЕНТ (Unified National Testing, Kazakhstan) ${label} problems into structured JSON.

Output ONLY a valid JSON object — no markdown, no code fences, just raw JSON.

If the image contains a graph, chart, coordinate plane, circuit, block-scheme, or any visual diagram that cannot be fully described in text/LaTeX:
{"skip": "graph", "reason": "<brief reason>", "source_file": "<PLACEHOLDER>"}

If the image is unclear, has multiple problems, or is not a recognizable ${label} question:
{"skip": "unsupported", "reason": "<brief reason>", "source_file": "<PLACEHOLDER>"}

Otherwise transcribe the problem:
{
  "topic_slug": "<${slugs}>",
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
- Pick the most specific topic_slug from the list above
- For informatics: code fragments go inside the stem as plain text
- For physics: always keep correct units (м/с, кг, Н, Дж и т.п.)
- difficulty: honest assessment — typical ЕНТ = 3`;
}

interface ParsedTranscription {
  item: TranscriptionItem;
  inputTok: number;
  outputTok: number;
  cacheRead: number;
  cacheWrite: number;
}

function buildTranscribeParams(
  imagePath: string,
  model: string,
  system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'],
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const filename = path.basename(imagePath);
  const imageData = fs.readFileSync(imagePath).toString('base64');
  const mediaType = getMediaType(imagePath);

  return {
    model,
    max_tokens: 2048,
    system,
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
            text: `Transcribe this ЕНТ problem. Set source_file to "${filename}".`,
          },
        ],
      },
    ],
  };
}

function parseTranscribeResponse(
  message: Anthropic.Message,
  filename: string,
): ParsedTranscription {
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
      item: {
        skip: 'unsupported',
        reason: `Not JSON: ${raw.slice(0, 60).replace(/\s+/g, ' ')}`,
        source_file: filename,
      },
      inputTok,
      outputTok,
      cacheRead,
      cacheWrite,
    };
  }

  if (typeof parsed === 'object' && parsed !== null) {
    (parsed as Record<string, unknown>).source_file = filename;
  }

  const skipResult = SkipItemSchema.safeParse(parsed);
  if (skipResult.success) {
    return { item: skipResult.data, inputTok, outputTok, cacheRead, cacheWrite };
  }

  const refResult = ReferenceQuestionSchema.safeParse(parsed);
  if (refResult.success) {
    return { item: refResult.data, inputTok, outputTok, cacheRead, cacheWrite };
  }

  const msg = refResult.error.issues[0]?.message ?? 'unknown';
  return {
    item: { skip: 'unsupported', reason: `Zod: ${msg}`, source_file: filename },
    inputTok,
    outputTok,
    cacheRead,
    cacheWrite,
  };
}

async function transcribeImage(
  client: Anthropic,
  imagePath: string,
  model: string,
  system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'],
): Promise<ParsedTranscription> {
  const filename = path.basename(imagePath);
  const params = buildTranscribeParams(imagePath, model, system);
  const response = await client.messages.create(params);
  return parseTranscribeResponse(response, filename);
}

async function main() {
  loadEnv();

  const { dir, limit, subject, sync } = parseArgs();

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

  const model = resolveModel('TRANSCRIBE_MODEL', 'claude-haiku-4-5-20251001');
  const mode = sync ? 'sync' : 'batch (−50%)';

  console.log(`\n📂  ${dir}`);
  console.log(`📋  Processing ${files.length} image(s)  [model: ${model}, mode: ${mode}]`);
  console.log(`   ⚠️  Paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output\n`);

  const anthropic = new Anthropic({ apiKey });
  const system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'] = [
    { type: 'text', text: buildSystemInstruction(subject), cache_control: { type: 'ephemeral' } },
  ];

  const results: TranscriptionItem[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let skipped = 0;
  let graphs = 0;
  const costMultiplier = sync ? 1 : 0.5;

  function record(
    item: TranscriptionItem,
    inputTok: number,
    outputTok: number,
    cacheRead: number,
    cacheWrite: number,
  ): void {
    results.push(item);
    totalInput += inputTok;
    totalOutput += outputTok;
    totalCacheRead += cacheRead;
    totalCacheWrite += cacheWrite;

    if ('skip' in item) {
      skipped++;
      if (item.skip === 'graph') graphs++;
      console.log(`⏭  skip(${item.skip}): ${item.reason}`);
    } else {
      const cost = calcCost(inputTok, outputTok, costMultiplier);
      console.log(
        `✓  ${item.topic_slug} / ${item.type} / diff=${item.difficulty}  [${inputTok}in ${outputTok}out ~$${cost.toFixed(5)}]`,
      );
    }
  }

  if (sync) {
    for (const file of files) {
      process.stdout.write(`  ${file}  …  `);
      try {
        const { item, inputTok, outputTok, cacheRead, cacheWrite } = await transcribeImage(
          anthropic,
          path.join(dir, file),
          model,
          system,
        );
        record(item, inputTok, outputTok, cacheRead, cacheWrite);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        record({ skip: 'unsupported', reason: `API error: ${msg}`, source_file: file }, 0, 0, 0, 0);
        console.log(`❌  ${msg}`);
      }
    }
  } else {
    const built = files.map((file, i) => ({
      customId: indexCustomId(i),
      file,
      params: buildTranscribeParams(path.join(dir, file), model, system),
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
      built.map(({ customId, file }) => ({ customId, item: file })),
      resultsMap,
    );

    for (const { item: file, result } of mapped) {
      process.stdout.write(`  ${file}  …  `);
      if (isSucceeded(result)) {
        const { item, inputTok, outputTok, cacheRead, cacheWrite } = parseTranscribeResponse(
          result.result.message,
          file,
        );
        record(item, inputTok, outputTok, cacheRead, cacheWrite);
      } else {
        const reason = describeFailure(result);
        record(
          { skip: 'unsupported', reason: `batch: ${reason}`, source_file: file },
          0,
          0,
          0,
          0,
        );
      }
    }
  }

  const outDir = path.join(process.cwd(), 'scripts', 'references');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const outFile = path.join(outDir, `${subject}-${ts}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

  const totalCost = calcCost(totalInput, totalOutput, costMultiplier);
  const transcribed = files.length - skipped;
  console.log(
    `\n✅  ${transcribed} transcribed, ${skipped} skipped (${graphs} graph, ${skipped - graphs} other)`,
  );
  console.log(
    `💰  Tokens: ${totalInput} in / ${totalOutput} out  ~$${totalCost.toFixed(4)} USD  [${model}, ${sync ? 'standard' : 'batch −50%'} rate]`,
  );
  console.log(
    `🗄️  Cache: ${totalCacheWrite} written / ${totalCacheRead} read (system prompt cache_control — no effect until the prompt clears the model's minimum cacheable prefix)`,
  );
  console.log(`📄  Saved → ${outFile}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
