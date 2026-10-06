'use client';

export function SaveStatus({ children }: { children: React.ReactNode }) {
  return <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{children}</p>;
}
