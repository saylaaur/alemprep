import { createHash } from 'node:crypto';
import type { ContentBlock, Context, Locale, Question } from '@/types/db';

export type CoverageQuestion = Pick<Question, 'id' | 'topic_id' | 'context_id' | 'language' | 'type' | 'difficulty' | 'body' | 'explanation' | 'source_question_id' | 'is_published'>;
export type CoverageContext = Pick<Context, 'title' | 'content'>;
export type SourceCheckpoint = { translationId: string; sourceHash: string };
export type TextCheckpoint = { textHash: string; locale: Locale; status: 'completed' | 'pending' };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function sourceHash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function questionSourceHash(question: CoverageQuestion, contexts: ReadonlyMap<string, CoverageContext>): string {
  const { topic_id, type, difficulty, body, explanation, context_id } = question;
  return sourceHash({ topic_id, type, difficulty, body, explanation, context_id, context: context_id ? contexts.get(context_id) ?? null : null });
}

/** Read-only estimate. C00b must mask/restore math and price the actual request payload. */
function naturalText(value: string): string {
  return value.replace(/\$\$[\s\S]*?\$\$|\$[^$]*?\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g, '').trim();
}

function blockText(blocks: ContentBlock[]): string[] {
  return blocks.flatMap(block => {
    if (block.type === 'latex' || block.type === 'image') return [];
    if (block.type === 'table') return [...block.columns, ...block.rows.flat()];
    return [block.value];
  });
}

export function collectText(question: CoverageQuestion, context?: CoverageContext): string[] {
  const body = question.body;
  const fields = body.stem_blocks?.length ? blockText(body.stem_blocks) : [body.stem];
  if ('options' in body) fields.push(...body.options.map(option => option.content));
  if ('left' in body) fields.push(...body.left.map(option => option.content), ...body.right);
  fields.push(...blockText(question.explanation?.blocks ?? []));
  if (context) fields.push(context.title ?? '', ...blockText(context.content.blocks));
  return fields.map(naturalText).filter(text => /\p{L}/u.test(text));
}

export function estimateBudget(texts: readonly string[], checkpoint: readonly TextCheckpoint[] = []) {
  const count = (values: readonly string[]) => values.reduce((sum, text) => sum + [...text].length, 0);
  const unique = [...new Set(texts)];
  const done = new Set(checkpoint.filter(item => item.locale === 'kk' && item.status === 'completed').map(item => item.textHash));
  const remainingCharacters = count(unique.filter(text => !done.has(sourceHash(text))));
  return {
    rawCharacters: count(texts), uniqueCharacters: count(unique), remainingCharacters,
    // Assumption for NMT only, no claim of unused account credit. USD, excluding taxes.
    usdBeforeCredit: remainingCharacters / 1_000_000 * 20,
    usdIfFullMonthlyCreditAvailable: Math.max(0, remainingCharacters - 500_000) / 1_000_000 * 20,
  };
}

export function pairStatus(
  source: CoverageQuestion,
  translations: readonly CoverageQuestion[],
  contexts: ReadonlyMap<string, CoverageContext>,
  checkpoint: readonly SourceCheckpoint[] = [],
): 'missing' | 'draft' | 'published-unverified' | 'stale' | 'duplicate' {
  const pairs = translations.filter(q => q.language === 'kk' && q.source_question_id === source.id);
  if (!pairs.length) return 'missing';
  if (pairs.length > 1) return 'duplicate';
  const pair = pairs[0];
  const prior = checkpoint.find(item => item.translationId === pair.id);
  if (pair.topic_id !== source.topic_id || pair.type !== source.type || (prior && prior.sourceHash !== questionSourceHash(source, contexts))) return 'stale';
  // Publication alone never proves linguistic/mathematical review or freshness.
  return pair.is_published ? 'published-unverified' : 'draft';
}

const desiredFeatures = ['radicals', 'single', 'multi', 'matching', 'context', 'table', 'formula', 'text-option', 'negation'] as const;
export type SampleFeature = typeof desiredFeatures[number];

export function questionFeatures(question: CoverageQuestion, contexts: ReadonlyMap<string, CoverageContext>, radicalTopicIds: ReadonlySet<string>): Set<SampleFeature> {
  const features = new Set<SampleFeature>([question.type]);
  if (radicalTopicIds.has(question.topic_id)) features.add('radicals');
  if (question.context_id && contexts.has(question.context_id)) features.add('context');
  const blocks = [...(question.body.stem_blocks ?? []), ...(question.explanation?.blocks ?? []), ...(contexts.get(question.context_id ?? '')?.content.blocks ?? [])];
  if (blocks.some(block => block.type === 'table')) features.add('table');
  if (blocks.some(block => block.type === 'latex') || /\$|\\\(|\\\[/.test(JSON.stringify(question.body))) features.add('formula');
  const options = 'options' in question.body ? question.body.options.map(item => item.content) : [...question.body.left.map(item => item.content), ...question.body.right];
  if (options.some(text => /[а-яё]/i.test(naturalText(text)))) features.add('text-option');
  if (/(?:^|\s)(?:не|нет|кроме)(?:\s|[.,!?]|$)/i.test(collectText(question).join(' '))) features.add('negation');
  return features;
}

export function selectSample(
  pool: readonly CoverageQuestion[], contexts: ReadonlyMap<string, CoverageContext>, radicalTopicIds: ReadonlySet<string>, limit = 30,
) {
  const candidates = pool.filter(q => q.language === 'ru' && q.is_published).slice().sort((a, b) => a.id.localeCompare(b.id));
  const selected = new Map<string, CoverageQuestion>();
  const features = new Map(candidates.map(q => [q.id, questionFeatures(q, contexts, radicalTopicIds)]));
  for (const feature of desiredFeatures) {
    if ([...selected.keys()].some(id => features.get(id)!.has(feature))) continue;
    const question = candidates.find(q => features.get(q.id)!.has(feature));
    if (question && selected.size < limit) selected.set(question.id, question);
  }
  // Add topic diversity before filling; this is a technical translation sample, not an approved syllabus.
  for (const question of candidates) {
    if (selected.size >= limit) break;
    if (![...selected.values()].some(q => q.topic_id === question.topic_id)) selected.set(question.id, question);
  }
  for (const question of candidates) {
    if (selected.size >= limit) break;
    selected.set(question.id, question);
  }
  return { questions: [...selected.values()], missingFeatures: desiredFeatures.filter(feature => ![...selected.keys()].some(id => features.get(id)!.has(feature))) };
}
