'use client';

import type {
  CalendarEvent,
  CalendarEventsWindowResponse,
  CalendarOccurrence,
  CalendarReminderWindowResponse,
} from '@second-brain/types';
import {
  Button,
  PlatformActionBar,
  PlatformBackButton,
  PlatformPageHeader,
  PlatformShell,
  PlatformSidebarNote,
  type PlatformNavGroup,
} from '@second-brain/ui';
import {
  CalendarClock,
  CalendarPlus2,
  Clock3,
  Pencil,
  Trash2,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type {
  BuildEventPayloadInput,
  CalendarEventMode,
  RecurrenceEndMode,
  RecurrenceKind,
  ReminderPreset,
  WeekdayToken,
} from '../lib/calendar';
import {
  buildEventPayload,
  fromMonthKey,
  getAgendaOccurrences,
  getEventByOccurrence,
  getMonthWindow,
  groupOccurrencesByDate,
  toInputDate,
} from '../lib/calendar';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from '../lib/api';
import { ThemeSwitcher } from './theme-switcher';

type CalendarAppProps = {
  initialMonthKey: string;
  initialWindow: CalendarEventsWindowResponse;
  initialReminders: CalendarReminderWindowResponse;
  initialTheme: 'dark' | 'light';
  timezone: string;
};

type FormState = BuildEventPayloadInput;

const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekdayOptions: Array<{ token: WeekdayToken; label: string }> = [
  { token: 'MO', label: 'Mon' },
  { token: 'TU', label: 'Tue' },
  { token: 'WE', label: 'Wed' },
  { token: 'TH', label: 'Thu' },
  { token: 'FR', label: 'Fri' },
  { token: 'SA', label: 'Sat' },
  { token: 'SU', label: 'Sun' },
];
const modeOptions: Array<{ value: CalendarEventMode; label: string; description: string }> = [
  {
    value: 'all-day-single',
    label: 'Single all-day',
    description: 'Birthdays, anniversaries, and one-day reminders.',
  },
  {
    value: 'all-day-range',
    label: 'Multi-day',
    description: 'Trips, holidays, and day ranges without time slots.',
  },
  {
    value: 'timed',
    label: 'Time specific',
    description: 'Appointments, gym, meetings, and routines.',
  },
];

const calendarSidebarGroups: PlatformNavGroup[] = [
  {
    label: 'Calendar',
    items: [{ href: '/', label: 'Month overview', kind: 'app', match: 'exact' }],
  },
  {
    label: 'Shortcuts',
    items: [
      { href: '/finances', label: 'Finances', kind: 'platform' },
      { href: '/', label: 'Portal', kind: 'platform', match: 'exact' },
    ],
  },
];

const weekdayTokenByIso = (iso: string): WeekdayToken => {
  const weekday = new Date(iso).getUTCDay();
  return weekday === 0 ? 'SU' : (weekdayOptions[weekday - 1]?.token ?? 'MO');
};

const formatTimeInput = (iso: string) =>
  new Date(iso).toLocaleTimeString('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

const formatDayKey = (value: Date) => value.toISOString().slice(0, 10);

const isAllDayOccurrence = (occurrence: CalendarOccurrence) => {
  const start = new Date(occurrence.startAt);
  const end = new Date(occurrence.endAt);
  return (
    start.getUTCHours() === 0 &&
    start.getUTCMinutes() === 0 &&
    end.valueOf() - start.valueOf() >= 24 * 60 * 60_000
  );
};

const parseRRule = (rrule: string) =>
  new Map(
    rrule
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, value = ''] = part.split('=');
        return [key ?? '', value] as const;
      }),
  );

const defaultFormState = (): FormState => {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.valueOf() + 60 * 60_000);
  const startDay = toInputDate(start.toISOString());

  return {
    title: '',
    description: '',
    mode: 'timed',
    startDay,
    endDay: startDay,
    startTime: start.toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    endTime: end.toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
    timezone: 'Europe/Madrid',
    reminderPreset: '30m',
    source: 'manual',
    recurrenceEnabled: false,
    recurrenceKind: 'weekly',
    recurrenceWeekdays: [weekdayTokenByIso(start.toISOString())],
    recurrenceEndMode: 'never',
    recurrenceUntilDay: '',
    recurrenceCount: '12',
  };
};

