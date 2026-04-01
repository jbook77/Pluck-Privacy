# Google Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Google sign-in to the extension so that when a file is loaded, it gets uploaded to Google Drive and attached to calendar events created via the Calendar API, with a per-batch calendar picker and smart alias-based auto-selection.

**Architecture:** A new `google-api.js` file holds all Google API logic (auth, Drive upload, Calendar event creation, calendar list, alias matching). `popup.js` is modified to tag extracted events with their source file, wire up the new creation flow, and manage the settings panel UI. `popup.html` gets the new footer, calendar picker, and settings panel markup.

**Tech Stack:** Chrome Extension MV3, vanilla JS, `chrome.identity` API, Google Drive API v3, Google Calendar API v3, `chrome.storage.local`

---

## Prerequisites (Manual — Do Before Writing Any Code)

- [ ] Go to [https://console.cloud.google.com](https://console.cloud.google.com) and create a new project (e.g. "Travel Calendar Extension")
- [ ] Enable the **Google Calendar API**: APIs & Services → Library → search "Google Calendar API" → Enable
- [ ] Enable the **Google Drive API**: same path → search "Google Drive API" → Enable
- [ ] Create OAuth credentials: APIs & Services → Credentials → Create Credentials → OAuth client ID → Application type: **Chrome Extension**
- [ ] Find your extension ID: go to `chrome://extensions`, enable Developer Mode, find the extension's ID (looks like `abcdefghijklmnopqrstuvwxyzabcdef`)
- [ ] Paste that extension ID into the "Application ID" field in the GCP OAuth client creation form
- [ ] Copy the resulting **Client ID** (looks like `123456789-abc.apps.googleusercontent.com`) — you'll need it in Task 2
- [ ] Configure the OAuth consent screen: APIs & Services → OAuth consent screen → Internal (for Workspace orgs) → fill in app name and contact email → add scopes: `drive.file`, `calendar.events`, `calendar.readonly`

---

## File Map

| File | Change |
|---|---|
| `manifest.json` | Add `identity` permission, `oauth2` block, update `host_permissions` |
| `google-api.js` | **Create new** — all Google API functions |
| `popup.html` | Add `<script src="google-api.js">`, new footer markup, settings panel div, calendar picker div, theme toggle switch |
| `popup.js` | Source file tagging, init on load, calendar picker wiring, settings panel logic, modified `addToCalendar()`, modified `renderTravelCards()` |

---

## Task 1: Update manifest.json

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Add identity permission, oauth2 block, and updated host_permissions**

Replace the entire `manifest.json` with (substituting your real Client ID for `YOUR_CLIENT_ID_HERE`):

```json
{
  "manifest_version": 3,
  "name": "Travel & Events Shortcut",
  "version": "1.1",
  "description": "Drop files, paste, or scan the page to add travel and events to Google Calendar.",
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "identity"
  ],
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID_HERE",
    "scopes": [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly"
    ]
  },
  "host_permissions": [
    "https://generativelanguage.googleapis.com/*",
    "https://www.googleapis.com/",
    "<all_urls>"
  ],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle",
      "match_about_blank": true
    }
  ],
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add manifest.json
git commit -m "feat: add identity permission and oauth2 config for Google integration"
```

---

## Task 2: Create google-api.js — Auth and Calendar List

**Files:**
- Create: `google-api.js`

- [ ] **Step 1: Create the file with auth functions and calendar list fetching**

```javascript
'use strict';

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function signInWithGoogle() {
  const token = await _getToken(true);
  const userInfo = await _fetchUserInfo(token);
  const calendars = await fetchCalendarList(token);
  await chrome.storage.local.set({ google_account: userInfo, google_calendars: calendars });
  return { token, userInfo, calendars };
}

async function getAuthToken() {
  return _getToken(false);
}

function _getToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Not signed in'));
      } else {
        resolve(token);
      }
    });
  });
}

async function signOutGoogle() {
  let token;
  try { token = await _getToken(false); } catch(e) {}
  if (token) {
    await new Promise(resolve => chrome.identity.removeCachedAuthToken({ token }, resolve));
  }
  await chrome.storage.local.remove(['google_account', 'google_calendars', 'google_last_calendar', 'google_aliases']);
}

async function _fetchUserInfo(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!res.ok) throw new Error('Could not fetch user info');
  const d = await res.json();
  return { email: d.email, name: d.name };
}

// ─── Calendar list ─────────────────────────────────────────────────────────────

async function fetchCalendarList(token) {
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer',
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  if (!res.ok) throw new Error('Could not fetch calendar list');
  const data = await res.json();
  return (data.items || []).map(cal => ({
    id: cal.id,
    name: cal.summary,
    color: cal.backgroundColor || '#4285f4'
  }));
}

// ─── Drive upload ──────────────────────────────────────────────────────────────

async function uploadToDrive(token, file) {
  const metadata = { name: file.name, mimeType: file.mimeType };
  const boundary = 'tcs_bnd_' + Date.now();
  const body = [
    '--' + boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    '--' + boundary,
    'Content-Type: ' + file.mimeType,
    'Content-Transfer-Encoding: base64',
    '',
    file.base64,
    '--' + boundary + '--'
  ].join('\r\n');

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'multipart/related; boundary=' + boundary
      },
      body
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) || 'Drive upload failed');
  }
  return (await res.json()).id;
}

// ─── Calendar event creation ───────────────────────────────────────────────────

async function createCalendarEvent(token, calendarId, eventData, fileIds) {
  const event = {
    summary: eventData.title,
    start: { dateTime: eventData.startISO },
    end: { dateTime: eventData.endISO },
    location: eventData.location || '',
    description: eventData.notes || eventData.baseDetails || ''
  };
  if (fileIds && fileIds.length) {
    event.attachments = fileIds.map(id => ({
      fileUrl: 'https://drive.google.com/open?id=' + id
    }));
  }
  const qs = (fileIds && fileIds.length) ? '?supportsAttachments=true' : '';
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events' + qs,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) || 'Calendar API error ' + res.status);
  }
  return await res.json(); // contains htmlLink
}

// ─── Alias storage and matching ────────────────────────────────────────────────

function getAliases() {
  return new Promise(resolve => {
    chrome.storage.local.get('google_aliases', r => resolve(r.google_aliases || {}));
  });
}

function saveAliases(aliases) {
  return chrome.storage.local.set({ google_aliases: aliases });
}

// extractedEvents: array of event objects from Gemini
// calendars: array of { id, name, color }
// aliases: { calendarId: ['alias1', 'alias2', ...] }
// Returns calendarId string if unambiguous match, null otherwise
function autoSelectCalendar(extractedEvents, calendars, aliases) {
  const corpus = extractedEvents.flatMap(ev => [
    ev.title || '',
    ev.notes || '',
    ev.location || '',
    ev.baseDetails || '',
    ...(ev.passengers || []).map(p => p.name || '')
  ]).join(' ');

  const matched = new Set();
  for (const cal of calendars) {
    const calAliases = aliases[cal.id] || [];
    for (const alias of calAliases) {
      const re = new RegExp('\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (re.test(corpus)) {
        matched.add(cal.id);
        break;
      }
    }
  }
  return matched.size === 1 ? [...matched][0] : null;
}
```

- [ ] **Step 2: Verify syntax**

```bash
node --check google-api.js
```

Expected: no output (clean)

- [ ] **Step 3: Verify autoSelectCalendar logic with a quick inline test**

```bash
node -e "
const autoSelectCalendar = $(grep -A 30 'function autoSelectCalendar' google-api.js | head -32)
// Simple smoke test without chrome APIs
const events = [{ title: 'Fly Newark to Miami', passengers: [{ name: 'Kevin Jonas' }] }];
const cals = [{ id: 'cal-kevin', name: 'Kevin Jonas', color: '#4285f4' }, { id: 'cal-joe', name: 'Joe Jonas', color: '#0f9d58' }];
const aliases = { 'cal-kevin': ['Kevin', 'Kev', 'KJ'], 'cal-joe': ['Joe', 'Joseph'] };
const result = autoSelectCalendar(events, cals, aliases);
console.assert(result === 'cal-kevin', 'Expected cal-kevin, got ' + result);
console.log('autoSelectCalendar: OK');
"
```

Expected: `autoSelectCalendar: OK`

- [ ] **Step 4: Commit**

```bash
git add google-api.js
git commit -m "feat: add google-api.js with auth, Drive upload, Calendar API, and alias matching"
```

---

## Task 3: Add google-api.js to popup.html and update the footer markup

**Files:**
- Modify: `popup.html`

- [ ] **Step 1: Read the current popup.html footer section**

Open `popup.html` and find the footer `<div>` — it currently contains the theme toggle button. Note its exact HTML.

- [ ] **Step 2: Add the script tag for google-api.js**

In `popup.html`, add this line immediately before the existing `<script src="popup.js"></script>` line:

```html
    <script src="google-api.js"></script>
```

- [ ] **Step 3: Replace the existing footer with the new footer**

Find the footer div (the one containing the theme toggle) and replace it entirely with:

```html
    <div class="footer" id="main-footer">
      <!-- Google auth area -->
      <div id="footer-auth">
        <button class="connect-google-btn" id="connect-google-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.545 6.558a9.42 9.42 0 0 1 .139 1.626c0 2.434-.87 4.492-2.384 5.885h.002C11.978 15.292 10.158 16 8 16A8 8 0 1 1 8 0a7.689 7.689 0 0 1 5.352 2.082l-2.284 2.284A4.347 4.347 0 0 0 8 3.166c-2.087 0-4.03 1.222-4.979 3.188A4.95 4.95 0 0 0 2.5 8c0 .716.137 1.4.385 2.026C3.878 12.14 5.753 13.33 8 13.33a4.855 4.855 0 0 0 3.363-1.358"/></svg>
          Connect Google
        </button>
        <div id="footer-account" style="display:none">
          <div class="account-avatar" id="account-avatar">J</div>
          <span class="account-email" id="account-email">jeremy@example.com</span>
          <button class="text-btn" id="sign-out-btn">sign out</button>
        </div>
      </div>
      <!-- Right side: settings gear + theme toggle -->
      <div style="display:flex;align-items:center;gap:10px">
        <button class="icon-btn" id="settings-btn" title="Settings">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <label class="theme-switch" title="Toggle theme">
          <input type="checkbox" id="theme-toggle-input">
          <span class="theme-track"><span class="theme-thumb"></span></span>
          <span id="theme-label">Light mode</span>
        </label>
      </div>
    </div>
```

- [ ] **Step 4: Add the settings panel div and calendar picker div**

Immediately after the footer div (still inside the main wrapper), add:

```html
    <!-- Settings panel (hidden by default) -->
    <div id="settings-panel" style="display:none">
      <div class="settings-header">
        <button class="icon-btn" id="settings-back-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <span class="settings-title">Settings</span>
      </div>
      <div id="settings-body"></div>
    </div>
```

- [ ] **Step 5: Add the calendar picker row**

Find the `<button class="add-cal-btn"` area — actually this button is rendered dynamically in `popup.js`. Instead, find the `<div id="results">` element and add the calendar picker row just above it:

```html
    <!-- Calendar picker (shown when signed in, hidden otherwise) -->
    <div id="cal-picker-row" style="display:none">
      <div class="picker-label">Add to calendar</div>
      <div class="cal-picker-wrap" id="cal-picker-wrap">
        <button class="cal-picker-btn" id="cal-picker-btn" type="button">
          <span class="cal-picker-selected" id="cal-picker-selected">
            <span class="cal-dot" id="cal-picker-dot"></span>
            <span id="cal-picker-name">Select calendar</span>
          </span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="cal-picker-dropdown" id="cal-picker-dropdown"></div>
      </div>
    </div>

    <div id="results"></div>
```

- [ ] **Step 6: Verify the HTML is valid (no unclosed tags)**

```bash
node -e "
const html = require('fs').readFileSync('popup.html','utf8');
const opens = (html.match(/<div/g)||[]).length;
const closes = (html.match(/<\/div>/g)||[]).length;
console.log('div opens:', opens, 'div closes:', closes);
if (opens !== closes) console.warn('MISMATCH — check for unclosed divs');
else console.log('OK');
"
```

Expected: `OK` (opens and closes match)

- [ ] **Step 7: Commit**

```bash
git add popup.html
git commit -m "feat: add footer auth area, settings panel, and calendar picker markup to popup.html"
```

---

## Task 4: Add CSS for new UI elements to popup.html

**Files:**
- Modify: `popup.html` (the `<style>` block)

- [ ] **Step 1: Add new CSS rules to the existing `<style>` block in popup.html**

Find the closing `</style>` tag and add the following rules immediately before it:

```css
/* ── Footer ── */
.footer { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-top:1px solid var(--border); flex-shrink:0; }
#footer-auth { display:flex; align-items:center; }
.connect-google-btn { display:flex; align-items:center; gap:5px; background:none; border:1px solid var(--border); border-radius:5px; padding:4px 10px; color:var(--muted); font-size:10px; cursor:pointer; }
.connect-google-btn:hover { border-color:var(--accent); color:var(--accent); }
#footer-account { display:flex; align-items:center; gap:6px; }
.account-avatar { width:20px; height:20px; border-radius:50%; background:#4285f4; display:flex; align-items:center; justify-content:center; color:#fff; font-size:9px; font-weight:700; flex-shrink:0; }
.account-email { color:var(--muted); font-size:10px; }
.text-btn { background:none; border:none; color:var(--muted); font-size:10px; cursor:pointer; text-decoration:underline; padding:0; }
.icon-btn { background:none; border:none; color:var(--muted); cursor:pointer; padding:2px; display:flex; align-items:center; }
.icon-btn:hover { color:var(--fg); }

/* ── Theme toggle switch ── */
.theme-switch { display:flex; align-items:center; gap:5px; cursor:pointer; font-size:10px; color:var(--muted); user-select:none; }
.theme-switch input { display:none; }
.theme-track { width:28px; height:16px; background:#444; border-radius:8px; position:relative; transition:background .2s; flex-shrink:0; }
.theme-switch input:checked ~ .theme-track { background:var(--accent); }
.theme-thumb { width:12px; height:12px; background:#fff; border-radius:50%; position:absolute; top:2px; left:2px; transition:transform .2s; }
.theme-switch input:checked ~ .theme-track .theme-thumb { transform:translateX(12px); }

/* ── Calendar picker ── */
#cal-picker-row { padding:0 12px 8px; }
.picker-label { font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
.cal-picker-wrap { position:relative; }
.cal-picker-btn { display:flex; align-items:center; justify-content:space-between; background:var(--card); border:1px solid var(--accent); border-radius:6px; padding:7px 10px; cursor:pointer; width:100%; color:var(--fg); font-size:12px; }
.cal-picker-selected { display:flex; align-items:center; gap:8px; }
.cal-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
.cal-picker-dropdown { position:absolute; top:calc(100% + 2px); left:0; right:0; background:var(--card); border:1px solid var(--border); border-radius:6px; z-index:100; overflow:hidden; display:none; }
.cal-picker-dropdown.open { display:block; }
.cal-picker-item { display:flex; align-items:center; gap:8px; padding:8px 10px; cursor:pointer; font-size:12px; color:var(--fg); }
.cal-picker-item:hover { background:var(--hover); }
.cal-picker-item.active { background:var(--hover); }

/* ── Settings panel ── */
#settings-panel { display:none; flex-direction:column; flex:1; overflow:hidden; }
.settings-header { display:flex; align-items:center; gap:8px; padding:10px 12px; border-bottom:1px solid var(--border); flex-shrink:0; }
.settings-title { font-weight:600; font-size:13px; }
#settings-body { overflow-y:auto; flex:1; padding:12px; }
.settings-section-label { font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; margin-bottom:4px; }
.settings-hint { font-size:11px; color:var(--muted); margin-bottom:12px; line-height:1.5; }
.alias-cal-card { background:var(--card); border-radius:6px; padding:8px 10px; margin-bottom:6px; }
.alias-cal-name { display:flex; align-items:center; gap:6px; margin-bottom:6px; font-weight:600; font-size:11px; color:var(--muted); }
.alias-tags { display:flex; flex-wrap:wrap; gap:4px; }
.alias-tag { background:var(--bg); border:1px solid var(--border); border-radius:20px; padding:2px 8px; font-size:10px; color:var(--fg); display:flex; align-items:center; gap:4px; }
.alias-tag-remove { background:none; border:none; color:var(--muted); cursor:pointer; padding:0; font-size:12px; line-height:1; }
.alias-add-pill { background:none; border:1px dashed var(--border); border-radius:20px; padding:2px 8px; font-size:10px; color:var(--muted); cursor:pointer; }
.alias-add-pill:hover { border-color:var(--accent); color:var(--accent); }
.alias-input-row { display:flex; align-items:center; gap:6px; margin-top:6px; }
.alias-input { background:var(--bg); border:1px solid var(--accent); border-radius:4px; padding:3px 6px; color:var(--fg); font-size:11px; outline:none; flex:1; }
.alias-confirm-btn { background:var(--accent); border:none; border-radius:4px; padding:3px 8px; font-size:11px; font-weight:600; cursor:pointer; color:#000; }
```

- [ ] **Step 2: Verify syntax check still passes**

```bash
node -e "const fs=require('fs'); const c=fs.readFileSync('popup.js','utf8'); new Function(c); console.log('OK');"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add popup.html
git commit -m "feat: add CSS for footer, theme toggle switch, calendar picker, and settings panel"
```

---

## Task 5: Update popup.js — theme toggle switch and init

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Replace the theme toggle event listener**

Find this block in `popup.js`:

```javascript
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
```

Replace with:

```javascript
  document.getElementById('theme-toggle-input').addEventListener('change', (e) => {
    applyTheme(e.target.checked ? 'light' : 'dark');
  });
```

- [ ] **Step 2: Update applyTheme() to sync the checkbox**

Find the `applyTheme` function. After the line `document.documentElement.setAttribute('data-theme', theme);` add:

```javascript
  const toggle = document.getElementById('theme-toggle-input');
  if (toggle) toggle.checked = (theme === 'light');
```

Also update the label lines — find and replace:

```javascript
  const icon  = document.getElementById('theme-icon');
  const label = document.getElementById('theme-label');
  if (theme === 'light') {
    icon.textContent  = '🌙';
    label.textContent = 'Dark mode';
  } else {
    icon.textContent  = '☀️';
    label.textContent = 'Light mode';
  }
```

With:

```javascript
  const label = document.getElementById('theme-label');
  if (label) label.textContent = (theme === 'light') ? 'Dark mode' : 'Light mode';
```

- [ ] **Step 3: Verify syntax**

```bash
node --check popup.js
```

Expected: no output

- [ ] **Step 4: Manual test — load extension in Chrome, verify theme toggle is now a switch**

In Chrome go to `chrome://extensions` → click the refresh icon on the extension → open the popup → confirm the theme toggle is a sliding switch and toggles correctly.

- [ ] **Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: replace theme button with toggle switch"
```

---

## Task 6: popup.js — Google sign-in/out and footer state

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Add Google auth state variables and helper after the existing state block**

Find the line `let detectedEvents = [];` and add after it:

```javascript
let googleAccount  = null;   // { email, name } or null
let googleCalendars = [];    // [{ id, name, color }]
let selectedCalendarId = null;
```

- [ ] **Step 2: Add footer rendering functions**

Add these functions after the `applyTheme` function:

```javascript
// ─── Google auth UI ────────────────────────────────────────────────────────────

function renderFooterSignedOut() {
  document.getElementById('connect-google-btn').style.display = '';
  document.getElementById('footer-account').style.display = 'none';
}

function renderFooterSignedIn(account) {
  document.getElementById('connect-google-btn').style.display = 'none';
  const fa = document.getElementById('footer-account');
  fa.style.display = 'flex';
  document.getElementById('account-avatar').textContent = (account.name || account.email || '?')[0].toUpperCase();
  document.getElementById('account-email').textContent = account.email || '';
}

function renderCalendarPicker(calendars, selectedId) {
  const row = document.getElementById('cal-picker-row');
  if (!calendars || !calendars.length) { row.style.display = 'none'; return; }
  row.style.display = '';

  const sel = calendars.find(c => c.id === selectedId) || calendars[0];
  selectedCalendarId = sel.id;
  document.getElementById('cal-picker-dot').style.background = sel.color;
  document.getElementById('cal-picker-name').textContent = sel.name;

  const dd = document.getElementById('cal-picker-dropdown');
  dd.innerHTML = calendars.map(c =>
    '<div class="cal-picker-item' + (c.id === sel.id ? ' active' : '') + '" data-id="' + escAttr(c.id) + '" data-name="' + escAttr(c.name) + '" data-color="' + escAttr(c.color) + '">'
    + '<span class="cal-dot" style="background:' + escAttr(c.color) + '"></span>'
    + escHtml(c.name)
    + '</div>'
  ).join('');

  dd.querySelectorAll('.cal-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedCalendarId = item.getAttribute('data-id');
      const name = item.getAttribute('data-name');
      const color = item.getAttribute('data-color');
      document.getElementById('cal-picker-dot').style.background = color;
      document.getElementById('cal-picker-name').textContent = name;
      dd.classList.remove('open');
      chrome.storage.local.set({ google_last_calendar: selectedCalendarId });
      updateAddBtn();
    });
  });
}

