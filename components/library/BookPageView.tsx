import { MathText } from '@/components/math/MathText';
import type { BookPage } from '@/lib/books/content';
import { cn } from '@/lib/utils';

/** Текст с **жирным** и формулами в $...$. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <strong key={i} className="font-semibold">
            <MathText text={p.slice(2, -2)} />
          </strong>
        ) : (
          <MathText key={i} text={p} />
        )
      )}
    </span>
  );
}

/** Цвета страниц книги: книга — предмет, она одинакова в светлой и тёмной теме. */
export const PAGE_TONES = [
  { bg: '#dff6ec', fg: '#0b0d0c', accent: '#0f3b2b', chip: '#0f3b2b', chipFg: '#dff6ec' },
  { bg: '#f7f7f2', fg: '#0b0d0c', accent: '#17845d', chip: '#dff6ec', chipFg: '#0f3b2b' },
  { bg: '#0f3b2b', fg: '#f4f7f5', accent: '#a6f4d0', chip: '#2bc98f', chipFg: '#062a1d' },
  { bg: '#0b0d0c', fg: '#f4f7f5', accent: '#2bc98f', chip: '#2bc98f', chipFg: '#062a1d' },
] as const;
export type PageTone = (typeof PAGE_TONES)[number];

export function BookPageView({ page, tone, className }: { page: BookPage; tone: PageTone; className?: string }) {
  return (
    <div
      className={cn('flex h-full flex-col justify-center gap-[0.8em] overflow-y-auto p-[clamp(16px,5%,44px)] text-[clamp(12px,1.35vw,16px)]', className)}
      style={{ background: tone.bg, color: tone.fg }}
    >
      {page.kicker && <div className="text-[0.75em] font-semibold uppercase tracking-[0.1em] opacity-60">{page.kicker}</div>}
      <h3 className="font-serif text-[1.9em] font-semibold leading-[1.05] tracking-[-0.01em]">{page.title}</h3>
      {page.blocks.map((b, i) => {
        switch (b.type) {
          case 'text':
            return <p key={i} className="font-serif leading-[1.5]"><RichText text={b.text} /></p>;
          case 'formula':
            return (
              <div key={i} className="self-start rounded-[0.5em] px-[0.8em] py-[0.4em] text-[1.25em]" style={{ background: tone.chip, color: tone.chipFg }}>
                <MathText text={b.tex} display />
              </div>
            );
          case 'list': {
            const L = b.ordered ? 'ol' : 'ul';
            return (
              <L key={i} className={cn('grid gap-[0.35em] pl-[1.2em] font-serif leading-[1.45]', b.ordered ? 'list-decimal' : 'list-disc')}>
                {b.items.map((it, j) => <li key={j}><RichText text={it} /></li>)}
              </L>
            );
          }
          case 'note':
            return (
              <div key={i} className="rounded-[0.7em] px-[0.9em] py-[0.6em] text-[0.95em] leading-[1.45]" style={{ background: tone.chip, color: tone.chipFg }}>
                <RichText text={b.text} />
              </div>
            );
          case 'trap':
            return (
              <ul key={i} className="grid gap-[0.45em] font-serif leading-[1.45]">
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-[0.5em]">
                    <span aria-hidden className="mt-[0.15em] font-sans font-bold" style={{ color: tone.accent }}>!</span>
                    <RichText text={it} />
                  </li>
                ))}
              </ul>
            );
        }
      })}
    </div>
  );
}
