'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { appModules, portalRoutes } from '../lib/portal-modules';
import { cn } from '../lib/utils';

export function PortalNavbar() {
  const pathname = usePathname() || '/';

  return (
    <div className="portal-navbar">
      <div className="portal-navbar-group">
        <span className="portal-navbar-label">Pages</span>
        <div className="portal-navbar-links">
          {portalRoutes.map((route) => {
            const active =
              route.href === '/'
                ? pathname === '/'
                : pathname === route.href || pathname.startsWith(`${route.href}/`);

            return (
              <Link
                key={route.href}
                href={route.href}
                className={cn('portal-tab', active && 'is-active')}
              >
                {route.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="portal-navbar-group portal-navbar-apps">
        <span className="portal-navbar-label">Apps</span>
        <div className="portal-navbar-links">
          {appModules.map((module) =>
            module.status === 'live' ? (
              <a key={module.name} href={module.href} className="portal-chip-link">
                {module.name}
              </a>
            ) : (
              <span key={module.name} className="portal-chip-link is-disabled" aria-disabled="true">
                {module.name}
                <span className="portal-chip-meta">Soon</span>
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
