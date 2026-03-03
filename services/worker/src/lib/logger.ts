export const log = (
  level: 'info' | 'error',
  message: string,
  meta: Record<string, unknown> = {},
) => {
  console[level](
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      service: 'worker',
      message,
      ...meta,
    }),
  );
};
