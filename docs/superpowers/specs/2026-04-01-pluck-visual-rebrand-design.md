# Pluck Visual Rebrand — Design Spec

**Date:** 2026-04-01  
**Status:** Draft  
**Scope:** Aesthetic/cosmetic refresh only — no functional changes to extraction, API calls, or event logic

---

## Overview

Rebrand the "Travel & Events Shortcut" Chrome extension as **Pluck** with a new visual identity inspired by Linear: deep dark UI, clean typography, and a confident indigo + gold color scheme. Font: Poppins (Google Fonts). Logo: placeholder until final asset is ready.

---

## Workflow & Safety Rules

1. **Preview-first:** All design changes are built in `UI Design/preview.html` (standalone, no JS logic) before touching the real extension
2. **Approval gate:** Every change to `popup.html` requires explicit user approval
3. **No functional changes:** Buttons, inputs, event listeners, API calls, extraction logic — all untouched. Only CSS properties, class names (if needed), text labels, and font loading change
4. **Change log:** Every modification recorded in `UI Design/changelog.md` with before/after details
5. **Validation:** After each change to real extension files, run `node --check popup.js` and verify manual reload in Chrome
6. **Revertibility:** Changelog enables reverting any individual change

---

## Design System

### Brand Colors

| Token | Value | Usage |
|---|---|---|
| `--brand` | `#1D1DA4` | Logo, brand accents, active toggle states |
| `--accent` | `#F0C040` | Primary buttons, CTAs, success states, selected file indicators |
| `--accent-hover` | `#D4A830` | Hover state for gold elements |

### Dark Theme Palette

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0f0f14` | Page background |
| `--bg2` | `#181820` | Cards, inputs, elevated surfaces |
| `--bg3` | `#22222e` | Hover states, tertiary surfaces |
| `--border` | `#2a2a3a` | Default borders |
| `--border2` | `#3a3a4a` | Focus/hover borders |
| `--text` | `#f0f0f0` | Primary text |
| `--text2` | `#b0b0c0` | Secondary text |
| `--text3` | `#6a6a80` | Muted labels |
| `--text4` | `#3a3a4a` | Hint text, placeholder text |

### Light Theme Palette

Update existing light theme to complement the indigo/gold identity. Shift from current blue-tinted to indigo-tinted whites:

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#f4f4fa` | Page background (soft indigo-white) |
| `--bg2` | `#eaeaf4` | Cards, inputs |
| `--bg3` | `#dddde8` | Hover states |
| `--border` | `#c8c8d8` | Default borders |
| `--border2` | `#a8a8c0` | Focus/hover borders |
| `--text` | `#111128` | Primary text |
| `--text2` | `#3a3a58` | Secondary text |
| `--text3` | `#7a7a98` | Muted labels |
| `--text4` | `#a8a8c0` | Hint text |
| `--brand` | `#1D1DA4` | Same as dark |
| `--accent` | `#C8960A` | Slightly darker gold for light backgrounds |
| `--accent-hover` | `#A87A00` | Hover |

### Typography

**Font family:** `'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

Loaded via Google Fonts: weights 300, 500, 600, 700.

| Weight | Size | Usage |
|---|---|---|
| 700 | 16px | "Pluck" wordmark in header |
| 600 | 14px | Buttons, card titles, section headings |
| 600 | 13px | Secondary buttons (scan, browse) |
| 500 | 13px | Body text, input text, field values |
| 500 | 12px | Labels, smaller body text |
| 300 | 11px | Hints, sublabels, footer text, placeholders |
| 300 | 10px | Tags, fine print |

### Spacing & Radius

No changes from current values — keep existing radius and spacing:
- Card border-radius: `10px`
- Button border-radius: `8px`
- Input border-radius: `7px`
- Body padding: `20px`

---

## Component Designs

### Header

- **Logo:** Placeholder — 32x32 indigo (`#1D1DA4`) rounded-rect with white "P" in Poppins 700. Will be replaced with final logo PNG later.
- **Title:** "Pluck" in Poppins 700, 16px, `--text`
- **Subtitle:** "Travel & Events" in Poppins 300, 11px, `--text3`
- Layout: same flex row with gap

### URL Input Row

- Input: `--bg2` background, `--border` border, Poppins 500 12px
- Placeholder text: Poppins 300, `--text4`
- Fetch button: `--bg2` background, `--text2` text, Poppins 600 12px
- Fetch hover: `--bg3` background, subtle `--brand` left-border accent

### Drop Zone

- Dashed border: `--border` color, 1.5px
- Upload icon: `--text4`, transitions to `--accent` (gold) when files present
- Border with files: solid `--accent` (gold) — replaces current green
- Drop label: Poppins 500 13px, `--text3`
- Sublabel: Poppins 300 11px, `--text4`
- Browse button: Poppins 600 12px, `--bg2` background, `--border` border
- **Collapse behavior:** When results are rendered, the drop zone collapses to a single-line bar:
  - Shows: file icon + "{N} file(s) loaded" + "Change files" link
  - Poppins 300 11px, `--text3`
  - Click "Change files" to re-expand the full drop zone
  - Implementation: toggle a `.collapsed` class that changes height/padding/content visibility

