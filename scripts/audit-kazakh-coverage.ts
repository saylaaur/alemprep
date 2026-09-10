import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { getServiceClient } from './lib/db';
import { readAllPages } from '../lib/supabase/pagination';
import { collectText, estimateBudget, pairStatus, questionFeatures, questionSourceHash, selectSample, type CoverageQuestion } from './lib/kazakh-coverage';
import type { Context } from '@/types/db';

function argument(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

const checkpointSchema = z.object({
  sources: z.array(z.object({ translationId: z.string(), sourceHash: z.string() })).default([]),
  texts: z.array(z.object({ textHash: z.string(), locale: z.enum(['ru', 'kk']), status: z.enum(['completed', 'pending']) })).default([]),
});

async function main(): Promise<void> {
  const supabase = getServiceClient();
  const checkpointPath = argument('--checkpoint');
  const checkpoint = checkpointSchema.parse(checkpointPath ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) : {});
  const [questions, topics, subjects, contextRows] = await Promise.all([
    readAllPages<CoverageQuestion>((from, to) => supabase.from('questions').select('id, topic_id, context_id, language, type, difficulty, body, explanation, source_question_id, is_published').order('id').range(from, to), 'question inventory'),
    readAllPages<{ id: string; subject_id: string; slug: string }>((from, to) => supabase.from('topics').select('id, subject_id, slug').order('id').range(from, to), 'topic inventory'),
    readAllPages<{ id: string; slug: string }>((from, to) => supabase.from('subjects').select('id, slug').order('id').range(from, to), 'subject inventory'),
    readAllPages<Pick<Context, 'id' | 'language' | 'title' | 'content'>>((from, to) => supabase.from('contexts').select('id, language, title, content').order('id').range(from, to), 'context inventory'),
  ]);
  const contexts = new Map(contextRows.map(context => [context.id, context]));
  const publishedSources = questions.filter(q => q.language === 'ru' && q.is_published);
  const translations = questions.filter(q => q.language === 'kk');
  const sourceIds = new Set(questions.filter(q => q.language === 'ru').map(q => q.id));
  const statuses = new Map(publishedSources.map(q => [q.id, pairStatus(q, translations, contexts, checkpoint.sources)]));
  const missingContexts = questions.filter(q => q.is_published && q.context_id && contexts.get(q.context_id)?.language !== q.language);
  const mathId = subjects.find(s => s.slug === 'math')?.id;
  const mathTopics = new Set(topics.filter(t => t.subject_id === mathId).map(t => t.id));
  const radicals = new Set(topics.filter(t => t.slug === 'radicals-and-expressions').map(t => t.id));
  const mathPool = publishedSources.filter(q => mathTopics.has(q.topic_id));
  const sample = selectSample(mathPool, contexts, radicals);
  const budget = (pool: CoverageQuestion[]) => estimateBudget(pool.flatMap(q => collectText(q, q.context_id ? contexts.get(q.context_id) : undefined)), checkpoint.texts);
  const measured = [['Пробные 30 (фактически ' + sample.questions.length + ')', sample.questions], ['Первые 200 математики (техническая оценка)', [...mathPool].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 200)], ['Весь опубликованный RU-банк', publishedSources]] as const;
  const timestamp = new Date().toISOString();
  const manifest = {
    schema: 'alemprep-kk-source-sample-v1', timestamp, preliminary: true, subject: 'math',
    humanReviewed: false, missingFeatures: sample.missingFeatures,
    questions: sample.questions.map(q => ({ id: q.id, topicId: q.topic_id, sourceHash: questionSourceHash(q, contexts), features: [...questionFeatures(q, contexts, radicals)] })),
  };
  const manifestTarget = path.resolve(argument('--manifest', '/private/tmp/alemprep-kk-source-sample.json')!);
  // Real source references belong outside the repository, even though this manifest contains no text.
  const relative = path.relative(path.resolve(__dirname, '..'), manifestTarget);
  if (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) throw new Error('Write the private source manifest outside the repository');
  const lines = [
    '# Покрытие казахского контента и предварительная смета', '', `Read-only snapshot: ${timestamp}.`, '',
    'Снимок production, только агрегаты. Наличие публикации не подтверждает правильность, права на исходник или человеческую приёмку. Записи БД и Translation API не вызываются. Несколько чтений не являются транзакционным снимком; повторить перед выпуском партии.', '',
    `Всего вопросов: ${questions.length}; опубликовано RU: ${publishedSources.length}; опубликовано KK: ${translations.filter(q => q.is_published).length}; черновиков всех языков: ${questions.filter(q => !q.is_published).length}.`,
    `Отсутствующий/другого языка контекст у опубликованных вопросов: ${missingContexts.length}. KK без существующего RU source_question_id: ${translations.filter(q => !q.source_question_id || !sourceIds.has(q.source_question_id)).length}.`, '',
    '## Связанные RU → KK пары', '',
    '| Состояние пары для опубликованного RU | Количество |', '| --- | ---: |',
    ...(['missing', 'draft', 'published-unverified', 'stale', 'duplicate'] as const).map(status => `| ${status} | ${[...statuses.values()].filter(value => value === status).length} |`), '',
    'Свежесть нельзя доказать одним source_question_id: в текущей схеме нет source hash перевода. Без внешнего checkpoint опубликованная пара остаётся published-unverified. Даже совпавший hash не подтверждает человеческую приёмку; drafts/duplicates/stale направляются на review, не перезаписываются.', '',
    '## По предметам и темам', '',
    '| Предмет / тема | RU опублик. | RU draft | KK опублик. | KK draft | Нет пары | Stale |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const subject of subjects) {
    for (const topic of topics.filter(t => t.subject_id === subject.id)) {
      const pool = questions.filter(q => q.topic_id === topic.id);
      const count = (language: string, published: boolean) => pool.filter(q => q.language === language && q.is_published === published).length;
      lines.push(`| ${subject.slug} / ${topic.slug} | ${count('ru', true)} | ${count('ru', false)} | ${count('kk', true)} | ${count('kk', false)} | ${pool.filter(q => statuses.get(q.id) === 'missing').length} | ${pool.filter(q => statuses.get(q.id) === 'stale').length} |`);
    }
  }
  lines.push('', '## Предварительная стоимость NMT', '',
    'Считаются Unicode code points естественного текста: условие (stem_blocks заменяет stem), варианты и matching labels, объяснения, context title/content, заголовки/ячейки таблиц. Формулы в delimiters и latex blocks, URL изображений, IDs и ключи ответов исключены. Полей alt/caption у изображений в текущей схеме нет: подписи внутри картинки требуют отдельной ручной обработки.', '',
    'Это оценка после грубого удаления формул, не точный платёж: C00b пересчитает сериализованный payload с placeholders. Точная строковая дедупликация; общий контекст оплачивается однократно. Checkpoint экономит только на совпавшем text hash с completed и target kk. Наличие неиспользованного кредита в аккаунте неизвестно.', '',
    'Допущение: [Google NMT — $20 за миллион символов, кредит $10/месяц](https://cloud.google.com/translate/pricing), без налогов, проверки человеком и повторных запросов. Лимит бюджета должен задаваться в C00b до платного запуска.', '',
    '| Объём | Символов до dedup | Уникальных | Осталось с checkpoint | USD без кредита | USD если весь кредит свободен |', '| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const [label, pool] of measured) {
    const estimate = budget(pool);
    lines.push(`| ${label} | ${estimate.rawCharacters} | ${estimate.uniqueCharacters} | ${estimate.remainingCharacters} | ${estimate.usdBeforeCredit.toFixed(2)} | ${estimate.usdIfFullMonthlyCreditAvailable.toFixed(2)} |`);
  }
  lines.push('', '## Пробная выборка', '',
    `Выбрано ${sample.questions.length} RU-задач математики. Это предварительная техническая выборка для проверки перевода, не утверждённая программа уроков. Классы и темы школа ещё не подтвердила. Не найденные признаки: ${sample.missingFeatures.join(', ') || 'нет'}.`, '',
    'В закрытом manifest — только IDs, source hashes и признаки. Исходные тексты и ответы в публичный отчёт не включены. Материалы для первых уроков (30–50 принятых пар), следующие 100–200 и reviewers утверждаются отдельно; выборка для перевода не даёт допуск к пилоту.', '',
    'Повтор: `npm run audit:kk -- --output /private/tmp/kk-coverage.md --manifest /private/tmp/kk-source-sample.json` из окружения с service-role. Опционально `--checkpoint /private/path/checkpoint.json` с `{sources:[{translationId,sourceHash}],texts:[{textHash,locale,status}]}`. Это read-only инструмент, не импорт существующих production переводов.', '');
  const reportTarget = argument('--output', 'docs/qa/kazakh-coverage.md')!;
  fs.mkdirSync(path.dirname(reportTarget), { recursive: true });
  fs.mkdirSync(path.dirname(manifestTarget), { recursive: true });
  fs.writeFileSync(manifestTarget, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  fs.writeFileSync(reportTarget, lines.join('\n'));
  console.log(`Read-only coverage: RU ${publishedSources.length}, KK ${translations.filter(q => q.is_published).length}. Report: ${reportTarget}. Private sample: ${manifestTarget}`);
}

main().catch(() => { console.error('Coverage audit failed; no successful report claimed. Check credentials, query availability and checkpoint format.'); process.exitCode = 1; });
