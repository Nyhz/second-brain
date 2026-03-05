import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type CardProps = {
  title?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function Card({
  title,
  children,
  className,
  contentClassName,
}: CardProps) {
  return (
    <section
      className={cn(
        'rounded-xl border border-border/70 bg-card/95 text-card-foreground shadow-sm',
        className,
      )}
    >
      {title ? (
        <header className="border-b border-border/60 px-5 py-3.5">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        </header>
      ) : null}
      <div className={cn('px-5 py-4', contentClassName)}>{children}</div>
    </section>
  );
}