function hideCalendarPicker() {
  document.getElementById('cal-picker-row').style.display = 'none';
}
```

- [ ] **Step 3: Wire up the Connect Google and sign-out buttons in DOMContentLoaded**

Inside the `DOMContentLoaded` listener, after the existing event listeners, add:

```javascript
  // Google auth
  document.getElementById('connect-google-btn').addEventListener('click', async () => {
    try {
      setStatus('Connecting...', 'loading');
      const result = await signInWithGoogle();
      googleAccount = result.userInfo;
      googleCalendars = result.calendars;
      renderFooterSignedIn(googleAccount);
      const stored = await new Promise(r => chrome.storage.local.get('google_last_calendar', r));
      renderCalendarPicker(googleCalendars, stored.google_last_calendar || null);
      setStatus('', '');
    } catch(e) {
      setStatus('', '');
      showResult('<div class="error-box">Could not connect Google: ' + escHtml(e.message) + '</div>');
    }
  });

  document.getElementById('sign-out-btn').addEventListener('click', async () => {
    await signOutGoogle();
    googleAccount = null;
    googleCalendars = [];
    selectedCalendarId = null;
    renderFooterSignedOut();
    hideCalendarPicker();
  });

  // Calendar picker dropdown toggle
  document.getElementById('cal-picker-btn').addEventListener('click', () => {
    document.getElementById('cal-picker-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!document.getElementById('cal-picker-wrap').contains(e.target)) {
      document.getElementById('cal-picker-dropdown').classList.remove('open');
    }
  });
