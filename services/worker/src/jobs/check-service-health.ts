import { createDbClient } from '@second-brain/db';

export type ProbeTarget = {
  service: 'api' | 'worker' | 'caddy';
  targetUrl: string;
};

type ProbeResult = {
  service: ProbeTarget['service'];
  targetUrl: string;
  checkedAt: string;
  status: 'operational' | 'degraded' | 'down';
  httpStatus: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
};

export const probeService = async (
  target: ProbeTarget,
  timeoutMs: number,
): Promise<ProbeResult> => {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target.targetUrl, {
      signal: controller.signal,
      cache: 'no-store',
    });
    const latencyMs = Date.now() - started;
    const status: ProbeResult['status'] = response.ok
      ? 'operational'
      : 'degraded';

    return {
      service: target.service,
      targetUrl: target.targetUrl,
      checkedAt: new Date().toISOString(),
      status,
      httpStatus: response.status,
      latencyMs,
      errorMessage: null,
    };
  } catch (error) {
    return {
      service: target.service,
      targetUrl: target.targetUrl,
      checkedAt: new Date().toISOString(),
      status: 'down',
      httpStatus: null,
      latencyMs: Date.now() - started,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
};

export const checkServiceHealth = async (
  databaseUrl: string,
  targets: ProbeTarget[],
  timeoutMs: number,
  retentionPerService = 24,
): Promise<Record<string, unknown>> => {
  const { sql } = createDbClient(databaseUrl);
  const results = await Promise.all(
    targets.map((target) => probeService(target, timeoutMs)),
  );

  for (const result of results) {
    await sql`
      insert into core.service_health_checks (
        service_name,
        target_url,
        checked_at,
        status,
        http_status,
        latency_ms,
        error_message,
        source
      )
      values (
        ${result.service},
        ${result.targetUrl},
        ${result.checkedAt},
        ${result.status},
        ${result.httpStatus},
        ${result.latencyMs},
        ${result.errorMessage},
        'scheduled'
      )
    `;
  }

  await sql`
    delete from core.service_health_checks as checks
    using (
      select id
      from (
        select
          id,
          row_number() over (
            partition by service_name
            order by checked_at desc
          ) as row_num
        from core.service_health_checks
      ) as ranked
      where ranked.row_num > ${retentionPerService}
    ) as stale
    where checks.id = stale.id
  `;

  await sql.end();

  return {
    checkedAt: new Date().toISOString(),
    targets: targets.length,
    operational: results.filter((item) => item.status === 'operational').length,
    degraded: results.filter((item) => item.status === 'degraded').length,
    down: results.filter((item) => item.status === 'down').length,
  };
};
