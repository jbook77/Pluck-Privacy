# Calendar Picker & Visibility Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the calendar picker dropdown overlapping the footer, and add per-calendar visibility toggles in Settings so users can hide calendars from the picker.

**Architecture:** Pure CSS fix for the dropdown direction. For visibility: store hidden calendar IDs in `chrome.storage.local`, filter them out in `renderCalendarPicker()` and `tryAutoSelectCalendar()`, and add toggle switches to alias cards in the Settings panel. Also extend the calendar data shape to include `accessRole` for My/Other grouping.

**Tech Stack:** Vanilla JS, Chrome Extension MV3, `chrome.storage.local`, CSS custom properties.

---

## File Map

| File | Changes |
|---|---|
| `popup.html` | CSS: fix `.cal-picker-dropdown` direction; add toggle switch styles; add `.alias-cal-header` styles |
| `popup.js` | Extend `renderCalendarPicker`, `tryAutoSelectCalendar`, `renderSettingsBody`, `renderAliasCard`, `wireAliasEvents`; add `getHiddenCalendars` helper |
| `google-api.js` | Add `accessRole` to calendar objects in `fetchCalendarList` |
| `background.js` | Add `accessRole` to calendar objects in `_fetchCalendarList`; add `google_hidden_calendars` to sign-out cleanup |

---

### Task 1: Fix dropdown direction (CSS only)

**Files:**
- Modify: `popup.html` (line with `.cal-picker-dropdown`)

- [ ] **Step 1: Change `top` to `bottom` in the dropdown CSS**

In `popup.html`, find:
```css
.cal-picker-dropdown { position:absolute; top:calc(100% + 2px); left:0; right:0; background:var(--card); border:1px solid var(--border); border-radius:6px; z-index:100; overflow:hidden; display:none; }
```
Replace with:
```css
.cal-picker-dropdown { position:absolute; bottom:calc(100% + 2px); left:0; right:0; background:var(--card); border:1px solid var(--border); border-radius:6px; z-index:100; overflow:hidden; display:none; }
```

- [ ] **Step 2: Verify**

Reload the extension at `chrome://extensions`. Click the calendar picker — dropdown should open upward, above the button, no longer overlapping the footer.

- [ ] **Step 3: Commit**

```bash
git add popup.html
git commit -m "fix: calendar picker dropdown opens upward to avoid footer overlap"
```

---

### Task 2: Add `accessRole` to calendar data

The calendar objects currently only store `{ id, name, color }`. We need `accessRole` to split calendars into "My Calendars" (owner) vs "Other Calendars" (reader/writer/freeBusyReader).

**Files:**
- Modify: `google-api.js` — `fetchCalendarList` function
- Modify: `background.js` — `_fetchCalendarList` function

- [ ] **Step 1: Update `fetchCalendarList` in `google-api.js`**

Find:
```js
return (data.items || []).map(cal => ({
  id: cal.id,
  name: cal.summary,
  color: cal.backgroundColor || '#4285f4'
}));
```
Replace with:
```js
return (data.items || []).map(cal => ({
  id: cal.id,
  name: cal.summary,
  color: cal.backgroundColor || '#4285f4',
  accessRole: cal.accessRole || 'reader'
}));
```

- [ ] **Step 2: Update `_fetchCalendarList` in `background.js`**

Find:
```js
return (data.items || []).map(cal => ({
  id: cal.id,
  name: cal.summary,
  color: cal.backgroundColor || '#4285f4'
}));
```
Replace with:
```js
return (data.items || []).map(cal => ({
  id: cal.id,
  name: cal.summary,
  color: cal.backgroundColor || '#4285f4',
  accessRole: cal.accessRole || 'reader'
}));
```

- [ ] **Step 3: Verify syntax**

```bash
node --check google-api.js && node --check background.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add google-api.js background.js
git commit -m "feat: include accessRole in calendar data for My/Other grouping"
```

---

### Task 3: Add `getHiddenCalendars` helper and update sign-out

**Files:**
- Modify: `popup.js` — add `getHiddenCalendars` after `getAliases`
- Modify: `google-api.js` — `signOutGoogle` cleanup list

- [ ] **Step 1: Add `getHiddenCalendars` to `popup.js`**

