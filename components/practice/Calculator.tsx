'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { X, Delete } from 'lucide-react';
import { cn } from '@/lib/utils';
import { evaluate, formatValue } from '@/lib/calculator';

/** Символы, которые можно вводить с клавиатуры в дисплей. */
const ALLOWED_INPUT = /^[0-9.,+\-*/×÷()%√\s]*$/;

type ButtonSpec = { label: string; append?: string; action?: 'clear' | 'backspace' | 'equals' };

const GRID: ButtonSpec[] = [
  { label: '7', append: '7' }, { label: '8', append: '8' }, { label: '9', append: '9' }, { label: '÷', append: '÷' },
  { label: '4', append: '4' }, { label: '5', append: '5' }, { label: '6', append: '6' }, { label: '×', append: '×' },
  { label: '1', append: '1' }, { label: '2', append: '2' }, { label: '3', append: '3' }, { label: '−', append: '-' },
  { label: '0', append: '0' }, { label: ',', append: ',' }, { label: '%', append: '%' }, { label: '+', append: '+' },
  { label: '√', append: '√' }, { label: '(', append: '(' }, { label: ')', append: ')' }, { label: '=', action: 'equals' },
];

export function Calculator({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('calc');
  const [expr, setExpr] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const append = (s: string) => {
    setError(false);
    setExpr((prev) => prev + s);
    inputRef.current?.focus();
  };

  const doEquals = () => {
    const res = evaluate(expr);
    if (res.ok) {
      setExpr(formatValue(res.value));
      setError(false);
    } else {
      setError(true);
    }
    inputRef.current?.focus();
  };

  const doClear = () => { setExpr(''); setError(false); inputRef.current?.focus(); };
  const doBackspace = () => { setError(false); setExpr((p) => p.slice(0, -1)); inputRef.current?.focus(); };

  return (
    <div
      role="dialog"
      aria-label={t('title')}
      className="fixed bottom-4 right-4 z-40 w-72 rounded-2xl border bg-card p-3 shadow-lg"
      onKeyDown={(e) => {
        // не даём цифрам/стрелкам утечь в шорткаты экзамена
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        if (e.key === 'Enter') { e.preventDefault(); doEquals(); }
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('title')}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <input
        ref={inputRef}
        value={expr}
        onChange={(e) => {
          if (ALLOWED_INPUT.test(e.target.value)) {
            setError(false);
            setExpr(e.target.value);
          }
        }}
        aria-label={t('display')}
        aria-invalid={error}
        placeholder="0"
        inputMode="text"
        autoComplete="off"
        className={cn(
          'mb-2 w-full rounded-lg border bg-background px-3 py-2.5 text-right font-mono text-lg tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/25',
          error && 'border-destructive/60 text-destructive'
        )}
      />
      <div className="mb-2 h-4 text-right text-xs text-destructive" aria-live="polite">
        {error ? t('error') : ''}
      </div>

      <div className="mb-1.5 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={doClear}
          className="h-10 rounded-lg bg-muted text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 focus-visible:ring-4 focus-visible:ring-ring/25"
        >
          {t('clear')}
        </button>
        <button
          type="button"
          onClick={doBackspace}
          aria-label={t('backspace')}
          className="grid h-10 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors hover:bg-muted/70 focus-visible:ring-4 focus-visible:ring-ring/25"
        >
          <Delete className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {GRID.map((b) => (
          <button
            key={b.label}
            type="button"
            aria-label={b.action === 'equals' ? t('equals') : undefined}
            onClick={() => {
              if (b.action === 'equals') doEquals();
              else if (b.append) append(b.append);
            }}
            className={cn(
              'h-10 rounded-lg font-mono text-sm font-medium transition-colors focus-visible:ring-4 focus-visible:ring-ring/25',
              b.action === 'equals'
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted/60 hover:bg-muted'
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
