import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export function ProgressDisclosure({ title, summary, children }: {
  title: string;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl border bg-card/70 shadow-sm">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden sm:px-5">
        <span className="font-medium">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-muted-foreground">
          {summary}
          <ChevronDown className="size-4 motion-safe:transition-transform group-open:rotate-180" aria-hidden />
        </span>
      </summary>
      <div className="border-t px-4 py-4 sm:p-5">{children}</div>
    </details>
  );
}
