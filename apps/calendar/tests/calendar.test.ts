import { describe, expect, test } from 'bun:test';
import {
  buildEventPayload,
  getMonthWindow,
  groupOccurrencesByDate,
  toMonthKey,
} from '../lib/calendar';

describe('calendar helpers', () => {
  test('builds month window and month keys', () => {
    const month = new Date('2026-03-15T12:00:00');
    const window = getMonthWindow(month);

    expect(toMonthKey(month)).toBe('2026-03');
    expect(window.gridStartIso < window.gridEndIso).toBe(true);
  });

  test('builds validated event payload', () => {
    const payload = buildEventPayload({
      title: 'Dentist',
      description: 'Review',
      mode: 'timed',
      startDay: '2026-03-09',
      endDay: '2026-03-09',
      startTime: '17:00',
      endTime: '18:00',
      timezone: 'Europe/Madrid',
      reminderPreset: '30m',
      source: 'manual',
      recurrenceEnabled: true,
      recurrenceKind: 'weekly',
      recurrenceWeekdays: ['MO', 'WE'],
      recurrenceEndMode: 'count',
      recurrenceUntilDay: '',
      recurrenceCount: '8',
    });

    expect(payload.title).toBe('Dentist');
    expect(payload.reminders).toHaveLength(1);
    expect(payload.recurrence?.rrule?.includes('BYDAY=MO,WE')).toBe(true);
    expect(payload.recurrence?.count).toBe(8);
    expect(payload.isAllDay).toBe(false);
  });

  test('builds validated all-day payload', () => {
    const payload = buildEventPayload({
      title: 'Birthday',
      description: '',
      mode: 'all-day-single',
      startDay: '2026-03-10',
      endDay: '2026-03-10',
      startTime: '09:00',
      endTime: '10:00',
      timezone: 'Europe/Madrid',
      reminderPreset: '1d',
      source: 'manual',
      recurrenceEnabled: true,
      recurrenceKind: 'yearly',
      recurrenceWeekdays: ['TU'],
      recurrenceEndMode: 'never',
      recurrenceUntilDay: '',
      recurrenceCount: '',
    });

    expect(payload.isAllDay).toBe(true);
    expect(payload.reminders[0]?.minutesBeforeStart).toBe(1440);
    expect(payload.recurrence?.rrule?.includes('FREQ=YEARLY')).toBe(true);
  });

  test('groups multi-day all-day occurrences across each covered day', () => {
    const grouped = groupOccurrencesByDate([
      {
        occurrenceId: 'one',
        eventId: '30000000-0000-4000-8000-000000000001',
        title: 'Trip',
        description: null,
        location: null,
        startAt: '2026-03-10T00:00:00.000Z',
        endAt: '2026-03-13T00:00:00.000Z',
        timezone: 'Europe/Madrid',
        status: 'confirmed',
        source: 'manual',
        isRecurring: false,
      },
    ]);

    expect(grouped.get('2026-03-10')).toHaveLength(1);
    expect(grouped.get('2026-03-11')).toHaveLength(1);
    expect(grouped.get('2026-03-12')).toHaveLength(1);
  });
});
