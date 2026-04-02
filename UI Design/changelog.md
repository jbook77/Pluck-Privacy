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
