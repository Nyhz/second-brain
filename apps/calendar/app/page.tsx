import { cookies } from 'next/headers';
import { CalendarApp } from '../components/calendar-app';
import { fromMonthKey, getMonthWindow, toMonthKey } from '../lib/calendar';
import { loadCalendarWindow, loadReminderWindow } from '../lib/api';

const getSingleSearchParam = (
  value: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('sb-theme-mode')?.value;
  const initialTheme = themeCookie === 'light' ? 'light' : 'dark';
  const resolvedSearchParams = (await searchParams) ?? {};
  const month = fromMonthKey(getSingleSearchParam(resolvedSearchParams.month));
  const monthWindow = getMonthWindow(month);
  const [windowData, reminders] = await Promise.all([
    loadCalendarWindow(monthWindow.gridStartIso, monthWindow.gridEndIso).catch(() => ({
      windowStart: monthWindow.gridStartIso,
      windowEnd: monthWindow.gridEndIso,
      timezone: process.env.PLATFORM_TIMEZONE ?? 'Europe/Madrid',
      events: [],
      occurrences: [],
    })),
    loadReminderWindow(
      new Date().toISOString(),
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
    ).catch(() => ({
      windowStart: new Date().toISOString(),
      windowEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      timezone: process.env.PLATFORM_TIMEZONE ?? 'Europe/Madrid',
      reminders: [],
    })),
  ]);

  return (
    <CalendarApp
      initialMonthKey={toMonthKey(month)}
      initialWindow={windowData}
      initialReminders={reminders}
      initialTheme={initialTheme}
      timezone={process.env.PLATFORM_TIMEZONE ?? 'Europe/Madrid'}
    />
  );
}
