import { describe, expect, test } from 'bun:test';
import type {
  ServiceCheckNowResponse,
  ServiceStatusHistoryResponse,
} from '@second-brain/types';
import {
  summarizeCheckNowResults,
  summarizeOperationsHistory,
} from '../lib/operations-data';

const historyFixture: ServiceStatusHistoryResponse = {
  generatedAt: '2026-03-08T10:00:00.000Z',
  services: [
    {
      service: 'api',
      points: [
        {
          hourIso: '2026-03-08T08:00:00.000Z',
          status: 'operational',
          latencyMs: 30,
          httpStatus: 200,
        },
        {
          hourIso: '2026-03-08T09:00:00.000Z',
          status: 'degraded',
          latencyMs: 120,
          httpStatus: 503,
        },
      ],
    },
    {
      service: 'worker',
      points: [
        {
          hourIso: '2026-03-08T08:00:00.000Z',
          status: 'operational',
          latencyMs: 40,
          httpStatus: 200,
        },
        {
          hourIso: '2026-03-08T09:00:00.000Z',
          status: 'operational',
          latencyMs: 35,
          httpStatus: 200,
        },
      ],
    },
    {
      service: 'caddy',
      points: [
        {
          hourIso: '2026-03-08T08:00:00.000Z',
          status: 'operational',
          latencyMs: 12,
          httpStatus: 200,
        },
        {
          hourIso: '2026-03-08T09:00:00.000Z',
          status: 'down',
          latencyMs: null,
          httpStatus: null,
        },
      ],
    },
  ],
};

const checkNowFixture: ServiceCheckNowResponse = {
  checkedAt: '2026-03-08T10:15:00.000Z',
  results: [
    {
      service: 'api',
      status: 'operational',
      targetUrl: 'http://api:3001/health',
      checkedAt: '2026-03-08T10:15:00.000Z',
      latencyMs: 22,
      httpStatus: 200,
      errorMessage: null,
    },
    {
      service: 'worker',
      status: 'degraded',
      targetUrl: 'http://worker:3002/health',
      checkedAt: '2026-03-08T10:15:00.000Z',
      latencyMs: 88,
      httpStatus: 503,
      errorMessage: null,
    },
    {
      service: 'caddy',
      status: 'down',
      targetUrl: 'http://caddy:8080/__caddy/healthz',
      checkedAt: '2026-03-08T10:15:00.000Z',
      latencyMs: null,
      httpStatus: null,
      errorMessage: 'timeout',
    },
  ],
};

describe('operations-data helpers', () => {
  test('summarizeOperationsHistory derives overall and per-service metrics', () => {
    const summary = summarizeOperationsHistory(historyFixture);

    expect(summary.overallStatus).toBe('down');
    expect(summary.availabilityLabel).toBe('67%');
    expect(summary.degradedSamples).toBe(1);
    expect(summary.downSamples).toBe(1);
    expect(summary.services.find((service) => service.service === 'api')?.currentStatus).toBe(
      'degraded',
    );
    expect(summary.services.find((service) => service.service === 'worker')?.averageLatencyMs).toBe(
      38,
    );
  });

  test('summarizeCheckNowResults reports worst status and failing service count', () => {
    const summary = summarizeCheckNowResults(checkNowFixture.results);

    expect(summary.overallStatus).toBe('down');
    expect(summary.failingServices).toHaveLength(2);
    expect(summary.averageLatencyMs).toBe(55);
  });
});
