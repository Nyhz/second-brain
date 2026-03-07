import './globals.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { LayoutShell } from '../components/layout-shell';
import { loadServerAccountsData } from '../lib/data/server-data';

const themeBootScript = `(() => {
  try {
    const rawStorage = localStorage.getItem('sb-theme-mode');
    const rawCookie =
      document.cookie
        .split('; ')
        .find((entry) => entry.startsWith('sb-theme-mode='))
        ?.split('=')[1] ?? null;
    const mode =
      rawStorage === 'light' || rawCookie === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', mode);
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  try {
    const rawStorage = localStorage.getItem('sb-sensitive-hidden');
    const rawCookie =
      document.cookie
        .split('; ')
        .find((entry) => entry.startsWith('sb-sensitive-hidden='))
        ?.split('=')[1] ?? null;
    const mode =
      rawStorage === '1' || rawCookie === '1' ? 'hidden' : 'visible';
    document.documentElement.setAttribute('data-sensitive', mode);
  } catch {
    document.documentElement.setAttribute('data-sensitive', 'visible');
  }
})();`;

export const metadata: Metadata = {
  title: 'SecondBrain | Finances',
  description:
    'Internal investment dashboard for portfolio performance, positions, transactions, and assets.',
  applicationName: 'SecondBrain',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('sb-theme-mode')?.value;
  const sensitiveCookie = cookieStore.get('sb-sensitive-hidden')?.value;
  const initialTheme = themeCookie === 'light' ? 'light' : 'dark';
  const initialSensitiveHidden = sensitiveCookie === '1';
  const accountsData = await loadServerAccountsData().catch(() => ({
    rows: [],
  }));

  return (
    <html
      lang="en"
      data-theme={initialTheme}
      data-sensitive={initialSensitiveHidden ? 'hidden' : 'visible'}
      suppressHydrationWarning
    >
      <body>
        <Script id="finances-theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
        <LayoutShell
          initialAccounts={accountsData.rows}
          initialSensitiveHidden={initialSensitiveHidden}
          initialTheme={initialTheme}
        >
          {children}
        </LayoutShell>
      </body>
    </html>
  );
}
