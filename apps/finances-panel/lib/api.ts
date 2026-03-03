import { loadAppEnv } from '@second-brain/config';
import { type ApiError, apiErrorSchema } from '@second-brain/types';

const env = loadAppEnv(
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {},
);

const serverSide = typeof window === 'undefined';
export const API_BASE = serverSide
  ? env.INTERNAL_API_URL
  : env.NEXT_PUBLIC_API_URL;

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, body: ApiError | null) {
    super(body?.message ?? `API request failed: ${status}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body?.code ?? 'HTTP_ERROR';
    this.details = body?.details;
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    let parsedBody: ApiError | null = null;
    try {
      const body = (await res.json()) as unknown;
      const parsed = apiErrorSchema.safeParse(body);
      if (parsed.success) {
        parsedBody = parsed.data;
      }
    } catch {
      parsedBody = null;
    }

    throw new ApiRequestError(res.status, parsedBody);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}
