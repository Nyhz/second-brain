import type { Account } from '@second-brain/types';
import type { ReactNode } from 'react';
import { buildAccountSlugMaps } from '../lib/account-slugs';
import { LayoutControls } from './layout-controls';
import { AppShell } from './ui/app-shell';
import { type NavGroup, type NavItem, SideNav } from './ui/side-nav';
import { TopNav } from './ui/top-nav';

const navItems: NavItem[] = [
  { href: '/', label: 'Overview' },
  { href: '/assets', label: 'Assets' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/taxes', label: 'Taxes' },
];

type LayoutShellProps = {
  children: ReactNode;
  initialAccounts: Account[];
  initialSensitiveHidden: boolean;
  initialTheme: 'dark' | 'light';
};

export function LayoutShell({
  children,
  initialAccounts,
  initialSensitiveHidden,
  initialTheme,
}: LayoutShellProps) {
  const accountSlugMaps = buildAccountSlugMaps(initialAccounts);
  const accountChildItems: NavItem[] = initialAccounts.map((account) => {
    const slug = accountSlugMaps.slugsById.get(account.id) ?? account.id;
    return {
      href: `/accounts/${encodeURIComponent(slug)}`,
      label: account.name,
    };
  });
  const shellItems = navItems.map((item) =>
    item.href === '/accounts'
      ? { ...item, children: accountChildItems }
      : item,
  );
  const navGroups: NavGroup[] = [
    {
      label: 'Overview',
      items: shellItems.slice(0, 1),
    },
    {
      label: 'Operations',
      items: shellItems.slice(1),
    },
  ];
  const portalHref = process.env.NEXT_PUBLIC_PORTAL_URL ?? '/';

  return (
    <AppShell
      topNav={
        <TopNav
          title="Portfolio Operations"
          eyebrow="Second Brain Finances"
          left={
            <a
              href={portalHref}
              className="inline-flex h-8 items-center rounded-md border border-border bg-secondary px-3 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/85"
            >
              Go Back
            </a>
          }
          right={
            <LayoutControls
              initialSensitiveHidden={initialSensitiveHidden}
              initialTheme={initialTheme}
            />
          }
        />
      }
      sideNav={<SideNav groups={navGroups} items={shellItems} />}
    >
      {children}
    </AppShell>
  );
}
