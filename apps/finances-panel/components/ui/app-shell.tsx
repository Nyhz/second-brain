import type { ReactNode } from 'react';

type AppShellProps = {
  topNav: ReactNode;
  sideNav: ReactNode;
  children: ReactNode;
};

export function AppShell({ topNav, sideNav, children }: AppShellProps) {
  return (
    <div className="grid min-h-screen grid-cols-[250px_1fr] grid-rows-[64px_1fr] bg-background text-foreground">
      <header className="col-start-2 row-start-1 border-b border-border bg-background/95 backdrop-blur">
        {topNav}
      </header>
      <aside className="col-start-1 row-span-2 row-start-1 border-r border-border bg-card p-4">
        {sideNav}
      </aside>
      <main className="col-start-2 row-start-2 p-6">{children}</main>
    </div>
  );
}
