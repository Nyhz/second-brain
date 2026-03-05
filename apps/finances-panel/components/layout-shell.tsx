'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useThemeMode } from './theme-provider';
import {
  AppShell,
  type NavGroup,
  type NavItem,
  SideNav,
  ThemeSelector,
  TopNav,
} from './ui';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const withBasePath = (path: string) => {
  const normalized = `${basePath}${path}`.replace(/\/{2,}/g, '/');
  if (normalized !== '/' && normalized.endsWith('/')) {
    return normalized.slice(0, -1);
  }
  return normalized;
};

const navItems: NavItem[] = [
  { href: withBasePath('/'), label: 'Overview' },
  { href: withBasePath('/assets'), label: 'Assets' },
  { href: withBasePath('/accounts'), label: 'Accounts' },
  { href: withBasePath('/transactions'), label: 'Transactions' },
];

export function LayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { mode, setMode } = useThemeMode();
  const activeItems = navItems.map((item) => ({
    ...item,
    active:
      item.href === withBasePath('/')
        ? pathname === withBasePath('/')
        : pathname.startsWith(item.href),
  }));
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

  return (
    <AppShell
      topNav={
        <TopNav
          title="Portfolio Operations"
          eyebrow="Second Brain Finances"
          right={<ThemeSelector value={mode} onChange={setMode} compact />}
        />
      }
      sideNav={<SideNav groups={navGroups} items={activeItems} />}
    >
      {children}
    </AppShell>
  );
}
