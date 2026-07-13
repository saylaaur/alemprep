/**
 * Общие константы пользовательских настроек. Вынесены в обычный модуль:
 * из файла с 'use server' (profile-actions) можно экспортировать только
 * async-функции, а эти значения нужны и серверу, и клиенту.
 */

/** Границы дневной цели (задач в день). Дефолт схемы — 20. */
export const MIN_DAILY_GOAL = 5;
export const MAX_DAILY_GOAL = 200;

/** Границы целевого балла (шкала пары предметов, UI-максимум — 110; DB CHECK шире, 1..140). */
export const MIN_TARGET_SCORE = 1;
export const MAX_TARGET_SCORE = 110;
