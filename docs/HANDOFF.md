# Travel & Events Shortcut — Project Handoff

**Prepared for:** Continued development in VS Code with Claude Code  
**Date:** March 2026  
**Extension name:** Travel & Events Shortcut  
**Version:** 1.0

---

## What Was Built

A Chrome extension (Manifest V3) that converts any scheduling content into Google Calendar events. The user can drop files, paste content, or click a button to scan the current page — the extension uses Gemini 2.5 Flash to extract structured event data and presents a results screen where events can be selected, edited inline, and sent to Google Calendar.

---

## The Problem It Solves

Entertainment industry professionals (and anyone with a heavy scheduling workload) receive time-sensitive event information across many formats: flight confirmation PDFs, hotel booking emails, press junket schedules, Zoom meeting threads, restaurant reservation confirmations, event invitations. Getting all of this into a calendar requires tedious manual entry. This extension automates that entire process.

---

## Full Feature List

### Input Methods
| Method | What it handles |
|---|---|
| Drop zone | PDF, .eml, .txt, images, screenshots |
| Browse files button | File picker, same types |
| Ctrl+V / ⌘V paste | Text, images, files — anywhere in the popup |
| URL fetch field | Paste a PDF link from email, fetches and loads it |
| Scan this page button | Reads the active Chrome tab via content script |

### Travel Extraction (PDFs / .eml files)
- Extracts flights and hotel stays from confirmation documents
- Flight card format: `Fly Newark to Miami (AA 1692)` with route, time, duration, cabin class
- Hotel card format: `Stay at JW Marriott Miami Turnberry` with check-in/out, confirmation number, room type
- Passenger list sorted by seat number (03A, 03B, 03E, 03F)
- Passenger names normalized: Last/First → First Last, middle names removed except numeral suffixes (II, III, Jr, Sr)
- Multi-PDF merging: upload two PDFs for the same flight (e.g. different passengers), passengers are merged onto one card
- Mismatch detection: if PDFs are for different flights, an amber warning shows the conflicting fields
- Each event has its own "Add to Google Calendar" button

### Event Detection (everything else)
- Detects: dinners, meetings, appointments, events, ceremonies, press appearances, and more
- Party size logic: "Danielle Jonas +4" = Party of 5 total
- Zoom meeting handling: join URL in location field, Meeting ID and passcode in notes
- Press schedules / itineraries: every time-stamped line item becomes its own event card (tested on 8-page, 25+ event schedules)
- Duration inference: dinner = 2hr, haircut/barber = 45min, meeting = 1hr
- Timezone inference from location keywords
- Results shown as interactive cards with checkboxes

### Results UI
- Each detected event shown as a card with type badge (Dinner / Meeting / Appointment / Event / Other)
- Color-coded badges per type
- Checkbox to include/exclude
- Click card header to toggle checkbox
- Select all / Deselect all buttons
- Retry button (re-runs last extraction)
- Inline edit panel on selected cards: Title, Start, End, Location, Notes
- Live counter on export button: "Add 3 events to Google Calendar"
- Opens each event in a new tab (pre-filled Google Calendar form)

### Gmail / Outlook Handling
- Both sites block content script injection
- Gmail: content script targets `.a3s.aiL` (email body element) and returns its text
- If page text is empty on Gmail/Outlook: shows blue info box with Ctrl+V paste tip
- Local PDFs (`file://`): tries content script text, falls back to guidance to drop the file

### Theming
- Dark mode (default) and light mode (soft blue palette)
- Toggle button in bottom-left footer
- Preference persisted to localStorage
- All colors are CSS custom properties — easy to update

---

## File Structure

```
travel-and-events-shortcut/
├── manifest.json       Chrome MV3 config
├── popup.html          Full UI, CSS variables, single-screen layout
├── popup.js            All logic — ~530 lines
├── content.js          Page text extractor — ~20 lines
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── CLAUDE.md           Claude Code project context file
└── docs/
    ├── HANDOFF.md      This file
    └── HANDOFF.docx    Formatted Word version
```

---

## Architecture

**No build step. No npm. No dependencies.**

Pure vanilla JS, HTML, and CSS. Load unpacked in Chrome and it works. Every change is a save + refresh on `chrome://extensions`.

```
popup.html  ←→  popup.js  ←→  Gemini API (REST)
                    ↕
              content.js  ←→  Active tab DOM
                    ↕
            chrome.storage.local  (API key)
            localStorage           (theme preference)
```

---

## Gemini Integration Details