```

- [ ] **Step 4: Load signed-in state on startup**

At the end of the `DOMContentLoaded` listener (after all event listeners), add:

```javascript
  // Restore Google sign-in state
  chrome.storage.local.get(['google_account', 'google_calendars', 'google_last_calendar'], (r) => {
    if (r.google_account) {
      googleAccount = r.google_account;
      googleCalendars = r.google_calendars || [];
      renderFooterSignedIn(googleAccount);
      renderCalendarPicker(googleCalendars, r.google_last_calendar || null);
    } else {
      renderFooterSignedOut();
    }
  });
```

- [ ] **Step 5: Verify syntax**

```bash
node --check popup.js
```

Expected: no output

- [ ] **Step 6: Manual test in Chrome**

Reload the extension. Open the popup. Confirm "Connect Google" button appears in footer. Click it — Chrome should prompt for Google permissions. After approval the footer should show your email and a sign out link. Reload the popup — sign-in state should persist. Click sign out — footer returns to Connect button.

- [ ] **Step 7: Commit**

```bash
git add popup.js
git commit -m "feat: add Google sign-in/out UI and footer state management"
```

---

## Task 7: popup.js — Tag extracted events with source file index

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Update the travel extraction loop to tag events**

In `runExtract()`, find the travel extraction loop:

```javascript
        for (const f of travelFiles) {
          const parsed = await callGemini(apiKey, [
            { inline_data: { mime_type: f.mimeType, data: f.base64 } },
            { text: TRAVEL_PROMPT }
          ]);
          allEvents.push(...(parsed.events || []));
        }
