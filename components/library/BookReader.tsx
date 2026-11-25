'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { BookContent } from '@/lib/books/content';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BookPageView, PAGE_TONES } from './BookPageView';

type Half = { key: string; node: ReactNode; bg: string };

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * Книга: на компьютере — развороты, страницы перелистываются в 3D;
 * на телефоне — по одной странице. Стрелки ← → тоже листают.
 */
export function BookReader({
  content,
  cover,
  labels,
}: {
  content: BookContent;
  cover: ReactNode;
  /** page — шаблон вида «Страница {n} из {total}» */
  labels: { prev: string; next: string; page: string };
}) {
  const wide = useWide();
  const halves: Half[] = [
    { key: 'cover', node: cover, bg: '#0f3b2b' },
    ...content.pages.map((p, i) => {
      const tone = PAGE_TONES[i % PAGE_TONES.length];
      return { key: `p${i}`, node: <BookPageView page={p} tone={tone} className="h-full" />, bg: tone.bg };
    }),
  ];
  const pageCount = halves.length;
  if (pageCount % 2) halves.push({ key: 'end', node: <div className="h-full" />, bg: '#f7f7f2' });

  const spreads = halves.length / 2;
  const total = wide ? spreads : pageCount;
  const [pos, setPos] = useState(0);
  const go = useCallback((n: number) => setPos(Math.max(0, Math.min(total - 1, n))), [total]);

  useEffect(() => setPos(0), [wide]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input,textarea')) return;
      if (e.key === 'ArrowRight') go(pos + 1);
      if (e.key === 'ArrowLeft') go(pos - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, pos]);

  const nav = (
    <div className="flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" onClick={() => go(pos - 1)} disabled={pos === 0} aria-label={labels.prev}>
        <ChevronLeft className="h-4 w-4" /> {labels.prev}
      </Button>
      <span className="min-w-[7rem] text-center font-mono text-xs tabular-nums text-muted-foreground">{labels.page.replace('{n}', String(pos + 1)).replace('{total}', String(total))}</span>
      <Button size="sm" onClick={() => go(pos + 1)} disabled={pos === total - 1} aria-label={labels.next}>
        {labels.next} <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  if (!wide) {
    const h = halves[pos];
    return (
      <div className="grid gap-4">
        <div className="aspect-[3/4] max-h-[78vh] w-full overflow-hidden rounded-3xl shadow-lg" style={{ background: h.bg }}>
          <div key={h.key} className="h-full animate-fade-in">{h.node}</div>
        </div>
        {nav}
      </div>
    );
  }

  // Листы: лицевая сторона — правая страница разворота i, оборот — левая разворота i+1.
  const leaves = Array.from({ length: spreads - 1 }, (_, i) => ({ front: halves[2 * i + 1], back: halves[2 * i + 2] }));
  return (
    <div className="grid gap-5">
      <div className="relative aspect-[2/1.2] w-full [perspective:2400px] [filter:drop-shadow(0_30px_50px_rgba(0,0,0,.35))]">
        <button type="button" aria-label={labels.prev} onClick={() => go(pos - 1)}
          className="absolute left-0 top-0 h-full w-1/2 overflow-hidden rounded-l-[22px] text-left" style={{ background: halves[0].bg }}>
          {halves[0].node}
        </button>
        <button type="button" aria-label={labels.next} onClick={() => go(pos + 1)}
          className="absolute left-1/2 top-0 h-full w-1/2 overflow-hidden rounded-r-[22px] text-left" style={{ background: halves[halves.length - 1].bg }}>
          {halves[halves.length - 1].node}
        </button>
        {leaves.map((leaf, i) => {
          const flipped = i < pos;
          return (
            <div
              key={leaf.front.key}
              onClick={() => go(flipped ? i : i + 1)}
              className={cn(
                'absolute left-1/2 top-0 h-full w-1/2 origin-left cursor-pointer transition-transform [transition-duration:900ms] [transform-style:preserve-3d] [transition-timing-function:cubic-bezier(.645,.045,.355,1)]',
                flipped && '[transform:rotateY(-180deg)]'
              )}
              style={{ zIndex: flipped ? 10 + i : 20 - i }}
            >
              <div className="absolute inset-0 overflow-hidden rounded-r-[22px] [backface-visibility:hidden]" style={{ background: leaf.front.bg }}>
                {leaf.front.node}
              </div>
              <div className="absolute inset-0 overflow-hidden rounded-l-[22px] [backface-visibility:hidden] [transform:rotateY(180deg)]" style={{ background: leaf.back.bg }}>
                {leaf.back.node}
              </div>
            </div>
          );
        })}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 z-40 -ml-5 w-10 bg-[linear-gradient(90deg,transparent,rgba(0,0,0,.18)_45%,rgba(0,0,0,.28)_50%,rgba(255,255,255,.08)_52%,transparent)]" />
      </div>
      {nav}
    </div>
  );
}
