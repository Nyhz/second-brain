import './globals.css';
import Script from 'next/script';
import type { ReactNode } from 'react';

const themeBootScript = `(() => {
  try {
    const raw = localStorage.getItem('sb-theme-mode');
    const mode = raw === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', mode);
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <Script id="portal-theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
