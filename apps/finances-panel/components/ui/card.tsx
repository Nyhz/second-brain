import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type CardProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function Card({ title, children, className }: CardProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-sm',
        className,
      )}
    >
      {title ? <h3 className="px-4 pt-4 text-base font-semibold">{title}</h3> : null}
      {children}
    </section>
  );
}
