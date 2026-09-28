import { describe, expect, it } from 'vitest';
import { createLearningStateService } from './state';
import type { LearningStateClient } from './repository';

const actorId = '11111111-1111-4111-8111-111111111111';
const sessionId = '44444444-4444-4444-8444-444444444444';

describe('learning state service', () => {
  it('gets the actor from the server boundary before reading state', async () => {
    const calls: unknown[] = [];
    const state: LearningStateClient = {
      readSession: async (actor, session) => {
        calls.push({ actor, session });
        return { data: null, error: null };
      },
    };
    const service = createLearningStateService({ actorId: async () => actorId, state });

    await expect(service.getLearningState(sessionId)).resolves.toMatchObject({ ok: false, error: 'not-found' });
    expect(calls).toEqual([{ actor: actorId, session: sessionId }]);
  });
});