In `popup.js`, find the `getAliases` function call pattern (around line 220 in `renderSettingsBody`). Add this new helper directly after the `tryAutoSelectCalendar` function (around line 201):

```js
function getHiddenCalendars() {
  return new Promise(resolve => {
    chrome.storage.local.get('google_hidden_calendars', r => resolve(r.google_hidden_calendars || []));
  });
}
```

- [ ] **Step 2: Add `google_hidden_calendars` to sign-out cleanup in `google-api.js`**

Find:
```js
await chrome.storage.local.remove(['google_account', 'google_calendars', 'google_last_calendar', 'google_aliases']);
```
Replace with:
```js
await chrome.storage.local.remove(['google_account', 'google_calendars', 'google_last_calendar', 'google_aliases', 'google_hidden_calendars']);
```

- [ ] **Step 3: Verify syntax**

```bash
node --check popup.js && node --check google-api.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add popup.js google-api.js
git commit -m "feat: add getHiddenCalendars helper and clear on sign-out"
```

---

### Task 4: Filter hidden calendars from the picker

**Files:**
- Modify: `popup.js` — `renderCalendarPicker` and `tryAutoSelectCalendar`

- [ ] **Step 1: Update `renderCalendarPicker` to filter hidden calendars**

Find the full `renderCalendarPicker` function:
```js
function renderCalendarPicker(calendars, selectedId) {
  const row = document.getElementById('cal-picker-row');
  if (!calendars || !calendars.length) { row.style.display = 'none'; return; }
  row.style.display = '';

  const sel = calendars.find(c => c.id === selectedId) || calendars[0];
  selectedCalendarId = sel.id;
```
Replace with:
```js
async function renderCalendarPicker(calendars, selectedId) {
  const row = document.getElementById('cal-picker-row');
  if (!calendars || !calendars.length) { row.style.display = 'none'; return; }

  const hiddenIds = await getHiddenCalendars();
  const visible = calendars.filter(c => !hiddenIds.includes(c.id));
  if (!visible.length) { row.style.display = 'none'; return; }
  row.style.display = '';

  const sel = visible.find(c => c.id === selectedId) || visible[0];
  selectedCalendarId = sel.id;
```

Then find the line that builds the dropdown items:
```js
  const dd = document.getElementById('cal-picker-dropdown');
  dd.innerHTML = calendars.map(c =>
```
Replace `calendars.map` with `visible.map`:
```js
  const dd = document.getElementById('cal-picker-dropdown');
  dd.innerHTML = visible.map(c =>
```

- [ ] **Step 2: Update `tryAutoSelectCalendar` to skip hidden calendars**

Find:
```js
async function tryAutoSelectCalendar(events) {
  if (!googleAccount || !googleCalendars.length) return;
  const aliases = await getAliases();
  const matchedId = autoSelectCalendar(events, googleCalendars, aliases);
```
Replace with:
```js
async function tryAutoSelectCalendar(events) {
  if (!googleAccount || !googleCalendars.length) return;
  const aliases = await getAliases();
  const hiddenIds = await getHiddenCalendars();
  const visibleCalendars = googleCalendars.filter(c => !hiddenIds.includes(c.id));
  const matchedId = autoSelectCalendar(events, visibleCalendars, aliases);
```

- [ ] **Step 3: Verify syntax**

```bash
node --check popup.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: filter hidden calendars from picker and auto-select"
```

---

### Task 5: Add toggle switch CSS

**Files:**
- Modify: `popup.html` — add styles after `.alias-cal-card` block

- [ ] **Step 1: Add toggle switch and header styles**

In `popup.html`, find:
```css
.alias-cal-name { display:flex; align-items:center; gap:6px; margin-bottom:6px; font-weight:600; font-size:11px; color:var(--muted); }
```
Replace with:
```css
.alias-cal-name { display:flex; align-items:center; gap:6px; font-weight:600; font-size:11px; color:var(--muted); }
.alias-cal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
.cal-vis-toggle { position:relative; width:32px; height:18px; border-radius:9px; cursor:pointer; flex-shrink:0; border:none; padding:0; transition:background 0.2s; }
.cal-vis-toggle::after { content:''; position:absolute; width:12px; height:12px; border-radius:50%; background:#fff; top:3px; transition:left 0.2s; }
.cal-vis-toggle.on::after  { left:17px; }
.cal-vis-toggle.off::after { left:3px; background:#ccc; }
.alias-cal-card.hidden { opacity:0.5; }
```