```

Replace with:

```javascript
        for (const f of travelFiles) {
          const fIdx = loadedFiles.indexOf(f);
          const parsed = await callGemini(apiKey, [
            { inline_data: { mime_type: f.mimeType, data: f.base64 } },
            { text: TRAVEL_PROMPT }
          ]);
          const tagged = (parsed.events || []).map(ev => ({ ...ev, sourceFileIdx: fIdx }));
          allEvents.push(...tagged);
        }
```

- [ ] **Step 2: Update the event detection loop to tag events**

In the same `runExtract()` function, find the event detection loop:

```javascript
        for (const f of [...travelFiles, ...eventFiles]) {
          let parts;
          if (f.kind === 'text') {
            parts = [{ text: DETECT_PROMPT + '\n\nContent:\n' + f.text }];
          } else if (f.kind === 'image') {
            parts = [
              { inline_data: { mime_type: f.mimeType, data: f.base64 } },
              { text: DETECT_PROMPT + '\n\nExtract all events visible in this image.' }
            ];
          } else {
            parts = [
              { inline_data: { mime_type: f.mimeType, data: f.base64 } },
              { text: DETECT_PROMPT }
            ];
          }
          const parsed = await callGemini(apiKey, parts);
          allEvents.push(...(parsed.events || []));
        }
