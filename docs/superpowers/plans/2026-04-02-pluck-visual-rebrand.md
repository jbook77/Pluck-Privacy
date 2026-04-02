# Pluck Visual Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the "Travel & Events Shortcut" Chrome extension as **Pluck** with a new visual identity (dark indigo + gold, Poppins font, gradient backgrounds) and expand the event type taxonomy from 5 to 12 categories.

**Architecture:** CSS-only visual changes to `popup.html` (custom properties, font, gradient backgrounds, new tag classes) plus functional changes to `popup.js` (expanded DETECT_PROMPT, new type maps, inline SVG icons in tags). No structural HTML changes to the extension — only CSS values, text labels, and the header logo SVG change.

**Tech Stack:** Chrome Extension MV3, vanilla JS, CSS custom properties, Google Fonts (Poppins), inline SVG

---

### Task 1: Add Google Fonts and Update Typography

**Files:**
- Modify: `popup.html:1-5` (add font link tags in `<head>`)
- Modify: `popup.html:86` (update `font-family` on `body`)

- [ ] **Step 1: Add Google Fonts preconnect and stylesheet links**

In `popup.html`, add these three lines immediately after `<meta charset="UTF-8" />` (line 4), before `<title>`:

```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;500;600;700&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Update font-family on body**

In `popup.html` line 86, change:
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```
to:
```css
font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

- [ ] **Step 3: Update title tag**

In `popup.html` line 5, change:
```html
<title>Travel &amp; Events Shortcut</title>
```
to:
```html
<title>Pluck</title>
```

- [ ] **Step 4: Verify syntax**

Run: `node --check popup.js`
Expected: No output (success)

- [ ] **Step 5: Commit**

```bash
git add popup.html
git commit -m "style: add Poppins font and update typography for Pluck rebrand"
```

---

### Task 2: Replace Dark Theme CSS Custom Properties

**Files:**
- Modify: `popup.html:8-43` (dark theme `:root` block)

- [ ] **Step 1: Replace the entire dark theme variable block**

In `popup.html`, replace lines 8–43 (the `:root, [data-theme="dark"]` block) with:

```css
    :root, [data-theme="dark"] {
      --bg:           #1E27AE;
      --bg2:          rgba(255, 255, 255, 0.06);
      --bg3:          rgba(255, 255, 255, 0.10);
      --border:       rgba(255, 255, 255, 0.12);
      --border2:      rgba(255, 255, 255, 0.20);
      --text:         #f0f0f0;
      --text2:        #b0b0c0;
      --text3:        rgba(255, 255, 255, 0.40);
      --text4:        rgba(255, 255, 255, 0.20);
      --brand:        #1E27AE;
      --accent:       #D4A830;
      --accent-hover: #B89020;
      --btn-primary-bg:  #D4A830;
      --btn-primary-txt: #0f0f14;
      --btn-scan-bg:     transparent;
      --btn-scan-txt:    rgba(255, 255, 255, 0.40);
      --btn-scan-border: rgba(255, 255, 255, 0.12);
      --btn-scan-hover:  rgba(255, 255, 255, 0.10);
      --btn-scan-hover-txt: #b0b0c0;
      --tag-flight-bg:  #0e1530; --tag-flight-txt: #5a8af7;
      --tag-hotel-bg:   #0d1f17; --tag-hotel-txt:  #3ecf8e;
      --tag-charter-bg: #1a1040; --tag-charter-txt: #b794f4;
      --card-bg:        rgba(255, 255, 255, 0.06);
      --card-border:    rgba(255, 255, 255, 0.12);
      --err-bg: #1f0e12; --err-border: #5a2030; --err-txt: #f87171;
      --warn-bg: #1e1800; --warn-border: #564200; --warn-txt: #D4A830;
      --info-bg: #0e1228; --info-border: #1e2a5a; --info-txt: #5a8af7;
      --hint-txt: rgba(255, 255, 255, 0.20);
      --footer-txt: rgba(255, 255, 255, 0.20);
      --header-border: rgba(255, 255, 255, 0.12);
      --divider: rgba(255, 255, 255, 0.08);
      --type-dinner-bg: #2a1a00; --type-dinner-txt: #D4A830;
      --type-meeting-bg: #0e1530; --type-meeting-txt: #5a8af7;
      --type-appt-bg: #1a1040; --type-appt-txt: #a07cf0;
      --type-event-bg: #1a0018; --type-event-txt: #e060d0;
      --type-other-bg: #22222e; --type-other-txt: #6a6a80;
      --type-party-bg: #1a0018; --type-party-txt: #e060d0;
      --type-pickup-bg: #261400; --type-pickup-txt: #f09040;
      --type-grooming-bg: #081a1a; --type-grooming-txt: #40c8b0;
      --type-styling-bg: #1a0a14; --type-styling-txt: #f07090;
      --type-perform-bg: #14103a; --type-perform-txt: #8888f0;
      --type-photo-bg: #0a1820; --type-photo-txt: #40b8e8;
      --type-interview-bg: #181a08; --type-interview-txt: #a8c840;
      --add-cal-bg: #D4A830; --add-cal-txt: #0f0f14;
    }
