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
import { parseMultiItems } from './lib/multi-transcribe';
import { referencesMissingVisual } from './lib/checks';
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

function parseArgs(): {
  dir: string;
  limit: number;
  subject: string;
  sync: boolean;
  multi: boolean;
} {
  const args = process.argv.slice(2);
  let dir = '';
  let limit = Infinity;
  let subject = 'math';
  let sync = false;
  let multi = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir' && args[i + 1]) dir = expandPath(args[++i]);
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--sync') sync = true;
    if (args[i] === '--multi') multi = true;
  }
  if (!dir) {
    console.error(
      'Usage: npm run gen:transcribe -- --dir <path> [--subject math] [--limit N] [--sync] [--multi]',
    );
    process.exit(1);
  }
  return { dir, limit, subject, sync, multi };
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

/**
 * --multi: изображение — разворот печатной книжки, несколько заданий на кадре.
 * В отличие от одиночного режима, возвращаем JSON-массив и явно предупреждаем
 * про рукописные пометки ученика и обрывки соседних страниц/колонок в кадре.
 */
function buildMultiSystemInstruction(subject: string): string {
  const label = SUBJECT_LABEL[subject] ?? 'mathematics';
  const slugs = getTopicSlugs(subject).join('|');
  return `You are a ${label} teacher transcribing ЕНТ (Unified National Testing, Kazakhstan) ${label} problems from a photographed page of a printed practice booklet.

The image contains SEVERAL test problems (a two-column book spread). Extract ALL problems that are FULLY visible — condition and all answer options.

Output ONLY a valid JSON array — no markdown, no code fences, just raw JSON. One entry per problem, in reading order.

⚠️  DO NOT EXTRACT PROBLEMS THAT DEPEND ON A PICTURE — not even partially, not even if you can guess the rest. We have NO support for images in questions; a problem whose condition needs a picture, diagram, chart, or graph to understand (electrical circuits, geometric drawings, function graphs, image-based tables) is UNUSABLE no matter how well you transcribe its text. Watch for these exact phrases in the Russian text — any of them means the problem POINTS AT a picture that exists outside the text and MUST be skipped: "как показано на рисунке", "на схеме", "на графике", "изображён на" / "изображена на", "указаны на рисунке", "приведён на рисунке", "см. рис.". Do not confuse this with a problem that asks the student to build a graph themselves ("постройте график функции") — that one has no missing picture and stays. For each skipped problem, still emit an entry:
{"skip": "graph", "reason": "<brief reason>", "source_file": "<PLACEHOLDER>"}

⚠️  IGNORE HANDWRITTEN MARKS. Circled letters, checkmarks, crossed-out text, and margin calculations are a STUDENT'S OWN ANSWERS and MAY BE WRONG. Determine the correct answer yourself by solving the problem — never read it off the handwritten marks.

⚠️  IGNORE fragments of a neighboring page or column bleeding in at the edge of the photo — only take problems visible IN FULL (condition + all options). Do not take a problem that shows a number but not its full text.

⚠️  SELF-CONTAINED STEMS. Some problems share a preceding context block (a passage, a described figure with given measurements, a shared condition) that applies to several numbered problems at once. Each problem you extract MUST stand alone: copy the relevant shared context (the given numbers, the described figure, the passage) INTO that problem's own stem. Never rely on a previous array entry to supply missing information — a problem shown by itself, without its neighbors, must still be fully solvable.

⚠️  TWO-PART PROBLEMS. If one problem number presents two independently-answered parts, each with its OWN lettered options (e.g. "Найдите f(g(x)): A) B) C) D)" followed by "Найдите g(f(x)): E) F) G) H)"), extract them as TWO SEPARATE single-choice problems — one per lettered option set, each with the shared condition copied into its stem. Do NOT also emit a combined "multi" entry whose options are the sub-questions themselves — that produces a nonsensical question.

If a problem is unclear or not a recognizable ${label} question, skip it the same way:
{"skip": "unsupported", "reason": "<brief reason>", "source_file": "<PLACEHOLDER>"}

Otherwise, for each transcribed problem:
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

interface ParsedMultiTranscription {
  items: TranscriptionItem[];
  discardedReasons: string[];
  inputTok: number;
  outputTok: number;
  cacheRead: number;
  cacheWrite: number;
}

function buildTranscribeParams(
  imagePath: string,
  model: string,
  system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'],
  multi = false,
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const filename = path.basename(imagePath);
  const imageData = fs.readFileSync(imagePath).toString('base64');
  const mediaType = getMediaType(imagePath);
  const text = multi
    ? `Extract every fully visible ЕНТ problem from this page. Set source_file to "${filename}" for each item.`
    : `Transcribe this ЕНТ problem. Set source_file to "${filename}".`;

  return {
    model,
    max_tokens: multi ? 8192 : 2048,
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
            text,
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

function parseTranscribeResponseMulti(
  message: Anthropic.Message,
  filename: string,
): ParsedMultiTranscription {
  const inputTok = message.usage.input_tokens;
  const outputTok = message.usage.output_tokens;
  const cacheRead = message.usage.cache_read_input_tokens ?? 0;
  const cacheWrite = message.usage.cache_creation_input_tokens ?? 0;
  const raw = message.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();

  const { items, discardedReasons, parseError } = parseMultiItems(raw, filename);
  if (parseError) {
    return {
      items: [{ skip: 'unsupported', reason: parseError, source_file: filename }],
      discardedReasons: [],
      inputTok,
      outputTok,
      cacheRead,
      cacheWrite,
    };
  }

  return { items, discardedReasons, inputTok, outputTok, cacheRead, cacheWrite };
}

async function transcribeImageMulti(
  client: Anthropic,
  imagePath: string,
  model: string,
  system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'],
): Promise<ParsedMultiTranscription> {
  const filename = path.basename(imagePath);
  const params = buildTranscribeParams(imagePath, model, system, true);
  const response = await client.messages.create(params);
  return parseTranscribeResponseMulti(response, filename);
}

async function main() {
  loadEnv();

  const { dir, limit, subject, sync, multi } = parseArgs();

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
  console.log(
    `📋  Processing ${files.length} image(s)  [model: ${model}, mode: ${mode}${multi ? ', multi' : ''}]`,
  );
  console.log(`   ⚠️  Paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output\n`);

  const anthropic = new Anthropic({ apiKey });
  const system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'] = [
    {
      type: 'text',
      text: multi ? buildMultiSystemInstruction(subject) : buildSystemInstruction(subject),
      cache_control: { type: 'ephemeral' },
    },
  ];

  const results: TranscriptionItem[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let skipped = 0;
  let graphs = 0;
  let extracted = 0;
  let discardedBySchema = 0;
  let filteredGraphs = 0;
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

  function recordMulti(
    items: TranscriptionItem[],
    discardedReasons: string[],
    inputTok: number,
    outputTok: number,
    cacheRead: number,
    cacheWrite: number,
  ): void {
    totalInput += inputTok;
    totalOutput += outputTok;
    totalCacheRead += cacheRead;
    totalCacheWrite += cacheWrite;

    for (const item of items) {
      if (!('skip' in item) && referencesMissingVisual(item)) {
        const filtered: TranscriptionItem = {
          skip: 'graph',
          reason: `Ссылается на отсутствующий визуальный материал (детерминантный фильтр): "${item.body.stem.slice(0, 60)}"`,
          source_file: item.source_file,
        };
        results.push(filtered);
        skipped++;
        filteredGraphs++;
        console.log(`  🚫  filtered(graph): ${filtered.reason}`);
        continue;
      }

      results.push(item);
      if ('skip' in item) {
        skipped++;
        if (item.skip === 'graph') graphs++;
        console.log(`  ⏭  skip(${item.skip}): ${item.reason}`);
      } else {
        extracted++;
        console.log(`  ✓  ${item.topic_slug} / ${item.type} / diff=${item.difficulty}`);
      }
    }

    for (const reason of discardedReasons) {
      discardedBySchema++;
      console.log(`  ❌  discarded (schema): ${reason}`);
    }
  }

  if (sync) {
    for (const file of files) {
      process.stdout.write(`  ${file}  …  ${multi ? '\n' : ''}`);
      try {
        if (multi) {
          const { items, discardedReasons, inputTok, outputTok, cacheRead, cacheWrite } =
            await transcribeImageMulti(anthropic, path.join(dir, file), model, system);
          recordMulti(items, discardedReasons, inputTok, outputTok, cacheRead, cacheWrite);
        } else {
          const { item, inputTok, outputTok, cacheRead, cacheWrite } = await transcribeImage(
            anthropic,
            path.join(dir, file),
            model,
            system,
          );
          record(item, inputTok, outputTok, cacheRead, cacheWrite);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const errorItem: TranscriptionItem = {
          skip: 'unsupported',
          reason: `API error: ${msg}`,
          source_file: file,
        };
        if (multi) {
          recordMulti([errorItem], [], 0, 0, 0, 0);
        } else {
          record(errorItem, 0, 0, 0, 0);
        }
        console.log(`❌  ${msg}`);
      }
    }
  } else {
    const built = files.map((file, i) => ({
      customId: indexCustomId(i),
      file,
      params: buildTranscribeParams(path.join(dir, file), model, system, multi),
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
      process.stdout.write(`  ${file}  …  ${multi ? '\n' : ''}`);
      if (isSucceeded(result)) {
        if (multi) {
          const { items, discardedReasons, inputTok, outputTok, cacheRead, cacheWrite } =
            parseTranscribeResponseMulti(result.result.message, file);
          recordMulti(items, discardedReasons, inputTok, outputTok, cacheRead, cacheWrite);
        } else {
          const { item, inputTok, outputTok, cacheRead, cacheWrite } = parseTranscribeResponse(
            result.result.message,
            file,
          );
          record(item, inputTok, outputTok, cacheRead, cacheWrite);
        }
      } else {
        const reason = describeFailure(result);
        const errorItem: TranscriptionItem = {
          skip: 'unsupported',
          reason: `batch: ${reason}`,
          source_file: file,
        };
        if (multi) {
          recordMulti([errorItem], [], 0, 0, 0, 0);
        } else {
          record(errorItem, 0, 0, 0, 0);
        }
      }
    }
  }

  const outDir = path.join(process.cwd(), 'scripts', 'references');
  fs.mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const outFile = path.join(outDir, `${subject}-${ts}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

  const totalCost = calcCost(totalInput, totalOutput, costMultiplier);
  const transcribed = multi ? extracted : files.length - skipped;
  if (multi) {
    console.log(`\n📊  Сводка:`);
    console.log(`   обработано изображений:        ${files.length}`);
    console.log(`   извлечено заданий:             ${extracted}`);
    console.log(
      `   пропущено из-за графики:       ${graphs + filteredGraphs} (модель: ${graphs}, фильтр: ${filteredGraphs})`,
    );
    console.log(`   пропущено (прочее):            ${skipped - graphs - filteredGraphs}`);
    console.log(`   отброшено схемой (невалидные): ${discardedBySchema}`);
  } else {
    console.log(
      `\n✅  ${transcribed} transcribed, ${skipped} skipped (${graphs} graph, ${skipped - graphs} other)`,
    );
  }
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