| Setting | Value |
|---|---|
| Model | `gemini-2.5-flash` |
| Endpoint | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` |
| Temperature | 0 |
| Max output tokens | 8192 (required for long schedules) |
| Auth | API key in URL query param |
| Key storage | `chrome.storage.local` → key: `gemini_api_key` |

The key is entered once in the popup. A "Change API key" link in the footer lets users update it. The key is hidden (password input) and never logged.

---

## Google Calendar Integration Details

Events are opened via pre-filled URL — no OAuth required:

```
https://calendar.google.com/calendar/render
  ?action=TEMPLATE
  &text=Fly Newark to Miami (AA 1692)
  &dates=20260327T165800Z/20260327T205500Z
  &details=Newark Liberty (EWR) - Miami Int'l (MIA)...
  &location=Newark Liberty International Airport...
```

**Current limitation:** This method cannot attach files. Full Google Calendar API + OAuth would be needed for that.

---

## Prompts

### TRAVEL_PROMPT (flights & hotels)
Instructs Gemini to extract structured flight/hotel JSON. Key rules:
- Flight title format: `Fly [ORIGIN] to [DEST] ([AIRLINE] [NUMBER])`
- Passenger name normalization (Last/First → First Last, no middle names except suffixes)
- No eTicket numbers
- Timezone DST awareness (New York spring = -04:00, etc.)

### DETECT_PROMPT (general events)
Instructs Gemini to extract all events as an array. Key rules:
- `Name +N` = party of N+1 total
- Every time-stamped item in a schedule = its own event
- Zoom: URL as location, ID/passcode in notes
- Infer durations when not stated
- Do not invent details not present in the source

---

## Decisions Made During Development

| Decision | Rationale |
|---|---|
| Gemini over OpenAI | Native PDF/image support in the API without preprocessing |
| No build step | Keeps iteration fast; single developer, no CI needed |
| URL-based Google Calendar | No OAuth complexity; covers 95% of use cases |
| CSS custom properties for theming | Easy to update colors without touching JS |
| `chrome.storage.local` for API key | Not synced across devices (intentional — security) |
| `maxOutputTokens: 8192` | Default was cutting off responses on long press schedules |
| Single screen, no tabs | Simpler UX; one dropzone handles everything |

---

## Known Issues / Not Yet Implemented

### Known constraints
- **Gmail scanning**: Gmail blocks content scripts. Users paste email body instead.
- **Local PDF scanning**: Chrome blocks `fetch()` for `file://` URLs from extensions. User must drop the file.
- **No file attachment to calendar events**: Would require Google Calendar API + OAuth + Google Drive API.
- **API key visible to user**: Acceptable for personal use; would need backend proxy for public distribution.

### Future work discussed
- Google Calendar API + OAuth (background event creation, file attachments)
- Backend API proxy (hide Gemini key from end users)
- Chrome Web Store publication (needs privacy policy, review, icon work)
- Smart mixed-document routing (PDFs through travel extraction, images through event detection in parallel)

---

## How to Load the Extension

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (toggle, top right)
3. Click **Load unpacked**
4. Select the `travel-and-events-shortcut/` folder
5. Pin it to your toolbar
6. Click the icon → enter your Gemini API key → save

After any code change: click the **↺ refresh icon** on the extension card.

---

## Working with Claude Code in VS Code

### Recommended workflow
1. Open the project folder in VS Code
2. Start a Claude Code session
3. Reference specific functions by name — the codebase is small enough that Claude can hold it all in context
4. After any JS change, always validate: `node --check popup.js`
5. Reload the extension in Chrome to test

### Gotchas Claude Code should know
- No inline `onclick` in HTML — all listeners in `DOMContentLoaded`
- No `localStorage` for secrets — use `chrome.storage.local`
- No `<form>` tags
- Apostrophes inside single-quoted JS strings cause syntax errors — use `\'` or switch to double quotes
- `new Function(code)` does NOT catch async/await syntax errors — use `node --check` instead
- The `tab` variable name conflicts if used as both a function parameter and a destructured `chrome.tabs.query` result in the same scope

### Key functions to know
| Function | File | Purpose |
|---|---|---|
| `loadFile()` | popup.js | Reads any file into base64, classifies kind |
| `runExtract()` | popup.js | Routes files to travel or event extraction |
| `runScan()` | popup.js | Reads active tab, handles edge cases |
| `callGemini()` | popup.js | Single Gemini API call wrapper |
| `renderTravelCards()` | popup.js | Travel result cards with cal links |
| `renderDetectedCards()` | popup.js | Interactive event cards with edit UI |
| `applyTheme()` | popup.js | Dark/light theme switcher |
| `handlePaste()` | popup.js | Global paste event handler |

---

## Origin

Built iteratively through a long Claude.ai conversation. Jeremy Book (Executive Assistant to Kevin Jonas) developed this to handle real scheduling workflows in the entertainment industry — primarily flight/hotel confirmations, press schedules, and event invitations.
