# Edit travel cards before adding to calendar

**Date:** 2026-04-17
**Status:** Design approved — ready for implementation plan

## Summary

Give users the ability to edit a flight, hotel, or charter card before pushing it to Google Calendar, matching the inline-edit experience that event-detection cards already have. Edits are opt-in: the card stays collapsed and read-only by default; clicking **Edit** reveals an input panel.

## Motivation

Today, travel cards are read-only. If Gemini extracts a flight time slightly wrong, or the user wants to tweak the title/location/notes, they have to either (a) retry with better input or (b) manually fix the event in Google Calendar after the fact. Event-detection cards already solve this — travel cards should match.

## User flow

1. User drops a travel PDF / `.eml`. Gemini extracts. `renderTravelCards` renders cards collapsed (same as today).
2. Each card gets a new **"✎ Edit"** link between the last read-only row and the **Add to Google Calendar** button.
3. Clicking **Edit** expands an input panel in place. Link becomes **"▴ Collapse"**.
4. User edits any field.
5. Clicking **Add to Google Calendar** uses the edited values if the panel was ever opened, or the original extraction if it was never opened.

## Scope

Applies to all three travel card types:

| Type | Fields in edit panel |
|---|---|
| Flight (commercial) | Title · Date · Depart time · Arrive time · Location · Notes |
| Charter | Title · Date · Depart time · Arrive time · Location · Notes |
| Hotel | Title · Check-in date · Check-out date · Location · Notes |

Event-detection cards are **not** touched.

## Field behavior

- **Title / Location** — plain text input. If emptied, fall back to original value on Add.
- **Date / Time** — native `<input type="date">` and `<input type="time">`. Timezone suffix preserved from the original ISO string via `data-tz` on each time input, matching the event-card pattern.
- **Hotel check-in / check-out** — date-only inputs; check-out becomes the `endISO`, both stay at their original times-of-day.
- **Notes** — multi-line textarea pre-filled with the output of `buildTravelDetails(ev)` (base details + formatted passenger list). Whatever the user types goes through to the calendar event verbatim.

## Behavior rules

| Situation | Handling |
|---|---|
| Panel never opened | Use original `ev` as-is. Zero change from today. |
| Panel opened, field edited, panel collapsed, Add clicked | Read values from DOM inputs — edits persist while the panel is collapsed. |
| Retry clicked | Edits wiped (retry re-extracts from scratch). Same as event cards today. |
| Title emptied | Fall back to original title. |
| Date / time emptied | Fall back to original ISO. |
| Notes textarea edited | Textarea content replaces `baseDetails`. For flights/hotels, `passengers` is also cleared on the cloned event so `buildTravelDetails` passes the textarea through verbatim instead of re-appending a passenger list. (Charter short-circuits in `buildTravelDetails` already, so no extra step needed there.) |

## Implementation approach

**Approach A: Extend `renderTravelCards` in place** (approved).

- Add collapsed edit-panel HTML inside the existing card loop.
- Add an **Edit** toggle link.
- In the existing `.travel-cal-btn` click handler, check if the panel is expanded; if so, build a shallow-cloned event from input values and pass it to `addTravelEventToCalendar`; otherwise use the original.
- No refactor of event-card code. No new helper functions shared between travel and event cards.

## What does NOT change

- `TRAVEL_PROMPT`, `DETECT_PROMPT` — unchanged.
- `loadFile`, `runExtract`, `callGemini`, `mergeFlights` — unchanged.
- `buildTravelDetails` — unchanged (still formats passengers when present; passes `baseDetails` through when `passengers` is empty).
- `addTravelEventToCalendar` — unchanged. Receives either the original event or a cloned-with-edits event.
- Drive upload flow, OAuth flow, calendar-target selection, theming — unchanged.
- Event-detection card rendering and editing — untouched.

## Testing

Manual testing (no automated tests in this codebase):

- Extract a flight PDF → card renders collapsed like today → **Add to Calendar** works unchanged.
- Click **Edit** → panel expands → edit title only → **Add** → verify Google Calendar event has the new title.
- Edit date, depart time, arrive time → **Add** → verify event times in calendar.
- Edit a hotel card's check-in and check-out dates → **Add** → verify hotel event spans correct dates.
- Edit a charter card → verify it behaves like a flight card.
- Edit notes → **Add** → verify textarea content appears in calendar event description verbatim, no passenger list appended twice.
- Click **Edit**, edit title, click **Collapse**, click **Add** → verify edited title still used.
- Click **Retry** after editing → verify re-extraction runs and edits are discarded.
- Sign-out state: edit fields, click **Add** → verify URL-fallback Google Calendar opens with edited values pre-filled.

## Out of scope (deferred)

- Granular passenger-row editing (name/seat/confirmation as discrete fields). Option B from Q1 brainstorming.
- Bulk select + one-button add for travel cards. Option A from Q2 brainstorming.
- Persisting edits across Retry.
