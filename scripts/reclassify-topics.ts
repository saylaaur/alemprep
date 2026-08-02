/**
 * Реклассификация опубликованных задач предмета на официальные темы НЦТ
 * (scripts/data/official-topics.json, см. supabase/migrations/0019).
 *
 * Usage:
 *   npm run gen:reclassify -- --subject <slug> [--dry-run] [--sync] [--limit N]
 *
 * Читает опубликованные задачи предмета вместе с текущей темой, батчем через
 * Haiku классифицирует каждую по ОФИЦИАЛЬНОМУ списку тем предмета (условие +
 * варианты → ANSWER: {"topic_slug": "...", "confidence": 0..1}).
 *
 * Детерминантная проверка (не доверяем модели): вернувшийся topic_slug ОБЯЗАН
 * быть в официальном списке предмета, иначе задача остаётся на прежней теме.
 * confidence < 0.6 — тоже не трогаем. Пишет в БД ТОЛЬКО questions.topic_id.
 *
 * --dry-run: только отчёт, без записи — гнать первым делом.
 *
 * ⚠️  Уses paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output (batch: half that)
 */
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient, loadEnv } from './lib/db';
import { getTopicSlugs } from './lib/schema';
import { resolveModel } from './lib/models';
import {
  parseClassification,
  summarizeReclassification,
  type ClassificationOutcome,
  type ReclassificationItem,
} from './lib/reclassify';
import {
  collectBatchResults,
  describeFailure,
  indexCustomId,
  isSucceeded,
  mapResultsByCustomId,
  submitAndAwaitBatch,
} from './lib/batch';

const COST = { input: 1.0, output: 5.0 }; // USD per 1M tokens (Haiku, standard rate; batch is half)

function calcCost(inputTok: number, outputTok: number, costMultiplier: number): number {
  return ((inputTok * COST.input + outputTok * COST.output) / 1_000_000) * costMultiplier;
}

function parseArgs(): { subject: string; dryRun: boolean; sync: boolean; limit?: number } {
  const args = process.argv.slice(2);
  let subject = '';
  let dryRun = false;
  let sync = false;
  let limit: number | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--dry-run') dryRun = true;
    if (args[i] === '--sync') sync = true;
    if (args[i] === '--limit' && args[i + 1]) limit = parseInt(args[++i], 10);
  }
  if (!subject) {
    console.error(
      'Usage: npm run gen:reclassify -- --subject <slug> [--dry-run] [--sync] [--limit N]',
    );
    process.exit(1);
  }
  return { subject, dryRun, sync, limit };
}

interface SubjectRow {
  id: string;
  slug: string;
}

interface TopicRow {
  id: string;
  slug: string;
}

interface QuestionRow {
  id: string;
  type: string;
  body: Record<string, unknown>;
  topic_id: string;
}

function describeQuestion(body: Record<string, unknown>): string {
  const lines: string[] = [`Problem: ${String(body.stem ?? '')}`];
  if (Array.isArray(body.options)) {
    lines.push('Options:');
    for (const o of body.options as { id: string; content: string }[]) {
      lines.push(`  (${o.id}) ${o.content}`);
    }
  }
  if (Array.isArray(body.left)) {
    lines.push('Left items:');
    for (const l of body.left as { id: string; content: string }[]) {
      lines.push(`  ${l.id}) ${l.content}`);
    }
    lines.push(`Right list: ${JSON.stringify(body.right)}`);
  }
  return lines.join('\n');
}

function buildSystemInstruction(subject: string, officialSlugs: readonly string[]): string {
  const slugs = officialSlugs.join('|');
  return `You classify ЕНТ (Kazakhstan Unified National Testing) "${subject}" problems into the OFFICIAL topic taxonomy from the current NCT specification.

Given a problem's condition and answer options, pick the SINGLE best-matching topic from this exact list — never invent a slug outside it:
<${slugs}>

Work step by step (briefly), then on the LAST line output:
ANSWER: {"topic_slug": "<one of the slugs above, verbatim>", "confidence": <0..1>}

Rules:
- confidence reflects how certain you are the problem belongs to THAT SPECIFIC topic, not just that it's a valid problem.
- If the problem could plausibly fit more than one topic, pick the most specific match and lower confidence accordingly.
- Output ONLY your brief reasoning followed by the ANSWER line.`;
}

