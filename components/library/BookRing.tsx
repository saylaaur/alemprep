'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useRouter } from '@/i18n/routing';
import type { BookState } from '@/lib/supabase/queries/books';

export type RingBook = { slug: string; name: string; subject: string; state: BookState };
export type Ring = { key: string; name: string; books: RingBook[]; empty: string };

/** Книга ещё идёт по графику 1-3-7-10-14-30-60 — светится жёлтым. */
const inSchedule = (s: BookState) => s === 'due' || s === 'scheduled';

const TILT = -14;

function colors(state: BookState): [string, string] {
  switch (state) {
    case 'due':
    case 'scheduled':
      return ['#ffd45a', '#2b2100'];
    case 'mastered':
      return ['#0b0d0c', '#a6f4d0'];
    case 'available':
      return ['#ffffff', '#0b0d0c'];
    default:
      return ['#e7ebe8', '#7a857f'];
  }
}

/**
 * Кольцо книг как у CLOU: каждая книга — тонкая карточка на наклонённом эллипсе.
 * Крутится само, от прокрутки страницы и пальцем; подписи предметов следуют за кольцом.
 */
export function BookRings({ rings, hint }: { rings: Ring[]; hint: string }) {
  const [active, setActive] = useState(0);
  const ring = rings[active] ?? rings[0];
  return (
    <div>
      <div role="tablist" className="mb-2 flex max-w-full overflow-x-auto px-3 [scrollbar-width:none]">
        <div className="mx-auto flex shrink-0 gap-0.5 rounded-full bg-muted/60 p-1 backdrop-blur-xl">
          {rings.map((r, i) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn(
                'whitespace-nowrap rounded-full px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150 sm:px-3.5 sm:text-sm',
                i === active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {r.name}
              <span className="ml-1 text-xs text-muted-foreground">{r.books.length}</span>
            </button>
          ))}
        </div>
      </div>
      {ring.books.length === 0 ? (
        <div className="grid h-[clamp(200px,30vw,320px)] place-items-center px-6 text-center text-sm text-muted-foreground">{ring.empty}</div>
      ) : (
        <BookRing key={ring.key} books={ring.books} />
      )}
      <p className="px-4 text-center text-[13px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function BookRing({ books }: { books: RingBook[] }) {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const hover = useRef(false);
  const n = books.length;

  useEffect(() => {
    const stage = stageRef.current;
    const ring = ringRef.current;
    if (!stage || !ring || n === 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let spin = 0;
    let vel = 0;
    let raf = 0;
    let R = 400;
    let cw = 60;
    let ch = 84;
    let drag: { x: number; s: number } | null = null;
    let lastY = window.scrollY;

    const layout = () => {
      const w = stage.clientWidth;
      // На узком экране кольцо шире экрана: видна передняя дуга, книги не слипаются (≥ 24 px между книгами).
      // Мало книг — карточки крупнее, чтобы по ним было легко попасть.
      cw = Math.max(46, Math.min(n < 30 ? 92 : 72, w * (n < 30 ? 0.09 : 0.066)));
      // Книги смотрят наружу и не наезжают друг на друга: если их много, кольцо шире экрана
      // и видна передняя дуга, как карусель.
      R = Math.max(Math.min(520, w * 0.43), (n * cw * 1.08) / (2 * Math.PI));
      ch = cw * 1.4;
      // Центр кольца уводим вглубь на R: передняя дуга стоит в плоскости экрана в обычном размере.
      // По высоте ставим так, чтобы и передняя, и дальняя дуга помещались в сцену.
      const th = (-TILT * Math.PI) / 180;
      const front = R * Math.sin(th);
      const back = (-R * Math.sin(th) * 1700) / (1700 + 2 * R * Math.cos(th));
      ring.style.top = `${stage.clientHeight / 2 - (front + back) / 2}px`;
      Array.from(ring.children).forEach((el, i) => {
        const a = (i * 360) / n;
        const e = el as HTMLElement;
        e.style.width = `${cw}px`;
        e.style.height = `${ch}px`;
        e.style.left = `${-cw / 2}px`;
        e.style.top = `${-ch / 2}px`;
        e.style.fontSize = `${cw * 0.16}px`;
        e.style.transform = `rotateY(${a}deg) translateZ(${R}px)`;
      });
    };
    const onScroll = () => {
      const d = window.scrollY - lastY;
      lastY = window.scrollY;
      vel += d * 0.02;
    };
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button,a')) return;
      drag = { x: e.clientX, s: spin };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const ns = drag.s + (e.clientX - drag.x) * 0.25;
      vel = ns - spin;
      spin = ns;
    };
    const up = () => (drag = null);

    const tick = () => {
      if (!drag) {
        // Пока палец или мышь над книгой — кольцо замирает, чтобы по ней можно было нажать.
        spin += vel + (reduce || hover.current ? 0 : 0.03);
        vel *= 0.92;
      }
      ring.style.transform = `translateZ(${-R}px) rotateX(${TILT}deg) rotateY(${spin}deg)`;
      raf = requestAnimationFrame(tick);
    };

    layout();
    window.addEventListener('resize', layout);
    window.addEventListener('scroll', onScroll, { passive: true });
    stage.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', layout);
      window.removeEventListener('scroll', onScroll);
      stage.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [n]);

  return (
    <div
        ref={stageRef}
        className="relative h-[clamp(300px,46vw,560px)] cursor-grab touch-pan-y select-none overflow-hidden [perspective:1700px] active:cursor-grabbing"
      >
        <div ref={ringRef} className="absolute left-1/2 top-1/2 h-0 w-0 [transform-style:preserve-3d]">
          {books.map((b) => {
            const [bg, fg] = colors(b.state);
            const face = (
              <span
                className="absolute inset-0 grid content-between overflow-hidden rounded-[3px_7px_7px_3px] p-[8%] [backface-visibility:hidden]"
                style={{
                  background: bg,
                  color: fg,
                  boxShadow: inSchedule(b.state)
                    ? `0 0 0 ${b.state === 'due' ? 2 : 1}px #ffd45a, 0 0 ${b.state === 'due' ? 26 : 16}px rgba(255,212,90,${b.state === 'due' ? 0.85 : 0.55})`
                    : 'inset 5px 0 0 rgba(0,0,0,.14), inset 0 0 0 1px rgba(0,0,0,.06)',
                }}
              >
                <span className="font-serif font-semibold leading-[1.1] [hyphens:auto] [overflow-wrap:anywhere]">{b.name}</span>
              </span>
            );
            return (
              <button
                key={b.slug}
                type="button"
                title={b.name}
                onClick={() => router.push({ pathname: '/library/[book]', params: { book: b.slug } })}
                onPointerEnter={() => (hover.current = true)}
                onPointerLeave={() => (hover.current = false)}
                className="absolute [transform-style:preserve-3d]"
              >
                {face}
                <span className="absolute inset-0 [transform:rotateY(180deg)] [transform-style:preserve-3d]">{face}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}