```

- [ ] **Step 2: Verify no syntax issues**

Open Chrome, go to `chrome://extensions`, reload the extension, open the popup. Confirm it loads without console errors.

- [ ] **Step 3: Commit**

```bash
git add popup.html
git commit -m "style: replace dark theme palette with Pluck indigo/gold scheme"
```

---

### Task 3: Replace Light Theme CSS Custom Properties

**Files:**
- Modify: `popup.html:45-80` (light theme `[data-theme="light"]` block)

- [ ] **Step 1: Replace the entire light theme variable block**

In `popup.html`, replace lines 45–80 (the `[data-theme="light"]` block) with:

```css
    [data-theme="light"] {
      --bg:           #e3e0e1;
      --bg2:          rgba(0, 0, 0, 0.05);
      --bg3:          rgba(0, 0, 0, 0.08);
      --border:       rgba(0, 0, 0, 0.10);
      --border2:      rgba(0, 0, 0, 0.18);
      --text:         #111128;
      --text2:        rgba(0, 0, 0, 0.60);
      --text3:        rgba(0, 0, 0, 0.38);
      --text4:        rgba(0, 0, 0, 0.20);
      --brand:        #1E27AE;
      --accent:       #C8960A;
      --accent-hover: #A87A00;
      --btn-primary-bg:  #C8960A;
      --btn-primary-txt: #fff;
      --btn-scan-bg:     transparent;
      --btn-scan-txt:    rgba(0, 0, 0, 0.38);
      --btn-scan-border: rgba(0, 0, 0, 0.10);
      --btn-scan-hover:  rgba(0, 0, 0, 0.08);
      --btn-scan-hover-txt: rgba(0, 0, 0, 0.60);
      --tag-flight-bg:  #dde4f8; --tag-flight-txt: #2a4aa0;
      --tag-hotel-bg:   #d0f0e0; --tag-hotel-txt:  #0d6644;
      --tag-charter-bg: #e8e0f8; --tag-charter-txt: #5a2ea8;
      --card-bg:        rgba(0, 0, 0, 0.03);
      --card-border:    rgba(0, 0, 0, 0.10);
      --err-bg: #fdecea; --err-border: #f5b8b8; --err-txt: #c0392b;
      --warn-bg: #fff8e1; --warn-border: #ffd54f; --warn-txt: #7a5900;
      --info-bg: #e8f0fd; --info-border: #a8c4f0; --info-txt: #1a4fa8;
      --hint-txt: rgba(0, 0, 0, 0.20);
      --footer-txt: rgba(0, 0, 0, 0.20);
      --header-border: rgba(0, 0, 0, 0.10);
      --divider: rgba(0, 0, 0, 0.06);
      --type-dinner-bg: #f8edd0; --type-dinner-txt: #8a5a00;
      --type-meeting-bg: #dde4f8; --type-meeting-txt: #2a4aa0;
      --type-appt-bg: #e8e0f8; --type-appt-txt: #5a2ea8;
      --type-event-bg: #f4ddf8; --type-event-txt: #8a0aa0;
      --type-other-bg: #e8e8f0; --type-other-txt: #7a7a98;
      --type-party-bg: #f4ddf8; --type-party-txt: #8a0aa0;
      --type-pickup-bg: #f8e8d0; --type-pickup-txt: #8a4a00;
      --type-grooming-bg: #d0f0ea; --type-grooming-txt: #0a6858;
      --type-styling-bg: #f8dde4; --type-styling-txt: #8a2040;
      --type-perform-bg: #e0e0f8; --type-perform-txt: #3a3aa0;
      --type-photo-bg: #d4eaf8; --type-photo-txt: #0a5878;
      --type-interview-bg: #eaf0d0; --type-interview-txt: #4a6010;
      --add-cal-bg: #C8960A; --add-cal-txt: #fff;
    }
```

- [ ] **Step 2: Reload extension in Chrome and toggle to light mode to verify**

- [ ] **Step 3: Commit**

```bash
git add popup.html
git commit -m "style: replace light theme palette with Pluck indigo/gold scheme"
```

---

### Task 4: Add Gradient Backgrounds and Body Styling

**Files:**
- Modify: `popup.html:84-89` (body CSS)

- [ ] **Step 1: Update body CSS to include gradient background**

In `popup.html`, replace the body rule (line 84–89):

```css
    body {
      width: 440px; min-height: 200px;
      font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px; color: var(--text); background: var(--bg); padding: 20px;
      transition: background 0.2s, color 0.2s;
    }
```

with:

