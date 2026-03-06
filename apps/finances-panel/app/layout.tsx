import './globals.css';
import type { Metadata } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { LayoutShell } from '../components/layout-shell';
import { SensitiveModeProvider } from '../components/sensitive-mode-provider';
import { ThemeProvider } from '../components/theme-provider';

const themeBootScript = `(() => {
  try {
    const raw = localStorage.getItem('sb-theme-mode');
    const mode = raw === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', mode);
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  try {
    const raw = localStorage.getItem('sb-sensitive-hidden');
    const mode = raw === '1' ? 'hidden' : 'visible';
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-sensitive="visible"
      suppressHydrationWarning
    >
      <body>
        <Script id="finances-theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
        <ThemeProvider>
          <SensitiveModeProvider>
            <LayoutShell>{children}</LayoutShell>
          </SensitiveModeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
