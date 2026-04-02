# CLAUDE.md — Travel & Events Shortcut

## Project Purpose

**Travel & Events Shortcut** is a Chrome extension that lets users instantly convert any event-related content — travel confirmation PDFs, email invitations, press schedules, screenshots, or pasted text — into Google Calendar events, without any manual copy-pasting.

It was built to solve a real workflow problem for entertainment industry professionals who deal with a high volume of time-sensitive scheduling documents (flight confirmations, hotel bookings, press junket schedules, restaurant reservations, Zoom meeting links, event invitations) and spend significant time manually entering them into their calendar.

The extension uses Google's Gemini 2.5 Flash model as its AI backbone for structured event extraction.

---

## Project Status

**Version:** 1.0 (functional, developer-mode install)  
**Distribution:** Private / developer use only (not on Chrome Web Store)  
**AI Model:** `gemini-2.5-flash` via direct REST API  
**Architecture:** Chrome Extension MV3, pure vanilla JS, no build step, no dependencies

---

## Repository Structure

```
travel-and-events-shortcut/
├── manifest.json          # Chrome extension config (MV3)
├── popup.html             # Full UI — single screen, no tabs
├── popup.js               # All UI logic, Gemini API calls, event rendering
├── content.js             # Injected into pages — returns page text to popup
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── CLAUDE.md              # This file
└── docs/
    ├── HANDOFF.md         # Full project handoff in Markdown
    └── HANDOFF.docx       # Same handoff as formatted Word document
```

---

## How It Works

### Two extraction modes

**1. Travel mode** (flights + hotels)
- Upload PDF confirmations or `.eml` email files
- Gemini extracts structured flight/hotel data
- Outputs individual "Add to Google Calendar" links per event
- Handles multi-passenger PDFs: merges passengers from separate confirmations onto a single flight card
- Formats passenger list sorted by seat number

**2. Event detection mode** (everything else)
- Input: dropped file, pasted image/text, or "Scan this page" button
- Gemini detects dinners, meetings, appointments, press appearances, ceremonies, etc.
- Results shown as selectable, editable cards
- User selects which events to export, edits any fields inline, then bulk-opens Google Calendar

### Smart input handling
- Drop zone accepts: PDF, `.eml`, `.txt`, any image type
- Ctrl+V / ⌘V paste: handles text, images, and files
- "Scan this page": reads active tab via content script
  - Gmail/Outlook: shows paste-text tip (those sites block content scripts)
  - Local PDFs (`file://`): tries content script, falls back to drop-file guidance
- URL fetch: pastes a PDF link from email, fetches and loads it

### Routing logic (in `runExtract`)
- Files classified as `kind: 'travel'` (PDF/eml) → TRAVEL_PROMPT → flight/hotel cards
- Files classified as `kind: 'image'` or `kind: 'text'` → DETECT_PROMPT → event cards
- **Mixed uploads** (e.g. a PDF schedule alongside an image) → all run through DETECT_PROMPT

---

## Key Files Explained

### `popup.js`

The entire application lives here. Key sections:

| Section | What it does |
|---|---|
| `TRAVEL_PROMPT` | Detailed prompt for extracting flights and hotels. Includes passenger name formatting rules, seat sorting, confirmation code extraction. |
| `DETECT_PROMPT` | Prompt for general event detection. Handles party size math, Zoom links, timezone inference, press schedule parsing (forces extraction of every time-stamped item). |
| `loadFile()` | Reads any dropped/pasted file into base64, classifies its kind. |
| `runExtract()` | Routes loaded files to travel or event extraction. |
| `runScan()` | Queries the active tab, handles Gmail/Outlook/local PDF edge cases, calls Gemini with page text. |
| `callGemini()` | Single fetch wrapper. Uses `maxOutputTokens: 8192` — critical for dense schedules. |
| `renderTravelCards()` | Renders flight/hotel result cards with individual Google Calendar links. |
| `renderDetectedCards()` | Renders the interactive checkbox + inline-edit results UI. |
| `applyTheme()` | Switches between dark and light mode, persists to localStorage. |
| `handlePaste()` | Global paste listener — routes to travel or event flow based on file type. |

### `content.js`

Minimal. Listens for `{ type: 'GET_PAGE_TEXT' }` from the popup. Returns `document.body.innerText` (or the Gmail email body if on `mail.google.com`), capped at 20,000 characters.

### `popup.html`

Single-screen layout (no tabs). Theme variables defined as CSS custom properties on `[data-theme="dark"]` and `[data-theme="light"]`. All interactive elements wired in `popup.js` via `addEventListener` — no inline handlers.

---

## Gemini Integration

