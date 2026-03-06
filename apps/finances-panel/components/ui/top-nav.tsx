import type { ReactNode } from 'react';

type TopNavProps = {
  title: string;
  eyebrow?: string;
  left?: ReactNode;
  right?: ReactNode;
};

export function TopNav({ title, eyebrow, left, right }: TopNavProps) {
  return (
    <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6 xl:px-8">
      <div className="flex min-w-0 items-center gap-3">
        {left ? <div className="shrink-0">{left}</div> : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <p className="truncate text-sm font-semibold tracking-tight">{title}</p>
        </div>
      </div>
      {right ? (
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-2 py-1">
          {right}
        </div>
      ) : null}
    </div>
  );
}
