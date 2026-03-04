'use client';

import type {
  ServiceCheckNowResponse,
  ServiceStatus,
  ServiceStatusHistoryResponse,
} from '@second-brain/types';
import { Button, Modal } from './ui';
import { useMemo, useState } from 'react';

type OperationsStatusProps = {
  initialHistory: ServiceStatusHistoryResponse;
};

const statusClass = (status: ServiceStatus) => {
  if (status === 'operational') return 'is-operational';
  if (status === 'degraded') return 'is-degraded';
  if (status === 'down') return 'is-down';
  return 'is-unknown';
};

const statusLabel = (status: ServiceStatus) => {
  if (status === 'operational') return 'Operational';
  if (status === 'degraded') return 'Degraded';
  if (status === 'down') return 'Down';
  return 'Unknown';
};

const formatDateTime = (value: string) =>
  `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const formatHour = (value: string) =>
  new Date(value).toISOString().slice(11, 16);

export function OperationsStatus({ initialHistory }: OperationsStatusProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [checkNow, setCheckNow] = useState<ServiceCheckNowResponse | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const latestByService = useMemo(() => {
    return initialHistory.services.map((service) => {
      const latestKnown = [...service.points]
        .reverse()
        .find((point) => point.status !== 'unknown');
      return {
        service: service.service,
        status: latestKnown?.status ?? 'unknown',
      };
    });
  }, [initialHistory]);

  const timelineAxis = useMemo(() => {
    const points = initialHistory.services[0]?.points ?? [];
    return points.map((point, index) => {
      const showLabel = index % 3 === 0 || index === points.length - 1;
      return {
        hourIso: point.hourIso,
        label: showLabel
          ? formatHour(point.hourIso)
          : '',
      };
    });
  }, [initialHistory]);

  const runCheckNow = async () => {
    setIsChecking(true);
    setErrorMessage(null);

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
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <section className="status-wrap">
      <div className="status-head">
        <div>
          <h2>Operations Status</h2>
          <p>
            Hourly probes for API, Worker, and Caddy over the last 24 hours.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => void runCheckNow()}
          disabled={isChecking}
          variant="primary"
        >
          {isChecking ? 'Checking...' : 'Check now'}
        </Button>
      </div>

      {errorMessage ? <p className="status-error">{errorMessage}</p> : null}

      <div className="status-summary">
        {latestByService.map((service) => (
          <div key={service.service} className="status-chip">
            <span>{service.service.toUpperCase()}</span>
            <strong className={statusClass(service.status)}>
              {statusLabel(service.status)}
            </strong>
          </div>
        ))}
      </div>

      <div className="timeline-grid">
        {initialHistory.services.map((service) => (
          <div key={service.service} className="timeline-row">
            <div className="timeline-label">
              {service.service.toUpperCase()}
            </div>
            <div
              className="timeline-points"
              role="img"
              aria-label={`${service.service} 24 hour status timeline`}
            >
              {service.points.map((point) => (
                <div
                  key={`${service.service}-${point.hourIso}`}
                  className={`timeline-point ${statusClass(point.status)}`}
                  title={`${formatDateTime(point.hourIso)} · ${statusLabel(point.status)}${point.httpStatus ? ` · HTTP ${point.httpStatus}` : ''}${point.latencyMs !== null ? ` · ${point.latencyMs}ms` : ''}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="timeline-axis" aria-hidden="true">
        {timelineAxis.map((item) => (
          <span key={item.hourIso}>{item.label}</span>
        ))}
      </div>
      <div className="timeline-range">
        <span>24h ago</span>
        <span>Latest data</span>
      </div>
      <ul className="status-legend" aria-label="Status color legend">
        <li>
          <span className="legend-dot timeline-point is-operational" />{' '}
          Operational
        </li>
        <li>
          <span className="legend-dot timeline-point is-degraded" /> Degraded
        </li>
        <li>
          <span className="legend-dot timeline-point is-down" /> Down
        </li>
        <li>
          <span className="legend-dot timeline-point is-unknown" /> Unknown
        </li>
      </ul>

      <Modal
        open={modalOpen && checkNow !== null}
        title="Live service status"
        onClose={() => setModalOpen(false)}
      >
        {checkNow ? (
          <>
            <p className="modal-ts">
              Checked at {formatDateTime(checkNow.checkedAt)}
            </p>
            <div className="modal-list">
              {checkNow.results.map((result) => (
                <div key={result.service} className="modal-row">
                  <div>
                    <strong>{result.service.toUpperCase()}</strong>
                    <p>{result.targetUrl}</p>
                  </div>
                  <div className="modal-meta">
                    <span className={statusClass(result.status)}>
                      {statusLabel(result.status)}
                    </span>
                    <span>
                      {result.httpStatus
                        ? `HTTP ${result.httpStatus}`
                        : 'No HTTP code'}
                    </span>
                    <span>
                      {result.latencyMs !== null ? `${result.latencyMs}ms` : '-'}
                    </span>
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
