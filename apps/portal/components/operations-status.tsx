'use client';

import type {
  ServiceCheckNowResponse,
  ServiceStatusHistoryResponse,
} from '@second-brain/types';
import { useMemo, useState } from 'react';
import {
  defaultProbeTargets,
  formatStatusDateTime,
  formatStatusHour,
  statusClassName,
  statusLabel,
  summarizeCheckNowResults,
  summarizeOperationsHistory,
} from '../lib/operations-data';
import { Button } from './ui/button';
import { Modal } from './ui/modal';

type OperationsStatusProps = {
  initialHistory: ServiceStatusHistoryResponse;
  errorMessage?: string | null;
  hoursLabel: string;
};

export function OperationsStatus({
  initialHistory,
  errorMessage: historyErrorMessage = null,
  hoursLabel,
}: OperationsStatusProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [checkNow, setCheckNow] = useState<ServiceCheckNowResponse | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [checkErrorMessage, setCheckErrorMessage] = useState<string | null>(null);

  const historySummary = useMemo(
    () => summarizeOperationsHistory(initialHistory),
    [initialHistory],
  );

  const checkNowSummary = useMemo(
    () => (checkNow ? summarizeCheckNowResults(checkNow.results) : null),
    [checkNow],
  );

  const timelineAxis = useMemo(() => {
    const points = initialHistory.services[0]?.points ?? [];
    return points.map((point, index) => {
      const showLabel = index === 0 || index === points.length - 1 || index % 6 === 0;
      return {
        hourIso: point.hourIso,
        label: showLabel ? formatStatusHour(point.hourIso) : '',
      };
    });
  }, [initialHistory]);

  const runCheckNow = async () => {
    setIsChecking(true);
    setCheckErrorMessage(null);

    try {
      const response = await fetch('/api/ops/status/check-now', {
        method: 'POST',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`Check failed (${response.status})`);
      }
      const payload = (await response.json()) as ServiceCheckNowResponse;
      setCheckNow(payload);
      setModalOpen(true);
    } catch (error) {
      setCheckErrorMessage(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <section className="status-wrap reveal">
      <div className="status-head surface">
        <div>
          <p className="eyebrow">Runtime Health</p>
          <h2>24-hour service matrix</h2>
          <p>
            Hourly persisted probes across API, Worker, and Caddy with a live
            check action layered on top for immediate confirmation.
          </p>
        </div>
        <div className="status-head-actions">
          <span className="route-pill">{hoursLabel}</span>
          <Button
            type="button"
            onClick={() => void runCheckNow()}
            disabled={isChecking}
            variant="primary"
          >
            {isChecking ? 'Checking...' : 'Check now'}
          </Button>
        </div>
      </div>

      {historyErrorMessage ? <p className="status-error">{historyErrorMessage}</p> : null}
      {checkErrorMessage ? <p className="status-error">{checkErrorMessage}</p> : null}

      <div className="status-kpi-grid">
        <article className="surface status-kpi">
          <span>Overall status</span>
          <strong className={statusClassName(historySummary.overallStatus)}>
            {historySummary.overallStatusLabel}
          </strong>
          <p>Worst current service state across the monitored platform.</p>
        </article>
        <article className="surface status-kpi">
          <span>24h availability</span>
          <strong>{historySummary.availabilityLabel}</strong>
          <p>Operational samples divided by all known hourly samples.</p>
        </article>
        <article className="surface status-kpi">
          <span>Degraded samples</span>
          <strong>{historySummary.degradedSamples}</strong>
          <p>Observed hourly points that returned a degraded state.</p>
        </article>
        <article className="surface status-kpi">
          <span>Down samples</span>
          <strong>{historySummary.downSamples}</strong>
          <p>Observed hourly points that failed outright in the current window.</p>
        </article>
      </div>

      <div className="surface section-stack">
        <div className="section-head">
          <div>
            <p className="eyebrow">Timeline</p>
            <h2>Hourly probe history</h2>
          </div>
        </div>

        <div className="timeline-grid">
          {historySummary.services.map((service) => (
            <div key={service.service} className="timeline-row">
              <div className="timeline-label-wrap">
                <div className="timeline-label">{service.service.toUpperCase()}</div>
                <div className={`timeline-status-copy ${statusClassName(service.currentStatus)}`}>
                  {statusLabel(service.currentStatus)}
                </div>
              </div>
              <div
                className="timeline-points"
                role="img"
                aria-label={`${service.service} hourly status timeline`}
              >
                {service.points.map((point) => (
                  <div
                    key={`${service.service}-${point.hourIso}`}
                    className={`timeline-point ${statusClassName(point.status)}`}
                    title={`${formatStatusDateTime(point.hourIso)} · ${statusLabel(point.status)}${point.httpStatus ? ` · HTTP ${point.httpStatus}` : ''}${point.latencyMs !== null ? ` · ${point.latencyMs}ms` : ''}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div
          className="timeline-axis"
          style={{ gridTemplateColumns: `repeat(${timelineAxis.length || 1}, minmax(8px, 1fr))` }}
          aria-hidden="true"
        >
          {timelineAxis.map((item) => (
            <span key={item.hourIso}>{item.label}</span>
          ))}
        </div>
        <div className="timeline-range">
          <span>Window start</span>
          <span>Latest data</span>
        </div>
      </div>

      <div className="status-detail-grid">
        {historySummary.services.map((service) => (
          <article key={service.service} className="surface status-service-card">
            <div className="status-service-head">
              <div>
                <p className="status-service-name">{service.service.toUpperCase()}</p>
                <p className="status-service-meta">
                  Last known check:{' '}
                  {service.latest ? formatStatusDateTime(service.latest.hourIso) : 'No data'}
                </p>
              </div>
              <span className={`ops-state-pill ${statusClassName(service.currentStatus)}`}>
                {statusLabel(service.currentStatus)}
              </span>
            </div>
            <div className="status-service-kpis">
              <div>
                <span>Availability</span>
                <strong>{service.availabilityLabel}</strong>
              </div>
              <div>
                <span>Avg latency</span>
                <strong>
                  {service.averageLatencyMs !== null ? `${service.averageLatencyMs}ms` : '-'}
                </strong>
              </div>
              <div>
                <span>Latest HTTP</span>
                <strong>
                  {service.latest?.httpStatus ? `HTTP ${service.latest.httpStatus}` : '-'}
                </strong>
              </div>
              <div>
                <span>Incidents</span>
                <strong>{service.degradedCount + service.downCount}</strong>
              </div>
            </div>
            <div className="status-service-notes">
              <p>
                <span>Target:</span>{' '}
                <code>{defaultProbeTargets[service.service]}</code>
              </p>
              <p>
                <span>Degraded:</span> {service.degradedCount}
              </p>
              <p>
                <span>Down:</span> {service.downCount}
              </p>
              <p className="status-note-compact">
                <span>Known samples:</span> {service.sampleCount}
              </p>
            </div>
          </article>
        ))}
      </div>

      <ul className="status-legend surface" aria-label="Status color legend">
        <li>
          <span className="legend-dot timeline-point is-operational" />
          Operational
        </li>
        <li>
          <span className="legend-dot timeline-point is-degraded" />
          Degraded
        </li>
        <li>
          <span className="legend-dot timeline-point is-down" />
          Down
        </li>
        <li>
          <span className="legend-dot timeline-point is-unknown" />
          Unknown
        </li>
      </ul>

      <Modal
        open={modalOpen && checkNow !== null}
        title="Live service status"
        onClose={() => setModalOpen(false)}
      >
        {checkNow ? (
          <>
            <div className="live-check-summary">
              <p className="modal-ts">
                Checked at {formatStatusDateTime(checkNow.checkedAt)}
              </p>
              <div className="live-check-metrics">
                <span className={`ops-state-pill ${statusClassName(checkNowSummary?.overallStatus ?? 'unknown')}`}>
                  {statusLabel(checkNowSummary?.overallStatus ?? 'unknown')}
                </span>
                <span>
                  Avg latency:{' '}
                  {checkNowSummary?.averageLatencyMs !== null &&
                  checkNowSummary?.averageLatencyMs !== undefined
                    ? `${checkNowSummary.averageLatencyMs}ms`
                    : '-'}
                </span>
                <span>
                  Failing services: {checkNowSummary?.failingServices.length ?? 0}
                </span>
              </div>
            </div>
            <div className="modal-list">
              {checkNow.results.map((result) => (
                <div key={result.service} className="modal-row">
                  <div>
                    <strong>{result.service.toUpperCase()}</strong>
                    <p>{result.targetUrl}</p>
                  </div>
                  <div className="modal-meta">
                    <span className={statusClassName(result.status)}>
                      {statusLabel(result.status)}
                    </span>
                    <span>
                      {result.httpStatus ? `HTTP ${result.httpStatus}` : 'No HTTP code'}
                    </span>
                    <span>{result.latencyMs !== null ? `${result.latencyMs}ms` : '-'}</span>
                    <span>{result.errorMessage ?? 'No error reported'}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Modal>
    </section>
  );
}
