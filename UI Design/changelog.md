# Pluck UI Redesign — Changelog

All changes to the extension's visual design are logged here. Each entry includes before/after details to enable reverting any individual change.

---

## 2026-04-01 — Initial Setup

- Created `UI Design/` folder
- Created `font-comparison.html` for font evaluation
- Created `preview.html` for full UI mockup
- Design spec written: `docs/superpowers/specs/2026-04-01-pluck-visual-rebrand-design.md`

**No changes to the live extension yet.**

---

## 2026-04-02 — Icon Generation v1

- Source: `icons/Calendar icon with airplane logo.png` (1024x1024, solid blue bg)
- Trimmed margins → `icons/logo-trimmed.png` (819x819)
- Generated: icon16.png, icon32.png, icon48.png, icon128.png
- All sizes are simple LANCZOS downscales from trimmed source, solid blue background
- Backed up to `icons/backup-v1/`
- **Issue:** Icons look blurry/pixelated at small sizes due to blue bg wasting pixels and fine details (drop shadow, page curl, thin outlines) not surviving downscale

---

## 2026-04-02 — Pluck Visual Rebrand — Full Integration

### popup.html

**Typography:**
- Added Google Fonts Poppins (300, 500, 600, 700)
- Updated `font-family` on body to `'Poppins', -apple-system, ...`
- Updated `font-size` from 14px to 13px, added `font-weight: 500`
- Updated font weights across components (scan hint 300, edit-label 300, field-label 300, etc.)

