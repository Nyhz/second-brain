import { cn } from '../../lib/utils';

export type NavItem = {
  href: string;
  label: string;
  active?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

type SideNavProps = {
  items?: NavItem[];
  groups?: NavGroup[];
};

export function SideNav({ items = [], groups }: SideNavProps) {
  const groupedItems =
    groups && groups.length > 0 ? groups : [{ label: 'Navigation', items }];

  return (
    <nav className="space-y-5" aria-label="Main Navigation">
      <div className="border-b border-border/60 pb-4">
        <p className="text-sm font-semibold tracking-tight">Second Brain</p>
        <p className="mt-1 text-xs text-muted-foreground">Finances</p>
      </div>
      {groupedItems.map((group) => (
        <div key={group.label} className="space-y-1.5">
          <p className="px-2 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/90">
            {group.label}
          </p>
          <div className="grid gap-1">
            {group.items.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  'rounded-md px-3 py-2 text-sm transition-colors',
                  item.active
                    ? 'bg-muted text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
