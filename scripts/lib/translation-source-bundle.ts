import { sourceHash } from './kazakh-coverage';
import type { Context, Question } from '@/types/db';

export type SourceRef = { id: string; sourceHash: string };
export type BatchManifest = { schema: 'alemprep-kk-source-sample-v1'; questions: SourceRef[] };

export type ExportQuestion = Pick<Question, 'id' | 'topic_id' | 'context_id' | 'language' | 'type' | 'difficulty' | 'body' | 'explanation' | 'is_published'>;
export type ExportContext = Pick<Context, 'id' | 'language' | 'title' | 'content'>;
export type ExportTopic = { id: string; subject_id: string; slug: string; name_ru: string; name_kk: string | null; sort_order?: number | null };
/** One row of 0038 lineage (content_version_sources) joined with its version locale and publication status. */
export type LineageRow = { questionVersionId: string; sourceQuestionId: string; sourceHash: string; locale: 'ru' | 'kk'; status: 'draft' | 'approved' | 'quarantined' | null };

export type BundleSource = {
  sourceId: string; sourceHash: string;
  topic: { id: string; subject_id: string; slug: string; name_ru: string; name_kk: string | null };
  question: Pick<ExportQuestion, 'type' | 'difficulty' | 'body' | 'explanation'>;
  context: ReturnType<typeof sourceSnapshot>['context'];
  versionCandidates: Array<{ questionVersionId: string; locale: 'ru' | 'kk'; status: LineageRow['status']; sameSourceHash: boolean }>;
  sourceAcceptance: 'ru-approved-same-hash' | 'not-human-verified-by-this-export';
};

export type ExportSelection = {
  topicSlugs: readonly string[];
  maxPerTopic: number;
  includeImages: boolean;
};

/** Pilot default: the approved progressions first, then the next ENT math topics. About 150–200 sources. */
export const PILOT_TWO_WEEK_TOPICS = [
  'progressions', 'powers', 'radicals-and-expressions', 'algebraic-expressions',
  'linear-quadratic-rational-equations', 'inequalities',
] as const;

const MAX_BATCH = 30;

/** Same shape as SQL content_source_snapshot_v1 (0038), so the hash matches the RU/KK importers. */
export function sourceSnapshot(question: ExportQuestion, contexts: ReadonlyMap<string, ExportContext>) {
  const context = question.context_id ? contexts.get(question.context_id) ?? null : null;
  return {
    topic_id: question.topic_id, type: question.type, difficulty: question.difficulty,
    body: question.body, explanation: question.explanation, context_id: question.context_id,
    context: context ? { id: context.id, language: context.language, title: context.title, content: context.content } : null,
  };
}

function hasImage(question: ExportQuestion, contexts: ReadonlyMap<string, ExportContext>): boolean {
  const blocks = [...(question.body.stem_blocks ?? []), ...(question.explanation?.blocks ?? []),
    ...(question.context_id ? contexts.get(question.context_id)?.content.blocks ?? [] : [])];
  return blocks.some(block => block.type === 'image');
}

export function splitSourceManifests(sources: readonly SourceRef[]): BatchManifest[] {
  if (new Set(sources.map(s => s.id)).size !== sources.length) throw new Error('Duplicate source reference');
  const batches: BatchManifest[] = [];
  for (let i = 0; i < sources.length; i += MAX_BATCH) {
    batches.push({ schema: 'alemprep-kk-source-sample-v1', questions: sources.slice(i, i + MAX_BATCH).map(s => ({ id: s.id, sourceHash: s.sourceHash })) });
  }
  return batches;
}

