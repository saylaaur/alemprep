import { describe, expect, it } from 'vitest';
import { chunkSegments, estimateRun, requireExecutionBudget } from './translation-runner';

describe('translation run budget', () => {
  it('counts the actual masked payload in Unicode code points and demands both explicit caps', () => {
    const estimate = estimateRun([{ path: 'a', sourceText: 'Қазақ [[AP_0]]' }, { path: 'b', sourceText: '😀' }]);
    expect(estimate.characters).toBe(15);
    expect(estimate.maximumChargedCharacters).toBe(45);
    expect(estimate.usd).toBeCloseTo(0.0003, 12);
    expect(() => requireExecutionBudget(estimate, { execute: true })).toThrow('max-chars');
    expect(() => requireExecutionBudget(estimate, { execute: true, maxChars: 15 })).toThrow('max-usd');
    expect(() => requireExecutionBudget(estimate, { execute: true, maxChars: 14, maxUsd: 1 })).toThrow('max-chars');
    expect(() => requireExecutionBudget(estimate, { execute: true, maxChars: 15, maxUsd: 0.0003 })).toThrow('max-chars');
    expect(() => requireExecutionBudget(estimate, { execute: true, maxChars: 45, maxUsd: 0.0009 })).not.toThrow();
  });

  it('does not split a segment and refuses a single overlarge segment for automatic translation', () => {
    const segments = [
      { path: 'a', sourceText: 'a'.repeat(4_500) },
      { path: 'b', sourceText: 'b'.repeat(4_500) },
      { path: 'c', sourceText: 'c'.repeat(4_500) },
    ];
    expect(chunkSegments(segments, { maxRequestChars: 9_000, maxSegmentChars: 4_500 })).toEqual([[segments[0], segments[1]], [segments[2]]]);
    expect(() => chunkSegments([{ path: 'huge', sourceText: 'x'.repeat(4_501) }], { maxRequestChars: 25_000, maxSegmentChars: 4_500 })).toThrow('manual review');
  });
});
