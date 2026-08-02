export interface TopicForPruning {
  id: string;
  slug: string;
  subjectSlug: string;
  nameRu: string;
  questionCount: number;
}

export type PruneAction = 'delete' | 'keep_official' | 'keep_has_questions';

export interface PruneDecision {
  topic: TopicForPruning;
  action: PruneAction;
}

/**
 * Только пустые темы, которых нет в официальной спецификации, кандидаты на
 * удаление. Официальная тема никогда не удаляется (даже без единой задачи —
 * это цель миграции 0019, а не мусор). Тема с задачами не удаляется НИКОГДА,
 * официальная она или нет — вместо этого попадает в отчёт на ручной разбор.
 */
export function decidePruning(
  topics: TopicForPruning[],
  officialSlugsBySubject: Record<string, readonly string[]>,
): PruneDecision[] {
  return topics.map((topic) => {
    const isOfficial = (officialSlugsBySubject[topic.subjectSlug] ?? []).includes(topic.slug);
    if (isOfficial) return { topic, action: 'keep_official' };
    if (topic.questionCount > 0) return { topic, action: 'keep_has_questions' };
    return { topic, action: 'delete' };
  });
}

export interface PruneSummary {
  deleted: TopicForPruning[];
  needsReview: TopicForPruning[];
  keptOfficial: number;
}

export function summarizePruning(decisions: PruneDecision[]): PruneSummary {
  const deleted: TopicForPruning[] = [];
  const needsReview: TopicForPruning[] = [];
  let keptOfficial = 0;

  for (const { topic, action } of decisions) {
    if (action === 'delete') deleted.push(topic);
    else if (action === 'keep_has_questions') needsReview.push(topic);
    else keptOfficial++;
  }

  return { deleted, needsReview, keptOfficial };
}