```css
    body {
      width: 440px; min-height: 200px;
      font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px; font-weight: 500;
      color: var(--text); background: var(--bg); padding: 20px;
      transition: background 0.2s, color 0.2s;
      background-size: 100% 100%;
    }
    [data-theme="dark"] body {
      background: radial-gradient(circle at 95% 5%, #c8b898 0%, #887898 12%, #3838a0 25%, #1E27AE 40%, #1E27AE 100%);
      background-size: 100% 100%;
    }
    [data-theme="light"] body {
      background: radial-gradient(circle at 95% 5%, #1E27AE 0%, #7878c0 12%, #b0b0d0 25%, #e3e0e1 40%, #e3e0e1 100%);
      background-size: 100% 100%;
    }
```

- [ ] **Step 2: Reload and verify gradient renders in both themes**

- [ ] **Step 3: Commit**

```bash
git add popup.html
git commit -m "style: add radial gradient backgrounds for both themes"
```

---

### Task 5: Update Header — Inline SVG Logo and Pluck Branding

**Files:**
- Modify: `popup.html:287-300` (header HTML)

- [ ] **Step 1: Replace the header block**

In `popup.html`, replace lines 287–300 (the entire `.header` div) with:

```html
  <div class="header">
    <div class="header-icon" style="background:none; padding:0;">
      <svg width="32" height="32" viewBox="100 120 830 740" xmlns="http://www.w3.org/2000/svg">
        <path transform="translate(354,128)" d="m0 0h17l10 4 6 5 5 8 4 9 2 6-1 10-3 18h279l5-35 7-12 8-7 11-5 3-1h16l9 3 9 8 6 12 4 11-3 22-1 5h78l18 4 12 5 13 9 9 9 7 11 11 21 3 10v21l-14 99-12 89-10 73-5 37-8 58-2 14-5 13-7 11-9 9-16 12-16 13-17 13-17 14-13 10-16 13-16 12-15 12-13 10-15 12-10 7-15 8-16 4h-451l-16-4-14-7-10-8-8-9-14-21-5-13-1-5v-21l13-87 9-61 11-72 15-101 13-86 11-72 5-15 7-13 12-14 10-8 16-9 16-5 11-2h60l1-14 3-20 6-12 8-8 12-6z" fill="var(--brand)"/>
        <path transform="translate(354,128)" d="m0 0h17l10 4 6 5 5 8 4 9 2 6-1 10-3 18h279l5-35 7-12 8-7 11-5 3-1h16l9 3 9 8 6 12 4 11-3 22-1 5h78l18 4 12 5 13 9 9 9 7 11 11 21 3 10v21l-14 99-12 89-10 73-5 37-8 58-2 14-5 13-7 11-9 9-16 12-16 13-17 13-17 14-13 10-16 13-16 12-15 12-13 10-15 12-10 7-15 8-16 4h-451l-16-4-14-7-10-8-8-9-14-21-5-13-1-5v-21l13-87 9-61 11-72 15-101 13-86 11-72 5-15 7-13 12-14 10-8 16-9 16-5 11-2h60l1-14 3-20 6-12 8-8 12-6zm-150 218-1 1-7 49-19 125-16 108-15 102-1 7v10l3 11 6 8 8 7 12 5 4 1h431l8-4 6-7 2-4 7-48 6-17 8-13 9-10 8-8 14-9 12-6 18-5 16-2h63l10-3 6-5 4-8 13-92 13-90 14-98v-5z" fill="#fff"/>
        <path transform="translate(345,371)" d="m0 0h255l28 3 23 4 26 7 21 8 19 10 16 12 7 6 9 11 6 10 5 12 2 8v24l-4 16-8 16-6 9-12 14-14 12-18 12-23 12-23 9-31 9-26 5-23 3-31 2h-157l-2 9-16 49-13 38-7 21h-127l3-9 10-29 13-37 15-43 13-37 34-96 15-42 19-54z" fill="#fff"/>
        <path transform="translate(267,220)" d="m0 0h48l1 2-4 27v9l4 10 9 8 9 3h16l12-4 8-6 6-7 3-7 5-34 1-1h141l142 1-1 13-2 14v11l3 8 5 6 9 5 9 2 13-1 11-4 8-6 6-7 4-11 4-30 1-1h40l47 1 12 4 9 6 7 8 4 8 1 3v17l-7 49-1 2h-642l3-22 6-38 4-10 8-11 11-9 13-6z" fill="var(--brand)"/>
        <path transform="translate(354,128)" d="m0 0h17l10 4 6 5 5 8 4 9 2 6-1 10-3 18h279l5-35 7-12 8-7 11-5 3-1h16l9 3 9 8 6 12 4 11-3 22-5 35-5 2-4 30-4 11-9 10-10 6-13 3h-7l-11-3-9-6-6-9-1-4v-11l4-27h-283l-5 34-5 10-8 8-10 5-7 2h-16l-10-4-8-7-4-8-1-3v-9l4-28-2-3 5-28h-42v-1h45l1-14 3-20 6-12 8-8 12-6z" fill="#fff"/>
        <path transform="translate(518,399)" d="m0 0h29l10 10 8 7 12 12 7 8 12 13 9 11 3 3v2h25l23 2 20 4 9 4 6 4 3 4-1 5-6 5-11 5-18 4-21 2-33 1-13 12-11 9-13 11-14 11-16 13-15 11-2 1h-27l6-8 12-15 14-19 14-20 5-8h-11l-62-5-20 15-10 7-3 2h-25l6-8 12-17 9-13-1-5-13-30-2-6h23l6 5 5 5 12 13 3 3 26-1 51-3-9-22-8-16-10-19z" fill="var(--brand)"/>
        <path transform="translate(888,236)" d="m0 0 3 4 5 11 2 7v21l-14 99-12 89-10 73-5 37-8 58-2 14-5 13-7 11-9 9-16 12-16 13-17 13-17 14-13 10-16 13-16 12-15 12-13 10-15 12-10 7-15 8-16 4h-451l-16-4-14-7-10-8-8-9-2-5 8 6 11 6 12 5 10 2h448l12-3 16-8 54-42 13-10 11-9 18-14 28-22 13-10 16-13 13-10 11-9 10-15 3-8 12-83 24-170 11-75 5-38 1-6v-13z" fill="rgba(255,255,255,0.3)"/>
      </svg>
    </div>
    <div>
      <div class="header-title">Pluck</div>
      <div class="header-sub">Travel &amp; Events</div>
    </div>
  </div>
```

