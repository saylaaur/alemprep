import * as fs from 'node:fs';
import * as path from 'node:path';
import { getServiceClient } from './lib/db';
import { buildInventorySummary, type InventoryQuestion, type InventorySubject, type InventoryTopic } from './lib/production-inventory';

function outputPath(): string {
  const index = process.argv.indexOf('--output');
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : 'docs/qa/production-inventory.md';
}

async function readAllQuestions(): Promise<InventoryQuestion[]> {
  const supabase = getServiceClient();
  const pageSize = 1000;
  const questions: InventoryQuestion[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('questions')
      .select('topic_id, language, type, is_published')
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not read questions: ${error.message}`);
    const page = (data ?? []) as InventoryQuestion[];
    questions.push(...page);
    if (page.length < pageSize) return questions;
  }
}

async function main(): Promise<void> {
  const supabase = getServiceClient();
  const [questions, topicsResult, subjectsResult] = await Promise.all([
    readAllQuestions(),
    supabase.from('topics').select('id, subject_id'),
    supabase.from('subjects').select('id, slug').order('sort_order'),
  ]);
  if (topicsResult.error || subjectsResult.error) {
    throw new Error(`Could not read taxonomy: ${topicsResult.error?.message ?? subjectsResult.error?.message}`);
  }

  const summary = buildInventorySummary(
    questions,
    (topicsResult.data ?? []) as InventoryTopic[],
    (subjectsResult.data ?? []) as InventorySubject[],
  );
  const lines = [
    '# Инвентаризация production-контента',
    '',
    `Дата: ${new Date().toISOString()}`,
    '',
    'Отчёт содержит только агрегированные метаданные. Он не подтверждает предметную корректность задач и не заменяет приёмку редактором.',
    '',
    '## Общий объём',
    '',
    `- Всего: ${summary.total}`,
    `- Опубликовано: ${summary.published}`,
    `- Черновиков: ${summary.drafts}`,
    '',
    '## Опубликованные задачи по языку и формату',
    '',
    '| Язык | Один ответ | Несколько ответов | Сопоставление |',
    '| --- | ---: | ---: | ---: |',
    ...(['ru', 'kk'] as const).map(
      (language) => `| ${language} | ${summary.byLanguageAndType[language].single} | ${summary.byLanguageAndType[language].multi} | ${summary.byLanguageAndType[language].matching} |`,
    ),
    '',
    '## По предмету',
    '',
    '| Предмет | Опубликовано | Черновики |',
    '| --- | ---: | ---: |',
    ...summary.bySubject.map((subject) => `| ${subject.slug} | ${subject.published} | ${subject.drafts} |`),
    '',
  ];
  const target = outputPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, lines.join('\n'));
  console.log(`Inventory: ${summary.published} published, ${summary.drafts} drafts. Report: ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
