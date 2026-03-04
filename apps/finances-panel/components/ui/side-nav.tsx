import { cn } from '../../lib/utils';

export type NavItem = {
  href: string;
  label: string;
  active?: boolean;
};

type SideNavProps = {
  items: NavItem[];
};

export function SideNav({ items }: SideNavProps) {
  return (
    <nav className="grid gap-1" aria-label="Main Navigation">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className={cn(
            'rounded-md px-3 py-2 text-sm transition-colors',
            item.active
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