const eventToFormState = (event: CalendarEvent): FormState => {
  const startDay = toInputDate(event.startAt);
  const endDay = toInputDate(new Date(new Date(event.endAt).valueOf() - 1).toISOString());
  const rruleParts = event.recurrence ? parseRRule(event.recurrence.rrule) : null;
  const recurrenceKind: RecurrenceKind =
    rruleParts?.get('FREQ') === 'YEARLY' ? 'yearly' : 'weekly';
  const recurrenceWeekdays =
    rruleParts?.get('BYDAY')?.split(',').filter(Boolean) as WeekdayToken[] | undefined;

  return {
    title: event.title,
    description: event.description ?? '',
    mode: event.isAllDay
      ? startDay === endDay
        ? 'all-day-single'
        : 'all-day-range'
      : 'timed',
    startDay,
    endDay,
    startTime: formatTimeInput(event.startAt),
    endTime: formatTimeInput(event.endAt),
    timezone: event.timezone,
    reminderPreset:
      event.reminders[0]?.minutesBeforeStart === 30
        ? '30m'
        : event.reminders[0]?.minutesBeforeStart === 60
          ? '1h'
          : event.reminders[0]?.minutesBeforeStart === 1440
            ? '1d'
            : 'none',
    source: event.source,
    recurrenceEnabled: Boolean(event.recurrence),
    recurrenceKind,
    recurrenceWeekdays:
      recurrenceKind === 'weekly'
        ? recurrenceWeekdays && recurrenceWeekdays.length > 0
          ? recurrenceWeekdays
          : [weekdayTokenByIso(event.startAt)]
        : [weekdayTokenByIso(event.startAt)],
    recurrenceEndMode: event.recurrence?.untilAt
      ? 'until'
      : event.recurrence?.count
        ? 'count'
        : 'never',
    recurrenceUntilDay: event.recurrence?.untilAt
      ? toInputDate(event.recurrence.untilAt)
      : '',
    recurrenceCount: event.recurrence?.count ? String(event.recurrence.count) : '12',
  };
};

