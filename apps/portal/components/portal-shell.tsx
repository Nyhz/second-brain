import type { ReactNode } from 'react';
import { PortalNavbar } from './portal-navbar';
import { ThemeSwitcher } from './theme-switcher';
import { PortalTopbar } from './portal-topbar';

type ThemeMode = 'dark' | 'light';

type PortalShellProps = {
  initialTheme: ThemeMode;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  showHero?: boolean;
};

export function PortalShell({
  initialTheme,
  eyebrow,
  title,
  description,
  children,
  showHero = true,
}: PortalShellProps) {
  return (
    <div className="portal-app-shell">
      <div className="portal-main-wrap">
        <header className="portal-header">
          <div className="surface portal-frame reveal">
            <div className="portal-frame-topline">
              <div className="portal-brand">
                <p>Second Brain</p>
                <span>Platform portal</span>
              </div>
              <ThemeSwitcher initialMode={initialTheme} />
            </div>
            <PortalNavbar />
          </div>
        </header>
        {showHero ? (
          <section className="portal-hero-frame surface reveal">
            <PortalTopbar
              eyebrow={eyebrow}
              title={title}
              description={description}
            />
          </section>
        ) : null}
        <main className="portal-page">{children}</main>
      </div>
    </div>
  );
}
