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
      {splitCode(content).map((part, i) =>
        part.kind === 'text' ? (
          part.value
        ) : part.kind === 'block' ? (
          <code
            key={i}
            className="my-2 block overflow-x-auto whitespace-pre rounded-lg bg-muted px-3 py-2 font-mono text-sm"
          >
            {part.value}
          </code>
        ) : (
          <code key={i} className="rounded bg-muted px-1 font-mono text-[0.9em]">
            {part.value}
          </code>
        ),
      )}
    </span>
  );
}

type Part = { kind: 'text' | 'block' | 'inline'; value: string };

/**
 * Делит текст на обычный текст и код: ```блок``` и `строчный код`.
 * KaTeX не трогает содержимое <code>, поэтому символы вроде % и // в коде безопасны.
 */
export function splitCode(text: string): Part[] {
  const parts: Part[] = [];
  const re = /```[a-z]*\n?([\s\S]*?)```|`([^`\n]+)`/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ kind: 'text', value: text.slice(last, m.index) });
    if (m[1] !== undefined) parts.push({ kind: 'block', value: m[1].replace(/\n$/, '') });
    else parts.push({ kind: 'inline', value: m[2] ?? '' });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ kind: 'text', value: text.slice(last) });
  return parts;
}
