import type { ReactNode } from 'react';

type TopNavProps = {
  title: string;
  right?: ReactNode;
};

export function TopNav({ title, right }: TopNavProps) {
  return (
    <div className="sb-ui-topnav-row">
      <div className="sb-ui-brand">{title}</div>
      <div className="sb-ui-topnav-right">{right}</div>
    </div>
  );
}
