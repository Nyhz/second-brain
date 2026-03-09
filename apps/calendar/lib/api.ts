import type {
  ApiError,
  CalendarEvent,
  CalendarEventsWindowResponse,
  CalendarReminderWindowResponse,
  CreateCalendarEventInput,
} from '@second-brain/types';
import { apiErrorSchema } from '@second-brain/types';

const serverSide = typeof window === 'undefined';
const API_BASE = serverSide
  ? process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? ''
  : process.env.NEXT_PUBLIC_API_URL ?? '';

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

const parseErrorBody = async (response: Response) => {
  try {
    const body = (await response.json()) as unknown;
    const parsed = apiErrorSchema.safeParse(body);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

export const apiRequest = async <T>(path: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: init?.cache ?? 'no-store',
  });

  if (!response.ok) {
    throw new ApiRequestError(response.status, await parseErrorBody(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const loadCalendarWindow = (from: string, to: string) =>
  apiRequest<CalendarEventsWindowResponse>(
    `/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

export const loadReminderWindow = (from: string, to: string) =>
  apiRequest<CalendarReminderWindowResponse>(
    `/calendar/reminders?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );

export const createCalendarEvent = (payload: CreateCalendarEventInput) =>
  apiRequest<CalendarEvent>('/calendar/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateCalendarEvent = (
  eventId: string,
  payload: Partial<CreateCalendarEventInput>,
) =>
  apiRequest<CalendarEvent>(`/calendar/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const deleteCalendarEvent = (eventId: string) =>
  apiRequest<void>(`/calendar/events/${eventId}`, {
    method: 'DELETE',
  });
