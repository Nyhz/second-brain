'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

type CollapsibleCardProps = {
  title: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  defaultOpen?: boolean;
};

export function CollapsibleCard({
  title,
  children,
  className,
  contentClassName,
  defaultOpen = true,
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section
      className={cn(
        'rounded-xl border border-border/70 bg-card/95 text-card-foreground shadow-sm',
        className,
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-5 py-3.5 text-left"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isOpen && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>
      {isOpen ? <div className={cn('px-5 py-4', contentClassName)}>{children}</div> : null}
    </section>
  );
}