**Model:** `gemini-2.5-flash`  
**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`  
**Auth:** API key passed as URL query param `?key=`  
**Key storage:** `chrome.storage.local` under key `gemini_api_key`  
**Temperature:** 0 (deterministic)  
**Max output tokens:** 8192 (required for dense multi-page schedules)

The API key is entered once by the user and hidden behind a "Change API key" link. There is no backend — all calls go directly from the popup.

---

## Google Calendar Integration

Events are opened in new tabs using pre-filled Google Calendar URL parameters:

```
https://calendar.google.com/calendar/render?action=TEMPLATE
  &text=EVENT_TITLE
  &dates=START_ISO_UTC/END_ISO_UTC
  &details=NOTES_AND_PASSENGER_LIST
  &location=ADDRESS_OR_ZOOM_URL
```

**Limitation:** This approach cannot attach files to calendar events. Doing so would require the Google Calendar API with OAuth — see Future Work below.

---

## Theming

Two themes: **dark** (default) and **light** (light blue palette).

Toggled via the button in the bottom-left footer. Preference saved to `localStorage` as `tes_theme`.

All colors are CSS custom properties on `html[data-theme]`. To change any color, update the relevant variable in `popup.html`'s `<style>` block — no JS changes needed.

Dark theme base: `#1e1e1e` background, `#f0f0f0` text.  
Light theme base: `#deeeff` background (soft blue), `#0d1f30` text.

---

## Known Constraints

| Constraint | Detail |
|---|---|
| Gmail / Outlook scanning | Content scripts are blocked. User must copy-paste email body with Ctrl+V. The UI detects this and shows the tip automatically. |
| Local PDFs (`file://`) | Chrome extensions cannot `fetch()` local files. Content script text extraction works for Chrome's built-in PDF viewer; otherwise user drops the file. |
| File attachments to calendar | Not possible via URL parameters. Would require Google Calendar API + OAuth. |
| API key exposure | The Gemini key is stored in `chrome.storage.local` (not synced, not in code). For public distribution, a backend proxy would be needed. |
| No build pipeline | Intentional for simplicity. If the project grows significantly, consider adding a bundler (Vite or esbuild). |
| MV3 only | Uses `chrome.tabs`, `chrome.scripting`, `chrome.storage`. Not compatible with MV2. |

---

## Future Work (Discussed / Not Yet Built)

- **Google Calendar API + OAuth integration** — would enable background event creation and file attachments. Requires a registered GCP project with OAuth credentials.
- **Backend proxy for API key** — removes the need for users to supply their own Gemini key; better UX for wider distribution.
- **Chrome Web Store publication** — needs privacy policy, updated description, icon polish, and backend key proxy.
- **Mixed-document smart routing** — currently mixed uploads (PDF + image) all go through DETECT_PROMPT. Could intelligently run travel extraction on PDFs and event detection on images in parallel.
- **Recurring events** — the current approach opens each event individually. Bulk creation via Google Calendar API would be cleaner.

---

## Working with Claude Code

### Commands to know
```bash
# Load the extension in Chrome (no build needed)
# Go to chrome://extensions → Enable Developer Mode → Load unpacked → select this folder

# Validate popup.js syntax
node --check popup.js

# Quick syntax test including async
node -e "const fs=require('fs'); const c=fs.readFileSync('popup.js','utf8'); new Function(c); console.log('OK');"
```

### Prompt patterns that work well
- "Update the DETECT_PROMPT to also handle X"
- "Add a new input type to loadFile() for Y"
- "The renderDetectedCards() function needs Z"
- "Add a third button below the scan button that does..."
- Always ask Claude to run `node --check popup.js` after any JS changes

### What NOT to do
- Do not add inline `onclick` handlers in HTML — all events wired in `DOMContentLoaded`
- Do not use `localStorage` for the API key — use `chrome.storage.local`
- Do not add `<form>` tags — Chrome extension popups handle forms poorly
- Do not use template literals with backticks inside single-quoted JS strings without escaping apostrophes — this has caused syntax errors before

### Agent workflows
- Save all agent workflow files (plans, specs, execution logs) to the `work flows/` folder in the project root
- This keeps implementation artifacts organized and separate from source code and documentation

---

## Development Setup

1. Clone / open this folder in VS Code
2. Go to `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** → select this folder
5. Pin the extension to your toolbar
6. Click the extension icon to open the popup
7. After any code change: click the **refresh icon** on the extension card at `chrome://extensions`

No npm install, no build step, no dependencies. Edit and reload.

---

## Contact / Origin

Built iteratively through a Claude.ai conversation by Jeremy Book (Executive Assistant to Kevin Jonas). Developed to handle real scheduling workflows in the entertainment industry.
