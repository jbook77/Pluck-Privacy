# Google Integration Design
**Date:** 2026-03-31
**Feature:** Google account sign-in, Google Drive file upload, Google Calendar API event creation with file attachments, per-batch calendar selection with smart auto-detection, and alias management for multi-calendar workflows.

---

## Problem

The extension currently creates Google Calendar events by opening a pre-filled URL in a new tab. This approach cannot attach files to events. Users who want the original travel confirmation PDF, email, or image accessible from the calendar event must manually attach it themselves after the event is created.

Additionally, Jeremy manages multiple people's Google Calendars and must manually reassign events to the correct calendar after creation — there is no way to specify a target calendar via the URL approach.

---

## Goals

- Allow users to optionally sign in with Google
- When signed in and a file is loaded: upload the source file to Google Drive and create the calendar event via the Calendar API with the file as a true attachment
- When signed in: show a per-batch calendar picker so the user can assign events to the correct person's calendar before creation
- When not signed in, or signed in but no file loaded: fall back to the existing URL approach unchanged
- Auth persists — user is never asked to sign in again after the first time
- After extraction, auto-select the most likely calendar based on names found in the document matched against user-configured aliases
- Provide a settings panel for managing aliases (nicknames/alternate names mapped to a calendar)

---

## Non-Goals