const formatTimeRange = (startAt: string, endAt: string) => {
  const start = new Date(startAt);
  const end = new Date(endAt);

  if (isAllDayOccurrence({
    occurrenceId: '',
    eventId: '',
    title: '',
    description: null,
    location: null,
    startAt,
    endAt,
    timezone: 'Europe/Madrid',
    status: 'confirmed',
    source: 'manual',
    isRecurring: false,
  })) {
    if (end.valueOf() - start.valueOf() > 24 * 60 * 60_000) {
      return `${start.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })} - ${new Date(end.valueOf() - 1).toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
      })}`;
    }
    return `${start.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })} · All day`;
  }

  return `${start.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })} - ${end.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const formatOccurrenceBadge = (occurrence: CalendarOccurrence) => {
  if (isAllDayOccurrence(occurrence)) {
    const spanDays = Math.round(
      (new Date(occurrence.endAt).valueOf() - new Date(occurrence.startAt).valueOf()) /
        (24 * 60 * 60_000),
    );
    return spanDays > 1 ? `${spanDays} days` : 'All day';
  }

  return new Date(occurrence.startAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function CalendarApp({
  initialMonthKey,
  initialWindow,
  initialReminders,
  initialTheme,
  timezone,
}: CalendarAppProps) {
  const pathname = usePathname() || '/';
  const [isPending, startTransition] = useTransition();
  const [selectedMonthKey] = useState(initialMonthKey);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => ({
    ...defaultFormState(),
    timezone,
  }));

  const monthDate = useMemo(() => fromMonthKey(selectedMonthKey), [selectedMonthKey]);
  const monthWindow = useMemo(() => getMonthWindow(monthDate), [monthDate]);
  const groupedOccurrences = useMemo(
    () => groupOccurrencesByDate(initialWindow.occurrences),
    [initialWindow.occurrences],
  );
  const agenda = useMemo(
    () => getAgendaOccurrences(initialWindow.occurrences, 14),
    [initialWindow.occurrences],
  );

  const canRepeat = form.mode !== 'all-day-range';
  const isYearlyMode = form.mode === 'all-day-single';

  const openCreate = (day?: string) => {
    const next = {
      ...defaultFormState(),
      timezone,
    };
    if (day) {
      next.startDay = day;
      next.endDay = day;
      next.recurrenceWeekdays = [weekdayTokenByIso(`${day}T00:00:00.000Z`)];
    }
    setEditingEvent(null);
    setForm(next);
    setErrorMessage(null);
    setModalOpen(true);
  };

  const openEdit = (event: CalendarEvent) => {
    setEditingEvent(event);
    setForm(eventToFormState(event));
    setErrorMessage(null);
    setModalOpen(true);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      try {
        const payload = buildEventPayload({
          ...form,
          recurrenceKind: form.mode === 'timed' ? 'weekly' : 'yearly',
          timezone,
        });

        if (editingEvent) {
          await updateCalendarEvent(editingEvent.id, payload);
        } else {
          await createCalendarEvent(payload);
        }

        window.location.reload();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to save event');
      }
    });
  };

  const handleDelete = () => {
    if (!editingEvent) {
      return;
    }

    startTransition(async () => {
      try {
        await deleteCalendarEvent(editingEvent.id);
        window.location.reload();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to delete event');
      }
    });
  };

  const days = Array.from({ length: 42 }, (_, index) => {
    const value = new Date(monthWindow.gridStartIso);
    value.setDate(value.getDate() + index);
    return value;
  });

  return (
    <PlatformShell
      appName="Second Brain"
      appSubtitle="Calendar workspace"
      topbarEyebrow="Second Brain Calendar"
      topbarTitle="Events and reminders"
      topbarRight={<ThemeSwitcher initialMode={initialTheme} />}
      contentTop={<PlatformActionBar left={<PlatformBackButton />} />}
      sidebarGroups={calendarSidebarGroups}
      pathname={pathname}
      appPathname="/"
      sidebarFooter={
        <PlatformSidebarNote
          eyebrow="Intake"
          title="Structured AI + UI"
          description={
            <>
              Openclaw can write events to <code>/api/calendar/events</code> and read day or week
              summaries from <code>/api/calendar/summary/*</code>.
            </>
          }
        />
      }
      pageHeader={
        <PlatformPageHeader
          eyebrow="Second Brain Calendar"
          title="Events and reminders"
          description="All-day plans, recurring routines, and AI-readable weekly context in one scheduling surface."
          right={
            <div className="topbar-actions">
              <div className="topbar-chip">
                <CalendarClock size={14} aria-hidden="true" />
                {selectedMonthKey}
              </div>
              <Button
                type="button"
                variant="primary"
                className="gap-2"
                onClick={() => openCreate()}
              >
                <CalendarPlus2 size={16} aria-hidden="true" />
                New event
              </Button>
            </div>
          }
        />
      }
    >
      <div className="calendar-main">
        <section className="calendar-hero">
          <div className="hero-card surface-card">
            <p className="eyebrow">Scheduling Surface</p>
            <h2>Month grid and operator agenda</h2>
            <p>
              Build one-day reminders, multi-day holidays, and recurring routines while keeping
              the calendar readable for both the UI and Openclaw.
            </p>
          </div>
          <div className="hero-stats">
            <article className="stat-card surface-card">
              <span className="stat-label">Active events</span>
              <strong>{initialWindow.events.length}</strong>
              <span>Persisted calendar entries in the current month window.</span>
            </article>
            <article className="stat-card surface-card">
              <span className="stat-label">Occurrences</span>
              <strong>{initialWindow.occurrences.length}</strong>
              <span>Expanded events including recurring routines.</span>
            </article>
            <article className="stat-card surface-card">
              <span className="stat-label">Reminders</span>
              <strong>{initialReminders.reminders.length}</strong>
              <span>Upcoming alerts generated from the saved schedule.</span>
            </article>
          </div>
        </section>

        <section className="calendar-layout">
          <div className="calendar-board surface-card">
            <div className="calendar-board-head">
              {weekdayLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="calendar-grid">
              {days.map((day) => {
                const key = formatDayKey(day);
                const dayOccurrences = groupedOccurrences.get(key) ?? [];
                const isCurrentMonth = day.getMonth() === monthDate.getMonth();

                return (
                  <div
                    key={key}
                    className={`calendar-day ${isCurrentMonth ? '' : 'is-muted'}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openCreate(key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openCreate(key);
                      }
                    }}
                  >
                    <div className="calendar-day-head">
                      <span className="calendar-day-meta">
                        {dayOccurrences.length === 0
                          ? 'Open day'
                          : `${dayOccurrences.length} item${dayOccurrences.length === 1 ? '' : 's'}`}
                      </span>
                      <span className="calendar-day-number">{day.getDate()}</span>
                    </div>
                    <div className="calendar-day-events">
                      <button
                        type="button"
                        className="calendar-day-create"
                        onClick={(event) => {
                          event.stopPropagation();
                          openCreate(key);
                        }}
                      >
                        + Add event
                      </button>
                      {dayOccurrences.slice(0, 3).map((occurrence) => (
                        <button
                          type="button"
                          key={occurrence.occurrenceId}
                          className={`event-chip ${occurrence.source === 'ai' ? 'is-ai' : ''}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            const parentEvent = getEventByOccurrence(
                              initialWindow.events,
                              occurrence,
                            );
                            if (parentEvent) {
                              openEdit(parentEvent);
                            }
                          }}
                        >
                          <span>{formatOccurrenceBadge(occurrence)}</span>
                          <strong>{occurrence.title}</strong>
                        </button>
                      ))}
                      {dayOccurrences.length > 3 ? (
                        <span className="event-overflow">+{dayOccurrences.length - 3} more</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="calendar-sidebar">
            <section className="side-card surface-card">
              <div className="side-card-head">
                <div>
                  <p className="eyebrow">Agenda</p>
                  <h2>Upcoming</h2>
                </div>
              </div>
              <div className="stack-list">
                {agenda.length === 0 ? (
                  <p className="empty-copy">No upcoming occurrences in this month window.</p>
                ) : (
                  agenda.map((occurrence) => {
                    const event = getEventByOccurrence(initialWindow.events, occurrence);
                    return (
                      <button
                        key={occurrence.occurrenceId}
                        type="button"
                        className="agenda-row"
                        onClick={() => {
                          if (event) {
                            openEdit(event);
                          }
                        }}
                      >
                        <div>
                          <strong>{occurrence.title}</strong>
                          <span>{formatTimeRange(occurrence.startAt, occurrence.endAt)}</span>
                        </div>
                        {occurrence.isRecurring ? <span className="mini-pill">Repeats</span> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <section className="side-card surface-card">
              <div className="side-card-head">
                <div>
                  <p className="eyebrow">Reminders</p>
                  <h2>Due and upcoming</h2>
                </div>
                <Clock3 size={18} aria-hidden="true" />
              </div>
              <div className="stack-list">
                {initialReminders.reminders.length === 0 ? (
                  <p className="empty-copy">No reminders in the current horizon.</p>
                ) : (
                  initialReminders.reminders.slice(0, 12).map((reminder) => (
                    <article
                      key={`${reminder.reminderId}:${reminder.occurrenceId}`}
                      className="reminder-row"
                    >
                      <div>
                        <strong>{reminder.title}</strong>
                        <span>
                          Remind {new Date(reminder.remindAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <span className={`mini-pill ${reminder.status === 'due' ? 'is-due' : ''}`}>
                        {reminder.status}
                      </span>
                    </article>
                  ))
                )}
              </div>
            </section>
          </aside>
        </section>

        {modalOpen ? (
          <div className="modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
            <div
              className="modal-panel surface-card"
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-head">
                <div>
                  <p className="eyebrow">{editingEvent ? 'Edit event' : 'New event'}</p>
                  <h2>{editingEvent ? editingEvent.title : 'Create calendar event'}</h2>
                  <p className="modal-subcopy">
                    {editingEvent
                      ? 'Update the schedule details, recurrence, and reminders for this event.'
                      : 'Choose the event shape first, then fill only the fields that matter for that type.'}
                  </p>
                </div>
                <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
                  Close
                </Button>
              </div>

              <div className="calendar-form-stack">
                <div className="event-mode-grid">
                  {modeOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`event-mode-card ${form.mode === option.value ? 'is-active' : ''}`}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          mode: option.value,
                          endDay:
                            option.value === 'all-day-range' ? current.endDay : current.startDay,
                          recurrenceEnabled:
                            option.value === 'all-day-range' ? false : current.recurrenceEnabled,
                          recurrenceKind: option.value === 'timed' ? 'weekly' : 'yearly',
                        }))
                      }
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  ))}
                </div>

                <div className="form-grid">
                  <label className="span-2">
                    Title
                    <input
                      value={form.title}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, title: event.target.value }))
                      }
                      placeholder="Birthday, Summer holiday, Gym session..."
                    />
                  </label>

                  <label>
                    Starts on
                    <input
                      type="date"
                      value={form.startDay}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          startDay: event.target.value,
                          endDay:
                            current.mode === 'all-day-range' &&
                            current.endDay < event.target.value
                              ? event.target.value
                              : current.endDay,
                        }))
                      }
                    />
                  </label>

                  {form.mode === 'all-day-range' ? (
                    <label>
                      Ends on
                      <input
                        type="date"
                        value={form.endDay}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, endDay: event.target.value }))
                        }
                      />
                    </label>
                  ) : null}

                  {form.mode === 'timed' ? (
                    <>
                      <label>
                        Start time
                        <input
                          type="time"
                          value={form.startTime}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, startTime: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        End time
                        <input
                          type="time"
                          value={form.endTime}
                          onChange={(event) =>
                            setForm((current) => ({ ...current, endTime: event.target.value }))
                          }
                        />
                      </label>
                    </>
                  ) : null}

                  <label className={form.mode === 'timed' ? '' : 'span-2'}>
                    Reminder
                    <select
                      value={form.reminderPreset}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          reminderPreset: event.target.value as ReminderPreset,
                        }))
                      }
                    >
                      <option value="none">No reminder</option>
                      <option value="30m">30 minutes before</option>
                      <option value="1h">1 hour before</option>
                      <option value="1d">1 day before</option>
                    </select>
                    <span className="field-help">An optional alert before the event starts.</span>
                  </label>
                </div>

                {canRepeat ? (
                  <section className="recurrence-panel">
                    <div className="section-head">
                      <div>
                        <p className="eyebrow">Recurrence</p>
                        <h3>
                          {isYearlyMode ? 'Repeat yearly on this date' : 'Repeat weekly on selected days'}
                        </h3>
                      </div>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={form.recurrenceEnabled}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              recurrenceEnabled: event.target.checked,
                              recurrenceKind: current.mode === 'timed' ? 'weekly' : 'yearly',
                            }))
                          }
                        />
                        <span>Enable recurrence</span>
                      </label>
                    </div>

                    {form.recurrenceEnabled ? (
                      <div className="calendar-form-stack">
                        {form.mode === 'timed' ? (
                          <div className="weekday-picker">
                            {weekdayOptions.map((option) => {
                              const active = form.recurrenceWeekdays.includes(option.token);
                              return (
                                <button
                                  key={option.token}
                                  type="button"
                                  className={`weekday-pill ${active ? 'is-active' : ''}`}
                                  onClick={() =>
                                    setForm((current) => {
                                      const nextWeekdays = active
                                        ? current.recurrenceWeekdays.filter(
                                            (value) => value !== option.token,
                                          )
                                        : [...current.recurrenceWeekdays, option.token];
                                      return {
                                        ...current,
                                        recurrenceWeekdays:
                                          nextWeekdays.length > 0
                                            ? nextWeekdays
                                            : [option.token],
                                      };
                                    })
                                  }
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="field-help">
                            This event will repeat once per year on {form.startDay}.
                          </p>
                        )}

                        <div className="form-grid">
                          <label>
                            Ends
                            <select
                              value={form.recurrenceEndMode}
                              onChange={(event) =>
                                setForm((current) => ({
                                  ...current,
                                  recurrenceEndMode: event.target.value as RecurrenceEndMode,
                                }))
                              }
                            >
                              <option value="never">Never</option>
                              <option value="until">On date</option>
                              <option value="count">After N times</option>
                            </select>
                          </label>

                          {form.recurrenceEndMode === 'until' ? (
                            <label>
                              Until
                              <input
                                type="date"
                                value={form.recurrenceUntilDay}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    recurrenceUntilDay: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          ) : null}

                          {form.recurrenceEndMode === 'count' ? (
                            <label>
                              Occurrences
                              <input
                                inputMode="numeric"
                                value={form.recurrenceCount}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    recurrenceCount: event.target.value,
                                  }))
                                }
                                placeholder="12"
                              />
                            </label>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <label>
                  Description
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, description: event.target.value }))
                    }
                    placeholder="Extra context, preparation notes, gift idea, travel memo..."
                  />
                </label>
              </div>

              {errorMessage ? <p className="form-error">{errorMessage}</p> : null}

              <div className="modal-actions">
                {editingEvent ? (
                  <Button
                    type="button"
                    variant="danger"
                    className="gap-2"
                    onClick={handleDelete}
                    disabled={isPending}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Delete
                  </Button>
                ) : (
                  <span />
                )}
                <div className="modal-actions-right">
                  {editingEvent ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="gap-2"
                      onClick={() => openCreate()}
                      disabled={isPending}
                    >
                      <Pencil size={16} aria-hidden="true" />
                      Reset
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={isPending}
                  >
                    {isPending ? 'Saving...' : editingEvent ? 'Save changes' : 'Create event'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PlatformShell>
  );
}
