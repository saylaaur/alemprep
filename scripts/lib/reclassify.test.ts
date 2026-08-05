import { describe, it, expect } from 'vitest';
import {
  parseClassification,
  summarizeReclassification,
  RECLASSIFY_CONFIDENCE_THRESHOLD,
  type ReclassificationItem,
} from './reclassify';

const VALID_SLUGS = ['kinematics', 'dynamics', 'statics'] as const;

describe('parseClassification', () => {
  it('parses a confident, valid classification', () => {
    const result = parseClassification(
      'Reasoning...\nANSWER: {"topic_slug": "kinematics", "confidence": 0.92}',
      VALID_SLUGS,
    );
    expect(result).toEqual({ kind: 'classified', topicSlug: 'kinematics', confidence: 0.92 });
  });

  it('extracts ANSWER from a ```json fenced block', () => {
    const result = parseClassification(
      'Reasoning...\nANSWER:\n```json\n{"topic_slug": "dynamics", "confidence": 0.8}\n```',
      VALID_SLUGS,
    );
    expect(result).toEqual({ kind: 'classified', topicSlug: 'dynamics', confidence: 0.8 });
  });

  it('accepts confidence exactly at the threshold', () => {
    const result = parseClassification(
      `ANSWER: {"topic_slug": "statics", "confidence": ${RECLASSIFY_CONFIDENCE_THRESHOLD}}`,
      VALID_SLUGS,
    );
    expect(result.kind).toBe('classified');
  });

  it('flags confidence below the threshold as low_confidence, keeps the slug', () => {
    const result = parseClassification(
      'ANSWER: {"topic_slug": "kinematics", "confidence": 0.4}',
      VALID_SLUGS,
    );
    expect(result).toEqual({ kind: 'low_confidence', topicSlug: 'kinematics', confidence: 0.4 });
  });

  it('flags a slug outside the official list as invalid_slug even with high confidence', () => {
    const result = parseClassification(
      'ANSWER: {"topic_slug": "made-up-topic", "confidence": 0.99}',
      VALID_SLUGS,
    );
    expect(result).toEqual({ kind: 'invalid_slug', rawSlug: 'made-up-topic', confidence: 0.99 });
  });

  it('flags missing fields as a parse error', () => {
    const result = parseClassification('ANSWER: {"topic_slug": "kinematics"}', VALID_SLUGS);
    expect(result.kind).toBe('parse_error');
  });

  it('flags unparseable text as a parse error', () => {
    const result = parseClassification('the model rambled with no ANSWER line', VALID_SLUGS);
    expect(result.kind).toBe('parse_error');
  });

  it('flags a non-object ANSWER payload as a parse error', () => {
    const result = parseClassification('ANSWER: "kinematics"', VALID_SLUGS);
    expect(result.kind).toBe('parse_error');
  });

  it('parses correctly when LaTeX reasoning with brace-heavy formulas precedes the ANSWER line', () => {
    const raw = [
      'Рассмотрим уравнение движения: $\\frac{d^2x}{dt^2} + \\omega^2 x = 0$.',
      'Начальные условия задают $x(0) = \\sqrt{2}$, значит это классическая задача.',
      'ANSWER: {"topic_slug": "dynamics", "confidence": 0.85}',
    ].join('\n');
    const result = parseClassification(raw, VALID_SLUGS);
    expect(result).toEqual({ kind: 'classified', topicSlug: 'dynamics', confidence: 0.85 });
  });

  it('parses correctly when LaTeX appears inline on the same line as the JSON object', () => {
    const raw = 'ANSWER: since $\\frac{a}{b} = x$, {"topic_slug": "kinematics", "confidence": 0.9}';
    const result = parseClassification(raw, VALID_SLUGS);
    expect(result).toEqual({ kind: 'classified', topicSlug: 'kinematics', confidence: 0.9 });
  });

  it('takes the last JSON object when the response contains more than one', () => {
    const raw = [
      'ANSWER: {"topic_slug": "dynamics", "confidence": 0.5}',
      'Wait, reconsidering the problem statement more carefully.',
      'ANSWER: {"topic_slug": "kinematics", "confidence": 0.9}',
    ].join('\n');
    const result = parseClassification(raw, VALID_SLUGS);
    expect(result).toEqual({ kind: 'classified', topicSlug: 'kinematics', confidence: 0.9 });
  });

  it('returns a parse error for garbage without a topic_slug key, even with braces present', () => {
    const raw = 'Незаконченное рассуждение про $\\frac{a}{b}$ и {"foo": "bar"} без ответа.';
    const result = parseClassification(raw, VALID_SLUGS);
    expect(result.kind).toBe('parse_error');
  });

  it('includes up to 200 chars of the raw response in the parse_error reason', () => {
    const raw = 'x'.repeat(300);
    const result = parseClassification(raw, VALID_SLUGS);
    expect(result.kind).toBe('parse_error');
    if (result.kind === 'parse_error') {
      expect(result.reason).toContain('x'.repeat(200));
      expect(result.reason).not.toContain('x'.repeat(201));
    }
  });
});

describe('summarizeReclassification', () => {
  function item(
    questionId: string,
    currentTopicSlug: string,
    outcome: ReclassificationItem['outcome'],
  ): ReclassificationItem {
    return { questionId, currentTopicSlug, outcome };
  }

  it('counts a changed classification as reclassified and tallies the distribution', () => {
    const summary = summarizeReclassification([
      item('q1', 'mechanics', { kind: 'classified', topicSlug: 'kinematics', confidence: 0.9 }),
      item('q2', 'mechanics', { kind: 'classified', topicSlug: 'kinematics', confidence: 0.7 }),
      item('q3', 'mechanics', { kind: 'classified', topicSlug: 'dynamics', confidence: 0.8 }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.reclassified).toBe(3);
    expect(summary.confirmedUnchanged).toBe(0);
    expect(summary.distribution).toEqual({ kinematics: 2, dynamics: 1 });
  });

  it('does not count a classification into the same topic as reclassified', () => {
    const summary = summarizeReclassification([
      item('q1', 'kinematics', { kind: 'classified', topicSlug: 'kinematics', confidence: 0.9 }),
    ]);
    expect(summary.reclassified).toBe(0);
    expect(summary.confirmedUnchanged).toBe(1);
    expect(summary.distribution).toEqual({ kinematics: 1 });
  });

  it('leaves low-confidence, invalid-slug and parse-error items untouched and reported separately', () => {
    const summary = summarizeReclassification([
      item('q1', 'mechanics', { kind: 'low_confidence', topicSlug: 'kinematics', confidence: 0.3 }),
      item('q2', 'mechanics', { kind: 'invalid_slug', rawSlug: 'nope', confidence: 0.95 }),
      item('q3', 'mechanics', { kind: 'parse_error', reason: 'Not JSON: garbage' }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.reclassified).toBe(0);
    expect(summary.lowConfidence).toBe(1);
    expect(summary.invalidSlug).toBe(1);
    expect(summary.parseErrors).toBe(1);
    expect(summary.unclassified).toBe(3);
    expect(summary.distribution).toEqual({});
  });
});
