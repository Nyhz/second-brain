import type { ReactNode } from 'react';

type CardProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function Card({ title, children, className }: CardProps) {
  return (
    <section className={className ? `sb-ui-card ${className}` : 'sb-ui-card'}>
      {title ? <h3 className="sb-ui-card-title">{title}</h3> : null}
      {children}
    </section>
  );
}
