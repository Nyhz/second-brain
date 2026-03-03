import '@second-brain/ui/styles.css';
import './globals.css';
import type { ReactNode } from 'react';
import { LayoutShell } from '../components/layout-shell';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
