import type {
  OpsDashboardResponse,
  ServiceCheckNowResult,
  ServiceName,
  ServiceStatus,
  ServiceStatusHistory,
  ServiceStatusHistoryResponse,
} from '@second-brain/types';

const serviceNames: ServiceName[] = ['api', 'worker', 'caddy'];

export const defaultProbeTargets: Record<ServiceName, string> = {
  api: 'http://api:3001/health',
  worker: 'http://worker:3002/health',
  caddy: 'http://caddy:8080/__caddy/healthz',
};

const createEmptyPoints = (hours: number) =>
  Array.from({ length: hours }, (_, index) => ({
    hourIso: new Date(Date.now() - (hours - 1 - index) * 3600_000).toISOString(),
    status: 'unknown' as const,
    latencyMs: null,
    httpStatus: null,
  }));

export const createEmptyHistory = (
  hours: number,
): ServiceStatusHistoryResponse => ({
  generatedAt: new Date().toISOString(),
  services: serviceNames.map((service) => ({
    service,
    points: createEmptyPoints(hours),
  })),
});

export const loadOperationsHistory = async (
  hours: number,
): Promise<{
  history: ServiceStatusHistoryResponse;
  errorMessage: string | null;
}> => {
  const apiBase = process.env.INTERNAL_API_URL ?? 'http://api:3001';

  try {
    const response = await fetch(`${apiBase}/ops/status/history?hours=${hours}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return {
        history: createEmptyHistory(hours),
        errorMessage: `Failed to load operations history (HTTP ${response.status}).`,
      };
    }

    return {
      history: (await response.json()) as ServiceStatusHistoryResponse,
      errorMessage: null,
    };
  } catch {
    return {
      history: createEmptyHistory(hours),
      errorMessage: 'Failed to load operations history from API.',
    };
  }
};

export const loadOpsDashboard = async (
  limit = 6,
): Promise<{
  dashboard: OpsDashboardResponse | null;
  errorMessage: string | null;
}> => {
  const apiBase = process.env.INTERNAL_API_URL ?? 'http://api:3001';

  try {
    const response = await fetch(`${apiBase}/ops/dashboard?limit=${limit}`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return {
        dashboard: null,
        errorMessage: `Failed to load operations dashboard (HTTP ${response.status}).`,
      };
    }

    return {
      dashboard: (await response.json()) as OpsDashboardResponse,
      errorMessage: null,
    };
  } catch {
    return {
      dashboard: null,
      errorMessage: 'Failed to load operations dashboard from API.',
    };
  }
};

const statusPriority: Record<ServiceStatus, number> = {
  down: 3,
  degraded: 2,
  operational: 1,
  unknown: 0,
};

const statusLabelMap: Record<ServiceStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'Unknown',
};

const percent = (value: number, total: number) => {
  if (total <= 0) return '0%';
  return `${Math.round((value / total) * 100)}%`;
};

const average = (values: number[]) => {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
};

const latestPoint = (service: ServiceStatusHistory) =>
  [...service.points].reverse().find((point) => point.status !== 'unknown') ??
  service.points.at(-1) ??
  null;

const worstStatus = (statuses: ServiceStatus[]): ServiceStatus =>
  statuses.reduce<ServiceStatus>((current, candidate) => {
    return statusPriority[candidate] > statusPriority[current]
      ? candidate
      : current;
  }, 'unknown');

export const statusClassName = (status: ServiceStatus) => {
  if (status === 'operational') return 'is-operational';
  if (status === 'degraded') return 'is-degraded';
  if (status === 'down') return 'is-down';
  return 'is-unknown';
};

export const statusFromRunStatus = (
  status: 'success' | 'failed' | 'skipped' | null | undefined,
): ServiceStatus => {
  if (status === 'success') return 'operational';
  if (status === 'failed') return 'down';
  if (status === 'skipped') return 'degraded';
  return 'unknown';
};

export const statusLabel = (status: ServiceStatus) => statusLabelMap[status];

export const formatStatusDateTime = (value: string) =>
  `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export const formatStatusHour = (value: string) =>
  new Date(value).toISOString().slice(11, 16);

export const summarizeOperationsHistory = (
  history: ServiceStatusHistoryResponse,
) => {
  const services = history.services.map((service) => {
    const latestKnown = latestPoint(service);
    const knownPoints = service.points.filter((point) => point.status !== 'unknown');
    const operationalCount = knownPoints.filter(
      (point) => point.status === 'operational',
    ).length;
    const degradedCount = knownPoints.filter(
      (point) => point.status === 'degraded',
    ).length;
    const downCount = knownPoints.filter((point) => point.status === 'down').length;
    const latencies = knownPoints
      .map((point) => point.latencyMs)
      .filter((value): value is number => value !== null);

    return {
      service: service.service,
      points: service.points,
      latest: latestKnown,
      currentStatus: latestKnown?.status ?? 'unknown',
      availabilityLabel: percent(operationalCount, knownPoints.length),
      degradedCount,
      downCount,
      sampleCount: knownPoints.length,
      averageLatencyMs: average(latencies),
    };
  });

  const overallStatus = worstStatus(services.map((service) => service.currentStatus));
  const knownSamples = services.reduce((total, service) => total + service.sampleCount, 0);
  const operationalSamples = services.reduce((total, service) => {
    return (
      total +
      service.points.filter((point) => point.status === 'operational').length
    );
  }, 0);
  const degradedSamples = services.reduce(
    (total, service) => total + service.degradedCount,
    0,
  );
  const downSamples = services.reduce((total, service) => total + service.downCount, 0);

  return {
    generatedAt: history.generatedAt,
    overallStatus,
    overallStatusLabel: statusLabel(overallStatus),
    availabilityLabel: percent(operationalSamples, knownSamples),
    degradedSamples,
    downSamples,
    services,
  };
};

export const summarizeCheckNowResults = (results: ServiceCheckNowResult[]) => {
  const overallStatus = worstStatus(results.map((result) => result.status));
  const failingServices = results.filter((result) => result.status !== 'operational');

  return {
    overallStatus,
    failingServices,
    averageLatencyMs: average(
      results
        .map((result) => result.latencyMs)
        .filter((value): value is number => value !== null),
    ),
  };
};
