'use client';

import { AppShell, type NavItem, SideNav, TopNav } from '@second-brain/ui';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

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
          title="Second Brain Markets"
          right={
            <div className="top-nav-actions">
              <button type="button">1D</button>
              <button type="button">1W</button>
              <button type="button">1M</button>
              <button type="button">1Y</button>
            </div>
          }
        />
      }
      sideNav={<SideNav items={activeItems} />}
    >
      {children}
    </AppShell>
  );
}
