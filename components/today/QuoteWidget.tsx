'use client';

import { useState } from 'react';
import { QUOTES, dailyQuoteIndex } from '@/lib/quotes';
import type { Locale } from '@/types/db';

/** Цитата дня; нажатие показывает следующую. Казахский оригинал виден всегда. */
export function QuoteWidget({
  date,
  locale,
  title,
  nextLabel,
}: {
  date: string;
  locale: Locale;
  title: string;
  nextLabel: string;
}) {
  const [index, setIndex] = useState(() => dailyQuoteIndex(date));
  const q = QUOTES[index];

  return (
    <button
      type="button"
      onClick={() => setIndex((i) => (i + 1) % QUOTES.length)}
      aria-label={nextLabel}
      title={nextLabel}
      className="glass flex flex-col rounded-3xl p-5 text-left transition-[background-color,border-color,transform] duration-200 ease-apple hover:border-primary/30 hover:bg-card motion-safe:active:scale-[0.99] sm:col-span-2"
    >
      <span className="text-xs font-semibold text-muted-foreground">{title}</span>
      <span className="mt-3 block text-balance font-serif text-[clamp(20px,2.4vw,26px)] italic leading-snug">«{q.text}»</span>
      {locale === 'ru' && <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">{q.ru}</span>}
      <span className="mt-1.5 block text-xs text-muted-foreground">{q.author[locale]}</span>
    </button>
  );
}
