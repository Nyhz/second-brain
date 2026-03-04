'use client';

import {
  AppShell,
  ThemeSelector,
  type NavItem,
  SideNav,
  TopNav,
} from './ui';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useThemeMode } from './theme-provider';

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
  { href: withBasePath('/portfolio'), label: 'Portfolio' },
  { href: withBasePath('/markets'), label: 'Markets' },
  { href: withBasePath('/assets'), label: 'Assets' },
  { href: withBasePath('/accounts'), label: 'Accounts' },
  { href: withBasePath('/transactions'), label: 'Transactions' },
  { href: withBasePath('/settings'), label: 'Settings' },
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

  return (
    <AppShell
      topNav={
        <TopNav
          title="Second Brain Finances"
          right={
            <ThemeSelector value={mode} onChange={setMode} compact />
          }
        />
      }
      sideNav={<SideNav items={activeItems} />}
    >
      {children}
    </AppShell>
  );
}