- [ ] **Step 2: Verify HTML is valid (no syntax errors)**

```bash
node --check popup.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add popup.html
git commit -m "feat: add toggle switch CSS for calendar visibility"
```

---

### Task 6: Update `renderAliasCard` to include toggle and accept `hiddenIds`

**Files:**
- Modify: `popup.js` — `renderAliasCard` signature and body

- [ ] **Step 1: Update `renderAliasCard`**

Find the full function:
```js
function renderAliasCard(cal, calAliases) {
  return '<div class="alias-cal-card" id="alias-card-' + escAttr(cal.id) + '">'
    + '<div class="alias-cal-name">'
    + '<span class="cal-dot" style="background:' + escAttr(cal.color) + '"></span>'
    + escHtml(cal.name)
    + '</div>'
    + '<div class="alias-tags" id="alias-tags-' + escAttr(cal.id) + '">'
    + calAliases.map((a, i) =>
        '<span class="alias-tag">' + escHtml(a)
        + '<button class="alias-tag-remove" data-cal="' + escAttr(cal.id) + '" data-i="' + i + '">×</button>'
        + '</span>'
      ).join('')
    + '<button class="alias-add-pill" data-cal="' + escAttr(cal.id) + '">+ add</button>'
    + '</div>'
    + '<div class="alias-input-row" id="alias-input-row-' + escAttr(cal.id) + '" style="display:none">'
    + '<input class="alias-input" id="alias-input-' + escAttr(cal.id) + '" placeholder="Nickname">'
    + '<button class="alias-confirm-btn" data-cal="' + escAttr(cal.id) + '">✓</button>'
    + '</div>'
    + '</div>';
}
```
Replace with:
```js
function renderAliasCard(cal, calAliases, hiddenIds) {
  const isHidden = hiddenIds.includes(cal.id);
  const toggleStyle = isHidden ? 'background:#444' : 'background:' + cal.color;
  return '<div class="alias-cal-card' + (isHidden ? ' hidden' : '') + '" id="alias-card-' + escAttr(cal.id) + '">'
    + '<div class="alias-cal-header">'
    + '<div class="alias-cal-name">'
    + '<span class="cal-dot" style="background:' + escAttr(cal.color) + '"></span>'
    + escHtml(cal.name)
    + '</div>'
    + '<button class="cal-vis-toggle ' + (isHidden ? 'off' : 'on') + '" style="' + toggleStyle + '" data-cal="' + escAttr(cal.id) + '" title="' + (isHidden ? 'Show in picker' : 'Hide from picker') + '"></button>'
    + '</div>'
    + '<div class="alias-tags" id="alias-tags-' + escAttr(cal.id) + '">'
    + calAliases.map((a, i) =>
        '<span class="alias-tag">' + escHtml(a)
        + '<button class="alias-tag-remove" data-cal="' + escAttr(cal.id) + '" data-i="' + i + '">×</button>'
        + '</span>'
      ).join('')
    + '<button class="alias-add-pill" data-cal="' + escAttr(cal.id) + '">+ add</button>'
    + '</div>'
    + '<div class="alias-input-row" id="alias-input-row-' + escAttr(cal.id) + '" style="display:none">'
    + '<input class="alias-input" id="alias-input-' + escAttr(cal.id) + '" placeholder="Nickname">'
    + '<button class="alias-confirm-btn" data-cal="' + escAttr(cal.id) + '">✓</button>'
    + '</div>'
    + '</div>';
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check popup.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add popup.js
git commit -m "feat: renderAliasCard accepts hiddenIds and renders visibility toggle"
```

---

### Task 7: Update `renderSettingsBody` with My/Other grouping and hidden state

**Files:**
- Modify: `popup.js` — `renderSettingsBody`

- [ ] **Step 1: Replace `renderSettingsBody`**

