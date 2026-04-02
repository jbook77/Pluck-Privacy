# Feature Skills Handoff

This folder contains two portable feature guides ("skills") extracted from a Chrome extension that processes travel documents and events. They are written to be **product-agnostic** — adapt them to any Chrome MV3 extension that works with Google Calendar and/or Gmail.

## What's Included

### 1. [Drive + Calendar Attachment](drive-calendar-attachment.md)

**Problem it solves:** Chrome extensions that create Google Calendar events via URL parameters (`calendar.google.com/calendar/render?action=TEMPLATE&...`) cannot attach files to those events.

**What it does:** Uploads source documents (PDFs, images) to Google Drive, then creates the Calendar event via the Calendar API with the Drive files attached. Falls back gracefully to the URL approach if upload fails.

**When to use:** Your extension already creates calendar events and you want those events to have the source document attached (e.g., a flight confirmation PDF attached to the flight's calendar entry).

---

### 2. [Gmail "Send to Extension" Button](gmail-send-to-extension.md)

**Problem it solves:** Users receive emails with important attachments (PDFs, images) that they want to process through the extension, but downloading and drag-dropping files is tedious.

**What it does:** Injects a button directly into Gmail's UI next to email attachments. One click fetches the attachments via the Gmail API and queues them for the extension's popup. Includes a settings toggle to show/hide the button.

**When to use:** Your extension processes files (PDFs, images) and your users frequently receive those files as email attachments.

---

## Integration Notes

- **Both skills assume Chrome Extension MV3** (service worker, `chrome.identity`, `chrome.storage`)
- **Both use `chrome.identity.getAuthToken`** for OAuth — if your extension already has Google sign-in, you likely have this
- **Each skill has a Prerequisites Checklist** at the top — run through it before implementing
- **The skills are independent** — you can implement one without the other
- **If implementing both**, they share OAuth infrastructure (token management, GCP project setup) but the scopes, APIs, and code are separate

## Order of Implementation

If doing both:

1. **Drive + Calendar Attachment first** — it's simpler (two API calls, no DOM injection) and validates your OAuth setup
2. **Gmail button second** — it's more complex (content script + service worker + popup coordination) and adds the Gmail API scope on top of the existing setup

## For the Implementing Agent (Claude Code)

These documents contain complete, working code with full context on gotchas and edge cases. When integrating:

- Read the Prerequisites Checklist and verify each item against the existing codebase
- The code snippets are standalone functions — adapt naming, error handling, and UI patterns to match the existing codebase style
- Pay close attention to the "Gotchas and Lessons Learned" tables — these document real bugs that were encountered and fixed during development
- The Gmail message ID format conversion (decimal → hex, prefix stripping) is critical and easy to miss
- The inline image filtering is critical — without it, every email signature image gets treated as an attachment
