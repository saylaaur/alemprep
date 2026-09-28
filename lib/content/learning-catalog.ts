import 'server-only';

import { createHash } from 'node:crypto';
import type { LearningMode } from '@/lib/learning/contracts';
import type { QuestionType } from '@/types/db';
import type { QuestionVersion } from './versions';

export type ApprovedLearningVersion = {
  version: QuestionVersion;
  topicId: string;
  topicSlug: string;
  subjectId: string;
  subjectSlug: string;
  approvalStatus: 'draft' | 'approved' | 'quarantined';
};

export type LearningSessionPlan = {
  mode: LearningMode;
  locale: 'ru' | 'kk';
  topicId: string | null;
  subjectId: string | null;
  expiresAt: string;
  scoringVersion: 'ent-v1';
  manifestHash: string;
  items: { versionId: string }[];
};

/** Server-only pairing of an RPC plan and the immutable versions it names. */
export type SelectedLearningSession = {
  plan: LearningSessionPlan;
  versions: QuestionVersion[];
};

type BlueprintPart = { type: QuestionType; count: number };

function expiresAt(mode: LearningMode, now: Date): string {
  const durationMs: Record<LearningMode, number> = {
    practice: 2 * 60 * 60 * 1000,
    mock_exam: 160 * 60 * 1000,
    diagnostic: 30 * 60 * 1000,
    weekly: 45 * 60 * 1000,
  };
  return new Date(now.getTime() + durationMs[mode]).toISOString();
}

function isApprovedForLocale(candidate: ApprovedLearningVersion, locale: 'ru' | 'kk'): boolean {
  return candidate.approvalStatus === 'approved' && candidate.version.locale === locale;
}

function byVersionId(left: ApprovedLearningVersion, right: ApprovedLearningVersion): number {
  return left.version.id.localeCompare(right.version.id);
}

function selectionOffset(selectionKey: string, size: number): number {
  const digest = createHash('sha256').update(selectionKey).digest();
  return digest.readUInt32BE(0) % size;
}

function rotate<T>(entries: readonly T[], offset: number): T[] {
  if (entries.length === 0) return [];
  return entries.map((_, index) => entries[(index + offset) % entries.length]!);
}

function pickBalancedDeterministically(
  candidates: readonly ApprovedLearningVersion[],
  blueprint: readonly BlueprintPart[],
  selectionKey: string,
): ApprovedLearningVersion[] | null {
  const picked: ApprovedLearningVersion[] = [];
  for (const part of blueprint) {
    const byTopic = new Map<string, ApprovedLearningVersion[]>();
    for (const candidate of candidates) {
      if (candidate.version.type !== part.type) continue;
      const group = byTopic.get(candidate.topicId);
      if (group) group.push(candidate);
      else byTopic.set(candidate.topicId, [candidate]);
    }
    const groups = [...byTopic.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([topicId, group]) => ({ topicId, versions: group.sort(byVersionId) }));
    const rotatedGroups = rotate(groups, selectionOffset(`${selectionKey}:${part.type}:topics`, groups.length));
    const selected: ApprovedLearningVersion[] = [];
    for (let round = 0; selected.length < part.count; round += 1) {
      let added = false;
      for (const group of rotatedGroups) {
        if (round >= group.versions.length) continue;
        const offset = selectionOffset(`${selectionKey}:${part.type}:${group.topicId}`, group.versions.length);
        const candidate = group.versions[(round + offset) % group.versions.length];
        if (!candidate || selected.length >= part.count) continue;
        selected.push(candidate);
        added = true;
      }
      if (!added) return null;
    }
    picked.push(...selected);
  }
  return picked;
}

/** Matches the manifest contract checked again by start_learning_v1. */
export function contentManifestHash(versions: readonly QuestionVersion[]): string {
  const serialized = versions.map((version) => `${version.id}:${version.contentHash}`).join(',');
  return `sha256:${createHash('sha256').update(serialized).digest('hex')}`;
}

function toSessionPlan(input: {
  mode: LearningMode;
  locale: 'ru' | 'kk';
  topicId: string | null;
  subjectId: string | null;
  versions: readonly QuestionVersion[];
  now: Date;
}): LearningSessionPlan {
  return {
    mode: input.mode,
    locale: input.locale,
    topicId: input.topicId,
    subjectId: input.subjectId,
    expiresAt: expiresAt(input.mode, input.now),
    scoringVersion: 'ent-v1',
    manifestHash: contentManifestHash(input.versions),
    items: input.versions.map((version) => ({ versionId: version.id })),
  };
}