```

Replace with:

```javascript
        for (const f of [...travelFiles, ...eventFiles]) {
          const fIdx = f.kind !== 'text' ? loadedFiles.indexOf(f) : undefined;
          let parts;
          if (f.kind === 'text') {
            parts = [{ text: DETECT_PROMPT + '\n\nContent:\n' + f.text }];
          } else if (f.kind === 'image') {
            parts = [
              { inline_data: { mime_type: f.mimeType, data: f.base64 } },
              { text: DETECT_PROMPT + '\n\nExtract all events visible in this image.' }
            ];
          } else {
            parts = [
              { inline_data: { mime_type: f.mimeType, data: f.base64 } },
              { text: DETECT_PROMPT }
            ];
          }
          const parsed = await callGemini(apiKey, parts);
          const tagged = (parsed.events || []).map(ev =>
            fIdx !== undefined ? { ...ev, sourceFileIdx: fIdx } : ev
          );
          allEvents.push(...tagged);
        }
```

- [ ] **Step 3: Verify syntax**

```bash
node --check popup.js
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: tag extracted events with sourceFileIdx for Drive attachment routing"
```

---

## Task 8: popup.js — Auto-select calendar after extraction

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Add tryAutoSelectCalendar helper**

Add this function after `hideCalendarPicker()`:

```javascript
async function tryAutoSelectCalendar(events) {
  if (!googleAccount || !googleCalendars.length) return;
  const aliases = await getAliases();
  const matchedId = autoSelectCalendar(events, googleCalendars, aliases);
  if (matchedId) {
    selectedCalendarId = matchedId;
    const cal = googleCalendars.find(c => c.id === matchedId);
    if (cal) {
      document.getElementById('cal-picker-dot').style.background = cal.color;
      document.getElementById('cal-picker-name').textContent = cal.name;
      chrome.storage.local.set({ google_last_calendar: matchedId });
    }
  }
}
```

- [ ] **Step 2: Call tryAutoSelectCalendar after travel extraction**

In `runExtract()`, after `renderTravelCards(mergeFlights(allEvents));`, add:

```javascript
          tryAutoSelectCalendar(allEvents);
