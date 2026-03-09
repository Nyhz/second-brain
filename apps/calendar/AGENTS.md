# AGENTS.md — apps/calendar

## Product Goal
`calendar` is the scheduling domain app inside `second-brain`.

Its purpose is to be a practical personal calendar that works well for both:
- direct human use in the UI
- structured automation through the platform and Openclaw

The app should stay simple to operate, but its underlying event model should be standards-compatible and durable enough to interoperate with broader calendar concepts.

## Current User Surface
Current UI behavior:
- month-grid calendar overview
- agenda/sidebar summaries for the loaded window
- modal-based create and edit flows
- click a day cell to create an event for that day
- click an existing event to edit it

Current event types supported in the app:
- single-day all-day events
  - birthdays
  - anniversaries
  - one-day reminders
- multi-day all-day events
  - holidays
  - trips
  - day-range blocks without time slots
- timed events
  - appointments
  - workouts
  - meetings

Current recurrence support:
- weekly recurrence for timed events
- yearly recurrence for all-day events

Current form behavior:
- all-day event flows do not ask for time inputs
- timed event flows ask for date, start time, and end time
- recurrence controls appear only when relevant to the chosen event mode
- reminder selection is preset-driven rather than raw minute entry

## Current Technical State
The calendar app has already progressed beyond a static month board.

Implemented foundations:
- shared platform shell from `@second-brain/ui`
- modal-driven event creation and editing
- typed event payload builders in `apps/calendar/lib/calendar.ts`
- API-backed event CRUD through `services/api`
- Openclaw-friendly summary endpoints for:
  - `GET /calendar/summary/today`
  - `GET /calendar/summary/week`

Implemented standards-aligned calendar model:
- events now carry RFC-style identity/versioning fields:
  - `uid`
  - `dtstamp`
  - `sequence`
- recurring events use `RRULE`
- recurrence exceptions are supported through `EXDATE`
- one-time events do not force recurrence rules when not needed

This means the current internal model is aligned with RFC 5545 semantics, even though `.ics` import/export is not implemented yet.

## Current API Surface
The app depends on the shared calendar module in `services/api`.

Current route families:
- window/event reads:
  - `GET /calendar/events`
  - `GET /calendar/events/:id`
- writes:
  - `POST /calendar/events`
  - `PATCH /calendar/events/:id`
  - `DELETE /calendar/events/:id`
- reminders:
  - `GET /calendar/reminders`
- AI/automation summaries:
  - `GET /calendar/summary/today`
  - `GET /calendar/summary/week`

Inputs and outputs are validated through shared schemas in `@second-brain/types`.

Standard error format remains:
- `{ code, message, details? }`

## Data & Domain Model
- Shared Postgres database
- Domain schema: `calendar`

Important persisted concepts:
- calendar events
- recurrence rules
- recurrence exception dates
- reminders

Current event modeling rules:
- single one-time all-day event:
  - plain event instance
  - `isAllDay: true`
  - no `RRULE`
- multi-day all-day event:
  - plain event instance spanning multiple days
  - `isAllDay: true`
  - no `RRULE` unless it truly recurs
- recurring yearly birthday/anniversary:
  - all-day event
  - yearly `RRULE`
- timed recurring event:
  - explicit start/end datetime
  - weekly `RRULE` with weekday selection

## Openclaw Compatibility
The calendar must be usable by Openclaw as a planning and summarization source.

Current supported automation scenarios:
- create structured events through the normal calendar event write routes
- read current-day event summaries through `GET /calendar/summary/today`
- read current-week event summaries through `GET /calendar/summary/week`

Implementation requirement:
- AI-facing reads should return expanded occurrences for the requested window
- do not force Openclaw to interpret raw RRULEs just to answer “what is happening today?” or “what is happening this week?”

## UI/Frontend Requirements
- Preserve the shared platform shell and shared control styling from `@second-brain/ui`
- Keep the calendar visual language consistent with the rest of the platform
- Prefer modal workflows for create/edit operations
- Keep the event form modular:
  - only show fields relevant to the selected event type
  - do not show time inputs for all-day events
- Shared controls should come from `@second-brain/ui` so they render identically across apps

## Known Current Limitations
These are current product limitations, not desired behavior:
- the page loads a month from the `month` search param, but the UI does not expose month pagination controls yet
- users cannot easily navigate to a future month from the calendar UI
- there is only a month-style overview; there is no week view yet
- there is no alternate agenda-focused view mode
- there is no visible “today / previous / next” navigation bar for the calendar surface

This is why adding something like a birthday for next month is currently awkward even though the backend and page loader can already resolve another month window.

## V2 Priorities
The next major UI iteration should address navigation and view usability first.

### Required V2 capabilities
- month pagination controls:
  - previous month
  - next month
  - jump back to today
- supported view modes:
  - month view
  - week view
- URL-backed navigation state:
  - month view should use a stable month key in the URL
  - week view should use a stable week anchor in the URL
- click targets must work after navigation:
  - users should be able to navigate to next month and click that day directly to add a birthday or other event

### Strongly recommended V2 capabilities
- a compact toolbar above the calendar board with:
  - today
  - previous
  - next
  - current visible range label
  - month/week toggle
- better rendering for multi-day all-day events across adjacent days
- more Google Calendar-like information density in week view for timed events
- a clearer current-day highlight across both month and week views

## Implementation Guidance
1. Read the current `calendar-app.tsx`, `lib/calendar.ts`, and calendar API routes before changing behavior.
2. Extend the existing event model instead of replacing it with a new incompatible abstraction.
3. Preserve RFC-style semantics:
   - use `RRULE` for recurring events
   - use plain event spans for one-time events
   - prefer `EXDATE` for skipped instances
4. Keep UI state and URL state aligned for visible date windows and view modes.
5. When adding shared-looking controls, import them from `@second-brain/ui` instead of restyling local copies.
6. Prefer vertical slices:
   - UI
   - shared types
   - API route behavior
   - recurrence expansion logic
   - tests

## Testing & Quality Bar
Minimum expectations for calendar changes:
- `bun run typecheck`
- `bun test`

For implementation tasks that change code or platform behavior, also run:
- `bun run infra:up:build`
- `bun run infra:ps`

Relevant areas to extend when adding features:
- `apps/calendar/tests`
- `services/api/tests/calendar-routes.test.ts`
- recurrence expansion behavior in `services/api/src/modules/calendar/recurrence.ts`

## Near-Term Open Questions
- Should week view become the default for dense schedules, or should month remain the default landing view?
- Should reminders stay preset-only, or should advanced custom reminder timing be exposed later?
- When `.ics` import/export is added, should it live in the calendar API module or in a dedicated integration layer?
- When recurring series exceptions are edited from the UI, do we need full single-instance override support with `RECURRENCE-ID`, or is `EXDATE` plus recreate sufficient for the next phase?
