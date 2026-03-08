import { cookies } from 'next/headers';
import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, DatabaseBackup, ShieldCheck, Wallet } from 'lucide-react';
import { PortalShell } from '../components/portal-shell';
import {
  loadOpsDashboard,
  statusClassName,
  statusFromRunStatus,
} from '../lib/operations-data';

export default async function HomePage() {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('sb-theme-mode')?.value;
  const initialTheme = themeCookie === 'light' ? 'light' : 'dark';
  const { dashboard, errorMessage } = await loadOpsDashboard(6);
  const latestBackup = dashboard?.backups[0] ?? null;
  const latestJobs = dashboard?.jobs.slice(0, 5) ?? [];
  const latestImports = dashboard?.imports.slice(0, 5) ?? [];

  return (
    <PortalShell
      initialTheme={initialTheme}
      eyebrow="Second Brain Platform"
      title="Portal Home"
      description="A minimal front door for the local platform."
      showHero={false}
    >
      <section className="portal-command reveal">
        <div className="surface portal-command-primary">
          <div className="portal-command-head">
            <div className="portal-minimal-mark">
              <Wallet size={28} aria-hidden="true" />
              <span>Finances</span>
            </div>
            <span className="route-pill">Primary app</span>
          </div>
          <h1>Financial control surface</h1>
          <p>
            Open the live finance workspace, then use this portal to monitor
            backup confidence, import review pressure, and recent platform jobs.
          </p>
          <div className="portal-command-actions">
            <a href="/finances" className="portal-cta portal-cta-primary portal-cta-large">
              Open Financial App
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
            <Link href="/status" className="portal-cta portal-cta-secondary">
              Runtime Status
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="portal-command-side">
          <article className="surface command-kpi">
            <div className="command-kpi-head">
              <DatabaseBackup size={18} aria-hidden="true" />
              <span>Backup Confidence</span>
            </div>
            <strong className={statusClassName(statusFromRunStatus(latestBackup?.status))}>
              {dashboard?.summary.backupFresh ? 'Fresh' : latestBackup ? latestBackup.status : 'Unknown'}
            </strong>
            <p>
              {latestBackup
                ? `Last backup ${new Date(latestBackup.startedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`
                : 'No backup runs recorded yet.'}
            </p>
          </article>
          <article className="surface command-kpi">
            <div className="command-kpi-head">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>Review Queue</span>
            </div>
            <strong>{dashboard?.summary.reviewImports ?? 0}</strong>
            <p>Recent imports that are dry-run or contain failed rows.</p>
          </article>
          <article className="surface command-kpi">
            <div className="command-kpi-head">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>Failed Ops</span>
            </div>
            <strong>{(dashboard?.summary.failedJobs ?? 0) + (dashboard?.summary.failedImports ?? 0)}</strong>
            <p>Combined recent failed jobs and imports requiring attention.</p>
          </article>
        </div>
      </section>

      {errorMessage ? <p className="status-error">{errorMessage}</p> : null}

      <section className="portal-grid portal-command-grid reveal">
        <div className="surface section-stack">
          <div className="section-head">
            <div>
              <p className="eyebrow">Recent Jobs</p>
              <h2>Worker and platform activity</h2>
            </div>
          </div>
          <div className="command-list">
            {latestJobs.length === 0 ? (
              <p className="command-empty">No job runs recorded yet.</p>
            ) : (
              latestJobs.map((job) => (
                <article key={job.id} className="command-row">
                  <div>
                    <p>{job.jobName}</p>
                    <span>
                      Started {new Date(job.startedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
                    </span>
                  </div>
                  <strong className={statusClassName(job.status === 'success' ? 'operational' : job.status === 'failed' ? 'down' : 'degraded')}>
                    {job.status}
                  </strong>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="surface section-stack">
          <div className="section-head">
            <div>
              <p className="eyebrow">Recent Imports</p>
              <h2>Items that may need review</h2>
            </div>
          </div>
          <div className="command-list">
            {latestImports.length === 0 ? (
              <p className="command-empty">No import runs recorded yet.</p>
            ) : (
              latestImports.map((item) => (
                <article key={item.id} className="command-row">
                  <div>
                    <p>{item.source.toUpperCase()} · {item.filename}</p>
                    <span>
                      Failed {item.failedRows} · Imported {item.importedRows} / {item.totalRows}
                    </span>
                  </div>
                  <strong className={item.reviewRecommended ? 'is-degraded' : 'is-operational'}>
                    {item.reviewRecommended ? 'Review' : 'Clean'}
                  </strong>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </PortalShell>
  );
}