```

- [ ] **Step 3: Call tryAutoSelectCalendar after event detection**

In `runExtract()`, after `detectedEvents = allEvents;` and before `renderDetectedCards();`, add:

```javascript
          await tryAutoSelectCalendar(detectedEvents);
```

- [ ] **Step 4: Call tryAutoSelectCalendar after page scan**

In `runScan()`, after `detectedEvents = parsed.events || [];` and before `renderDetectedCards();`, add:

```javascript
          await tryAutoSelectCalendar(detectedEvents);
```

- [ ] **Step 5: Verify syntax**

```bash
node --check popup.js
```

Expected: no output

- [ ] **Step 6: Commit**

```bash
git add popup.js
git commit -m "feat: auto-select calendar after extraction using alias matching"
```

---

## Task 9: popup.js — Modify addToCalendar() for the API flow

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Replace addToCalendar() entirely**

Find the existing `addToCalendar()` function and replace it with:

```javascript
async function addToCalendar() {
  const btn = document.getElementById('add-cal-btn');
  if (btn) btn.disabled = true;

  const selectedEvents = detectedEvents
    .map((ev, i) => ({ ev, i }))
    .filter(({ i }) => document.getElementById('ck-' + i) && document.getElementById('ck-' + i).checked)
    .map(({ ev, i }) => ({
      title:   document.getElementById('et-' + i).value.trim() || ev.title,
      startISO: document.getElementById('es-' + i).value.trim() || ev.startISO,
      endISO:   document.getElementById('ee-' + i).value.trim() || ev.endISO,
      location: document.getElementById('el-' + i).value.trim() || ev.location || '',
      notes:    document.getElementById('en-' + i).value.trim() || ev.notes || '',
      sourceFileIdx: ev.sourceFileIdx
    }));

  // If not signed in or no files have a sourceFileIdx — use URL fallback
  const hasFileEvents = selectedEvents.some(ev => ev.sourceFileIdx !== undefined);
  if (!googleAccount || !hasFileEvents) {
    selectedEvents.forEach(ev => {
      chrome.tabs.create({ url: gcalUrl(ev.title, ev.startISO, ev.endISO, ev.location, ev.notes), active: false });
    });
    if (btn) btn.disabled = false;
    return;
  }

  setStatus('Uploading files...', 'loading');
  let token;
  try {
    token = await getAuthToken();
  } catch(e) {
    setStatus('', '');
    showResult('<div class="warn-box"><strong>Google connection lost</strong><br>Please sign out and reconnect Google to use file attachments, or <button class="text-btn" id="fallback-url-btn">add without attachment</button>.</div>');
    document.getElementById('fallback-url-btn').addEventListener('click', () => {
      selectedEvents.forEach(ev => {
        chrome.tabs.create({ url: gcalUrl(ev.title, ev.startISO, ev.endISO, ev.location, ev.notes), active: false });
      });
    });
    if (btn) btn.disabled = false;
    return;
  }

  // Upload each unique source file once
  const fileIdMap = {}; // sourceFileIdx -> fileId
  const uniqueIdxs = [...new Set(selectedEvents.filter(ev => ev.sourceFileIdx !== undefined).map(ev => ev.sourceFileIdx))];
  for (const idx of uniqueIdxs) {
    try {
      fileIdMap[idx] = await uploadToDrive(token, loadedFiles[idx]);
    } catch(e) {
      setStatus('', '');
      showDriveError(selectedEvents, token, e.message);
      if (btn) btn.disabled = false;
      return;
    }
  }

  setStatus('Creating events...', 'loading');
  try {
    for (const ev of selectedEvents) {
      const fileIds = (ev.sourceFileIdx !== undefined && fileIdMap[ev.sourceFileIdx])
        ? [fileIdMap[ev.sourceFileIdx]]
        : [];
      const created = await createCalendarEvent(token, selectedCalendarId, ev, fileIds);
      chrome.tabs.create({ url: created.htmlLink, active: false });
    }
    setStatus('', '');
  } catch(e) {
    setStatus('', '');
    showResult('<div class="error-box">Calendar error: ' + escHtml(e.message) + '</div>');
  }
  if (btn) btn.disabled = false;
}