### File List

- File items: `--bg2` background, `--border` border
- File name: Poppins 500 11px, `--text2`
- Remove button: `--text4`, hover `#f87171` (keep red for destructive)

### Extract Button (Primary CTA)

- Background: `--accent` (`#F0C040`)
- Text: `#0f0f14` (dark text on gold), Poppins 600 14px
- Hover: `--accent-hover` (`#D4A830`)
- Disabled: opacity 0.25
- Most visually prominent element on the page

### Scan Button

- Ghost/outlined style
- Border: `--border`, text: `--text3`, Poppins 600 13px
- Hover: `--bg3` background, `--text2` text, `--border2` border
- Icon: same magnifying glass SVG

### Scan Hint

- Poppins 300 11px, `--text4`

### Status

- Spinner: `--border` base, `--text3` top-color
- Status text: Poppins 500 12px, `--text3`

### Event Type Tags

Updated hues to complement indigo/gold palette:

| Type | Background | Text |
|---|---|---|
| Flight | `#0e1530` | `#5a8af7` |
| Hotel | `#0d1f17` | `#3ecf8e` |
| Charter | `#1a1040` | `#b794f4` |
| Dinner | `#2a1a00` | `#F0C040` |
| Meeting | `#0e1530` | `#5a8af7` |
| Appointment | `#1a1040` | `#a07cf0` |
| Event | `#1a0018` | `#e060d0` |
| Other | `#22222e` | `#6a6a80` |

### Travel Cards

- Background: `--bg2`, border: `--border`, radius: 10px
- Title: Poppins 600 13px, `--text`
- Icon: `--text3`
- Field label: Poppins 300 11px, `--text3`
- Field value: Poppins 500 11px, `--text2`
- Row divider: `--border` (1px)
- "Add to Calendar" link button: Poppins 500 12px, `--text`, `--bg2` bg, `--border` border

### Detected Cards

- Background: `--bg2`, border: `--border`, radius: 10px
- Selected state: border-color `--accent` (gold) — replaces current green
- Checkbox accent-color: `--accent`
- Title: Poppins 600 13px, `--text`
- Meta text: Poppins 300 11px, `--text3`
- Edit panel inputs: `--bg` background, `--border` border, Poppins 500 12px
- Edit labels: Poppins 300 10px, `--text3`

### Detect Actions Row

- Select All / Deselect buttons: `--bg2`, `--border`, Poppins 500 12px
- Retry button: same ghost style
- "Add to Calendar" button: gold accent, same style as Extract button

### Calendar Picker

- Picker button: `--bg2` background, `--brand` border (indigo accent)
- Calendar dot: keep per-calendar colors from Google
- Dropdown: `--bg2` background, `--border` border, shadow

### Footer

- "Connect Google" button: ghost style, Poppins 300 10px
  - Hover: `--brand` border and text color
- Account avatar: `--brand` background (indigo), white initial
- Account email: Poppins 300 10px, `--text4`
- Sign out link: Poppins 300 10px, `--text4`
- Settings gear: `--text4`, hover `--text`
- Theme toggle track: `--border` off, `--brand` on
- Theme label: Poppins 300 10px, `--text4`

### Settings Panel

- Full-screen overlay, `--bg` background
- Header: `--border` bottom border
- Title: Poppins 600 13px, centered
- Back button: `--text4`
- Section labels: Poppins 600 10px, `--brand` color, uppercase
- Hint text: Poppins 300 11px, `--text3`
- Toggle switches: `--brand` when on, `--border` when off
- Alias tags: `--bg` background, `--border` border, Poppins 500 10px

### Message Boxes

| Type | Background | Border | Text |
|---|---|---|---|
| Error | `#1f0e12` | `#5a2030` | `#f87171` |
| Warning | `#1e1800` | `#564200` | `#F0C040` |
| Info | `#0e1228` | `#1e2a5a` | `#5a8af7` |

---

## What Does NOT Change

- `popup.js` — no logic, event listeners, API calls, or data flow changes
- `content.js` — untouched
- `background.js` / `google-api.js` — untouched
- `manifest.json` — untouched (icon swap is a future task)
- Extraction prompts — untouched
- Any `chrome.storage` keys or data structures
- The HTML structure of event cards, edit panels, file items — only CSS properties change
- Google Calendar URL generation — untouched

---

## Implementation Order

1. Build `UI Design/preview.html` with all components mocked up
2. Iterate on preview with user until approved
3. Apply to real `popup.html` in this order:
   a. Add Google Fonts `<link>` tag + update `font-family`
   b. Replace CSS custom property values (dark theme)
   c. Replace CSS custom property values (light theme)
   d. Update header (logo placeholder + "Pluck" text)
   e. Update button styles (gold CTA)
   f. Update tag colors
   g. Add drop zone collapse behavior
4. Each step: user approval → apply → `node --check popup.js` → Chrome reload test → log in changelog
