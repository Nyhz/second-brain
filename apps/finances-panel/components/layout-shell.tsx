'use client';

import type { Account } from '@second-brain/types';
import {
  PlatformActionBar,
  PlatformBackButton,
  PlatformShell,
  PlatformSidebarNote,
  type PlatformNavGroup,
  type PlatformNavItem,
} from '@second-brain/ui';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { buildAccountSlugMaps } from '../lib/account-slugs';
import { LayoutControls } from './layout-controls';
import { SensitiveControls } from './sensitive-controls';

const navItems: PlatformNavItem[] = [
  { href: '/', label: 'Overview', kind: 'app', match: 'exact' },
  { href: '/assets', label: 'Assets', kind: 'app' },
  { href: '/accounts', label: 'Accounts', kind: 'app' },
  { href: '/transactions', label: 'Transactions', kind: 'app' },
  { href: '/taxes', label: 'Taxes', kind: 'app' },
  { href: '/audit', label: 'Audit', kind: 'app' },
];

const normalizeBasePath = (basePath?: string) => {
  if (!basePath || basePath === '/') {
    return '';
  }
  const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
};

const stripBasePath = (path: string, basePath?: string) => {
  const normalizedBasePath = normalizeBasePath(basePath);
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
  const router = useRouter();
  const pathname = usePathname() || '/';
  const appPathname = stripBasePath(
    pathname,
    process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  );
  const accountSlugMaps = buildAccountSlugMaps(initialAccounts);
  const accountChildItems: PlatformNavItem[] = initialAccounts.map((account) => {
    const slug = accountSlugMaps.slugsById.get(account.id) ?? account.id;
    return {
      href: `/accounts/${encodeURIComponent(slug)}`,
      label: account.name,
      kind: 'app',
    };
  });
  const shellItems = navItems.map((item) =>
    item.href === '/accounts'
      ? { ...item, children: accountChildItems }
      : item,
  );
  const navGroups: PlatformNavGroup[] = [
    {
      label: 'Overview',
      items: shellItems.slice(0, 1),
    },
    {
      label: 'Operations',
      items: shellItems.slice(1),
    },
  ];

  return (
    <PlatformShell
      appName="Second Brain"
      appSubtitle="Finances workspace"
      topbarEyebrow="Second Brain Finances"
      topbarTitle="Portfolio Operations"
      topbarRight={
        <LayoutControls
          initialTheme={initialTheme}
        />
      }
      contentTop={
        <PlatformActionBar
          left={<PlatformBackButton />}
          right={
            <SensitiveControls
              initialSensitiveHidden={initialSensitiveHidden}
            />
          }
        />
      }
      sidebarGroups={navGroups}
      pathname={pathname}
      appPathname={appPathname}
      appBasePath={process.env.NEXT_PUBLIC_BASE_PATH ?? ''}
      onAppNavigate={(href) => router.push(href)}
      sidebarFooter={
        <PlatformSidebarNote
          eyebrow="Accounts"
          title={`${initialAccounts.length} tracked account${initialAccounts.length === 1 ? '' : 's'}`}
          description="Sidebar keeps portfolio sections stable while the app-specific account tree stays local."
        />
      }
    >
      {children}
    </PlatformShell>
  );
}