export function selectPracticeSession(input: {
  locale: 'ru' | 'kk';
  topicSlug: string;
  selectionKey: string;
  candidates: readonly ApprovedLearningVersion[];
  now: Date;
}): SelectedLearningSession | null {
  const candidates = input.candidates
    .filter((entry) => isApprovedForLocale(entry, input.locale) && entry.topicSlug === input.topicSlug)
    .sort(byVersionId);
  if (candidates.length === 0) return null;
  const candidate = candidates[selectionOffset(input.selectionKey, candidates.length)];
  if (!candidate) return null;
  const versions = [candidate.version];
  return {
    versions,
    plan: toSessionPlan({
    mode: 'practice',
    locale: input.locale,
    topicId: candidate.topicId,
    subjectId: candidate.subjectId,
    versions,
    now: input.now,
    }),
  };
}

export function buildPracticeSessionPlan(input: {
  locale: 'ru' | 'kk';
  topicSlug: string;
  selectionKey: string;
  candidates: readonly ApprovedLearningVersion[];
  now: Date;
}): LearningSessionPlan | null {
  return selectPracticeSession(input)?.plan ?? null;
}

export function selectAssessmentSession(input: {
  locale: 'ru' | 'kk';
  mode: Exclude<LearningMode, 'practice'>;
  subjectSlug: string;
  selectionKey: string;
  candidates: readonly ApprovedLearningVersion[];
  blueprint: readonly BlueprintPart[];
  now: Date;
}): SelectedLearningSession | null {
  const candidates = input.candidates.filter((entry) =>
    isApprovedForLocale(entry, input.locale) && entry.subjectSlug === input.subjectSlug,
  );
  const picked = pickBalancedDeterministically(candidates, input.blueprint, `${input.selectionKey}:${input.subjectSlug}`);
  if (!picked || picked.length === 0) return null;
  const subjectId = picked[0]?.subjectId;
  if (!subjectId || picked.some((entry) => entry.subjectId !== subjectId)) return null;
  const versions = picked.map((entry) => entry.version);
  return {
    versions,
    plan: toSessionPlan({
    mode: input.mode,
    locale: input.locale,
    topicId: null,
    subjectId,
    versions,
    now: input.now,
    }),
  };
}

export function buildAssessmentSessionPlan(input: {
  locale: 'ru' | 'kk';
  mode: Exclude<LearningMode, 'practice'>;
  subjectSlug: string;
  selectionKey: string;
  candidates: readonly ApprovedLearningVersion[];
  blueprint: readonly BlueprintPart[];
  now: Date;
}): LearningSessionPlan | null {
  return selectAssessmentSession(input)?.plan ?? null;
}

/** Both blocks must exist before the caller invokes the atomic start RPC. */
export function selectMockExamSessions(input: {
  locale: 'ru' | 'kk';
  secondSubjectSlug: 'physics' | 'informatics';
  selectionKey: string;
  candidates: readonly ApprovedLearningVersion[];
  blueprint: readonly BlueprintPart[];
  now: Date;
}): [SelectedLearningSession, SelectedLearningSession] | null {
  const first = selectAssessmentSession({
    ...input,
    mode: 'mock_exam',
    subjectSlug: 'math',
  });
  const second = selectAssessmentSession({
    ...input,
    mode: 'mock_exam',
    subjectSlug: input.secondSubjectSlug,
  });
  if (!first || !second) return null;
  return [first, second];
}

/** Diagnostic and weekly keep one combined session, but require both subjects. */
export function selectPairedAssessmentSession(input: {
  locale: 'ru' | 'kk';
  mode: 'diagnostic' | 'weekly';
  secondSubjectSlug: 'physics' | 'informatics';
  selectionKey: string;
  candidates: readonly ApprovedLearningVersion[];
  blueprint: readonly BlueprintPart[];
  now: Date;
}): SelectedLearningSession | null {
  const first = selectAssessmentSession({
    ...input,
    subjectSlug: 'math',
  });
  const second = selectAssessmentSession({
    ...input,
    subjectSlug: input.secondSubjectSlug,
  });
  if (!first || !second) return null;
  const versions = [...first.versions, ...second.versions];
  return {
    versions,
    plan: toSessionPlan({
      mode: input.mode,
      locale: input.locale,
      topicId: null,
      subjectId: null,
      versions,
      now: input.now,
    }),
  };
}
