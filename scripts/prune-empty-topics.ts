/**
 * Чистка старых тем: удаляет темы, у которых 0 задач И которых нет в
 * официальной спецификации НЦТ (scripts/data/official-topics.json).
 *
 * Usage:
 *   npm run gen:prune-topics -- [--dry-run]
 *
 * ⚠️  Только пустые. Тема с хотя бы одной задачей (опубликованной или нет)
 * не удаляется НИКОГДА, официальная она или нет — попадает в отчёт для
 * ручного разбора владельцем. Официальная тема не удаляется никогда, даже
 * без единой задачи (это и есть цель миграции 0019, не мусор).
 *
 * Идемпотентно: повторный запуск не находит уже удалённых тем и ничего не делает.
 */
import { getServiceClient, loadEnv } from './lib/db';
import { getTopicSlugs } from './lib/schema';
import { decidePruning, summarizePruning, type TopicForPruning } from './lib/prune-topics';

function parseArgs(): { dryRun: boolean } {
  const args = process.argv.slice(2);
  return { dryRun: args.includes('--dry-run') };
}

interface SubjectRow {
  id: string;
  slug: string;
}

interface TopicRow {
  id: string;
  slug: string;
  name_ru: string;
  subject_id: string;
}

async function main() {
  loadEnv();
  const { dryRun } = parseArgs();
  const supabase = getServiceClient();

  const { data: subjectRows } = await supabase.from('subjects').select('id, slug');
  const subjects = (subjectRows ?? []) as SubjectRow[];
  if (subjects.length === 0) {
    console.error('\n❌  No subjects found in DB\n');
    process.exit(1);
  }
  const subjectSlugById = new Map(subjects.map((s) => [s.id, s.slug]));

  const { data: topicRows } = await supabase
    .from('topics')
    .select('id, slug, name_ru, subject_id')
    .range(0, 99_999);
  const topics = (topicRows ?? []) as TopicRow[];

  const { data: questionRows } = await supabase.from('questions').select('id, topic_id').range(0, 99_999);
  const questionCountByTopic = new Map<string, number>();
  for (const q of (questionRows ?? []) as { id: string; topic_id: string }[]) {
    questionCountByTopic.set(q.topic_id, (questionCountByTopic.get(q.topic_id) ?? 0) + 1);
  }

  const officialSlugsBySubject: Record<string, readonly string[]> = {};
  for (const s of subjects) officialSlugsBySubject[s.slug] = getTopicSlugs(s.slug);

  const topicsForPruning: TopicForPruning[] = topics.map((t) => ({
    id: t.id,
    slug: t.slug,
    subjectSlug: subjectSlugById.get(t.subject_id) ?? '?',
    nameRu: t.name_ru,
    questionCount: questionCountByTopic.get(t.id) ?? 0,
  }));

  const decisions = decidePruning(topicsForPruning, officialSlugsBySubject);
  const summary = summarizePruning(decisions);

  console.log(`\n📋  ${topics.length} topic(s) across ${subjects.length} subject(s)  [${dryRun ? 'DRY RUN' : 'LIVE'}]\n`);

  let deletedCount = 0;
  if (summary.deleted.length > 0) {
    console.log(`🗑️  ${dryRun ? 'Would delete' : 'Deleting'} ${summary.deleted.length} empty, non-official topic(s):`);
    for (const t of summary.deleted) {
      console.log(`   - [${t.subjectSlug}] ${t.slug} — "${t.nameRu}"`);
    }
    if (!dryRun) {
      const { error } = await supabase
        .from('topics')
        .delete()
        .in('id', summary.deleted.map((t) => t.id));
      if (error) {
        console.error(`\n❌  Delete failed: ${error.message}\n`);
        process.exit(1);
      }
      deletedCount = summary.deleted.length;
    }
    console.log('');
  } else {
    console.log('✅  No empty non-official topics to delete.\n');
  }

  if (summary.needsReview.length > 0) {
    console.log(`⚠️  ${summary.needsReview.length} non-official topic(s) still have questions — needs manual review:`);
    for (const t of summary.needsReview) {
      console.log(`   - [${t.subjectSlug}] ${t.slug} — "${t.nameRu}"  (${t.questionCount} question(s))`);
    }
    console.log('');
  }

  console.log(`📊  Сводка: удалено ${dryRun ? 0 : deletedCount}${dryRun ? ` (было бы: ${summary.deleted.length})` : ''}, требует внимания ${summary.needsReview.length}, официальных тем сохранено ${summary.keptOfficial}\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
