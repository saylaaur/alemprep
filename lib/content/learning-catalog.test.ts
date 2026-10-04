import { describe, expect, it } from 'vitest';
import type { QuestionVersion } from './versions';
import {
  buildAssessmentSessionPlan,
  buildPracticeSessionPlan,
  contentManifestHash,
  selectPairedAssessmentSession,
  selectMockExamSessions,
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
      selectionKey: 'actor:operation',
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
      expiresAt: '2026-09-22T11:59:55.000Z',
      items: [{ versionId: approved.version.id }],
    });
    expect(plan?.manifestHash).toBe(contentManifestHash([approved.version]));
  });

  it('reserves five seconds for the diagnostic DB time boundary', () => {
    const plan = buildAssessmentSessionPlan({
      mode: 'diagnostic', locale: 'kk', subjectSlug: 'math',
      selectionKey: 'clock-boundary',
      candidates: [candidate('10000000-0000-4000-8000-000000000011', 'single')],
      blueprint: [{ type: 'single', count: 1 }],
      now: new Date('2026-09-22T10:00:00.000Z'),
    });
    expect(plan?.expiresAt).toBe('2026-09-22T10:29:55.000Z');
  });

  it('rotates a new practice operation while keeping one operation stable', () => {
    const candidates = [
      candidate('10000000-0000-4000-8000-000000000011', 'single'),
      candidate('10000000-0000-4000-8000-000000000012', 'single'),
      candidate('10000000-0000-4000-8000-000000000013', 'single'),
      candidate('10000000-0000-4000-8000-000000000014', 'single'),
    ];
    const input = {
      locale: 'kk' as const,
      topicSlug: 'radicals-and-expressions',
      candidates,
      now: new Date('2026-09-22T10:00:00.000Z'),
    };
    const first = buildPracticeSessionPlan({ ...input, selectionKey: 'practice-a' });
    const retry = buildPracticeSessionPlan({ ...input, selectionKey: 'practice-a' });
    const next = buildPracticeSessionPlan({ ...input, selectionKey: 'practice-c' });

    expect(retry?.items).toEqual(first?.items);
    expect(next?.items).not.toEqual(first?.items);
  });

  it('returns no assessment plan when one approved blueprint type is missing', () => {
    const oneSingle = candidate('10000000-0000-4000-8000-000000000011', 'single');
    expect(buildAssessmentSessionPlan({
      locale: 'kk',
      mode: 'diagnostic',
      subjectSlug: 'math',
      selectionKey: 'assessment-missing-type',
      candidates: [oneSingle],
      blueprint: [{ type: 'single', count: 1 }, { type: 'multi', count: 1 }],
      now: new Date('2026-09-22T10:00:00.000Z'),
    })).toBeNull();
  });

  it('rotates a new assessment operation while keeping one operation stable', () => {
    const candidates = [
      candidate('10000000-0000-4000-8000-000000000019', 'single'),
      candidate('10000000-0000-4000-8000-000000000020', 'single'),
      candidate('10000000-0000-4000-8000-000000000021', 'single'),
      candidate('10000000-0000-4000-8000-000000000022', 'single'),
    ];
    const input = {
      locale: 'kk' as const,
      mode: 'weekly' as const,
      subjectSlug: 'math',
      candidates,
      blueprint: [{ type: 'single' as const, count: 2 }],
      now: new Date('2026-09-22T10:00:00.000Z'),
    };
    const first = buildAssessmentSessionPlan({ ...input, selectionKey: 'assessment-a' });
    const retry = buildAssessmentSessionPlan({ ...input, selectionKey: 'assessment-a' });
    const next = buildAssessmentSessionPlan({ ...input, selectionKey: 'assessment-c' });

    expect(retry?.items).toEqual(first?.items);
    expect(next?.items).not.toEqual(first?.items);
    expect(new Set(first?.items.map((item) => item.versionId)).size).toBe(2);
    expect(first?.expiresAt).toBe('2026-09-22T10:44:55.000Z');
  });

  it('preserves assessment type and topic balance after catalog rotation', () => {
    const alpha = { topicId: '40000000-0000-4000-8000-000000000011', topicSlug: 'alpha' };
    const beta = { topicId: '40000000-0000-4000-8000-000000000012', topicSlug: 'beta' };
    const candidates = [
      candidate('10000000-0000-4000-8000-000000000031', 'single', alpha),
      candidate('10000000-0000-4000-8000-000000000032', 'single', alpha),
      candidate('10000000-0000-4000-8000-000000000033', 'single', beta),
      candidate('10000000-0000-4000-8000-000000000034', 'multi', alpha),
      candidate('10000000-0000-4000-8000-000000000035', 'multi', beta),
    ];
    const input = {
      locale: 'kk' as const,
      mode: 'weekly' as const,
      subjectSlug: 'math',
      selectionKey: 'assessment-balance',
      blueprint: [{ type: 'single' as const, count: 2 }, { type: 'multi' as const, count: 2 }],
      now: new Date('2026-09-22T10:00:00.000Z'),
    };
    const plan = buildAssessmentSessionPlan({ ...input, candidates });
    const shuffled = buildAssessmentSessionPlan({ ...input, candidates: [...candidates].reverse() });
    const topicByVersion = new Map(candidates.map((entry) => [entry.version.id, entry.topicId]));

    expect(plan?.items).toEqual(shuffled?.items);
    expect(plan?.items).toHaveLength(4);
    expect(plan?.items.slice(0, 2).map((item) => topicByVersion.get(item.versionId)).sort())
      .toEqual([alpha.topicId, beta.topicId]);
    expect(plan?.items.slice(2).map((item) => topicByVersion.get(item.versionId)).sort())
      .toEqual([alpha.topicId, beta.topicId]);
  });

  it('builds both mock-exam subject blocks atomically from complete approved catalogs', () => {
    const math = candidate('10000000-0000-4000-8000-000000000030', 'single');
    const physics = candidate('10000000-0000-4000-8000-000000000031', 'single', {
      subjectId: '50000000-0000-4000-8000-000000000002',
      subjectSlug: 'physics',
      topicId: '40000000-0000-4000-8000-000000000002',
      topicSlug: 'kinematics',
    });

    const sessions = selectMockExamSessions({
      locale: 'kk',
      secondSubjectSlug: 'physics',
      selectionKey: 'mock-exam-atomically',
      candidates: [physics, math],
      blueprint: [{ type: 'single', count: 1 }],
      now: new Date('2026-09-22T10:00:00.000Z'),
    });

    expect(sessions?.map(({ plan }) => ({
      subjectId: plan.subjectId,
      expiresAt: plan.expiresAt,
      items: plan.items,
    }))).toEqual([
      { subjectId: math.subjectId, expiresAt: '2026-09-22T12:39:55.000Z', items: [{ versionId: math.version.id }] },
      { subjectId: physics.subjectId, expiresAt: '2026-09-22T12:39:55.000Z', items: [{ versionId: physics.version.id }] },
    ]);
  });

  it('does not shorten a paired diagnostic when either subject lacks its blueprint', () => {
    const math = candidate('10000000-0000-4000-8000-000000000040', 'single');
    const physics = candidate('10000000-0000-4000-8000-000000000041', 'single', {
      subjectId: '50000000-0000-4000-8000-000000000002',
      subjectSlug: 'physics',
      topicId: '40000000-0000-4000-8000-000000000002',
      topicSlug: 'kinematics',
    });

    const diagnostic = selectPairedAssessmentSession({
      locale: 'kk',
      mode: 'diagnostic',
      secondSubjectSlug: 'physics',
      selectionKey: 'paired-diagnostic-missing-type',
      candidates: [math, physics],
      blueprint: [{ type: 'single', count: 1 }, { type: 'multi', count: 1 }],
      now: new Date('2026-09-22T10:00:00.000Z'),
    });
    expect(diagnostic).toBeNull();
  });
});
