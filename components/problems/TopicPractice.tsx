'use client';

import { useEffect, useState } from 'react';
import { PracticeSection } from '@/components/lessons/PracticeSection';
import type { LessonLabels } from '@/components/lessons/labels';
import type { ResolvedQuestion } from '@/lib/lessons/catalog';
import { EMPTY_PROGRESS, parseProgress, type LessonProgress } from '@/lib/lessons/progress';

/** Решение набора задач темы. Ответы хранятся в браузере, отдельно для каждого набора. */
export function TopicPractice({
  storageKey,
  problems,
  labels,
  activityUrl,
}: {
  storageKey: string;
  problems: ResolvedQuestion[];
  labels: LessonLabels['practice'];
  activityUrl?: string;
}) {
  const [progress, setProgress] = useState<LessonProgress>(EMPTY_PROGRESS);

  useEffect(() => {
    try {
      setProgress(parseProgress(window.localStorage.getItem(storageKey)));
    } catch {
      /* хранилище недоступно — решаем без сохранения */
    }
  }, [storageKey]);

  const onAnswer = (id: string, index: number) => {
    if (progress.answers[id] !== undefined) return;
    const next = { ...progress, answers: { ...progress.answers, [id]: index } };
    setProgress(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* не сохранилось — не страшно */
    }
    if (activityUrl) {
      void fetch(activityUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'problem' }) }).catch(() => {});
    }
  };

  return <PracticeSection problems={problems} progress={progress} onAnswer={onAnswer} labels={labels} />;
}
