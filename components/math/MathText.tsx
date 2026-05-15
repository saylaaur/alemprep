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
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

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
  }, [text]);

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
