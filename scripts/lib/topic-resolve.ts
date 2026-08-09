import type { Subject } from './schema';

export interface TopicResolutionInput {
  topic_slug: string;
  subject?: Subject | null;
}

export type TopicResolution =
  | { kind: 'resolved'; subject: string; topicId: string }
  | { kind: 'unknown_subject'; subject: string }
  | { kind: 'unknown_topic'; subject: string; topicSlug: string };

/**
 * Предмет для поиска темы — свой subject у задания, если он есть (пайплайн
 * --multi без --subject даёт его каждой задаче отдельно), иначе предмет из
 * флага --subject (обратная совместимость со старыми generated-файлами без
 * поля subject). topicMapsBySubject собирается снаружи (insert-to-db.ts) —
 * эта функция никогда не ходит в сеть, только принимает решение.
 */
export function resolveTopic(
  item: TopicResolutionInput,
  flagSubject: string,
  topicMapsBySubject: ReadonlyMap<string, ReadonlyMap<string, string> | null>,
): TopicResolution {
  const subject = item.subject ?? flagSubject;
  const topicMap = topicMapsBySubject.get(subject);
  if (!topicMap) return { kind: 'unknown_subject', subject };
  const topicId = topicMap.get(item.topic_slug);
  if (!topicId) return { kind: 'unknown_topic', subject, topicSlug: item.topic_slug };
  return { kind: 'resolved', subject, topicId };
}
