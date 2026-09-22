import { describe, expect, it } from 'vitest';
import type { QuestionVersion } from './versions';
import {
  buildAssessmentSessionPlan,
  buildPracticeSessionPlan,
  contentManifestHash,
  type ApprovedLearningVersion,
} from './learning-catalog';

const baseVersion: QuestionVersion = {
  id: '10000000-0000-4000-8000-000000000001',
  questionId: '20000000-0000-4000-8000-000000000001',
  familyId: '30000000-0000-4000-8000-000000000001',
  revision: 1,
  locale: 'kk',
  type: 'single',
  topicLabel: 'Түбірлер',
  publicBody: { stem: 'x = ?', options: [{ id: 'A', content: '1' }] },
  gradingBody: { stem: 'x = ?', options: [{ id: 'A', content: '1' }], correct: 'A' },
  explanation: null,
  contextSnapshot: null,
  contentHash: 'content-1',
};

function candidate(
  id: string,
  type: QuestionVersion['type'],
  overrides: Partial<Omit<ApprovedLearningVersion, 'version'>> = {},
): ApprovedLearningVersion {
  return {
    approvalStatus: 'approved',
    topicId: '40000000-0000-4000-8000-000000000001',
    topicSlug: 'radicals-and-expressions',
    subjectId: '50000000-0000-4000-8000-000000000001',
    subjectSlug: 'math',
    version: { ...baseVersion, id, questionId: id.replace(/^1/, '2'), type, contentHash: `hash-${id}` },
    ...overrides,
  };
}

describe('learning catalog planning', () => {
  it('uses only an approved matching KK practice version and produces a stable manifest', () => {
    const approved = candidate('10000000-0000-4000-8000-000000000010', 'single');
    const plan = buildPracticeSessionPlan({
      locale: 'kk',
      topicSlug: 'radicals-and-expressions',
      candidates: [
        { ...approved, approvalStatus: 'draft' },
        { ...approved, topicSlug: 'other-topic' },
        approved,
      ],
      now: new Date('2026-09-22T10:00:00.000Z'),
    });

    expect(plan).toMatchObject({
      mode: 'practice',
      locale: 'kk',
      topicId: approved.topicId,
      subjectId: approved.subjectId,
      expiresAt: '2026-09-22T12:00:00.000Z',
      items: [{ versionId: approved.version.id }],
    });
    expect(plan?.manifestHash).toBe(contentManifestHash([approved.version]));
  });

  it('returns no assessment plan when one approved blueprint type is missing', () => {
    const oneSingle = candidate('10000000-0000-4000-8000-000000000011', 'single');
    expect(buildAssessmentSessionPlan({
      locale: 'kk',
      mode: 'diagnostic',
      subjectSlug: 'math',
      candidates: [oneSingle],
      blueprint: [{ type: 'single', count: 1 }, { type: 'multi', count: 1 }],
      now: new Date('2026-09-22T10:00:00.000Z'),
    })).toBeNull();
  });

  it('selects assessment items in a deterministic order instead of sampling on retries', () => {
    const later = candidate('10000000-0000-4000-8000-000000000020', 'single');
    const earlier = candidate('10000000-0000-4000-8000-000000000019', 'single');
    const plan = buildAssessmentSessionPlan({
      locale: 'kk',
      mode: 'weekly',
      subjectSlug: 'math',
      candidates: [later, earlier],
      blueprint: [{ type: 'single', count: 2 }],
      now: new Date('2026-09-22T10:00:00.000Z'),
    });

    expect(plan?.items.map((item) => item.versionId)).toEqual([earlier.version.id, later.version.id]);
    expect(plan?.expiresAt).toBe('2026-09-22T10:45:00.000Z');
  });
});