function buildClassifyParams(
  body: Record<string, unknown>,
  model: string,
  system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'],
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: 500,
    system,
    messages: [{ role: 'user', content: describeQuestion(body) }],
  };
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

function logOutcome(currentSlug: string, outcome: ClassificationOutcome): void {
  if (outcome.kind === 'classified') {
    const arrow = outcome.topicSlug === currentSlug ? '=' : '→';
    console.log(`✓  ${currentSlug} ${arrow} ${outcome.topicSlug}  [conf ${outcome.confidence.toFixed(2)}]`);
  } else if (outcome.kind === 'low_confidence') {
    console.log(`?  ${currentSlug} → ${outcome.topicSlug}  [conf ${outcome.confidence.toFixed(2)} < 0.6 — не трогаем]`);
  } else if (outcome.kind === 'invalid_slug') {
    console.log(`✗  slug вне списка: "${outcome.rawSlug}"  [conf ${outcome.confidence.toFixed(2)} — не трогаем]`);
  } else {
    console.log(`✗  ${outcome.reason}`);
  }
}

async function main() {
  loadEnv();
  const { subject, dryRun, sync, limit } = parseArgs();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('\n❌  ANTHROPIC_API_KEY not found in .env.local\n');
    process.exit(1);
  }

  const supabase = getServiceClient();

  const { data: subjectRow } = await supabase
    .from('subjects')
    .select('id, slug')
    .eq('slug', subject)
    .maybeSingle<SubjectRow>();
  if (!subjectRow) {
    console.error(`\n❌  Subject "${subject}" not found in DB\n`);
    process.exit(1);
  }

  const { data: topicRowsRaw } = await supabase
    .from('topics')
    .select('id, slug')
    .eq('subject_id', subjectRow.id);
  const topics = (topicRowsRaw ?? []) as TopicRow[];
  if (topics.length === 0) {
    console.error(`\n❌  No topics found for subject "${subject}"\n`);
    process.exit(1);
  }
  const topicIdBySlug = new Map(topics.map((t) => [t.slug, t.id]));
  const topicSlugById = new Map(topics.map((t) => [t.id, t.slug]));

  const { data: questionRowsRaw } = await supabase
    .from('questions')
    .select('id, type, body, topic_id')
    .eq('is_published', true)
    .in('topic_id', topics.map((t) => t.id))
    .range(0, 99_999);
  let questions = (questionRowsRaw ?? []) as QuestionRow[];
  if (limit !== undefined) questions = questions.slice(0, limit);

  if (questions.length === 0) {
    console.error(`\n❌  No published questions found for subject "${subject}"\n`);
    process.exit(1);
  }

  const officialSlugs = getTopicSlugs(subject);
  const model = resolveModel('RECLASSIFY_MODEL', 'claude-haiku-4-5-20251001');
  const mode = sync ? 'sync' : 'batch (−50%)';

  console.log(`\n📂  Subject: ${subject}`);
  console.log(
    `📋  Classifying ${questions.length} published question(s) against ${officialSlugs.length} official topics  [model: ${model}, mode: ${mode}${dryRun ? ', DRY RUN' : ''}]`,
  );
  console.log(`   ⚠️  Paid Anthropic account — Haiku 4.5: $1/1M input, $5/1M output\n`);

  const anthropic = new Anthropic({ apiKey });
  const system: Anthropic.Messages.MessageCreateParamsNonStreaming['system'] = [
    { type: 'text', text: buildSystemInstruction(subject, officialSlugs), cache_control: { type: 'ephemeral' } },
  ];

  const items: ReclassificationItem[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  const costMultiplier = sync ? 1 : 0.5;

  function record(
    q: QuestionRow,
    raw: string,
    inputTok: number,
    outputTok: number,
    cacheRead: number,
    cacheWrite: number,
  ): void {
    totalInput += inputTok;
    totalOutput += outputTok;
    totalCacheRead += cacheRead;
    totalCacheWrite += cacheWrite;
    const currentSlug = topicSlugById.get(q.topic_id) ?? '?';
    const outcome = parseClassification(raw, officialSlugs);
    items.push({ questionId: q.id, currentTopicSlug: currentSlug, outcome });
    logOutcome(currentSlug, outcome);
  }

  if (sync) {
    for (const q of questions) {
      const stem = String(q.body.stem ?? '').slice(0, 55);
      process.stdout.write(`  "${stem}…"  …  `);
      try {
        const response = await anthropic.messages.create(buildClassifyParams(q.body, model, system));
        record(
          q,
          extractText(response),
          response.usage.input_tokens,
          response.usage.output_tokens,
          response.usage.cache_read_input_tokens ?? 0,
          response.usage.cache_creation_input_tokens ?? 0,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        totalInput += 0;
        items.push({
          questionId: q.id,
          currentTopicSlug: topicSlugById.get(q.topic_id) ?? '?',
          outcome: { kind: 'parse_error', reason: `API error: ${msg}` },
        });
        console.log(`✗  API error: ${msg}`);
      }
    }
  } else {
    const built = questions.map((q, i) => ({
      customId: indexCustomId(i),
      q,
      params: buildClassifyParams(q.body, model, system),
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
      built.map(({ customId, q }) => ({ customId, item: q })),
      resultsMap,
    );

    for (const { item: q, result } of mapped) {
      const stem = String(q.body.stem ?? '').slice(0, 55);
      process.stdout.write(`  "${stem}…"  …  `);
      if (isSucceeded(result)) {
        const { message } = result.result;
        record(
          q,
          extractText(message),
          message.usage.input_tokens,
          message.usage.output_tokens,
          message.usage.cache_read_input_tokens ?? 0,
          message.usage.cache_creation_input_tokens ?? 0,
        );
      } else {
        items.push({
          questionId: q.id,
          currentTopicSlug: topicSlugById.get(q.topic_id) ?? '?',
          outcome: { kind: 'parse_error', reason: `batch: ${describeFailure(result)}` },
        });
        console.log(`✗  batch: ${describeFailure(result)}`);
      }
    }
  }

  // Пишем в БД ТОЛЬКО topic_id — только confidently-classified вопросы с
  // реально изменившейся темой. Ничего больше не трогаем.
  let written = 0;
  let skippedMissingTopic = 0;
  if (!dryRun) {
    for (const item of items) {
      if (item.outcome.kind !== 'classified') continue;
      if (item.outcome.topicSlug === item.currentTopicSlug) continue;
      const newTopicId = topicIdBySlug.get(item.outcome.topicSlug);
      if (!newTopicId) {
        // Официальная тема ещё не создана в БД — миграция 0019 не применена.
        skippedMissingTopic++;
        continue;
      }
      const { error } = await supabase
        .from('questions')
        .update({ topic_id: newTopicId })
        .eq('id', item.questionId);
      if (error) {
        console.warn(`  ❌  Update failed (${item.questionId}): ${error.message}`);
        continue;
      }
      written++;
    }
  }

  const summary = summarizeReclassification(items);
  const totalCost = calcCost(totalInput, totalOutput, costMultiplier);

  console.log(`\n📊  Сводка (${dryRun ? 'DRY RUN — ничего не записано' : `записано в БД: ${written}`}):`);
  console.log(`   всего проверено:                ${summary.total}`);
  console.log(`   переклассифицировано:           ${summary.reclassified}`);
  console.log(`   подтверждено (тема та же):      ${summary.confirmedUnchanged}`);
  console.log(
    `   не удалось классифицировать:    ${summary.unclassified}  (низкая уверенность: ${summary.lowConfidence}, слаг вне списка: ${summary.invalidSlug}, ошибка разбора: ${summary.parseErrors})`,
  );
  if (skippedMissingTopic > 0) {
    console.log(
      `   ⚠️  пропущено (тема ещё не в БД): ${skippedMissingTopic} — примените миграцию 0019 и прогоните снова`,
    );
  }
  console.log('   распределение по темам:');
  for (const [slug, count] of Object.entries(summary.distribution).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${slug}: ${count}`);
  }
  console.log(
    `\n💰  Tokens: ${totalInput} in / ${totalOutput} out  ~$${totalCost.toFixed(4)} USD  [${model}, ${sync ? 'standard' : 'batch −50%'} rate]`,
  );
  console.log(
    `🗄️  Cache: ${totalCacheWrite} written / ${totalCacheRead} read (system prompt cache_control — no effect until the prompt clears the model's minimum cacheable prefix)\n`,
  );
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
