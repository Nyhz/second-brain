import { loadAppEnv } from '@second-brain/config';

const env = loadAppEnv(
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {},
);

export const API_BASE = env.NEXT_PUBLIC_API_URL;

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
    throw new Error(`API request failed: ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}
