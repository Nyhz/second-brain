import type { ReactNode } from 'react';

type TopNavProps = {
  title: string;
  right?: ReactNode;
};

export function TopNav({ title, right }: TopNavProps) {
  return (
    <div className="flex h-16 items-center justify-between px-6">
      <div className="text-base font-semibold tracking-tight">{title}</div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}
