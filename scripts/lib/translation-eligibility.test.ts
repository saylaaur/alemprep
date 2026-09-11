import { describe, expect, it } from 'vitest';
import { eligibleContextIds } from './translation-eligibility';

describe('translation eligibility', () => {
  it('does not translate a context when every referencing question is stale or needs review', () => {
    expect(eligibleContextIds([
      { contextId: 'C-stale', stale: true, manual: false },
      { contextId: 'C-manual', stale: false, manual: true },
      { contextId: 'C-ready', stale: false, manual: false },
      { contextId: 'C-ready', stale: true, manual: false },
      { contextId: null, stale: false, manual: false },
    ])).toEqual(new Set(['C-ready']));
  });
});
