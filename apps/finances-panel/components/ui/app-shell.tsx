import type { ReactNode } from 'react';

type AppShellProps = {
  topNav: ReactNode;
  sideNav: ReactNode;
  children: ReactNode;
};

export function AppShell({ topNav, sideNav, children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen md:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-border/60 bg-background/95 p-5 md:block">
          <div className="sticky top-5">{sideNav}</div>
        </aside>
        <div className="min-w-0">
          <header className="sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur">
            {topNav}
          </header>
          <aside className="border-b border-border/60 bg-background/95 p-4 md:hidden">
            {sideNav}
          </aside>
          <main className="px-4 py-6 md:px-6 xl:px-8">
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
