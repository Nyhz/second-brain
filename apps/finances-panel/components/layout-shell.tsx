'use client';

import type { Account } from '@second-brain/types';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { buildAccountSlugMaps } from '../lib/account-slugs';
import { useSensitiveMode } from './sensitive-mode-provider';
import { useThemeMode } from './theme-provider';
import { AppShell } from './ui/app-shell';
import { SensitiveToggle } from './ui/sensitive-toggle';
import { type NavGroup, type NavItem, SideNav } from './ui/side-nav';
import { ThemeSelector } from './ui/theme-selector';
import { TopNav } from './ui/top-nav';

const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const normalizedBasePath = (() => {
  if (!configuredBasePath || configuredBasePath === '/') {
    return '';
  }
  const withLeadingSlash = configuredBasePath.startsWith('/')
    ? configuredBasePath
    : `/${configuredBasePath}`;
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
})();

const stripBasePath = (path: string) => {
  if (!normalizedBasePath) {
    return path || '/';
  }
  if (path === normalizedBasePath) {
    return '/';
  }
  if (path.startsWith(`${normalizedBasePath}/`)) {
    return path.slice(normalizedBasePath.length);
  }
  return path || '/';
};

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
};

export function LayoutShell({ children, initialAccounts }: LayoutShellProps) {
  const pathname = usePathname();
  const appPathname = useMemo(() => stripBasePath(pathname || '/'), [pathname]);
  const { mode, setMode } = useThemeMode();
  const { isSensitiveHidden, setSensitiveHidden } = useSensitiveMode();
  const accountRows = initialAccounts;
  const accountSlugMaps = useMemo(
    () => buildAccountSlugMaps(accountRows),
    [accountRows],
  );

  const accountChildItems = useMemo(() => {
    return accountRows.map((account) => {
      const slug = accountSlugMaps.slugsById.get(account.id) ?? account.id;
      const href = `/accounts/${encodeURIComponent(slug)}`;
      const active = appPathname === href || appPathname.startsWith(`${href}/`);
      return {
        href,
        label: account.name,
        active,
      };
    });
  }, [accountRows, accountSlugMaps, appPathname]);

  const activeItems = navItems.map((item) => {
    const nextItem: NavItem = {
      ...item,
      active:
        item.href === '/'
          ? appPathname === '/'
          : appPathname.startsWith(item.href),
    };
    if (item.href === '/accounts') {
      nextItem.children = accountChildItems;
    }
    return nextItem;
  });
  const navGroups: NavGroup[] = [
    {
      label: 'Overview',
      items: activeItems.slice(0, 1),
    },
    {
      label: 'Operations',
      items: activeItems.slice(1),
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
            <div className="flex items-center gap-2">
              <SensitiveToggle
                value={isSensitiveHidden}
                onChange={setSensitiveHidden}
                compact
              />
              <ThemeSelector value={mode} onChange={setMode} compact />
            </div>
          }
        />
      }
      sideNav={<SideNav groups={navGroups} items={activeItems} />}
    >
      {children}
    </AppShell>
  );
}