function showDriveError(selectedEvents, token, message) {
  const html = '<div class="warn-box"><strong>File upload failed</strong><br>' + escHtml(message)
    + '<div style="display:flex;gap:8px;margin-top:10px">'
    + '<button class="select-btn" id="drive-retry-btn">Retry</button>'
    + '<button class="select-btn" id="drive-skip-btn">Add without attachment</button>'
    + '</div></div>';
  // Prepend above existing results
  const results = document.getElementById('results');
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  results.insertBefore(tmp.firstChild, results.firstChild);

  document.getElementById('drive-retry-btn').addEventListener('click', () => {
    results.querySelector('.warn-box').remove();
    addToCalendar();
  });
  document.getElementById('drive-skip-btn').addEventListener('click', () => {
    results.querySelector('.warn-box').remove();
    // Fall back to URL for all selected
    selectedEvents.forEach(ev => {
      chrome.tabs.create({ url: gcalUrl(ev.title, ev.startISO, ev.endISO, ev.location, ev.notes), active: false });
    });
  });
}
```

- [ ] **Step 2: Update updateAddBtn() to reflect calendar name when signed in**

Find `updateAddBtn()` and replace it with:

```javascript
function updateAddBtn() {
  const btn = document.getElementById('add-cal-btn');
  if (!btn) return;
  const n = detectedEvents.filter((_, i) => document.getElementById('ck-' + i) && document.getElementById('ck-' + i).checked).length;
  btn.disabled = n === 0;
  if (n === 0) {
    btn.textContent = 'No events selected';
  } else if (googleAccount && selectedCalendarId) {
    const cal = googleCalendars.find(c => c.id === selectedCalendarId);
    const calName = cal ? cal.name : 'Google Calendar';
    btn.textContent = (n === 1 ? 'Add 1 event' : 'Add ' + n + ' events') + ' → ' + calName;
  } else {
    btn.textContent = n === 1 ? 'Add 1 event to Google Calendar' : 'Add ' + n + ' events to Google Calendar';
  }
}
```

- [ ] **Step 3: Verify syntax**

```bash
node --check popup.js
```

Expected: no output

- [ ] **Step 4: Manual test**

Reload the extension. Sign in with Google. Drop a PDF, extract events, select one, click Add. Verify:
- A new GCal tab opens showing the created event
- The event has the PDF listed in its attachment panel
- The tab shows the correct calendar (the one selected in the picker)

Also test unsigned: sign out, extract events, click Add — verify it still opens GCal pre-filled via URL.

- [ ] **Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: API-based event creation with Drive attachment and URL fallback in addToCalendar"
```

---

## Task 10: popup.js — Update renderTravelCards() for the API flow

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Replace the `<a>` cal-btn with a `<button>` in renderTravelCards()**

In `renderTravelCards()`, find this line:

```javascript
      + '<a class="cal-btn" href="' + gcalUrl(ev.title, s, e2, ev.location, details) + '" target="_blank">' + calSVG + ' Add to Google Calendar</a>'
```

Replace with:

```javascript
      + '<button class="cal-btn travel-cal-btn" data-i="' + i + '">' + calSVG + ' Add to Google Calendar</button>'
```

