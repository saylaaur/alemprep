import 'server-only';

export function isLearningEnabled(): boolean {
  return process.env.LEARNING_V1_ENABLED === 'true';
}

/**
 * Пилотный режим «только темы»: прячет пробник, диагностику и еженедельный тест.
 * Их попытки (integrity_version = 0) не видны в кабинете учителя, поэтому на пилоте
 * вся работа должна идти через «Предметы → тема».
 */
export function isPilotTopicsOnly(): boolean {
  return process.env.PILOT_TOPICS_ONLY === 'true';
}
