'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { PracticeSection } from '@/components/lessons/PracticeSection';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import type { LessonLabels } from '@/components/lessons/labels';
import type { ResolvedQuestion } from '@/lib/lessons/catalog';
import { EMPTY_PROGRESS, isTopicClosed, parseProgress, type LessonProgress } from '@/lib/lessons/progress';

export function TopicPractice({
  storageKey,
  topic,
  setIndex,
  availableSets,
  problems,
  labels,
  activityUrl,
}: {
  storageKey: string;
  topic: string;
  setIndex: number;
  availableSets: number;
  problems: ResolvedQuestion[];
  labels: LessonLabels['practice'];
  activityUrl?: string;
}) {
  const t = useTranslations('problems');
  const [savedProgress, setProgress] = useState<LessonProgress | null>(null);
  const progress = savedProgress ?? EMPTY_PROGRESS;

  useEffect(() => {
    try {
      setProgress(parseProgress(window.localStorage.getItem(storageKey)));
    } catch {
      setProgress(EMPTY_PROGRESS);
    }
  }, [storageKey]);

  const onAnswer = (id: string, index: number) => {
    if (savedProgress === null || savedProgress.answers[id] !== undefined) return;
    const next = { ...savedProgress, answers: { ...savedProgress.answers, [id]: index } };
    setProgress(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Progress remains available on this page. */
    }
    if (activityUrl) {
      void fetch(activityUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'problem' }) }).catch(() => {});
    }
  };

  const setHref = (index: number) => ({
    pathname: '/problems/[topic]' as const,
    params: { topic },
    query: { set: String(index) },
  });
  const nextSet = setIndex + 1 < availableSets ? setHref(setIndex + 1) : null;
  const showNextShortcut = nextSet && !isTopicClosed(problems, progress);

  return (
    <>
      <PracticeSection
        problems={problems}
        progress={progress}
        ready={savedProgress !== null}
        onAnswer={onAnswer}
        labels={labels}
        completionAction={
          <Button asChild className="min-h-11 w-full sm:w-auto">
            <Link href={nextSet ?? '/problems'}>
              {t(nextSet ? 'nextSet' : 'backToTopics')}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        }
      />
      {(setIndex > 0 || showNextShortcut) && (
        <nav aria-label={t('setNavigation')} className="flex flex-wrap items-center gap-2.5">
          {setIndex > 0 && (
            <Button asChild variant="outline" className="min-h-11">
              <Link href={setHref(setIndex - 1)}>
                <ChevronLeft className="size-4" aria-hidden />
                {t('prevSet')}
              </Link>
            </Button>
          )}
          {showNextShortcut && (
            <Button asChild variant="outline" className="ml-auto min-h-11">
              <Link href={nextSet}>
                {t('nextSet')}
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </Button>
          )}
        </nav>
      )}
    </>
  );
}
