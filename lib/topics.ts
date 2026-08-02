export interface SectionedTopic {
  section_no: number | null;
  section_name_ru: string | null;
  section_name_kk: string | null;
  topic_no: number | null;
}

export interface GroupedSection<T extends SectionedTopic> {
  sectionNo: number | null;
  sectionNameRu: string | null;
  sectionNameKk: string | null;
  topics: T[];
}

/**
 * Группирует темы предмета по официальному разделу (section_no) — двухуровневая
 * структура НЦТ (см. supabase/migrations/0019). Разделы по порядку section_no,
 * темы внутри раздела — по topic_no. Темы без раздела (старый контент вне
 * официальной спецификации, section_no NULL) — отдельной группой в конце;
 * страница решает, как её подписать.
 */
export function groupTopicsBySection<T extends SectionedTopic>(topics: T[]): GroupedSection<T>[] {
  const bySection = new Map<number | null, T[]>();
  for (const topic of topics) {
    // `?? null` — до применения миграции 0019 колонки в БД ещё нет, и клиент
    // отдаёт undefined, а не null; ниже везде сравниваем строго с null.
    const key = topic.section_no ?? null;
    const arr = bySection.get(key);
    if (arr) arr.push(topic);
    else bySection.set(key, [topic]);
  }

  for (const arr of bySection.values()) {
    arr.sort((a, b) => {
      const aNo = a.topic_no ?? null;
      const bNo = b.topic_no ?? null;
      if (aNo === null) return bNo === null ? 0 : 1;
      if (bNo === null) return -1;
      return aNo - bNo;
    });
  }

  const sectionKeys = Array.from(bySection.keys()).sort((a, b) => {
    if (a === null) return b === null ? 0 : 1;
    if (b === null) return -1;
    return a - b;
  });

  return sectionKeys.map((key) => {
    const arr = bySection.get(key)!;
    return {
      sectionNo: key,
      sectionNameRu: key === null ? null : arr[0].section_name_ru,
      sectionNameKk: key === null ? null : arr[0].section_name_kk,
      topics: arr,
    };
  });
}
