'use client';

import type { ReactNode } from 'react';
import {
  PlatformActionBar,
  PlatformBackButton,
  PlatformPageHeader,
  PlatformSidebarNote,
  PlatformShell as SharedPlatformShell,
  type PlatformNavGroup,
} from '@second-brain/ui';
import { usePathname } from 'next/navigation';
import { appModules, portalRoutes } from '../lib/portal-modules';
import { ThemeSwitcher } from './theme-switcher';

type ThemeMode = 'dark' | 'light';

type PortalShellProps = {
  initialTheme: ThemeMode;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  showHero?: boolean;
};

const portalSidebarGroups: PlatformNavGroup[] = [
  {
    label: 'Portal',
    items: portalRoutes.map((route) => ({
      href: route.href,
      label: route.label,
      kind: 'app' as const,
      match: route.href === '/' ? 'exact' : 'prefix',
    })),
  },
  {
    label: 'Modules',
    items: appModules.map((module) => ({
      href: module.href,
      label: module.name,
      kind: module.status === 'live' ? ('platform' as const) : ('app' as const),
      disabled: module.status !== 'live',
      match: 'prefix' as const,
      ...(module.status === 'live' ? {} : { meta: 'Soon' }),
    })),
  },
];

export function PortalShell({
  initialTheme,
  eyebrow,
  title,
  description,
  children,
  showHero = true,
}: PortalShellProps) {
  const pathname = usePathname() || '/';
  const isPortalHome = pathname === '/';

  return (
    <SharedPlatformShell
      appName="Second Brain"
      appSubtitle="Platform portal"
      topbarEyebrow="Portal"
      topbarTitle={title}
      topbarRight={<ThemeSwitcher initialMode={initialTheme} />}
      sidebarGroups={portalSidebarGroups}
      pathname={pathname}
      contentTop={
        !isPortalHome ? (
          <PlatformActionBar
            left={<PlatformBackButton />}
          />
        ) : undefined
      }
      pageHeader={
        showHero ? (
          <PlatformPageHeader
            eyebrow={eyebrow}
            title={title}
            description={description}
          />
        ) : undefined
      }
      sidebarFooter={
        <PlatformSidebarNote
          eyebrow="Local-first"
          title="Portal control surface"
          description="Shared shell for runtime status, app switching, and local operations."
        />
      }
    >
      <div className="portal-page">{children}</div>
    </SharedPlatformShell>
  );
}
