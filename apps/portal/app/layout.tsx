import './globals.css';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Script from 'next/script';
import type { ReactNode } from 'react';

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
})();`;

export const metadata: Metadata = {
  title: 'SecondBrain | Portal',
  description:
    'Internal control center for SecondBrain with platform status and app navigation.',
  applicationName: 'SecondBrain',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('sb-theme-mode')?.value;
  const initialTheme = themeCookie === 'light' ? 'light' : 'dark';

  return (
    <html lang="en" data-theme={initialTheme} suppressHydrationWarning>
      <body>
        <Script id="portal-theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
