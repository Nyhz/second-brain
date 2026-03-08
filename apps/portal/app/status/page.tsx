import { cookies } from 'next/headers';
import { OperationsStatus } from '../../components/operations-status';
import { PortalShell } from '../../components/portal-shell';
import { loadOperationsHistory } from '../../lib/operations-data';

export default async function StatusPage() {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('sb-theme-mode')?.value;
  const initialTheme = themeCookie === 'light' ? 'light' : 'dark';
  const { history, errorMessage } = await loadOperationsHistory(24);

  return (
    <PortalShell
      initialTheme={initialTheme}
      eyebrow="Second Brain Platform"
      title="Operations Status"
      description="Dedicated runtime visibility for platform services, recent health history, and on-demand checks."
    >
      <OperationsStatus
        initialHistory={history}
        errorMessage={errorMessage}
        hoursLabel="24h history"
      />
    </PortalShell>
  );
}
