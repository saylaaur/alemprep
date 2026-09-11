/**
 * Budgeted, offline Google NMT drafts. It never writes Supabase rows or publishes content.
 *
 * npm run content:translate-google -- --manifest /private/tmp/sample.json --output /private/tmp/kk-drafts.json
 * npm run content:translate-google -- --manifest /private/tmp/sample.json --output /private/tmp/kk-drafts.json --execute --max-chars 50000 --max-usd 1
 *
 * `--execute` requires a short-lived GOOGLE_TRANSLATE_ACCESS_TOKEN and GOOGLE_TRANSLATE_PROJECT_ID
 * in the operator shell. Do not add either one to .env.local or a NEXT_PUBLIC_ variable.
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import glossaryData from './lib/kk-glossary.json';
import { getServiceClient } from './lib/db';
import { GoogleTranslationProvider, retryTranslation } from './lib/google-translation';
import { questionSourceHash, sourceHash, type CoverageQuestion } from './lib/kazakh-coverage';
import { parseTranslationCommand, requirePrivateArtifactPath } from './lib/translation-command';
import { claimCheckpoint, loadCheckpoint, markCheckpointReceived, markCheckpointRejected, markCheckpointSent, markCheckpointValidated, saveCheckpoint, type TranslationCheckpointKey } from './lib/translation-checkpoint';
import { chunkSegments, estimateRun, requireExecutionBudget } from './lib/translation-runner';
import { eligibleContextIds } from './lib/translation-eligibility';
import {
  applyContextTranslations,
  applySegmentTranslations,
  extractContextSegments,
  extractQuestionSegments,
  inspectContextManualReviewIssues,
  inspectManualReviewIssues,
  type TranslationContext,
  type TranslationGlossary,
  type TranslationIssue,
  type TranslationSegment,
} from './lib/translation-segments';
import type { TranslationOriginal } from './lib/checks';

const manifestSchema = z.object({
  schema: z.literal('alemprep-kk-source-sample-v1'),
  questions: z.array(z.object({ id: z.string(), sourceHash: z.string() })).min(1).max(30),
});

const VALIDATOR_VERSION = 'segments-v1';
const MAX_SEGMENT_CHARACTERS = 4_500;
const MAX_REQUEST_CHARACTERS = 25_000;

type SourceContext = TranslationContext & { id: string; language: 'ru' | 'kk' };
type SourceQuestion = CoverageQuestion & { body: TranslationOriginal['body']; explanation: TranslationOriginal['explanation']; context_id: string | null };
type DraftEntity = {
  kind: 'question' | 'context';
  sourceId: string;
  sourceHash: string;
  segments: TranslationSegment[];
  manualIssues: TranslationIssue[];
  original: TranslationOriginal | TranslationContext;
};

const glossary = z.record(z.string(), z.string()).parse(glossaryData) as TranslationGlossary;
const glossaryVersion = sourceHash(glossary);

function checkpointKey(entity: DraftEntity): TranslationCheckpointKey {
  return {
    sourceId: entity.sourceId,
    sourceHash: entity.sourceHash,
    locale: 'kk',
    provider: 'google-nmt',
    glossaryVersion,
    validatorVersion: VALIDATOR_VERSION,
  };
}

function sourceQuestion(row: SourceQuestion): TranslationOriginal {
  return { type: row.type, body: row.body, explanation: row.explanation };
}

function entityForQuestion(question: SourceQuestion, contexts: ReadonlyMap<string, SourceContext>): DraftEntity {
  const original = sourceQuestion(question);
  return {
    kind: 'question', sourceId: question.id, sourceHash: questionSourceHash(question, contexts),
    segments: extractQuestionSegments(original, glossary).segments, manualIssues: inspectManualReviewIssues(original, glossary), original,
  };
}

function entityForContext(context: SourceContext): DraftEntity {
  return {
    kind: 'context', sourceId: context.id,
    sourceHash: sourceHash({ title: context.title, content: context.content }),
    segments: extractContextSegments(context, glossary).segments, manualIssues: inspectContextManualReviewIssues(context, glossary), original: context,
  };
}

async function runConcurrent<T>(items: readonly T[], concurrency: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let stop = false;
  const worker = async () => {
    while (!stop) {
      const index = next++;
      if (index >= items.length) return;
      try {
        await run(items[index]);
      } catch (error) {
        stop = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

function restoreEntity(entity: DraftEntity, translations: string[]) {
  return entity.kind === 'question'
    ? applySegmentTranslations(entity.original as TranslationOriginal, entity.segments, translations)
    : applyContextTranslations(entity.original as TranslationContext, entity.segments, translations);
}

function providerInputs(segments: readonly TranslationSegment[]) {
  return segments.filter(segment => segment.fixedTranslation === undefined).map(segment => ({ path: segment.path, sourceText: segment.sourceText }));
}

function combineTranslations(segments: readonly TranslationSegment[], providerTranslations: readonly string[]): string[] {
  let nextProviderTranslation = 0;
  const translations = segments.map(segment => {
    if (segment.fixedTranslation !== undefined) return segment.fixedTranslation;
    const translated = providerTranslations[nextProviderTranslation++];
    if (translated === undefined) throw new Error('provider translation count mismatch');
    return translated;
  });
  if (nextProviderTranslation !== providerTranslations.length) throw new Error('provider translation count mismatch');
  return translations;
}

async function saveDraftOutput(file: string, output: unknown): Promise<void> {
  await mkdir(dirname(resolve(file)), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

async function main(): Promise<void> {
  const command = parseTranslationCommand(process.argv.slice(2));
  const repositoryRoot = process.cwd();
  await requirePrivateArtifactPath(command.output, repositoryRoot);
  await requirePrivateArtifactPath(command.checkpoint, repositoryRoot);
  const manifest = manifestSchema.parse(JSON.parse(await readFile(command.manifest, 'utf8')));
  const supabase = getServiceClient();
  const questionIds = manifest.questions.map(item => item.id);
  const { data: questionRows, error: questionError } = await supabase
    .from('questions')
    .select('id, topic_id, context_id, language, type, difficulty, body, explanation, source_question_id, is_published')
    .in('id', questionIds)
    .eq('language', 'ru')
    .eq('is_published', true);
  if (questionError || !questionRows || questionRows.length !== questionIds.length) throw new Error('source questions are missing, unpublished or unavailable');
  const questions = questionRows as SourceQuestion[];
  const contextIds = [...new Set(questions.map(question => question.context_id).filter((id): id is string => Boolean(id)))];
  const { data: contextRows, error: contextError } = contextIds.length
    ? await supabase.from('contexts').select('id, language, title, content').in('id', contextIds).eq('language', 'ru')
    : { data: [] as SourceContext[], error: null };
  if (contextError || (contextRows ?? []).length !== contextIds.length) throw new Error('source contexts are missing or not Russian');
  const contexts = new Map((contextRows as SourceContext[]).map(context => [context.id, context]));
  const manifestHash = new Map(manifest.questions.map(item => [item.id, item.sourceHash]));
  const questionEntities = questions.map(question => entityForQuestion(question, contexts));
  const stale = questionEntities.filter(entity => manifestHash.get(entity.sourceId) !== entity.sourceHash);
  const staleIds = new Set(stale.map(entity => entity.sourceId));
  const manuallyBlockedQuestionIds = new Set(questionEntities.filter(entity => entity.manualIssues.length > 0).map(entity => entity.sourceId));
  const usableContextIds = eligibleContextIds(questions.map(question => ({
    contextId: question.context_id,
    stale: staleIds.has(question.id),
    manual: manuallyBlockedQuestionIds.has(question.id),
  })));
  // A context referenced solely by a stale/manual question is never sent to Google or billed.
  const contextEntities = [...contexts.values()].filter(context => usableContextIds.has(context.id)).map(entityForContext);
  const entities = [...contextEntities, ...questionEntities];
  const manual = entities.filter(entity => entity.manualIssues.length > 0);
  const candidates = entities.filter(entity => !stale.includes(entity) && !manual.includes(entity) && entity.segments.length > 0);
  const estimate = estimateRun(candidates.flatMap(entity => providerInputs(entity.segments).map(segment => ({ path: `${entity.sourceId}:${segment.path}`, sourceText: segment.sourceText }))));
  requireExecutionBudget(estimate, command);

  const output: {
    schema: 'alemprep-google-nmt-drafts-v1'; generatedAt: string; dryRun: boolean; glossaryVersion: string;
    estimate: ReturnType<typeof estimateRun>; staleSourceIds: string[];
    manualReview: Array<{ kind: DraftEntity['kind']; sourceId: string; issues: DraftEntity['manualIssues'] }>;
    drafts: Array<{ kind: DraftEntity['kind']; sourceId: string; sourceHash: string; state: string; retries?: number; value?: unknown; reason?: string }>;
  } = {
    schema: 'alemprep-google-nmt-drafts-v1', generatedAt: new Date().toISOString(), dryRun: !command.execute, glossaryVersion,
    estimate, staleSourceIds: stale.map(entity => entity.sourceId),
    manualReview: manual.map(entity => ({ kind: entity.kind, sourceId: entity.sourceId, issues: entity.manualIssues })), drafts: [],
  };
  if (!command.execute) {
    output.drafts.push(...candidates.map(entity => ({ kind: entity.kind, sourceId: entity.sourceId, sourceHash: entity.sourceHash, state: 'prepared' })));
  } else {
    const token = process.env.GOOGLE_TRANSLATE_ACCESS_TOKEN;
    const projectId = process.env.GOOGLE_TRANSLATE_PROJECT_ID;
    if (!token || !projectId) throw new Error('GOOGLE_TRANSLATE_ACCESS_TOKEN and GOOGLE_TRANSLATE_PROJECT_ID are required only for --execute');
    const provider = new GoogleTranslationProvider({ projectId, accessToken: async () => token });
    const checkpoint = await loadCheckpoint(command.checkpoint);
    await runConcurrent(candidates, 2, async entity => {
      const key = checkpointKey(entity);
      const claimed = claimCheckpoint(checkpoint, key);
      if (claimed.action === 'resume-required') {
        output.drafts.push({ kind: entity.kind, sourceId: entity.sourceId, sourceHash: entity.sourceHash, state: 'resume-required' });
        return;
      }
      if (claimed.action === 'stale') {
        output.drafts.push({ kind: entity.kind, sourceId: entity.sourceId, sourceHash: entity.sourceHash, state: 'stale' });
        return;
      }
      let translations: string[];
      let retries = 0;
      if (claimed.action === 'cache-hit') translations = claimed.translations;
      else {
        const inputs = providerInputs(entity.segments);
        const batches = chunkSegments(inputs, { maxRequestChars: MAX_REQUEST_CHARACTERS, maxSegmentChars: MAX_SEGMENT_CHARACTERS });
        markCheckpointSent(checkpoint, key, estimateRun(inputs).characters);
        await saveCheckpoint(command.checkpoint, checkpoint);
        try {
          const providerTranslations: string[] = [];
          for (const batch of batches) {
            providerTranslations.push(...await retryTranslation(() => provider.translate(batch), Math.random, undefined, () => { retries += 1; }));
          }
          translations = combineTranslations(entity.segments, providerTranslations);
          markCheckpointReceived(checkpoint, key, translations);
          await saveCheckpoint(command.checkpoint, checkpoint);
        } catch (error) {
          // Keep `sent`: a timeout may already have reached Google and be billed.
          output.drafts.push({ kind: entity.kind, sourceId: entity.sourceId, sourceHash: entity.sourceHash, state: 'sent', reason: error instanceof Error ? error.message : 'provider failure' });
          throw error;
        }
      }
      const restored = restoreEntity(entity, translations);
      if (!restored.ok) {
        markCheckpointRejected(checkpoint, key);
        await saveCheckpoint(command.checkpoint, checkpoint);
        output.drafts.push({ kind: entity.kind, sourceId: entity.sourceId, sourceHash: entity.sourceHash, state: 'rejected', reason: restored.reason });
        return;
      }
      markCheckpointValidated(checkpoint, key);
      await saveCheckpoint(command.checkpoint, checkpoint);
      if (entity.kind === 'question' && 'body' in restored) {
        output.drafts.push({ kind: entity.kind, sourceId: entity.sourceId, sourceHash: entity.sourceHash, state: 'validated', retries: claimed.action === 'cache-hit' ? 0 : retries, value: { body: restored.body, explanation: restored.explanation } });
      } else if (entity.kind === 'context' && 'context' in restored) {
        output.drafts.push({ kind: entity.kind, sourceId: entity.sourceId, sourceHash: entity.sourceHash, state: 'validated', retries: claimed.action === 'cache-hit' ? 0 : retries, value: restored.context });
      } else {
        throw new Error('translated entity did not match its source type');
      }
    });
  }
  await saveDraftOutput(command.output, output);
  console.log(`${command.execute ? 'Executed' : 'Dry run'}: ${candidates.length} eligible item(s), ${estimate.characters} initial characters, ${estimate.maximumChargedCharacters} maximum charged characters. Output: ${command.output}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'translation command failed');
  process.exitCode = 1;
});
