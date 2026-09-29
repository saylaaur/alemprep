import 'server-only';

export function isLearningEnabled(): boolean {
  return process.env.LEARNING_V1_ENABLED === 'true';
}
