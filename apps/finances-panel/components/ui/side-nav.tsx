'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils';

export type NavItem = {
  href: string;
  label: string;
  active?: boolean;
  children?: NavItem[];
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const parentItems = useMemo(
    () =>
      groupedItems
        .flatMap((group) => group.items)
        .filter((item) => Array.isArray(item.children) && item.children.length > 0),
    [groupedItems],
  );

  useEffect(() => {
    setExpanded((current) => {
      const next = { ...current };
      let changed = false;

      for (const item of parentItems) {
        const hasActiveChild = Boolean(item.children?.some((child) => child.active));
        if (next[item.href] === undefined) {
          next[item.href] = Boolean(item.active || hasActiveChild);
          changed = true;
          continue;
        }
        if ((item.active || hasActiveChild) && !next[item.href]) {
          next[item.href] = true;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [parentItems]);

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
            {group.items.map((item) => {
              const children = item.children ?? [];
              const hasChildren = children.length > 0;
              const isExpanded = expanded[item.href] ?? false;

              if (!hasChildren) {
                return (
                  <Link
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
                  </Link>
                );
              }

              return (
                <div key={item.href} className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Link
                      href={item.href}
                      className={cn(
                        'min-w-0 flex-1 rounded-md px-3 py-2 text-sm transition-colors',
                        item.active
                          ? 'bg-muted text-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {item.label}
                    </Link>
                    <button
                      type="button"
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${item.label}`}
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpanded((current) => ({
                          ...current,
                          [item.href]: !isExpanded,
                        }))
                      }
                      className="rounded-md border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {isExpanded ? '-' : '+'}
                    </button>
                  </div>
                  {isExpanded ? (
                    <div className="ml-3 border-l border-border/50 pl-2">
                      <div className="grid gap-1">
                        {children.map((child) => (
                          <Link
                            key={child.href}
                            href={child.href}
                            className={cn(
                              'rounded-md px-3 py-1.5 text-xs transition-colors',
                              child.active
                                ? 'bg-muted text-foreground shadow-sm'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                            )}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
