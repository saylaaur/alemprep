'use client';

import { MathText } from '@/components/math/MathText';
import { Button } from '@/components/ui/button';
import { publishQuestion, deleteQuestion } from '@/lib/supabase/admin-actions';
import type { UnpublishedQuestion } from '@/lib/supabase/queries';
import type { SingleBody, MultiBody, MatchingBody } from '@/types/db';
import { CheckCircle2, Trash2, BookOpen, Tag, Gauge } from 'lucide-react';

interface Labels {
  publish: string;
  delete: string;
  answer: string;
  explanation: string;
  topic: string;
  difficulty: string;
  source: string;
}

function isSingle(body: UnpublishedQuestion['body']): body is SingleBody {
  return 'correct' in body && typeof (body as SingleBody).correct === 'string';
}
function isMulti(body: UnpublishedQuestion['body']): body is MultiBody {
  return 'correct' in body && Array.isArray((body as MultiBody).correct);
}
function isMatching(body: UnpublishedQuestion['body']): body is MatchingBody {
  return 'left' in body;
}

export function ReviewCard({
  question: q,
  locale,
  labels,
}: {
  question: UnpublishedQuestion;
  locale: string;
  labels: Labels;
}) {
  const topicName = locale === 'kk' ? q.topic_name_kk : q.topic_name_ru;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Tag className="h-3.5 w-3.5" />
          {topicName}
        </span>
        <span className="flex items-center gap-1">
          <Gauge className="h-3.5 w-3.5" />
          {labels.difficulty}: {q.difficulty}
        </span>
        <span className="flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5" />
          {labels.source}: {q.source}
        </span>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 font-medium uppercase">
          {q.type}
        </span>
      </div>

      {/* Stem */}
      <div className="text-sm font-medium leading-relaxed">
        <MathText text={isSingle(q.body) || isMulti(q.body) ? q.body.stem : (q.body as MatchingBody).stem} />
      </div>

      {/* Options / left-right */}
      {(isSingle(q.body) || isMulti(q.body)) && (
        <ul className="space-y-1.5">
          {q.body.options.map((opt) => {
            const isCorrect = isSingle(q.body)
              ? (q.body as SingleBody).correct === opt.id
              : (q.body as MultiBody).correct.includes(opt.id);
            return (
              <li
                key={opt.id}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  isCorrect
                    ? 'bg-success/10 text-success font-medium'
                    : 'bg-muted/40 text-muted-foreground'
                }`}
              >
                {isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                <span className="font-mono text-xs shrink-0">{opt.id})</span>
                <MathText text={opt.content} />
              </li>
            );
          })}
        </ul>
      )}

      {isMatching(q.body) && (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <ul className="space-y-1.5">
            {q.body.left.map((item) => (
              <li key={item.id} className="rounded-lg bg-muted/40 px-3 py-2 flex items-center gap-2">
                <span className="font-mono text-xs">{item.id}.</span>
                <MathText text={item.content} />
              </li>
            ))}
          </ul>
          <ul className="space-y-1.5">
            {q.body.right.map((text, i) => (
              <li key={i} className="rounded-lg bg-muted/40 px-3 py-2">
                <MathText text={text} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Explanation */}
      {q.explanation && q.explanation.blocks.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none">
            {labels.explanation}
          </summary>
          <div className="mt-2 rounded-lg bg-muted/30 px-4 py-3 text-sm space-y-1">
            {q.explanation.blocks.map((block, i) => (
              <MathText key={i} text={block.value} />
            ))}
          </div>
        </details>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <form action={publishQuestion}>
          <input type="hidden" name="id" value={q.id} />
          <Button type="submit" size="sm" variant="default" className="gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            {labels.publish}
          </Button>
        </form>
        <form action={deleteQuestion}>
          <input type="hidden" name="id" value={q.id} />
          <Button type="submit" size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" />
            {labels.delete}
          </Button>
        </form>
      </div>
    </div>
  );
}
