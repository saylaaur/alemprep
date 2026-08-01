'use client';

import { useEffect, useRef } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';

/**
 * Рендерит строку с LaTeX-формулами в $...$ через самохостинг KaTeX (npm-пакет).
 * Использование: <MathText text="Найдите $\\ln x$" />
 * display=true: если текст не содержит $-разделителей, оборачивает в $$...$$ (блочный режим).
 */
export function MathText({ text, className, display = false }: { text: string; className?: string; display?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  // Bare LaTeX (без $) в display-блоках оборачиваем в $$...$$ для блочного рендера
  const content = display && !/\$/.test(text) ? `$$${text}$$` : text;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  }, [content]);

  return (
    <span ref={ref} className={className}>
      {content}
    </span>
  );
}