export function buildSourceBundles(input: {
  questions: readonly ExportQuestion[]; topics: readonly ExportTopic[]; contexts: readonly ExportContext[];
  lineage: readonly LineageRow[]; glossary: Record<string, string>; selection: ExportSelection; generatedAt: string;
}) {
  const { selection } = input;
  if (!selection.topicSlugs.length) throw new Error('No topics selected');
  if (!Number.isInteger(selection.maxPerTopic) || selection.maxPerTopic < 1) throw new Error('Invalid max per topic');
  const contexts = new Map(input.contexts.map(c => [c.id, c]));
  const missing = selection.topicSlugs.filter(slug => !input.topics.some(t => t.slug === slug));
  if (missing.length) throw new Error(`Unknown topics: ${missing.join(', ')}`);

  const summary: Array<{ slug: string; available: number; approvedRu: number; skippedImages: number; selected: number }> = [];
  const sources: BundleSource[] = [];
  for (const slug of selection.topicSlugs) {
    // The same slug may exist under several subjects; keep them all, in a stable order.
    const topicRows = input.topics.filter(t => t.slug === slug).slice().sort((a, b) => a.id.localeCompare(b.id));
    const topicIds = new Set(topicRows.map(t => t.id));
    const pool = input.questions.filter(q => q.language === 'ru' && q.is_published && topicIds.has(q.topic_id));
    const withState = pool.map(question => {
      const snapshot = sourceSnapshot(question, contexts);
      const hash = sourceHash(snapshot);
      const versions = input.lineage.filter(l => l.sourceQuestionId === question.id);
      const approvedRu = versions.some(v => v.locale === 'ru' && v.status === 'approved' && v.sourceHash === hash);
      return { question, hash, versions, approvedRu, image: hasImage(question, contexts) };
    });
    const eligible = withState.filter(s => selection.includeImages || !s.image || s.approvedRu);
    // Approved RU sources first (a KK version can attach to them now), then easier tasks, then id.
    eligible.sort((a, b) => Number(b.approvedRu) - Number(a.approvedRu) || a.question.difficulty - b.question.difficulty || a.question.id.localeCompare(b.question.id));
    const picked = eligible.slice(0, Math.max(selection.maxPerTopic, eligible.filter(s => s.approvedRu).length));
    summary.push({ slug, available: pool.length, approvedRu: withState.filter(s => s.approvedRu).length, skippedImages: withState.length - eligible.length, selected: picked.length });
    for (const s of picked) {
      const topic = topicRows.find(t => t.id === s.question.topic_id)!;
      const snapshot = sourceSnapshot(s.question, contexts);
      sources.push({
        sourceId: s.question.id, sourceHash: s.hash,
        topic: { id: topic.id, subject_id: topic.subject_id, slug: topic.slug, name_ru: topic.name_ru, name_kk: topic.name_kk },
        question: { type: s.question.type, difficulty: s.question.difficulty, body: s.question.body, explanation: s.question.explanation },
        context: snapshot.context,
        versionCandidates: s.versions.map(v => ({ questionVersionId: v.questionVersionId, locale: v.locale, status: v.status, sameSourceHash: v.sourceHash === s.hash })),
        sourceAcceptance: s.approvedRu ? 'ru-approved-same-hash' : 'not-human-verified-by-this-export',
      });
    }
  }
  const manifests = splitSourceManifests(sources.map(s => ({ id: s.sourceId, sourceHash: s.sourceHash })));
  const bundles = manifests.map((manifest, index) => ({
    schema: 'alemprep-ru-kk-review-source-v1' as const,
    generatedAt: input.generatedAt,
    purpose: 'private translator/reviewer sample; not import format',
    batch: `${index + 1}/${manifests.length}`,
    humanReviewed: false as const,
    sources: manifest.questions.map(ref => sources.find(s => s.sourceId === ref.id)!),
    glossary: input.glossary,
  }));
  return { bundles, manifests, summary };
}

export function parseExportCommand(args: readonly string[]) {
  const values = new Map<string, string>();
  let includeImages = false;
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--include-images') { includeImages = true; continue; }
    if (!['--topics', '--max-per-topic', '--out-dir'].includes(key) || values.has(key) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error('Usage: --out-dir <private dir> [--topics a,b] [--max-per-topic 30] [--include-images]');
    }
    values.set(key, args[++i]);
  }
  const outDir = values.get('--out-dir');
  if (!outDir) throw new Error('--out-dir is required');
  const topicSlugs = values.get('--topics')?.split(',').map(s => s.trim()).filter(Boolean) ?? [...PILOT_TWO_WEEK_TOPICS];
  const maxPerTopic = Number(values.get('--max-per-topic') ?? 30);
  if (!Number.isInteger(maxPerTopic) || maxPerTopic < 1 || maxPerTopic > 500) throw new Error('Invalid --max-per-topic');
  return { outDir, selection: { topicSlugs, maxPerTopic, includeImages } };
}
