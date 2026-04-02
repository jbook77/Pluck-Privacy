# Pluck Visual Rebrand — Design Spec

**Date:** 2026-04-01  
**Status:** Draft  
**Scope:** Visual rebrand + expanded event type taxonomy (prompt & rendering updates)

---

## Overview

Rebrand the "Travel & Events Shortcut" Chrome extension as **Pluck** with a new visual identity inspired by Linear: deep dark UI, clean typography, and a confident indigo + gold color scheme. Font: Poppins (Google Fonts). Logo: inline SVG from `icons/Calendar icon with airplane logo.svg`, fills use `var(--brand)` for theme adaptivity.

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
| `--brand` | `#1E27AE` | Logo, brand accents, active toggle states |
| `--accent` | `#F0C040` | Primary buttons, CTAs, success states, selected file indicators |
| `--accent-hover` | `#D4A830` | Hover state for gold elements |

### Dark Theme Palette

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#1E27AE` | Page background (rendered as radial gradient — see Gradient Backgrounds below) |
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
| `--bg` | `#e3e0e1` | Page background (warm lavender, rendered as radial gradient — see Gradient Backgrounds below) |
| `--bg2` | `#eaeaf4` | Cards, inputs |
| `--bg3` | `#dddde8` | Hover states |
| `--border` | `#c8c8d8` | Default borders |
| `--border2` | `#a8a8c0` | Focus/hover borders |
| `--text` | `#111128` | Primary text |
| `--text2` | `#3a3a58` | Secondary text |
| `--text3` | `#7a7a98` | Muted labels |
| `--text4` | `#a8a8c0` | Hint text |
| `--brand` | `#1E27AE` | Same as dark |
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

- **Logo:** Inline SVG from the calendar-airplane icon, 32x32, blue fills use `var(--brand)` and white fills use `#fff` for theme adaptivity. Wrapped in a rounded-rect container with 8px radius.
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

Each tag includes a small inline SVG icon (10x10, stroke style matching the tag text color) followed by the uppercase label. Tags use `display: inline-flex; align-items: center; gap: 3px`.

#### Travel tags (from TRAVEL_PROMPT)

| Type | Icon | Dark BG / Text | Light BG / Text |
|---|---|---|---|
| FLIGHT | Airplane | `#0e1530` / `#5a8af7` | `#dde4f8` / `#2a4aa0` |
| HOTEL | Building | `#0d1f17` / `#3ecf8e` | `#d0f0e0` / `#0d6644` |
| CHARTER | Airplane | `#1a1040` / `#b794f4` | `#e8e0f8` / `#5a2ea8` |

#### Detected event tags (from DETECT_PROMPT)

| Type | Icon | Dark BG / Text | Light BG / Text |
|---|---|---|---|
| DINNER | Fork & knife | `#2a1a00` / `#F0C040` | `#f8edd0` / `#8a5a00` |
| PARTY | Confetti/sparkle | `#1a0018` / `#e060d0` | `#f4ddf8` / `#8a0aa0` |
| PICKUP | Car | `#261400` / `#f09040` | `#f8e8d0` / `#8a4a00` |
| MEETING | Two people | `#0e1530` / `#5a8af7` | `#dde4f8` / `#2a4aa0` |
| GROOMING | Scissors | `#081a1a` / `#40c8b0` | `#d0f0ea` / `#0a6858` |
| STYLING | Shirt | `#1a0a14` / `#f07090` | `#f8dde4` / `#8a2040` |
| PERFORMANCE | Microphone | `#14103a` / `#8888f0` | `#e0e0f8` / `#3a3aa0` |
| PHOTO | Camera | `#0a1820` / `#40b8e8` | `#d4eaf8` / `#0a5878` |
| INTERVIEW | Speech bubble | `#181a08` / `#a8c840` | `#eaf0d0` / `#4a6010` |
| APPOINTMENT | (generic) | `#1a1040` / `#a07cf0` | `#e8e0f8` / `#5a2ea8` |
| EVENT | (generic) | `#1a0018` / `#e060d0` | `#f4ddf8` / `#8a0aa0` |
| OTHER | (none) | `#22222e` / `#6a6a80` | `#e8e8f0` / `#7a7a98` |

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

## Gradient Backgrounds

Both themes use a radial gradient with a champagne/brand glow in the top-right corner. On results load, `background-size` transitions from `100%` to `108%` over `0.3s ease-out` for a subtle breathing effect.

