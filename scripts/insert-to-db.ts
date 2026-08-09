/**
 * Step 3 — DB Insert
 * Generated JSON → Supabase (bypasses RLS via service-role key), is_published=false.
 *
 * Usage:
 *   npm run gen:insert -- --input scripts/generated/math-YYYY-MM-DDTHH-MM.json [--subject math] [--publish]
 *   npm run gen:insert -- --input scripts/verified-translations/math-....json --language kk [--publish]
 *
 * --language ru (default): input is GeneratedQuestion[] (topic_slug-based) — resolves
 *   subject/topic by slug, inserts with language='ru', source_question_id=null.
 * --language kk: input is TranslatedQuestion[] (scripts/translate-questions.ts →
 *   verify-translation.ts) — topic_id/context_id come straight from the JSON (same as
 *   the ru original, NOT re-resolved by slug), inserts with source_question_id set.
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  GeneratedQuestionSchema,
  ReferenceQuestionSchema,
  TranslatedQuestionSchema,
  type GeneratedQuestion,
  type ReferenceQuestion,
  type TranslatedQuestion,
} from './lib/schema';
import { resolveTopic } from './lib/topic-resolve';
import type { Locale } from '@/types/db';

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

function parseArgs(): { input: string; subject: string; publish: boolean; language: Locale } {
  const args = process.argv.slice(2);
  let input = '';
  let subject = 'math';
  let publish = false;
  let language: Locale = 'ru';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = expandPath(args[++i]);
    if (args[i] === '--subject' && args[i + 1]) subject = args[++i];
    if (args[i] === '--publish') publish = true;
    if (args[i] === '--language' && args[i + 1]) language = args[++i] as Locale;
  }
  if (!input) {
    console.error(
      'Usage: npm run gen:insert -- --input <path.json> [--subject math] [--language ru|kk] [--publish]',
    );
    process.exit(1);
  }
  if (language !== 'ru' && language !== 'kk') {
    console.error(`\n❌  --language must be "ru" or "kk", got "${language}"\n`);
    process.exit(1);
  }
  return { input, subject, publish, language };
}

interface TopicRow {
  id: string;
  slug: string;
}

interface SubjectRow {
  id: string;
}

/** Non-generic wrapper so ReturnType captures the same permissive client shape createClient(url, key, opts) infers at a real call site (a generic ReturnType<typeof createClient> resolves the function's default type params instead, which are far stricter). */
function createServiceClient(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false } });
}

type SupabaseServiceClient = ReturnType<typeof createServiceClient>;

/** Тянет subjects+topics для одного предмета; null (с warn) если предмет не найден в БД. */
async function fetchTopicMap(
  supabase: SupabaseServiceClient,
  subjectSlug: string,
): Promise<ReadonlyMap<string, string> | null> {
  const { data: subjectRow, error: subjectErr } = await supabase
    .from('subjects')
    .select('id')
    .eq('slug', subjectSlug)
    .single<SubjectRow>();

  if (subjectErr || !subjectRow) {
    console.warn(`  ⚠️  Предмет "${subjectSlug}" не найден в БД: ${subjectErr?.message ?? 'no data'}`);
    return null;
  }

  const { data: topicRows, error: topicsErr } = await supabase
    .from('topics')
    .select('id, slug')
    .eq('subject_id', subjectRow.id);

  if (topicsErr || !topicRows) {
    console.warn(`  ⚠️  Не удалось получить темы для "${subjectSlug}": ${topicsErr?.message ?? 'no data'}`);
    return null;
  }

  return new Map((topicRows as TopicRow[]).map((t) => [t.slug, t.id]));
}