**Dark theme palette:**
- Before: `--bg: #1e1e1e`, gray palette, green accents (#3ecf8e)
- After: `--bg: #1E27AE`, indigo palette, gold accents (#D4A830)
- Added `--brand`, `--accent`, `--accent-hover` tokens
- All hardcoded green (#3ecf8e) replaced with `var(--accent)`

**Light theme palette:**
- Before: `--bg: #deeeff`, blue-tinted
- After: `--bg: #e3e0e1`, warm lavender, gold accent (#C8960A)

**Gradient backgrounds:**
- Dark: `radial-gradient(circle at 95% 5%, #c8b898...#1E27AE)`
- Light: `radial-gradient(circle at 95% 5%, #1E27AE...#e3e0e1)`

**Header:**
- Before: Generic calendar SVG icon, "Travel & Events Shortcut" title
- After: Inline Pluck logo SVG from `Calendar icon with airplane logo.svg`, "Pluck" title, "Travel & Events" subtitle

**New event type tag CSS:**
- Added 7 new `.type-*` classes: party, pickup, grooming, styling, performance, photo, interview
- Updated `.tag` and `.event-type-tag` base with `display: inline-flex; align-items: center; gap: 3px` for icon support

**Drop zone collapse CSS:**
- Added `.drop-zone-collapsed` and `.change-link` classes (ready for JS implementation)

**Footer/settings CSS fix:**
- Replaced undefined vars: `--muted` → `--text3`/`--text4`/`--brand`, `--fg` → `--text`/`--text2`, `--hover` → `--bg3`, `--card` → `--bg2`
- Updated `--accent` → `--brand` where design spec requires indigo (connect-google-btn, theme toggle, cal-picker)
- Account avatar `#4285f4` → `var(--brand)`

### popup.js

**DETECT_PROMPT expanded:**
- Before: `dinner | meeting | appointment | event | other` (5 types)
- After: `dinner | party | pickup | meeting | grooming | styling | performance | photo | interview | appointment | event | other` (12 types)
- Added duration hints for new types
- Added classification guidance rules

**renderDetectedCards() updated:**
- `typeClass` map: 4 entries → 11 entries
- `typeLabel` map: 5 entries → 12 entries
- Added `typeIcon` map with inline SVG strings for all 12 types
- Tag rendering now includes SVG icon before label text

**renderTravelCards() updated:**
- Added `flightTagSVG`, `hotelTagSVG`, `charterTagSVG` constants (10x10 stroke icons)
- Travel tags now render with inline SVG icons and uppercase labels

### manifest.json
- Name: "Travel & Events Shortcut" → "Pluck — Travel & Events"
- Added 32px icon reference

### content.js
- Gmail "Send to Pluck" button updated to match Pluck brand: indigo background, gold accent

---

## 2026-04-04 — UI Refresh Merged to Main Build + Bug Fixes

### popup.html

**Background gradients (both themes):**
- Dark: replaced flat `#1E27AE` + single radial with layered deep-navy gradients (`#16204a` base, warm gold radial at top-right, dark-blue radial at bottom-left)
- Light: replaced heavy blue radial sweep with soft lavender linear gradient + subtle brand-blue tint at top-right

**Header:**
- "Pluck" title: added `font-style: italic`
- "Travel & Events" subtitle: `font-weight: 300` → `600`, added `font-style: italic`

**Drop zone:**
- Border: faint white dashed → brand-blue dashed (`--drop-zone-border` variable per theme)
- Background: transparent → subtle blue tint with inner glow (`--drop-zone-bg`, `--drop-zone-glow`)
- Upload icon: near-invisible `--text4` → blue-tinted `--drop-zone-icon`
- Label: `--text3` → `--text2`
- Browse button border bumped to `--border2`; hover border uses `--drop-zone-border`

**Scan button:**
- Dark: white-tinted bg/border → brand-blue tinted (`--btn-scan-bg`, `--btn-scan-border`)
- Light: dark-tinted bg/border → brand-blue tinted (same variables)

**Light mode contrast:**
- `--border` 10% → 15%, `--border2` 18% → 28%
- `--text2` 60% → 65%, `--text3` 38% → 50%, `--text4` 20% → 32%
- `--type-other-txt`: `#7a7a98` → `#4a4a68`

**Travel event cards:**
- Added `--card-shine` (inset top highlight) and gradient `--card-bg` to both themes
- Cards are `position: relative; overflow: hidden`
- Added `::before` left accent bar per category (3px, color-coded with glow):
  - `.flight` → blue (`--tag-flight-txt`)
  - `.hotel` → green (`--tag-hotel-txt`)
  - `.charter` → purple (`--tag-charter-txt`)
- `.event-top` and `.field-row` get `padding-left: 10px` to clear the accent bar

**Settings panel:**
- Dark background: old bright-blue radial → `linear-gradient(160deg, #16204a 0%, #111838 100%)`
- Light background: new override → `linear-gradient(160deg, #dfe0ee 0%, #e6e3e8 100%)`
- Section labels (`OTHER CALENDARS`, `GMAIL INTEGRATION`, `GEMINI API`): color `var(--accent)` (gold), added `::after` hairline rule, font-size 10px → 9px, letter-spacing bumped
- Settings title: added `text-transform: uppercase`, `letter-spacing: 0.10em`, explicit `color: var(--text)`
- Alias cal cards: `background: var(--bg2)` → `var(--card-bg)` with `var(--card-shine)`
- Calendar names in alias cards: `var(--text)` → `var(--text2)`, weight `600` → `500`

**"Change files" link:**
- Color: `var(--brand)` (dark navy, invisible on dark bg) → `var(--accent)` (gold)
- Removed `text-decoration: underline`; bumped weight to `600`

**URL input placeholder:**
- Before: "Paste a PDF link from email..."
- After: "Paste an event link or text..."

---

### popup.js

**Travel card category classes:**
- `renderTravelCards()` now adds `.flight`, `.hotel`, or `.charter` class to each `.event-card` div, enabling the `::before` accent bar CSS to target them

**Gmail file deduplication:**
- `loadGmailFiles()` now skips files whose filename is already in `loadedFiles`
- Prevents 7 identical hotel confirmation `.eml` files from generating 7 separate Gemini calls

---

### background.js

**Gmail attachment MIME type support:**
- Added `message/rfc822` to the qualifying attachment filter (`.eml` files were being silently rejected)
- Added `application/octet-stream` + `.eml` extension as a fallback match
- `.eml` MIME type is rewritten from `message/rfc822` → `text/plain` before storing, so Gemini can process it (matches the drag-and-drop path in popup.js)
- `kind` assignment updated to match the rewritten `text/plain` value

---

## 2026-04-04 — Design Exploration v2 ("Luxury Travel Docket") — preview.html only

> **Status: Design exploration only. Not yet applied to the main extension build.**
> The extension is currently under Chrome Web Store review. These changes are staged in
> `UI Design/preview.html` and will be merged into the live files after review clears.

### Concept
"Luxury Travel Docket" — a deeper, richer visual language with editorial weight.
Card-based layout with warm gold accents, colored left-accent bars per event category,
and a more refined typographic hierarchy.

---

### Dark theme background
- Before: `#1E27AE` solid (bright indigo)
- After: Multi-layer radial gradient over `#16204a` mid-navy base
  ```
  radial-gradient(ellipse at 96% 4%, rgba(200,184,152,0.55)... rgba(30,39,174,0.40)...)
  + radial-gradient(ellipse at 10% 90%, rgba(14,20,100,0.4)...)
  + linear-gradient(160deg, #16204a → #1a2450 → #111838)
  ```

### Light theme background
- Before: `#e3e0e1` warm lavender solid
- After: Layered gradient — `#dfe0ee → #e6e3e8 → #dddbe5` with brand-blue radial at top-right

---

### Typography
- Removed: Playfair Display (too formal), DM Mono (too technical)
- Kept: Poppins only (matches current live build)
- All monospace/serif references replaced with `'Poppins', sans-serif`

---

### Travel event cards
- Added `::before` pseudo-element: 3px left accent bar, color-coded per category
  - Flight: `var(--tag-flight-txt)` (#6a9aff) with matching glow
  - Hotel: `var(--tag-hotel-txt)` (#3ecf8e) with matching glow
  - Charter: `var(--tag-charter-txt)` (#c4a0ff) with matching glow
- Card top-shine: `inset 0 1px 0 rgba(255,255,255,0.10)`
- Card background: subtle two-stop gradient instead of flat `--bg2`

### Tags
- Added `letter-spacing: 0.08em` for all tags
- Added soft color-matched `box-shadow` glow to each type (e.g. `0 0 8px rgba(106,154,255,0.12)`)

### Primary button (Extract)
- Before: Flat gold fill
- After: `linear-gradient(135deg, --accent2 → --accent → --accent-hover)` + ambient glow shadow
- Disabled state: `opacity: 0.22` (intentionally faded until files are loaded)

### Scan button
- Before: Transparent background, faint dashed `var(--border)`, `--text3` text — visually buried
- After: Solid brand-blue border (`--scan-border`), subtle blue-tinted background (`--scan-bg`),
  full `--text2` text — reads as a real CTA alongside the drop zone

### Drop zone
- Before: Faint dashed `var(--border)`, icon at `--text4` (18% opacity), label at `--text3`
- After:
  - Border: brand-blue dashed (`rgba(80,110,255,0.45)` dark / `rgba(30,39,174,0.32)` light)
  - Background: subtle blue tint with inner radial glow
  - Icon: `rgba(130,155,255,0.70)` — clearly visible, blue-tinted
  - Main label: bumped from `--text3` to `--text2`
  - Browse button border: bumped to `--border2` for more definition

### Collapsed drop zone
- Style: pill-shaped (`border-radius: 20px`), Poppins text, gold "Change files" link on right

### Section labels
- Gold left-rule treatment: flex with `::after` horizontal rule in `--border`

### Footer connect button
- Pill-shaped, ghost style with brand hover

---

### Light mode contrast improvements
All changes relative to the initial dark→light port:

| Variable | Before | After | Reason |
|---|---|---|---|
| `--text2` | `rgba(0,0,0,0.55)` | `rgba(0,0,0,0.65)` | Body text too faint |
| `--text3` | `rgba(0,0,0,0.35)` | `rgba(0,0,0,0.50)` | Sub-labels below readable threshold |
| `--text4` | `rgba(0,0,0,0.18)` | `rgba(0,0,0,0.32)` | Hint text invisible |
| `--border` | `rgba(0,0,0,0.09)` | `rgba(0,0,0,0.15)` | Card separation invisible |
| `--border2` | `rgba(0,0,0,0.18)` | `rgba(0,0,0,0.28)` | Focus states not visible |
| `--tag-other-txt` | `#7a7a98` | `#4a4a68` | Tag text low contrast |
| `--card-bg` | `rgba(255,255,255,0.65)...0.35` | `rgba(255,255,255,0.80)...0.50` | Cards too transparent |
| `--card-shine` | `rgba(255,255,255,0.60)` | `rgba(255,255,255,0.90)` | Shine invisible on light bg |
