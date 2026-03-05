import type { ServiceStatusHistoryResponse } from '@second-brain/types';
import { OperationsStatus } from '../components/operations-status';
import { ThemeSwitcher } from '../components/theme-switcher';

const apps = [
  {
    name: 'Finances',
    href: '/finances',
    description: 'Portfolio, markets, transactions, and asset operations.',
  },
  {
    name: 'Calendar',
    href: '/calendar',
    description: 'Upcoming domain app slot.',
    disabled: true,
  },
  {
    name: 'Tasks',
    href: '/tasks',
    description: 'Upcoming domain app slot.',
    disabled: true,
  },
];

const emptyHistory: ServiceStatusHistoryResponse = {
  generatedAt: new Date().toISOString(),
  services: [
    {
      service: 'api',
      points: Array.from({ length: 24 }, (_, index) => ({
        hourIso: new Date(Date.now() - (23 - index) * 3600_000).toISOString(),
        status: 'unknown',
        latencyMs: null,
        httpStatus: null,
      })),
    },
    {
      service: 'worker',
      points: Array.from({ length: 24 }, (_, index) => ({
        hourIso: new Date(Date.now() - (23 - index) * 3600_000).toISOString(),
        status: 'unknown',
        latencyMs: null,
        httpStatus: null,
      })),
    },
    {
      service: 'caddy',
      points: Array.from({ length: 24 }, (_, index) => ({
        hourIso: new Date(Date.now() - (23 - index) * 3600_000).toISOString(),
        status: 'unknown',
        latencyMs: null,
        httpStatus: null,
      })),
    },
  ],
};

const loadHistory = async (): Promise<{
  history: ServiceStatusHistoryResponse;
  errorMessage: string | null;
}> => {
  const apiBase = process.env.INTERNAL_API_URL ?? 'http://api:3001';
  try {
    const response = await fetch(`${apiBase}/ops/status/history?hours=24`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return {
        history: emptyHistory,
        errorMessage: `Failed to load operations history (HTTP ${response.status}).`,
      };
    }
    return {
      history: (await response.json()) as ServiceStatusHistoryResponse,
      errorMessage: null,
    };
  } catch {
    return {
      history: emptyHistory,
      errorMessage: 'Failed to load operations history from API.',
    };
  }
};

export default async function HomePage() {
  const { history, errorMessage } = await loadHistory();

  return (
    <main className="portal-shell">
      <section className="hero">
        <div className="hero-head">
          <div>
            <p className="eyebrow">Second Brain Platform</p>
            <h1>Unified app ecosystem</h1>
            <p>
              One gateway for all personal apps. Use sections below to access
              active modules and operations endpoints.
            </p>
          </div>
          <ThemeSwitcher />
        </div>
      </section>

      <section className="grid cards">
        {apps.map((app) => (
          <a
            key={app.name}
            href={app.disabled ? '#' : app.href}
            aria-disabled={app.disabled ? 'true' : undefined}
            className={app.disabled ? 'card disabled' : 'card'}
          >
            <h2>{app.name}</h2>
            <p>{app.description}</p>
            <span>{app.disabled ? 'Coming soon' : 'Open module'}</span>
          </a>
        ))}
      </section>

      <OperationsStatus initialHistory={history} errorMessage={errorMessage} />
    </main>
  );
}
