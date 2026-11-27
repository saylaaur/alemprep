import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'mx-auto flex w-full max-w-5xl flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pb-1 pt-6 sm:px-6 sm:pt-9 lg:px-8 lg:pt-11',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="break-words text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-foreground/80 sm:text-base">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
