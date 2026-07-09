# Background Parsing + Timezone Picker — Design

**Date:** 2026-07-09
**Status:** Approved by Jeremy (conversation), pending spec review
**Scope:** Two features. A related bug fix (Gmail attachment base64 padding, background.js) was already applied outside this spec.

---

## Feature 1: Pluck remembers everything (background parsing + state restore)

### Problem

Chrome closes the extension popup the instant the user clicks anywhere else, destroying all in-memory state (`loadedFiles`, `detectedEvents`, inline edits). Parsing that is mid-flight dies with it. Jeremy wants to load files, click away to answer email, and come back to finished results.

### Decision (approved)

Keep the popup UI unchanged. Move Gemini extraction into the background service worker, persist all popup state to `chrome.storage.session`, and restore it whenever the popup reopens. Signal completion with the existing "!" badge. (Side-panel approach was considered and declined — bigger UX change, new permission, CWS re-review.)

### Architecture

**Single source of truth:** one `chrome.storage.session` key, `pluck_state`:

```js
{
  loadedFiles: [...],            // same shape as today's in-memory array
  phase: 'idle' | 'extracting' | 'done' | 'error',
  statusText: 'Detecting events...',   // for live status restore
  mode: 'travel' | 'detect',     // which renderer to use on restore
  travelEvents: [...],           // merged flight/hotel/charter events (travel mode)
  detectedEvents: [...],         // detected events incl. user edits (detect mode)
  selections: [...],             // checkbox state per detected event
  usedFallback: false,           // lighter-model banner flag
  error: null,                   // message for phase 'error'
  selectedCalendarId: '...',
  dropZoneCollapsed: 'files' | null,
  updatedAt: 1234567890
}
```

`chrome.storage.session` already has `TRUSTED_AND_UNTRUSTED_CONTEXTS` access (set in background.js) and auto-clears when Chrome fully quits — desired behavior. Quota is 10 MB; if a write fails (huge multi-PDF batch), the popup keeps working exactly as today (in-memory only) and skips persistence — no error shown, graceful degradation.

### Extraction moves to background

- Extract shared code (prompts `TRAVEL_PROMPT`/`DETECT_PROMPT`, `callGemini`, retry/fallback logic, `mergeFlights`, `checkMismatches`) from popup.js into a new **`extraction.js`**, loaded by popup.html via `<script>` and by background.js via `importScripts()`.
- Popup's `runExtract()` becomes: write `loadedFiles` + `phase:'extracting'` to `pluck_state`, send `{type:'RUN_EXTRACT'}` to background, render loading state.
- `runScan()` keeps its page-reading logic in the popup (needs the active tab), but hands the gathered text to the same background `RUN_EXTRACT` path as a text payload.
- Background `RUN_EXTRACT` handler: reads `pluck_state.loadedFiles` and the API key from `chrome.storage.local`, runs the exact routing logic that lives in `runExtract()` today (travel-only → TRAVEL_PROMPT per file; otherwise DETECT_PROMPT per file), updates `statusText` as it progresses, uses the existing `keepAlive` interval pattern during long calls, then writes results + `phase:'done'` (or `phase:'error'` + message).
- On completion, background: sets badge "!" and sends a `{type:'EXTRACT_DONE'}` runtime message (same pattern as `GMAIL_FILES_READY`; error ignored if popup closed).

### Popup restore path

On `DOMContentLoaded`, after existing init: read `pluck_state`.
- `phase:'extracting'` → restore file list, show `statusText` spinner, listen for `EXTRACT_DONE`.
- `phase:'done'` → restore file list, re-render cards from stored events via existing `renderTravelCards`/`renderDetectedCards`, restore selections, edits, calendar choice, collapsed drop zone, fallback banner; clear badge.
- `phase:'error'` → restore file list + existing error-with-retry UI.
- No state / `phase:'idle'` → today's fresh-open behavior (including `_pickUpPendingGmailFiles`).

### Continuous persistence of user activity

- Inline edits on cards (title/date/time/location/notes/all-day/timezone) and checkbox toggles update the stored event objects in `pluck_state` via a debounced (300 ms) listener.
- Calendar selection changes persist immediately.
- State clears (`pluck_state` removed) when the user clicks "Change files" or removes the last file. New files arriving (drag, paste, Send to Pluck) keep today's behavior — they join `loadedFiles` and re-extraction runs, so stored results are replaced by the new run's output.
- After events are successfully added to the calendar, state is kept (user may add remaining events) — it clears only via the rules above or Chrome quitting.