Find:
```js
async function renderSettingsBody() {
  const body = document.getElementById('settings-body');
  if (!googleAccount || !googleCalendars.length) {
    body.innerHTML = '<div class="settings-hint">Connect Google first to manage aliases.</div>';
    return;
  }
  const aliases = await getAliases();
  body.innerHTML = '<div class="settings-section-label">Calendar Aliases</div>'
    + '<div class="settings-hint">When a name or nickname appears in a document, auto-select that person\'s calendar.</div>'
    + googleCalendars.map(cal => renderAliasCard(cal, aliases[cal.id] || [])).join('');
  wireAliasEvents(aliases);
}
```
Replace with:
```js
async function renderSettingsBody() {
  const body = document.getElementById('settings-body');
  if (!googleAccount || !googleCalendars.length) {
    body.innerHTML = '<div class="settings-hint">Connect Google first to manage calendars.</div>';
    return;
  }
  const [aliases, hiddenIds] = await Promise.all([getAliases(), getHiddenCalendars()]);
  const mine  = googleCalendars.filter(c => c.accessRole === 'owner');
  const other = googleCalendars.filter(c => c.accessRole !== 'owner');

  let html = '<div class="settings-hint">Toggle calendars on or off to control which appear in the picker. Add nicknames to auto-select a calendar when that name appears in a document.</div>';
  if (mine.length) {
    html += '<div class="settings-section-label">My Calendars</div>'
      + mine.map(cal => renderAliasCard(cal, aliases[cal.id] || [], hiddenIds)).join('');
  }
  if (other.length) {
    html += '<div class="settings-section-label" style="margin-top:10px">Other Calendars</div>'
      + other.map(cal => renderAliasCard(cal, aliases[cal.id] || [], hiddenIds)).join('');
  }
  body.innerHTML = html;
  wireAliasEvents(aliases, hiddenIds);
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check popup.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add popup.js
git commit -m "feat: settings panel groups calendars by My/Other with visibility state"
```

---

### Task 8: Wire toggle click handler in `wireAliasEvents`

**Files:**
- Modify: `popup.js` — `wireAliasEvents` signature and body

- [ ] **Step 1: Update `wireAliasEvents` to accept and handle `hiddenIds`**

Find:
```js
function wireAliasEvents(aliases) {
  // Remove alias
  document.querySelectorAll('.alias-tag-remove').forEach(btn => {
```
Replace the entire function signature and add the toggle handler block at the top:
```js
function wireAliasEvents(aliases, hiddenIds) {
  // Visibility toggle
  document.querySelectorAll('.cal-vis-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const calId = btn.getAttribute('data-cal');
      const current = await getHiddenCalendars();
      let updated;
      if (current.includes(calId)) {
        updated = current.filter(id => id !== calId);
      } else {
        updated = [...current, calId];
      }
      await chrome.storage.local.set({ google_hidden_calendars: updated });
      renderSettingsBody();
      renderCalendarPicker(googleCalendars, selectedCalendarId);
    });
  });

  // Remove alias
  document.querySelectorAll('.alias-tag-remove').forEach(btn => {
```

Also update the `renderAliasCard` call inside the remove handler — it currently passes two args and needs three. Find inside `wireAliasEvents`:
```js
      document.getElementById('alias-card-' + calId).outerHTML = renderAliasCard(cal, current[calId]);
      wireAliasEvents(current);
```
Replace with:
```js
      const hids = await getHiddenCalendars();
      document.getElementById('alias-card-' + calId).outerHTML = renderAliasCard(cal, current[calId], hids);
      wireAliasEvents(current, hids);
```

- [ ] **Step 2: Verify syntax**

```bash
node --check popup.js && echo "OK"
```
Expected: `OK`

- [ ] **Step 3: Reload extension and test**

1. Reload at `chrome://extensions`
2. Open the extension and connect Google if not already signed in
3. Open Settings (gear icon)
4. Confirm calendars are grouped into "My Calendars" and "Other Calendars"
5. Toggle a calendar off — card should dim, toggle should slide left and go gray
6. Close Settings and open the calendar picker — toggled-off calendar should be absent
7. Toggle it back on — should reappear in picker

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: wire visibility toggle to update storage and re-render picker"
```
