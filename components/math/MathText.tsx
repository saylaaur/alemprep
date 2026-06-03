'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    renderMathInElement?: (
      element: HTMLElement,
      options?: {
        delimiters?: { left: string; right: string; display: boolean }[];
        throwOnError?: boolean;
      }
    ) => void;
  }
}

/**
 * Рендерит строку с LaTeX-формулами в $...$ через KaTeX (CDN).
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
    const tryRender = () => {
      if (window.renderMathInElement) {
        window.renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
          ],
          throwOnError: false,
        });
      } else {
        setTimeout(tryRender, 100);
      }
    };
    tryRender();
  }, [content]);

  return (
    <span ref={ref} className={className}>
      {content}
    </span>
  );
}