- [ ] **Step 2: Update the header-icon CSS rule**

In `popup.html` line 93, change:
```css
    .header-icon { width: 32px; height: 32px; background: var(--btn-primary-bg); border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
```
to:
```css
    .header-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
```

- [ ] **Step 3: Remove the now-unused header-icon svg stroke rule**

Delete line 94:
```css
    .header-icon svg { stroke: var(--btn-primary-txt); }
```

- [ ] **Step 4: Update header-title font size**

In `popup.html` line 95, change:
```css
    .header-title { font-size: 15px; font-weight: 600; color: var(--text); }
```
to:
```css
    .header-title { font-size: 16px; font-weight: 700; color: var(--text); }
```

- [ ] **Step 5: Update header-sub font weight**

In `popup.html` line 96, change:
```css
    .header-sub { font-size: 11px; color: var(--text3); margin-top: 1px; }
```
to:
```css
    .header-sub { font-size: 11px; font-weight: 300; color: var(--text3); margin-top: 1px; }
```

- [ ] **Step 6: Reload and verify header shows Pluck logo + title**

- [ ] **Step 7: Commit**

```bash
git add popup.html
git commit -m "style: update header with Pluck inline SVG logo and branding"
```

---

### Task 6: Update Button Styles — Gold CTA + Accent Colors

**Files:**
- Modify: `popup.html:119-148` (drop zone, buttons, scan hint CSS)
- Modify: `popup.html:182-193` (detected card accent colors)
- Modify: `popup.html:210-211` (add-cal button)

- [ ] **Step 1: Update drop zone accent colors**

In `popup.html` line 121, change:
```css
    .drop-zone.has-files { border-color: #3ecf8e; border-style: solid; }
```
to:
```css
    .drop-zone.has-files { border-color: var(--accent); border-style: solid; }
```

In line 125, change:
```css
    .drop-zone.has-files .upload-icon { color: #3ecf8e; }
```
to:
```css
    .drop-zone.has-files .upload-icon { color: var(--accent); }
```

- [ ] **Step 2: Update extract button to gold accent**

In `popup.html` line 141, change:
```css
    .btn-primary { width: 100%; padding: 11px; font-size: 14px; font-weight: 600; background: var(--btn-primary-bg); color: var(--btn-primary-txt); border: none; border-radius: 8px; cursor: pointer; transition: opacity 0.15s; margin-top: 10px; }
```
to:
```css
    .btn-primary { width: 100%; padding: 11px; font-size: 14px; font-weight: 600; background: var(--btn-primary-bg); color: var(--btn-primary-txt); border: none; border-radius: 8px; cursor: pointer; transition: background 0.15s; margin-top: 10px; font-family: inherit; }
```

In line 142, change:
```css
    .btn-primary:hover { opacity: 0.88; }
```
to:
```css
    .btn-primary:hover { background: var(--accent-hover); }
```

- [ ] **Step 3: Update detected card selected border color**

In `popup.html` line 183, change:
```css
    .detected-card.selected { border-color: #3ecf8e; }
```
to:
```css
    .detected-card.selected { border-color: var(--accent); }
```

- [ ] **Step 4: Update checkbox accent color**

In `popup.html` line 185, change:
```css
    .detect-checkbox { width: 16px; height: 16px; accent-color: #3ecf8e; flex-shrink: 0; cursor: pointer; }
```
to:
```css
    .detect-checkbox { width: 16px; height: 16px; accent-color: var(--accent); flex-shrink: 0; cursor: pointer; }
```

