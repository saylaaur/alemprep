/**
 * Детерминированный аудит локальных verified-выпусков.
 *
 * Usage:
 *   npm run audit:content -- --input scripts/verified --output docs/qa/content-audit-local.md
 *
 * Не меняет БД и JSON с задачами. Результат — очередь для предметного редактора:
 * blocker запрещает публикацию, review требует ручной вычитки.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { auditQuestionFiles, type ContentAuditFile } from './lib/content-audit';
import { GeneratedQuestionSchema, type GeneratedQuestion } from './lib/schema';

function parseArgs(): { input: string; output: string } {
  const args = process.argv.slice(2);
  let input = 'scripts/verified';
  let output = 'docs/qa/content-audit-local.md';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = args[++i];
    if (args[i] === '--output' && args[i + 1]) output = args[++i];
  }

  return { input, output };
}

function jsonFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return jsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  });
}

function readQuestionFiles(input: string): ContentAuditFile[] {
  const files = jsonFiles(input).sort();
  return files.map((filePath) => {
    const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(raw)) throw new Error(`${filePath}: expected a JSON array`);

    const questions: GeneratedQuestion[] = raw.map((item, questionIndex) => {
      const result = GeneratedQuestionSchema.safeParse(item);
      if (!result.success) {
        throw new Error(
          `${filePath} question ${questionIndex + 1}: ${result.error.issues[0]?.message ?? 'invalid question'}`,
        );
      }
      return result.data;
    });
    return { filePath, questions };
  });
}

function renderReport(input: string, audit: ReturnType<typeof auditQuestionFiles>): string {
  const byCode = new Map<string, number>();
  for (const finding of audit.findings) {
    byCode.set(finding.code, (byCode.get(finding.code) ?? 0) + 1);
  }

  const lines = [
    '# Локальный аудит контента',
    '',
    `Источник: \`${input}\``,
    `Дата: ${new Date().toISOString()}`,
    '',
    '## Итог',
    '',
    `- Файлов: ${audit.summary.files}`,
    `- Заданий: ${audit.summary.questions}`,
    `- Блокирующих публикацию: ${audit.summary.blockers}`,
    `- На ручную проверку: ${audit.summary.reviews}`,
    '',
    '## По типу проблемы',
    '',
    '| Код | Количество |',
    '| --- | ---: |',
    ...[...byCode.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => `| ${code} | ${count} |`),
    '',
    '## Очередь редактора',
    '',
    '| Статус | Код | Файл | № задачи в файле | Причина |',
    '| --- | --- | --- | ---: | --- |',
    ...audit.findings.map(
      (finding) =>
        `| ${finding.severity} | ${finding.code} | \`${finding.filePath}\` | ${finding.questionIndex + 1} | ${finding.detail} |`,
    ),
    '',
    'Результат детерминированной проверки не подтверждает предметную корректность. Каждую строку review должен принять или отклонить предметный редактор.',
    '',
  ];

  return lines.join('\n');
}

function main(): void {
  const { input, output } = parseArgs();
  if (!fs.existsSync(input)) throw new Error(`Input directory not found: ${input}`);

  const audit = auditQuestionFiles(readQuestionFiles(input));
  const report = renderReport(input, audit);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, report);

  console.log(`Audited ${audit.summary.questions} questions from ${audit.summary.files} files.`);
  console.log(`Blockers: ${audit.summary.blockers}; manual review: ${audit.summary.reviews}.`);
  console.log(`Report: ${output}`);
}

main();
