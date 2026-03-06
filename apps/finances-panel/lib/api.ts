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
const inFlightBrowserGets = new Map<string, Promise<unknown>>();

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
  const performRequest = async () => {
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
  };

  const method = (init?.method ?? 'GET').toUpperCase();
  const shouldDeduplicateInFlightGet = !serverSide && method === 'GET';

  if (!shouldDeduplicateInFlightGet) {
    return performRequest();
  }

  const inFlightKey = `${method}:${path}`;
  const existing = inFlightBrowserGets.get(inFlightKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const request = performRequest();
  inFlightBrowserGets.set(inFlightKey, request as Promise<unknown>);
  try {
    return await request;
  } finally {
    inFlightBrowserGets.delete(inFlightKey);
  }
}

export const invalidateBrowserApiRequestCache = (pathPrefix?: string) => {
  if (serverSide) {
    return;
  }
  if (!pathPrefix) {
    inFlightBrowserGets.clear();
    return;
  }
  for (const key of inFlightBrowserGets.keys()) {
    if (key.startsWith(`GET:${pathPrefix}`)) {
      inFlightBrowserGets.delete(key);
    }
  }
};