- Backend proxy or server-side component (stays fully client-side)
- Injecting a "Send to extension" button into Gmail (noted as future work)
- Recurring event support
- OAuth account switching (user is always signed in with Chrome's active work account)

---

## Architecture

### OAuth

- **Method:** `chrome.identity.getAuthToken({ interactive: true })`
- **Scopes:** `drive.file` (upload files), `calendar.events` (create events), and `calendar.readonly` (fetch the calendar list for the picker)
- **Why `getAuthToken`:** All users have Chrome signed into their work Google account, which already has delegated access to the calendars they manage. Chrome handles token caching and refresh automatically.
- **Persistence:** After first sign-in, `getAuthToken({ interactive: false })` silently returns a valid token on every subsequent use. User info (name, email) stored in `chrome.storage.local`.
- **Sign-out:** Calls `chrome.identity.removeCachedAuthToken()` and clears stored user info.
- **GCP setup (one-time):** Requires a Google Cloud Project with the Calendar API and Drive API enabled, an OAuth 2.0 client ID of type "Chrome Extension" with the extension's Chrome ID registered, and the `oauth2` block added to `manifest.json`.

### New manifest.json additions

```json
"permissions": ["identity"],
"oauth2": {
  "client_id": "<GCP_CLIENT_ID>",
  "scopes": [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly"
  ]
},
"host_permissions": [
  "https://www.googleapis.com/",
  "https://generativelanguage.googleapis.com/*",
  "<all_urls>"
]
```

### New functions in popup.js

| Function | Purpose |
|---|---|
| `signInWithGoogle()` | Calls `getAuthToken`, fetches user info, stores in `chrome.storage.local`, fetches calendar list |
| `signOutGoogle()` | Removes cached token, clears stored user info and calendar list |
| `fetchCalendarList(token)` | Calls `/calendar/v3/users/me/calendarList`, filters to writable calendars, caches result |
| `uploadToDrive(token, file)` | Uploads file base64 to Drive API, returns `fileId` |
| `createCalendarEvent(token, calendarId, eventData, fileIds)` | Creates event via Calendar API with Drive file attachments, returns event ID |
| `buildGCalEventUrl(event)` | Returns `event.htmlLink` from the Calendar API response — the direct GCal link to the created event |
| `autoSelectCalendar(events)` | Scans extracted event data (titles, passenger names, notes) for alias matches; returns the best-matching calendar ID or falls back to last-used |
| `getAliases()` / `saveAliases()` | Read/write alias mappings from `chrome.storage.local` |

### Source file tagging

During extraction in `runExtract()`, each extracted event is tagged with the index of the file it came from (`sourceFileIdx`). This allows the correct file to be attached to each event. If one file produces multiple events (e.g. a flight PDF with outbound and return), the file is uploaded to Drive once and its `fileId` is reused for all events from that source.

Scanned pages and pasted text have no source file — events from these sources are created via API with no attachment.

---

## Event Creation Flow

### Signed in + file loaded (new path)

1. User selects events and target calendar, clicks "Add N events → [Calendar Name]"
2. Deduplicate source files across selected events
3. For each unique source file: `uploadToDrive()` → store `fileId`
4. For each selected event: `createCalendarEvent()` with its source file's `fileId`
5. API response includes `htmlLink` → `chrome.tabs.create()` opens one tab per created event (same behavior as the URL flow today)

### Signed in + no file loaded (URL fallback)

- Behaves exactly as today: opens GCal pre-filled via URL, user clicks Save in GCal

### Signed out (URL fallback)

- Behaves exactly as today: no change

---

## UI Changes

### Footer (always visible)

- **Signed out:** "Connect Google" button added to the left side of the footer
- **Signed in:** Google account avatar initial + email address + "sign out" link replace the Connect button

### Calendar picker (signed in only, appears above Add button)

- Shown only when signed in
- Labeled "Add to calendar" in small uppercase
- Dropdown showing all writable calendars fetched from the API, each with its Google Calendar color dot
- Defaults to last-used calendar (persisted in `chrome.storage.local`)
- Hidden when signed out (Add button reverts to today's label and URL behavior)

### Smart calendar auto-selection

After events are extracted, `autoSelectCalendar()` scans all extracted text (passenger names, event titles, notes) for case-insensitive matches against the user's saved aliases. The first unambiguous match sets the calendar picker automatically. If no match is found, or multiple different calendars match (ambiguous), it falls back to the last-used calendar. The user can always override the auto-selected calendar before adding events.

Alias matching is case-insensitive and whole-word — "Joe" matches "Joe Jonas" on a passenger list but not "Joey".

### Settings panel

Accessed via a gear icon in the footer (sized larger than the theme toggle for easy tap). Opens a settings view that replaces the main popup content.

- Lists all calendars the user has access to, each as a card with its Google Calendar color dot and calendar name
- Each calendar card shows its current aliases as individual pill tags, each with its own × delete button
- A `+ add` pill on each card opens an inline text input to type a new alias and confirm with Enter or a checkmark button
- Aliases wrap onto multiple lines cleanly within the card
- Back arrow in the settings header returns to the main view
- Aliases stored in `chrome.storage.local` as `{ calendarId: [alias1, alias2, ...] }`

### Theme toggle

The light/dark mode button in the footer is redesigned as a proper toggle switch (on/off style) rather than a text button. Behavior unchanged — persists to `localStorage` as `tes_theme`.

### Add button label

- Signed out: `Add N events to Google Calendar` (unchanged)
- Signed in: `Add N events → [Selected Calendar Name]`

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Drive upload fails | Inline warning with two options: **Retry** or **Add without attachment** (proceeds via Calendar API, no file attached) |
| Calendar API fails | Inline error with API message (e.g. "You don't have write access to this calendar"). Drive file already uploaded — no cleanup needed. |
| Token expired/revoked | Chrome's `getAuthToken` handles silently in most cases. If it fails, show "Reconnect Google" prompt and clear stored account info. |
| No write access to a calendar | Calendar filtered out of the picker list at fetch time (only writable calendars shown) |

---

## Future Work

- **Gmail "Send to extension" button** — A content script that injects a button next to Gmail attachment chips, sending the file data directly to the popup without requiring a download-first step. High priority for Jeremy's workflow.
- **Google Calendar API + OAuth for file attachments** — *(this document — now being built)*
- **Backend proxy for Gemini API key** — removes need for users to supply their own key
- **Chrome Web Store publication** — needs privacy policy, icon polish, backend key proxy
- **Mixed-document smart routing** — run travel extraction on PDFs and event detection on images in parallel
- **Recurring events** — bulk creation via Calendar API

---

## Open Questions / Assumptions

- The GCP project and OAuth client ID will be set up by the developer before implementation begins. The `client_id` is the only external value that must be inserted into `manifest.json`.
- Calendar list is fetched once at sign-in and cached. A manual refresh button is not included in v1 — if the calendar list changes (e.g. a new calendar is delegated), the user can sign out and back in.
- Drive files are uploaded to the root of the user's Drive with their original filename. No special folder is created in v1.
