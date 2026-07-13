# Detect Fallback for Non-Travel PDFs — Design

**Date:** 2026-07-13
**Status:** Approved by Jeremy (conversation)

## Problem

Every PDF (dragged in or via Send to Pluck) is classified `kind: 'travel'` and read only by TRAVEL_PROMPT, which knows flights, hotels, and charters. A non-travel PDF with a perfectly good event in it (e.g. a Tixr movie-premiere ticket) comes back "No travel events found."

## Decision (approved)

When a travel-only batch produces **zero** travel events, `extractFromFiles` automatically re-runs the same files through DETECT_PROMPT and returns the detect-mode result. One change in `extraction.js` covers both callers (popup and background); the popup then renders normal event cards (with timezone dropdown, attachments via the preserved `sourceFileIdx` tags, persistence — all existing behavior).

- Status line during the second pass: `Checking for other kinds of events...` (plain English).
- Costs one extra Gemini call, only in the miss case.
- Out of scope (unchanged known limitation): a PDF where travel extraction finds SOME events but the document also contains non-travel events — no second pass runs.

## Verification

- Extend the one-off Node extraction test: stubbed `callGemini` returns `{events:[]}` for the TRAVEL_PROMPT call, real events for the DETECT_PROMPT call → `extractFromFiles` must return `mode: 'detect'` with the detect events and `sourceFileIdx` intact. Also assert the no-fallback case still returns travel mode.
- `node --check` on touched files; docs (CLAUDE.md routing note, CALENDAR_EVENT_FORMAT.md §1) updated to describe the fallback.
- Manual: re-send the Tixr ticket from Gmail → event card appears.
