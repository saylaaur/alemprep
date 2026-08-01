/**
 * Глоссарий терминов ru→kk для переводчика (scripts/translate-questions.ts).
 * Засевается АВТОМАТИЧЕСКИ из того, что уже есть и проверено в БД: названия
 * предметов (subjects.name_ru → name_kk) и тем (topics.name_ru → name_kk).
 * Дальше глоссарий расширяется ВРУЧНУЮ — владелец проекта, носитель языка,
 * дополняет scripts/lib/kk-glossary.json своими терминами.
 *
 * Повторный запуск НЕ стирает ручные добавления: файл читается, записи из
 * БД накладываются поверх (обновляют только свои ключи), результат — merge.
 *
 * Usage:
 *   npm run gen:glossary
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

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

interface NamedRow {
  name_ru: string;
  name_kk: string;
}

async function main() {
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      '\n❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local\n',
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const [{ data: subjects, error: subjErr }, { data: topics, error: topicErr }] =
    await Promise.all([
      supabase.from('subjects').select('name_ru, name_kk'),
      supabase.from('topics').select('name_ru, name_kk'),
    ]);

  if (subjErr || !subjects) {
    console.error(`\n❌  Failed to fetch subjects: ${subjErr?.message ?? 'no data'}\n`);
    process.exit(1);
  }
  if (topicErr || !topics) {
    console.error(`\n❌  Failed to fetch topics: ${topicErr?.message ?? 'no data'}\n`);
    process.exit(1);
  }

  const outFile = path.join(process.cwd(), 'scripts', 'lib', 'kk-glossary.json');
  const existing: Record<string, string> = fs.existsSync(outFile)
    ? JSON.parse(fs.readFileSync(outFile, 'utf8'))
    : {};

  const fromDb = [...(subjects as NamedRow[]), ...(topics as NamedRow[])];
  let added = 0;
  let updated = 0;
  const merged = { ...existing };
  for (const { name_ru, name_kk } of fromDb) {
    if (!name_ru || !name_kk) continue;
    if (!(name_ru in merged)) added++;
    else if (merged[name_ru] !== name_kk) updated++;
    merged[name_ru] = name_kk;
  }

  const sorted = Object.fromEntries(
    Object.entries(merged).sort(([a], [b]) => a.localeCompare(b, 'ru')),
  );

  fs.writeFileSync(outFile, JSON.stringify(sorted, null, 2) + '\n');

  console.log(`\n✅  Glossary: ${Object.keys(sorted).length} terms (${added} added, ${updated} updated from DB)`);
  console.log(`   Subjects: ${subjects.length}  |  Topics: ${topics.length}`);
  console.log(`📄  Saved → ${outFile}`);
  console.log(`   → расширяй вручную; повторный запуск не стирает ручные добавления\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