**Dark theme:**
```css
radial-gradient(circle at 95% 5%, #c8b898 0%, #887898 12%, #3838a0 25%, #1E27AE 40%, #1E27AE 100%)
```

**Light theme:**
```css
radial-gradient(circle at 95% 5%, #1E27AE 0%, #7878c0 12%, #b0b0d0 25%, #e3e0e1 40%, #e3e0e1 100%)
```

---

## Expanded Event Type Taxonomy (Functional Change)

The current `DETECT_PROMPT` only recognizes 5 event types: `dinner | meeting | appointment | event | other`. This must be expanded to support the entertainment industry workflows the extension is built for.

### Changes to `popup.js`

**1. Update `DETECT_PROMPT` (line 20)**

Replace the type enum:
```
"type": "dinner | party | pickup | meeting | grooming | styling | performance | photo | interview | appointment | event | other"
```

Update the duration inference hints (line 23):
```
"endISO": "ISO8601. Infer if missing: dinner=2hr, party=3hr, pickup=1hr, meeting=1hr, grooming=45min, styling=1.5hr, performance=2hr, photo=3hr, interview=1hr, appointment=1hr"
```

Add classification guidance to the Rules section:
```
- GROOMING: haircuts, barber, nails, facials, skincare, spa treatments
- STYLING: wardrobe fittings, getting dressed, outfit prep, fashion styling sessions
- PERFORMANCE: concerts, live shows, music performances, sets, soundchecks
- PHOTO: photo shoots, press photos, campaign shoots, headshots
- INTERVIEW: magazine interviews, press interviews, podcast guest appearances, Q&As
- PARTY: after-parties, galas, celebrations, receptions, launch events
- PICKUP: car service, driver, airport transfer, ride to/from venue
```

**2. Update `renderDetectedCards()` (lines 856-874)**

Expand the `typeClass` map:
```js
const typeClass = {
  dinner:'type-dinner', party:'type-party', pickup:'type-pickup',
  meeting:'type-meeting', grooming:'type-grooming', styling:'type-styling',
  performance:'type-performance', photo:'type-photo', interview:'type-interview',
  appointment:'type-appointment', event:'type-event'
};
```

Expand the `typeLabel` map:
```js
const typeLabel = {
  dinner:'Dinner', party:'Party', pickup:'Pickup',
  meeting:'Meeting', grooming:'Grooming', styling:'Styling',
  performance:'Performance', photo:'Photo', interview:'Interview',
  appointment:'Appointment', event:'Event', other:'Other'
};
```

Add an `typeIcon` map with inline SVG strings for each type (10x10 stroke icons), and update the tag rendering at line 874 to include the icon before the label text.

**3. Add CSS for new tag types in `popup.html`**

Add CSS custom properties for each new type's background and text colors (both dark and light themes), plus the corresponding `.type-*` classes. See Event Type Tags table above for all values.

---

## What Does NOT Change

- `content.js` — untouched
- `background.js` / `google-api.js` — untouched
- `manifest.json` — icon references updated separately (add 32px)
- Any `chrome.storage` keys or data structures
- The HTML structure of event cards, edit panels, file items — only CSS properties change
- Google Calendar URL generation — untouched
- `TRAVEL_PROMPT` — untouched (flight/hotel/charter types remain the same)

---

## Implementation Order

1. Build `UI Design/preview.html` with all components mocked up
2. Iterate on preview with user until approved
3. Apply CSS changes to real `popup.html`:
   a. Add Google Fonts `<link>` tag + update `font-family`
   b. Replace CSS custom property values (dark theme) + gradient background
   c. Replace CSS custom property values (light theme) + gradient background
   d. Update header (inline SVG logo + "Pluck" text)
   e. Update button styles (gold CTA)
   f. Add new event type tag CSS variables and classes (all 12 types)
   g. Add drop zone collapse behavior
   h. Add gradient animation (`background-size` transition on results load)
4. Apply functional changes to `popup.js`:
   a. Expand `DETECT_PROMPT` type enum and duration hints
   b. Add event type classification guidance to prompt rules
   c. Expand `typeClass` and `typeLabel` maps in `renderDetectedCards()`
   d. Add `typeIcon` map with inline SVG strings for each type
   e. Update tag rendering to include icon SVGs
5. Update `manifest.json` to reference 32px icon
6. Each step: user approval → apply → `node --check popup.js` → Chrome reload test → log in changelog
