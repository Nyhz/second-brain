import type { ReactNode } from 'react';

type PortalTopbarProps = {
  eyebrow: string;
  title: string;
  description: string;
  right?: ReactNode;
};

export function PortalTopbar({
  eyebrow,
  title,
  description,
  right,
}: PortalTopbarProps) {
  return (
    <div className="portal-topbar">
      <div className="portal-topbar-copy">
        <p className="portal-topbar-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {right ? <div className="portal-topbar-actions">{right}</div> : null}
    </div>
  );
}
