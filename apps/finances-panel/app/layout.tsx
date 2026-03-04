import './globals.css';
import type { ReactNode } from 'react';
import { LayoutShell } from '../components/layout-shell';
import { ThemeProvider } from '../components/theme-provider';

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
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <ThemeProvider>
          <LayoutShell>{children}</LayoutShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