### Gmail "Send to Pluck" interaction

`pending_gmail_files` flow is unchanged; when the popup picks the files up, they enter `loadedFiles` and the new persistence covers them from there. Badge continues to serve both "files waiting" and now "results ready".

### Error handling

- Background extraction failure → `phase:'error'` + plain-English message; popup (open or reopened later) shows the existing retry UI. Retry re-sends `RUN_EXTRACT`.
- Message-port failures (service worker asleep when popup sends `RUN_EXTRACT`) — `chrome.runtime.sendMessage` wakes the worker; response not required since state flows through storage.

---

## Feature 2: Timezone selector on non-flight event cards

### Problem

Zoom calls and similar invitations often omit a timezone and one can't be inferred. Today Gemini guesses (usually Eastern) and the user can't see or correct the assumption.

### Decision (approved)

Every detected-event card (non-flight family only; travel cards unchanged) gets a timezone dropdown next to the time fields, always visible, pre-filled with Gemini's inferred zone, defaulting to Eastern when unknown. Hidden while "All-day event" is toggled on.

**Zones offered:**

| Label    | IANA zone           |
|----------|---------------------|
| Eastern  | America/New_York (default) |
| Central  | America/Chicago     |
| Mountain | America/Denver      |
| Pacific  | America/Los_Angeles |
| Alaska   | America/Anchorage   |
| Hawaii   | Pacific/Honolulu    |
| London   | Europe/London       |

If Gemini returns an IANA zone outside this list (e.g. `America/Argentina/Buenos_Aires`), the dropdown shows it as an extra option labeled with the city name so the correct zone isn't silently replaced.

### Wall-clock semantics (key behavior)

Changing the dropdown never shifts the displayed time: 3:00 PM Eastern switched to Pacific becomes 3:00 PM Pacific. The time the user sees is the time that lands on the calendar, in the chosen zone.

### Calendar write changes (detected events only)

- **Signed in (Calendar API):** send wall-clock `dateTime` **without numeric offset** (`2026-07-09T15:00:00`) plus `timeZone: <IANA>` on both start and end. Google interprets the wall time in the named zone — this also permanently fixes the hard-coded-DST-offset bug documented in CALENDAR_EVENT_FORMAT.md §6.2, since Google now owns offset math.
- **URL fallback (not signed in):** the template URL needs UTC. Add a helper `wallTimeToUTC(dateTimeStr, ianaZone)` using `Intl.DateTimeFormat` to compute the zone's offset for that specific date (DST-correct), then convert. Also append `&ctz=<zone>`.
- **Travel events:** unchanged — they keep offset-bearing ISO strings + the separate start/end named zones from the in-progress work (already in the working tree: TRAVEL_PROMPT `startTimeZone`/`endTimeZone`, google-api.js pass-through).

### Extraction prompt

The working tree already adds `timeZone` (IANA) to DETECT_PROMPT's output format. Keep it; the dropdown pre-fills from it and falls back to `America/New_York`.

### Downstream contract (day-sheet app)

Update `docs/CALENDAR_EVENT_FORMAT.md` in the same change: §3 payload example and §6 timezone section must describe the new detected-event payload (wall time + named zone, no numeric offset) and soften the DST caveat accordingly. Titles, descriptions, locations — the fields the day-sheet app parses — are untouched.

---

## Testing

No test framework exists; verification is manual + one-off Node scripts (repo convention):

1. `node --check` on every touched JS file (popup.js, background.js, extraction.js, google-api.js).
2. One-off Node test for `wallTimeToUTC` across DST boundaries (Jan/Jul dates, all 7 zones).
3. Manual: load files → close popup mid-parse → badge appears → reopen shows results with edits intact; timezone dropdown round-trip on a Zoom invite with no stated zone; travel flow regression (flight PDF, both drag-in and Send to Pluck).
4. All-day toggle hides/restores the timezone dropdown.

## Out of scope

- Side panel surface.
- Timezone controls on travel cards (zones derive from airports).
- Zones beyond the 7 listed (plus pass-through of Gemini-detected foreign zones).
- Persisting state across full Chrome restarts.

## Rollout

Single release, version 1.6 (manifest already bumped in working tree). The in-progress timezone extraction changes in the working tree are absorbed by Feature 2 rather than committed separately.