(Note: `ev` is the loop variable and `i` is the index — make sure `forEach(ev => {` becomes `forEach((ev, i) => {` if it wasn't already.)

- [ ] **Step 2: Wire up travel card button clicks after the html is rendered**

In `renderTravelCards()`, after `showResult(html);`, add:

```javascript
  document.querySelectorAll('.travel-cal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.getAttribute('data-i'));
      const ev = events[idx]; // events is the parameter passed to renderTravelCards
      await addTravelEventToCalendar(ev);
    });
  });
```

- [ ] **Step 3: Add addTravelEventToCalendar()**

Add this function after `renderTravelCards()`:

```javascript
async function addTravelEventToCalendar(ev) {
  const s = ev.startISO, e2 = ev.endISO;
  const details = buildTravelDetails(ev);

  // If not signed in or no source file — URL fallback
  if (!googleAccount || ev.sourceFileIdx === undefined) {
    chrome.tabs.create({ url: gcalUrl(ev.title, s, e2, ev.location, details), active: false });
    return;
  }

  setStatus('Uploading file...', 'loading');
  let token;
  try {
    token = await getAuthToken();
  } catch(e) {
    setStatus('', '');
    chrome.tabs.create({ url: gcalUrl(ev.title, s, e2, ev.location, details), active: false });
    return;
  }

  let fileId;
  try {
    fileId = await uploadToDrive(token, loadedFiles[ev.sourceFileIdx]);
  } catch(e) {
    setStatus('', '');
    // Show inline retry/skip on the specific card
    const btn = document.querySelector('[data-i="' + ev.sourceFileIdx + '"].travel-cal-btn');
    if (btn) {
      const wrap = document.createElement('div');
      wrap.className = 'warn-box';
      wrap.style.marginTop = '6px';
      wrap.innerHTML = 'Upload failed. <button class="text-btn" id="tv-retry">Retry</button> or <button class="text-btn" id="tv-skip">add without attachment</button>';
      btn.parentNode.insertBefore(wrap, btn.nextSibling);
      document.getElementById('tv-retry').addEventListener('click', () => { wrap.remove(); addTravelEventToCalendar(ev); });
      document.getElementById('tv-skip').addEventListener('click', () => { wrap.remove(); chrome.tabs.create({ url: gcalUrl(ev.title, s, e2, ev.location, details), active: false }); });
    }
    return;
  }

  setStatus('Creating event...', 'loading');
  try {
    const created = await createCalendarEvent(token, selectedCalendarId, {
      title: ev.title, startISO: s, endISO: e2, location: ev.location || '', notes: details
    }, [fileId]);
    setStatus('', '');
    chrome.tabs.create({ url: created.htmlLink, active: false });
  } catch(e) {
    setStatus('', '');
    showResult('<div class="error-box">Calendar error: ' + escHtml(e.message) + '</div>');
  }
}
```

- [ ] **Step 4: Verify syntax**

```bash
node --check popup.js
```

Expected: no output

- [ ] **Step 5: Manual test**

Drop a flight PDF, extract. Confirm the Add to Google Calendar button is still present per card. When signed in, click one — verify the event is created in GCal with the PDF attached. When signed out, click one — verify it opens the URL-based GCal form.

- [ ] **Step 6: Commit**

```bash
git add popup.js
git commit -m "feat: travel cards use Calendar API with Drive attachment when signed in"
```

---

## Task 11: popup.js — Settings panel (alias management UI)

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Add settings panel open/close logic in DOMContentLoaded**

Inside the `DOMContentLoaded` listener, add:

```javascript
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-back-btn').addEventListener('click', closeSettings);
```

- [ ] **Step 2: Add openSettings(), closeSettings(), and renderSettingsBody()**

Add these functions after `hideCalendarPicker()`:

```javascript
// ─── Settings panel ───────────────────────────────────────────────────────────

function openSettings() {
  document.getElementById('settings-panel').style.display = 'flex';
  renderSettingsBody();
}

function closeSettings() {
  document.getElementById('settings-panel').style.display = 'none';
}

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

function wireAliasEvents(aliases) {
  // Remove alias
  document.querySelectorAll('.alias-tag-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      const calId = btn.getAttribute('data-cal');
      const idx = parseInt(btn.getAttribute('data-i'));
      const current = { ...aliases };
      current[calId] = (current[calId] || []).filter((_, i) => i !== idx);
      await saveAliases(current);
      Object.assign(aliases, current);
      const cal = googleCalendars.find(c => c.id === calId);
      document.getElementById('alias-card-' + calId).outerHTML = renderAliasCard(cal, current[calId]);
      wireAliasEvents(current);
    });
  });

  // Show add input
  document.querySelectorAll('.alias-add-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const calId = btn.getAttribute('data-cal');
      document.getElementById('alias-input-row-' + calId).style.display = 'flex';
      document.getElementById('alias-input-' + calId).focus();
      btn.style.display = 'none';
    });
  });

  // Confirm add
  document.querySelectorAll('.alias-confirm-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmAddAlias(btn.getAttribute('data-cal'), aliases));
  });
  document.querySelectorAll('.alias-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmAddAlias(input.id.replace('alias-input-', ''), aliases);
    });
  });
}

async function confirmAddAlias(calId, aliases) {
  const input = document.getElementById('alias-input-' + calId);
  const value = input.value.trim();
  if (!value) return;
  const current = { ...aliases };
  current[calId] = [...(current[calId] || []), value];
  await saveAliases(current);
  Object.assign(aliases, current);
  const cal = googleCalendars.find(c => c.id === calId);
  document.getElementById('alias-card-' + calId).outerHTML = renderAliasCard(cal, current[calId]);
  wireAliasEvents(current);
}
```

- [ ] **Step 3: Verify syntax**

```bash
node --check popup.js
```

Expected: no output

- [ ] **Step 4: Manual test**

Sign in. Click gear icon — settings panel opens. Confirm your calendars are listed. Click `+ add` on one, type a nickname, press Enter — pill appears. Click × on a pill — it disappears. Click Back — main view returns.

- [ ] **Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: settings panel with alias management UI"
```

---

## Task 12: Self-review and final syntax check

- [ ] **Step 1: Run full syntax check on all modified files**

```bash
node --check popup.js && node --check google-api.js && node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest OK')"
```

Expected: `manifest OK` with no other errors

- [ ] **Step 2: Verify google-api.js is loaded before popup.js in popup.html**

```bash
node -e "
const html = require('fs').readFileSync('popup.html','utf8');
const gIdx = html.indexOf('google-api.js');
const pIdx = html.indexOf('popup.js');
console.assert(gIdx < pIdx && gIdx !== -1, 'google-api.js must appear before popup.js');
console.log('Script order: OK');
"
```

Expected: `Script order: OK`

- [ ] **Step 3: End-to-end manual test checklist**

Run through each scenario in Chrome:

```
Signed out:
  [ ] Drop a PDF → extract → Add events → GCal URL opens in new tab (old behavior)
  [ ] Scan page → detect events → Add events → GCal URL opens in new tab (old behavior)

Signed in, no file:
  [ ] Scan page → detect events → Add events → GCal URL opens in new tab (fallback)

Signed in, with PDF:
  [ ] Drop PDF → extract travel events → calendar picker shows → Add to Google Calendar
      → event created in GCal with PDF in attachment panel → GCal tab opens showing event
  [ ] Auto-select test: set alias "Kevin" → Cal Kevin Jonas → drop Kevin's PDF
      → calendar picker auto-selects Kevin Jonas

Settings:
  [ ] Open settings (gear) → see calendar list
  [ ] Add alias → appears as pill
  [ ] Delete alias → pill removed
  [ ] Back button returns to main view

Error cases:
  [ ] Sign out mid-session → click Connect Google → re-auth works
  [ ] If Drive upload fails → Retry and Add without attachment options appear
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Google integration — OAuth, Drive attachments, Calendar API, alias auto-select"
```
