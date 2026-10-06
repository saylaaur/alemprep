import { afterEach, expect, it } from 'vitest';
import { isLearningEnabled, isPilotTopicsOnly } from './feature-flag';

const original = process.env.LEARNING_V1_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.LEARNING_V1_ENABLED;
  else process.env.LEARNING_V1_ENABLED = original;
});

it.each([undefined, '', 'false', 'TRUE', '1', ' true '])('disables trusted rollout for %s', (value) => {
  if (value === undefined) delete process.env.LEARNING_V1_ENABLED;
  else process.env.LEARNING_V1_ENABLED = value;
  expect(isLearningEnabled()).toBe(false);
});

it('enables only the explicit server flag', () => {
  process.env.LEARNING_V1_ENABLED = 'true';
  expect(isLearningEnabled()).toBe(true);
});

it.each([undefined, 'false', '1'])('keeps all assessments visible for PILOT_TOPICS_ONLY=%s', (value) => {
  const prev = process.env.PILOT_TOPICS_ONLY;
  if (value === undefined) delete process.env.PILOT_TOPICS_ONLY;
  else process.env.PILOT_TOPICS_ONLY = value;
  expect(isPilotTopicsOnly()).toBe(false);
  if (prev === undefined) delete process.env.PILOT_TOPICS_ONLY;
  else process.env.PILOT_TOPICS_ONLY = prev;
});

it('switches the pilot to topics only with the explicit flag', () => {
  process.env.PILOT_TOPICS_ONLY = 'true';
  expect(isPilotTopicsOnly()).toBe(true);
  delete process.env.PILOT_TOPICS_ONLY;
});
