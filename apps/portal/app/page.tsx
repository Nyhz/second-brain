import { cookies } from 'next/headers';
import type { ServiceStatusHistoryResponse } from '@second-brain/types';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Wallet,
} from 'lucide-react';
import { OperationsStatus } from '../components/operations-status';
import { ThemeSwitcher } from '../components/theme-switcher';

const appModules: Array<{
  name: string;
  href: string;
  description: string;
  detail: string;
  status: 'live' | 'planned';
  cta: string;
  icon: LucideIcon;
}> = [
  {
    name: 'Finances',
    href: '/finances',
    description: 'Portfolio, markets, transactions, and asset operations.',
    detail: 'Production-ready dashboard with summary, assets, and transactions.',
    status: 'live',
    cta: 'Open module',
    icon: Wallet,
  },
  {
    name: 'Calendar',
    href: '/calendar',
    description: 'Scheduling workspace and timeline orchestration.',
    detail: 'Domain shell reserved for upcoming calendar workflows.',
    status: 'planned',
    cta: 'Coming soon',
    icon: CalendarDays,
  },
  {
    name: 'Tasks',
    href: '/tasks',
    description: 'Action board for personal execution loops.',
    detail: 'Task domain will reuse shared identity and notification seams.',
    status: 'planned',
    cta: 'Coming soon',
    icon: ClipboardList,
  },
];

const createEmptyHistory = (): ServiceStatusHistoryResponse => ({
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
});

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
        history: createEmptyHistory(),
        errorMessage: `Failed to load operations history (HTTP ${response.status}).`,
      };
    }
    return {
      history: (await response.json()) as ServiceStatusHistoryResponse,
      errorMessage: null,
    };
  } catch {
    return {
      history: createEmptyHistory(),
      errorMessage: 'Failed to load operations history from API.',
    };
  }
};

export default async function HomePage() {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('sb-theme-mode')?.value;
  const initialTheme = themeCookie === 'light' ? 'light' : 'dark';
  const { history, errorMessage } = await loadHistory();
  const primaryModuleCandidate =
    appModules.find((module) => module.status === 'live') ?? appModules[0];
  const primaryModule = primaryModuleCandidate ?? null;
  const secondaryModules = primaryModule
    ? appModules.filter((module) => module.name !== primaryModule.name)
    : [];

  if (!primaryModule) {
    return (
      <main className="portal-shell">
        <section className="hero surface reveal">
          <div className="hero-head">
            <div>
              <p className="eyebrow">Second Brain Platform</p>
              <h1>Operations Control Surface</h1>
              <p>No modules configured yet for this workspace.</p>
            </div>
            <ThemeSwitcher initialMode={initialTheme} />
          </div>
        </section>
        <OperationsStatus initialHistory={history} errorMessage={errorMessage} />
      </main>
    );
  }

  const PrimaryIcon = primaryModule.icon;

  return (
    <main className="portal-shell">
      <section className="hero surface reveal">
        <div className="hero-head">
          <div>
            <p className="eyebrow">Second Brain Platform</p>
            <h1>Operations Control Surface</h1>
            <p>
              Unified entrypoint for every current and upcoming application in
              your local platform.
            </p>
          </div>
          <ThemeSwitcher initialMode={initialTheme} />
        </div>
        <div className="hero-chips">
          <span className="hero-chip">Local-first</span>
          <span className="hero-chip">Docker stack</span>
          <span className="hero-chip">Single control page</span>
        </div>
        {errorMessage ? (
          <p className="status-error hero-warning">{errorMessage}</p>
        ) : null}
      </section>

      <section className="surface reveal">
        <div className="section-head">
          <div>
            <p className="eyebrow">App Access</p>
            <h2>Domain launch hub</h2>
          </div>
          <CheckCircle2 className="section-icon" size={18} aria-hidden="true" />
        </div>
        <p className="app-access-summary">
          Make this panel your default launchpoint. Live modules stay one click
          away, while upcoming modules keep reserved slots and context.
        </p>
        <div className="app-access-grid">
          <a href={primaryModule.href} className="app-primary-card">
            <div className="app-primary-head">
              <span className="card-status live">Live module</span>
              <PrimaryIcon className="card-icon" size={18} aria-hidden="true" />
            </div>
            <h3>{primaryModule.name}</h3>
            <p>{primaryModule.description}</p>
            <p className="card-detail">{primaryModule.detail}</p>
            <div className="app-primary-footer">
              <span className="route-pill">{primaryModule.href}</span>
              <span className="app-open-link">
                {primaryModule.cta} <ArrowUpIcon />
              </span>
            </div>
          </a>

          <div className="app-secondary-stack">
            {secondaryModules.map((appModule) => {
              const Icon = appModule.icon;
              return (
                <article
                  key={appModule.name}
                  className="card disabled"
                  aria-disabled="true"
                >
                  <div className="card-head">
                    <h3>{appModule.name}</h3>
                    <span className="card-status planned">Planned</span>
                  </div>
                  <p>{appModule.description}</p>
                  <p className="card-detail">{appModule.detail}</p>
                  <div className="card-footnote">
                    <span className="route-pill">{appModule.href}</span>
                    <span>{appModule.cta}</span>
                  </div>
                  <Icon className="card-icon" size={16} aria-hidden="true" />
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <OperationsStatus initialHistory={history} errorMessage={errorMessage} />
    </main>
  );
}

function ArrowUpIcon() {
  return <ArrowUpRight className="shortcut-arrow" size={16} aria-hidden="true" />;
}