- [ ] **Step 5: Reload and verify gold accent on buttons, checkboxes, selected cards**

- [ ] **Step 6: Commit**

```bash
git add popup.html
git commit -m "style: update accent colors to gold for buttons, checkboxes, drop zone"
```

---

### Task 7: Add New Event Type Tag CSS Classes

**Files:**
- Modify: `popup.html:188-193` (event type tag CSS)

- [ ] **Step 1: Update tag base styles to support inline-flex icons**

In `popup.html` line 170, change:
```css
    .tag { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 5px; flex-shrink: 0; }
```
to:
```css
    .tag { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 5px; flex-shrink: 0; display: inline-flex; align-items: center; gap: 3px; }
    .tag svg { flex-shrink: 0; }
```

- [ ] **Step 2: Update event-type-tag base and add new type classes**

In `popup.html` line 188, change:
```css
    .event-type-tag { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 5px; flex-shrink: 0; }
```
to:
```css
    .event-type-tag { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 5px; flex-shrink: 0; display: inline-flex; align-items: center; gap: 3px; }
    .event-type-tag svg { flex-shrink: 0; }
```

- [ ] **Step 3: Add the 7 new type classes after the existing 5**

After line 193 (`.type-other`), add:

```css
    .type-party       { background: var(--type-party-bg);    color: var(--type-party-txt); }
    .type-pickup      { background: var(--type-pickup-bg);   color: var(--type-pickup-txt); }
    .type-grooming    { background: var(--type-grooming-bg); color: var(--type-grooming-txt); }
    .type-styling     { background: var(--type-styling-bg);  color: var(--type-styling-txt); }
    .type-performance { background: var(--type-perform-bg);  color: var(--type-perform-txt); }
    .type-photo       { background: var(--type-photo-bg);    color: var(--type-photo-txt); }
    .type-interview   { background: var(--type-interview-bg);color: var(--type-interview-txt); }
```

- [ ] **Step 4: Reload and confirm no CSS errors**

- [ ] **Step 5: Commit**

```bash
git add popup.html
git commit -m "style: add CSS classes for 7 new event type tags with inline icon support"
```

---

### Task 8: Fix Undefined CSS Variables in Footer/Settings

**Files:**
- Modify: `popup.html:224-282` (footer, theme toggle, calendar picker, settings panel CSS)

The footer/settings CSS block (added in a later commit) uses undefined variable names (`--muted`, `--fg`, `--hover`, `--card`) that don't match the theme system. These must be replaced with the correct theme tokens. Additionally, several `var(--accent)` references should be `var(--brand)` per the design spec.

- [ ] **Step 1: Replace `--muted` with the correct theme tokens**

These are all in `popup.html` lines 224–282. Make these replacements throughout that block:
- `var(--muted)` → `var(--text4)` (for muted/hint text)
- Exception: `.settings-section-label` and `.alias-cal-name` use `var(--muted)` → `var(--brand)` (these are section labels that should be indigo per design spec)
- Exception: `.settings-hint` uses `var(--muted)` → `var(--text3)` (hint text is slightly brighter than text4)

Specific changes:
```
Line 227: .connect-google-btn color:var(--muted) → color:var(--text4)
Line 231: .account-email color:var(--muted) → color:var(--text4)
Line 232: .text-btn color:var(--muted) → color:var(--text4)
Line 233: .icon-btn color:var(--muted) → color:var(--text4)
Line 237: .theme-switch color:var(--muted) → color:var(--text4)
Line 246: .picker-label color:var(--muted) → color:var(--text3)
Line 262: .settings-section-label color:var(--muted) → color:var(--brand)
Line 263: .settings-hint color:var(--muted) → color:var(--text3)
Line 265: .alias-cal-name color:var(--muted) → color:var(--text2)
Line 274: .alias-tag-remove color:var(--muted) → color:var(--text4)
Line 275: .alias-add-pill color:var(--muted) → color:var(--text3)
```

- [ ] **Step 2: Replace `--fg` with `--text`**

```
Line 234: .icon-btn:hover color:var(--fg) → color:var(--text)
Line 253: .cal-picker-item color:var(--fg) → color:var(--text)
Line 273: .alias-tag color:var(--fg) → color:var(--text2)
Line 278: .alias-input color:var(--fg) → color:var(--text)
Line 281: .gmail-toggle-label color:var(--fg) → color:var(--text2)
```

- [ ] **Step 3: Replace `--hover` with `--bg3`**

```
Line 254: .cal-picker-item:hover background:var(--hover) → background:var(--bg3)
Line 255: .cal-picker-item.active background:var(--hover) → background:var(--bg3)
```

- [ ] **Step 4: Replace `--card` with `--bg2`**

