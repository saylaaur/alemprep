'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { MathText } from '@/components/math/MathText';
import { BookPageView, PAGE_TONES, RichText } from '@/components/library/BookPageView';
import type { BookContent } from '@/lib/books/content';
import { fill } from '@/lib/lessons/progress';
import { playSound } from '@/lib/sound/ui-sounds';
import { cn } from '@/lib/utils';
import type { LessonLabels } from './labels';

/**
 * Правая колонка (как «рекомендованные видео» на YouTube): страницы книги-конспекта этого урока.
 * Страница раскрывается на месте; формулы и текст — те же, что в книге.
 */
export function BookNotes({
  title,
  content,
  action,
  labels,
}: {
  title: string;
  content: BookContent | null;
  action?: ReactNode;
  labels: LessonLabels['notes'];
}) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="rounded-3xl border bg-card/70 backdrop-blur-xl p-3 shadow-sm sm:p-4">
      <div className="px-1 pb-3 pt-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{labels.title}</div>
        <div className="mt-0.5 font-serif text-xl font-semibold leading-tight">{title}</div>
        <p className="mt-1 text-[13px] text-muted-foreground">{labels.subtitle}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>

      {!content ? (
        <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">{labels.notReady}</p>
      ) : (
        <ol className="grid gap-2">
          {content.pages.map((page, i) => {
            const tone = PAGE_TONES[i % PAGE_TONES.length];
            const isOpen = open === i;
            const formula = page.blocks.find((b) => b.type === 'formula');
            const firstText = page.blocks.find((b) => b.type === 'text');
            return (
              <li key={i} className="overflow-hidden rounded-2xl" style={{ background: tone.bg, color: tone.fg }}>
                <button
                  type="button"
                  data-sound="off"
                  aria-expanded={isOpen}
                  aria-label={`${fill(labels.page, { n: i + 1 })}: ${page.title}. ${isOpen ? labels.collapse : labels.expand}`}
                  onClick={() => {
                    playSound('flip');
                    setOpen(isOpen ? null : i);
                  }}
                  className="flex w-full items-start gap-3 p-3.5 text-left transition-[filter] duration-150 hover:brightness-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-ring/40"
                >
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ background: tone.chip, color: tone.chipFg }}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    {page.kicker && <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] opacity-60">{page.kicker}</span>}
                    <span className="block font-serif text-[17px] font-semibold leading-tight">{page.title}</span>
                    {!isOpen && formula && formula.type === 'formula' && (
                      <span className="mt-1.5 inline-block rounded-lg px-2 py-0.5 text-[13px]" style={{ background: tone.chip, color: tone.chipFg }}>
                        <MathText text={`$${formula.tex}$`} />
                      </span>
                    )}
                    {!isOpen && !formula && firstText && firstText.type === 'text' && (
                      <span className="mt-1 line-clamp-2 block text-[13px] leading-snug opacity-75">
                        <RichText text={firstText.text} />
                      </span>
                    )}
                  </span>
                  <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 opacity-60 transition-transform duration-300 ease-apple', isOpen && 'rotate-180')} />
                </button>
                <div className={cn('grid transition-[grid-template-rows] duration-300 ease-apple', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                  <div className="overflow-hidden">
                    <div className="px-1 pb-1">
                      <BookPageView page={page} tone={tone} className="h-auto justify-start !overflow-visible !bg-transparent !px-3 !pb-4 !pt-1 !text-[14px] [&>h3]:hidden [&>div:first-child]:hidden" />
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