async function insertRuQuestions(
  supabase: SupabaseServiceClient,
  rawBatch: unknown[],
  subject: string,
  publish: boolean,
): Promise<void> {
  type InsertCandidate = GeneratedQuestion | ReferenceQuestion;
  const questions: InsertCandidate[] = [];
  for (const item of rawBatch) {
    const genResult = GeneratedQuestionSchema.safeParse(item);
    if (genResult.success) {
      questions.push(genResult.data);
      continue;
    }
    const refResult = ReferenceQuestionSchema.safeParse(item);
    if (refResult.success) {
      questions.push(refResult.data);
      continue;
    }
    const record = item as Record<string, unknown>;
    const src = record.variant_of ?? record.source_file ?? '?';
    console.warn(
      `⚠️  Skipping invalid question (${String(src)}): ${genResult.error.issues[0]?.message ?? 'unknown'}`,
    );
  }

  if (questions.length === 0) {
    console.error('\n❌  No valid questions in input file.\n');
    process.exit(1);
  }

  console.log(
    `📋  Inserting ${questions.length} questions (default subject: ${subject}, language: ru, is_published: ${publish})\n`,
  );

  const neededSubjects = new Set<string>([subject]);
  for (const q of questions) {
    if (q.subject) neededSubjects.add(q.subject);
  }

  const topicMapsBySubject = new Map<string, ReadonlyMap<string, string> | null>();
  for (const s of neededSubjects) {
    topicMapsBySubject.set(s, await fetchTopicMap(supabase, s));
  }

  let inserted = 0;
  let failed = 0;

  for (const [i, q] of questions.entries()) {
    const resolution = resolveTopic(q, subject, topicMapsBySubject);
    if (resolution.kind === 'unknown_subject') {
      console.warn(`  ⚠️  Предмет "${resolution.subject}" недоступен в БД — задача пропущена`);
      failed++;
      continue;
    }
    if (resolution.kind === 'unknown_topic') {
      console.warn(
        `  ⚠️  No DB topic for slug "${resolution.topicSlug}" (${resolution.subject}) — skipped`,
      );
      failed++;
      continue;
    }

    const { error } = await supabase.from('questions').insert({
      topic_id: resolution.topicId,
      context_id: null,
      source_question_id: null,
      language: 'ru',
      type: q.type,
      difficulty: q.difficulty,
      body: q.body,
      explanation: q.explanation,
      source: 'ai_haiku',
      is_published: publish,
      sort_order: 1000 + i + 1,
    });

    if (error) {
      console.warn(`  ❌  Insert failed (${q.topic_slug}): ${error.message}`);
      failed++;
    } else {
      inserted++;
      process.stdout.write('.');
    }
  }

  console.log(`\n\n✅  Inserted: ${inserted}  Failed: ${failed}  Total: ${questions.length}`);
  console.log(
    publish
      ? `   Subjects: ${[...neededSubjects].join(', ')}  |  is_published: true  |  Задачи уже ЖИВЫЕ на сайте ✅\n`
      : `   Subjects: ${[...neededSubjects].join(', ')}  |  is_published: false  |  Ready for review at /admin/review\n`,
  );
}

async function insertKkTranslations(
  supabase: SupabaseServiceClient,
  rawBatch: unknown[],
  subject: string,
  publish: boolean,
): Promise<void> {
  const translations: TranslatedQuestion[] = [];
  for (const item of rawBatch) {
    const r = TranslatedQuestionSchema.safeParse(item);
    if (r.success) {
      translations.push(r.data);
    } else {
      const src = (item as Record<string, unknown>).source_question_id ?? '?';
      console.warn(
        `⚠️  Skipping invalid translation (${String(src)}): ${r.error.issues[0]?.message ?? 'unknown'}`,
      );
    }
  }

  if (translations.length === 0) {
    console.error('\n❌  No valid translations in input file.\n');
    process.exit(1);
  }

  console.log(
    `📋  Inserting ${translations.length} translations (subject: ${subject}, language: kk, is_published: ${publish})\n`,
  );

  let inserted = 0;
  let failed = 0;

  for (const t of translations) {
    const { error } = await supabase.from('questions').insert({
      topic_id: t.topic_id,
      context_id: t.context_id,
      source_question_id: t.source_question_id,
      language: 'kk',
      type: t.type,
      difficulty: t.difficulty,
      body: t.body,
      explanation: t.explanation,
      source: 'ai_haiku_translation',
      is_published: publish,
      sort_order: t.sort_order,
    });

    if (error) {
      console.warn(`  ❌  Insert failed (source ${t.source_question_id}): ${error.message}`);
      failed++;
    } else {
      inserted++;
      process.stdout.write('.');
    }
  }

  console.log(`\n\n✅  Inserted: ${inserted}  Failed: ${failed}  Total: ${translations.length}`);
  console.log(
    publish
      ? `   Subject: ${subject}  |  language: kk  |  is_published: true  |  Задачи уже ЖИВЫЕ на сайте ✅\n`
      : `   Subject: ${subject}  |  language: kk  |  is_published: false  |  Ready for review at /admin/review\n`,
  );
}

async function main() {
  loadEnv();

  const { input, subject, publish, language } = parseArgs();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      '\n❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n',
    );
    process.exit(1);
  }

  if (!fs.existsSync(input)) {
    console.error(`\n❌  Input file not found: ${input}\n`);
    process.exit(1);
  }

  console.log(`\n📥  ${input}`);
  const rawBatch = JSON.parse(fs.readFileSync(input, 'utf8')) as unknown[];

  // Service-role client bypasses RLS
  const supabase = createServiceClient(supabaseUrl, serviceRoleKey);

  if (language === 'kk') {
    await insertKkTranslations(supabase, rawBatch, subject, publish);
  } else {
    await insertRuQuestions(supabase, rawBatch, subject, publish);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