```
Line 264: .alias-cal-card background:var(--card) → background:var(--bg2)
Line 280: .gmail-toggle-row background:var(--card) → background:var(--bg2)
```

- [ ] **Step 5: Update `--accent` → `--brand` where design spec requires**

```
Line 228: .connect-google-btn:hover border-color:var(--accent) → var(--brand), color:var(--accent) → var(--brand)
Line 240: .theme-switch input:checked ~ .theme-track background:var(--accent) → var(--brand)
Line 248: .cal-picker-btn border:1px solid var(--accent) → var(--brand)
```

- [ ] **Step 6: Update account avatar background**

In `popup.html` line 230, change:
```css
.account-avatar { width:20px; height:20px; border-radius:50%; background:#4285f4; ...
```
to:
```css
.account-avatar { width:20px; height:20px; border-radius:50%; background:var(--brand); ...
```

- [ ] **Step 7: Add `font-weight: 300` to footer text elements**

Add `font-weight:300` to: `.connect-google-btn`, `.account-email`, `.text-btn`, `.theme-switch`

- [ ] **Step 8: Reload and verify footer, settings panel, calendar picker render correctly**

- [ ] **Step 9: Commit**

```bash
git add popup.html
git commit -m "fix: replace undefined CSS vars (--muted, --fg, --hover, --card) with theme tokens"
```

---

### Task 9: Expand DETECT_PROMPT in popup.js

**Files:**
- Modify: `popup.js:16-36` (DETECT_PROMPT)

- [ ] **Step 1: Update the type enum in the DETECT_PROMPT**

In `popup.js` line 20, change:
```
  "type": "dinner | meeting | appointment | event | other",
```
to:
```
  "type": "dinner | party | pickup | meeting | grooming | styling | performance | photo | interview | appointment | event | other",
```

- [ ] **Step 2: Update duration inference hints**

In `popup.js` line 23, change:
```
  "endISO": "ISO8601. Infer if missing: dinner=2hr, haircut/barber=45min, meeting=1hr, appointment=1hr",
```
to:
```
  "endISO": "ISO8601. Infer if missing: dinner=2hr, party=3hr, pickup=1hr, meeting=1hr, grooming=45min, styling=1.5hr, performance=2hr, photo=3hr, interview=1hr, appointment=1hr",
```

- [ ] **Step 3: Add classification guidance to the Rules section**

In `popup.js`, after line 35 (the line `- Do NOT invent details`), add these lines before the closing backtick:
```
- GROOMING: haircuts, barber, nails, facials, skincare, spa treatments
- STYLING: wardrobe fittings, getting dressed, outfit prep, fashion styling sessions
- PERFORMANCE: concerts, live shows, music performances, sets, soundchecks
- PHOTO: photo shoots, press photos, campaign shoots, headshots
- INTERVIEW: magazine interviews, press interviews, podcast guest appearances, Q&As
- PARTY: after-parties, galas, celebrations, receptions, launch events
- PICKUP: car service, driver, airport transfer, ride to/from venue
```

- [ ] **Step 4: Verify syntax**

Run: `node --check popup.js`
Expected: No output (success)

- [ ] **Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: expand DETECT_PROMPT to support 12 event types for entertainment workflows"
```

---

### Task 10: Expand typeClass, typeLabel, and Add typeIcon Maps in renderDetectedCards

**Files:**
- Modify: `popup.js:856-874` (renderDetectedCards type maps and tag rendering)

- [ ] **Step 1: Expand the typeClass map**

In `popup.js` line 856, change:
```js
  const typeClass = { dinner:'type-dinner', meeting:'type-meeting', appointment:'type-appointment', event:'type-event' };
```
to:
```js
  const typeClass = { dinner:'type-dinner', party:'type-party', pickup:'type-pickup', meeting:'type-meeting', grooming:'type-grooming', styling:'type-styling', performance:'type-performance', photo:'type-photo', interview:'type-interview', appointment:'type-appointment', event:'type-event' };
```

- [ ] **Step 2: Expand the typeLabel map**

In `popup.js` line 857, change:
```js
  const typeLabel = { dinner:'Dinner', meeting:'Meeting', appointment:'Appointment', event:'Event', other:'Other' };
```
to:
```js
  const typeLabel = { dinner:'Dinner', party:'Party', pickup:'Pickup', meeting:'Meeting', grooming:'Grooming', styling:'Styling', performance:'Performance', photo:'Photo', interview:'Interview', appointment:'Appointment', event:'Event', other:'Other' };
