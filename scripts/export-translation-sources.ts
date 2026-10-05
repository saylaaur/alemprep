import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { getServiceClient } from './lib/db';
import { readAllPages } from '../lib/supabase/pagination';
import { requirePrivateArtifactPath } from './lib/translation-command';
import glossaryData from './lib/kk-glossary.json';
import {
  buildSourceBundles, parseExportCommand,
  type ExportContext, type ExportQuestion, type ExportTopic, type LineageRow,
} from './lib/translation-source-bundle';

/**
 * KT1, read-only: exports published RU sources of chosen topics in the friend-file format
 * (alemprep-ru-kk-review-source-v1), split into batches of at most 30. No DB writes, no API calls.
 *
 *   npm run content:export-sources -- --out-dir ~/alemprep-private/kk-export-2026-10-05
 *   npm run content:export-sources -- --topics progressions,powers --max-per-topic 40 --out-dir <dir>
 */
async function main() {
  const command = parseExportCommand(process.argv.slice(2));
  await requirePrivateArtifactPath(command.outDir, process.cwd());
  const supabase = getServiceClient();
  const [questions, topics, contexts, lineageRows, versions, publications] = await Promise.all([
    readAllPages<ExportQuestion>((from, to) => supabase.from('questions').select('id, topic_id, context_id, language, type, difficulty, body, explanation, is_published').eq('language', 'ru').eq('is_published', true).order('id').range(from, to), 'RU questions'),
    readAllPages<ExportTopic>((from, to) => supabase.from('topics').select('id, subject_id, slug, name_ru, name_kk, sort_order').order('id').range(from, to), 'topics'),
    readAllPages<ExportContext>((from, to) => supabase.from('contexts').select('id, language, title, content').order('id').range(from, to), 'contexts'),
    readAllPages<{ question_version_id: string; source_question_id: string; source_hash: string }>((from, to) => supabase.from('content_version_sources').select('question_version_id, source_question_id, source_hash').order('question_version_id').range(from, to), 'version lineage'),
    readAllPages<{ id: string; locale: 'ru' | 'kk' }>((from, to) => supabase.from('question_versions').select('id, locale').order('id').range(from, to), 'question versions'),
    readAllPages<{ question_version_id: string; status: LineageRow['status'] }>((from, to) => supabase.from('question_publications').select('question_version_id, status').order('question_version_id').range(from, to), 'publications'),
  ]);
  const locale = new Map(versions.map(v => [v.id, v.locale]));
  const status = new Map(publications.map(p => [p.question_version_id, p.status]));
  const lineage: LineageRow[] = lineageRows.map(row => ({
    questionVersionId: row.question_version_id, sourceQuestionId: row.source_question_id, sourceHash: row.source_hash,
    locale: locale.get(row.question_version_id) ?? 'ru', status: status.get(row.question_version_id) ?? null,
  }));
  const glossary = z.record(z.string(), z.string()).parse(glossaryData);
  const generatedAt = new Date().toISOString();
  const { bundles, manifests, summary } = buildSourceBundles({ questions, topics, contexts, lineage, glossary, selection: command.selection, generatedAt });
  if (!bundles.length) throw new Error('No published RU sources for the selected topics');

  await mkdir(command.outDir, { recursive: true, mode: 0o700 });
  // flag 'wx': never overwrite an earlier export that may already be under translation.
  for (const [index, bundle] of bundles.entries()) {
    const name = `ru-sources-${String(index + 1).padStart(3, '0')}.json`;
    await writeFile(join(command.outDir, name), JSON.stringify(bundle, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
  await writeFile(join(command.outDir, 'manifests.json'), JSON.stringify({ generatedAt, selection: command.selection, summary, manifests }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.table(summary);
  console.log(`Read-only export: ${bundles.reduce((n, b) => n + b.sources.length, 0)} RU sources in ${bundles.length} files -> ${command.outDir}`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Export failed'); process.exitCode = 1; });
