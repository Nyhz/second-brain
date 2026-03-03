import type { ReactNode } from 'react';

type AppShellProps = {
  topNav: ReactNode;
  sideNav: ReactNode;
  children: ReactNode;
};

export function AppShell({ topNav, sideNav, children }: AppShellProps) {
  return (
    <div className="sb-ui-shell">
      <header className="sb-ui-topbar">{topNav}</header>
      <aside className="sb-ui-sidebar">{sideNav}</aside>
      <main className="sb-ui-main">{children}</main>
    </div>
  );
}