```

- [ ] **Step 3: Add the typeIcon map with inline SVG strings**

After the `typeLabel` line, add:

```js
  const typeIcon = {
    dinner:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>',
    party:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5.8 11.3L2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="M22 2l-2.24.75a2.9 2.9 0 00-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="M22 13l-1.34-.45a2.9 2.9 0 01-1.96-3.12v0c.1-.86-.57-1.63-1.45-1.63h-.38c-.86 0-1.6-.6-1.76-1.44L15 5"/></svg>',
    pickup:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h2m10 0h2M3 11l1.5-5A2 2 0 016.4 4.5h11.2a2 2 0 011.9 1.5L21 11"/><rect x="2" y="11" width="20" height="6" rx="2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
    meeting:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    grooming:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
    styling:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.38 3.46L16 2 12 5 8 2 3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47c.1.6.6 1.04 1.2 1.04H8v10c0 1.1.9 2 2 2h4a2 2 0 002-2V10h3.94c.6 0 1.1-.44 1.2-1.04l.58-3.47a2 2 0 00-1.34-2.23z"/></svg>',
    performance:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    photo:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    interview:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
    appointment:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    event:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5.8 11.3L2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="M22 2l-2.24.75a2.9 2.9 0 00-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="M22 13l-1.34-.45a2.9 2.9 0 01-1.96-3.12v0c.1-.86-.57-1.63-1.45-1.63h-.38c-.86 0-1.6-.6-1.76-1.44L15 5"/></svg>'
  };
```

- [ ] **Step 4: Update the tag rendering to include icons**

In `popup.js` line 874, change:
```js
      + '<span class="event-type-tag ' + (typeClass[ev.type] || 'type-other') + '">' + (typeLabel[ev.type] || 'Event') + '</span>'
```
to:
```js
      + '<span class="event-type-tag ' + (typeClass[ev.type] || 'type-other') + '">' + (typeIcon[ev.type] || '') + (typeLabel[ev.type] || 'Event') + '</span>'
```

- [ ] **Step 5: Verify syntax**

Run: `node --check popup.js`
Expected: No output (success)

- [ ] **Step 6: Commit**

```bash
git add popup.js
git commit -m "feat: add inline SVG icons and expanded type maps for 12 event categories"
```

---

### Task 11: Add Inline SVG Icons to Travel Card Tags

**Files:**
- Modify: `popup.js:743-744` (travel card SVG constants)
- Modify: `popup.js:757-758` (travel card tag label)
- Modify: `popup.js:763-765` (travel card tag rendering)

- [ ] **Step 1: Add tag icon SVG constants**

In `popup.js`, after line 744 (the `hotelSVG` line), add:

```js
  const flightTagSVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.4-.1.9.3 1.1l5.5 3.2-2.7 2.7-2.5-.5c-.3-.1-.7 0-.9.2l-.3.3c-.2.3-.1.7.1.9l2.6 1.9 1.9 2.6c.2.3.6.3.9.1l.3-.3c.2-.2.3-.6.2-.9l-.5-2.5 2.7-2.7 3.2 5.5c.2.4.7.5 1.1.3l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>';
  const hotelTagSVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21V7a2 2 0 012-2h14a2 2 0 012 2v14"/><path d="M3 11h18"/><rect x="7" y="11" width="4" height="5"/><rect x="13" y="11" width="4" height="5"/></svg>';
  const charterTagSVG = flightTagSVG;
```

- [ ] **Step 2: Update tag rendering to include icons**

In `popup.js` line 765, change:
```js
      + '<span class="tag ' + tagClass + '">' + tagLabel + '</span></div>'
```
to:
```js
      + '<span class="tag ' + tagClass + '">' + (hotel ? hotelTagSVG : flightTagSVG) + tagLabel.toUpperCase() + '</span></div>'
```

- [ ] **Step 3: Verify syntax**

Run: `node --check popup.js`
Expected: No output (success)

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: add inline SVG icons to travel card type tags"
```

---

### Task 12: Add Drop Zone Collapse CSS

**Files:**
- Modify: `popup.html` (add CSS class after drop zone styles, around line 131)

- [ ] **Step 1: Add collapsed drop zone styles**

After the `.browse-btn:hover` rule (line 130), add:

```css
    .drop-zone-collapsed { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 8px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg2); font-size: 11px; font-weight: 300; color: var(--text3); }
    .drop-zone-collapsed .change-link { color: var(--brand); cursor: pointer; text-decoration: underline; font-weight: 500; }
    .drop-zone-collapsed .change-link:hover { color: var(--accent); }
```

Note: The collapse behavior itself (toggling between full drop zone and collapsed bar) will be implemented as a future enhancement in `popup.js`. This task only adds the CSS classes so they are ready.

- [ ] **Step 2: Commit**

```bash
git add popup.html
git commit -m "style: add drop zone collapsed state CSS classes"
```

---

### Task 13: Update manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add 32px icon to manifest**

In `manifest.json`, update the `default_icon` block (lines 10-13) to:
```json
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
```

And update the `icons` block (lines 46-49) to:
```json
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
```

- [ ] **Step 2: Update the extension name**

In `manifest.json` line 3, change:
```json
  "name": "Travel & Events Shortcut",
```
to:
```json
  "name": "Pluck — Travel & Events",
```

- [ ] **Step 3: Reload extension in Chrome and verify name + icons in extensions page**

- [ ] **Step 4: Commit**

```bash
git add manifest.json
git commit -m "chore: update manifest with Pluck name and 32px icon"
```

---

### Task 14: Update Font Weights Across Component Styles

**Files:**
- Modify: `popup.html` (various CSS rules)

This task adds `font-weight` and `font-family: inherit` to component CSS rules to match the Poppins typography spec from the design. Only rules that need weight changes are listed.

- [ ] **Step 1: Update URL input placeholder**

In `popup.html` line 108, change:
```css
    .url-row input::placeholder { color: var(--text4); }
```
to:
```css
    .url-row input::placeholder { color: var(--text4); font-weight: 300; }
```

- [ ] **Step 2: Update fetch button weight**

In `popup.html` line 110, change:
```css
    .url-btn { padding: 7px 12px; font-size: 12px; font-weight: 500; border: 1px solid var(--border); border-radius: 7px; background: var(--bg2); cursor: pointer; color: var(--text2); }
```
to:
```css
    .url-btn { padding: 7px 12px; font-size: 12px; font-weight: 600; border: 1px solid var(--border); border-radius: 7px; background: var(--bg2); cursor: pointer; color: var(--text2); font-family: inherit; }
```

- [ ] **Step 3: Update scan button weight**

In `popup.html` line 145, change:
```css
    .btn-scan { width: 100%; padding: 10px; font-size: 13px; font-weight: 500; background: var(--btn-scan-bg); color: var(--btn-scan-txt); border: 1px solid var(--btn-scan-border); border-radius: 8px; cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 7px; }
```
to:
```css
    .btn-scan { width: 100%; padding: 10px; font-size: 13px; font-weight: 600; background: var(--btn-scan-bg); color: var(--btn-scan-txt); border: 1px solid var(--btn-scan-border); border-radius: 8px; cursor: pointer; transition: background 0.15s, color 0.15s, border-color 0.15s; margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 7px; font-family: inherit; }
```

- [ ] **Step 4: Update scan hint**

In `popup.html` line 148, change:
```css
    .scan-hint { font-size: 11px; color: var(--hint-txt); text-align: center; margin-top: 5px; }
```
to:
```css
    .scan-hint { font-size: 11px; font-weight: 300; color: var(--hint-txt); text-align: center; margin-top: 5px; }
```

- [ ] **Step 5: Update field-label weight**

In `popup.html` line 176, change:
```css
    .field-label { color: var(--text3); flex-shrink: 0; }
```
to:
```css
    .field-label { color: var(--text3); font-weight: 300; flex-shrink: 0; }
```

- [ ] **Step 6: Update detected-meta weight**

In `popup.html` line 187, change:
```css
    .detected-meta  { font-size: 11px; color: var(--text3); }
```
to:
```css
    .detected-meta  { font-size: 11px; font-weight: 300; color: var(--text3); }
```

- [ ] **Step 7: Update edit-label weight**

In `popup.html` line 197, change:
```css
    .edit-label { font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text3); margin-bottom: 4px; }
```
to:
```css
    .edit-label { font-size: 10px; font-weight: 300; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text3); margin-bottom: 4px; }
```

- [ ] **Step 8: Reload extension and verify typography looks correct**

- [ ] **Step 9: Commit**

```bash
git add popup.html
git commit -m "style: update font weights across components for Poppins typography"
```

---

### Task 15: Update Changelog

**Files:**
- Modify: `UI Design/changelog.md`

- [ ] **Step 1: Append new changelog entry**

Add the following to the end of `UI Design/changelog.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add "UI Design/changelog.md"
git commit -m "docs: update changelog with full Pluck rebrand integration details"
```

---

### Task 16: Final Verification

- [ ] **Step 1: Run syntax check**

Run: `node --check popup.js`
Expected: No output (success)

- [ ] **Step 2: Reload extension in Chrome**

Go to `chrome://extensions`, click the reload icon on the Pluck extension card.

- [ ] **Step 3: Visual verification checklist**

Open the popup and verify:
- Header shows Pluck logo + "Pluck" / "Travel & Events"
- Background is indigo radial gradient (dark mode)
- Extract button is gold (#D4A830)
- Scan button is ghost style with border
- All text uses Poppins font
- Toggle to light mode — background is warm lavender gradient, gold accent darkens
- Toggle back to dark mode

- [ ] **Step 4: Functional verification**

Drop a test PDF and extract — confirm:
- Travel cards render with inline SVG icons in tags (FLIGHT, HOTEL, CHARTER)
- Tags are uppercase with icon + text

Scan a page or paste text — confirm:
- Detected event cards render with correct type tags
- New types (if detected) show correct colors and icons
- Selected card border is gold, checkbox is gold

- [ ] **Step 5: Final commit (if any touch-ups needed)**

```bash
git add -A
git commit -m "fix: final adjustments from visual verification"
```
