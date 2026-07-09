# Background Parsing + Timezone Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extraction survives the popup closing (background parsing + full state restore), and detected-event cards get a timezone dropdown with wall-clock semantics.

**Architecture:** A new shared file `extraction.js` holds the prompts and Gemini logic, loaded by both the popup page and the background service worker. Extraction runs in the background worker; all popup state lives in a single `chrome.storage.session` key `pluck_state` that the popup restores on open and watches via `chrome.storage.onChanged`. Timezone: detected events send wall-clock `dateTime` (no offset) + IANA `timeZone` to the Calendar API.

**Tech Stack:** Chrome Extension MV3, vanilla JS, no build step, no test framework (verification = `node --check` + one-off Node scripts + manual popup checks).

**Spec:** `docs/superpowers/specs/2026-07-09-background-parsing-and-timezone-picker-design.md`

## Global Constraints

- No inline `onclick` handlers in HTML — wire all events with `addEventListener`.
- API key lives in `chrome.storage.local` (`gemini_api_key`), never `localStorage`.
- No `<form>` tags in popup.html.
- No template literals containing unescaped apostrophes inside single-quoted strings.
- User-facing strings: plain English, no AI model names, no HTTP status codes, no jargon; lead with what the user should do.
- After ANY JS change run `node --check <file>` on every touched file.
- One-off test scripts go in the session scratchpad, NOT the repo (repo has no tests folder and the packaging script zips the extension folder).
- Timezone dropdown zones (exact list, exact order): Eastern=America/New_York (default), Central=America/Chicago, Mountain=America/Denver, Pacific=America/Los_Angeles, Alaska=America/Anchorage, Hawaii=Pacific/Honolulu, London=Europe/London.
- `docs/CALENDAR_EVENT_FORMAT.md` is a downstream contract (a friend's day-sheet app parses Pluck events) — titles/descriptions/locations must not change format; timezone payload changes must be documented there.
- Version stays 1.6 (already bumped in the working tree).

---

### Task 1: Commit the working-tree changes as two clean commits

The working tree already contains (a) the Gmail-attachment base64 padding bug fix and (b) timezone-extraction groundwork. Commit them before feature work so later tasks diff cleanly.

**Files:**
- No edits. Commits only: `background.js` (fix), then `popup.js`, `google-api.js`, `manifest.json` (groundwork).

**Interfaces:**
- Produces: clean git baseline; `TRAVEL_PROMPT` already emits `startTimeZone`/`endTimeZone`, `DETECT_PROMPT` already emits `timeZone`, `createCalendarEvent` already forwards `eventData.startTimeZone`/`endTimeZone` into `event.start.timeZone`/`event.end.timeZone`.

- [ ] **Step 1: Verify current diff is only the expected files**

Run: `git status --porcelain`
Expected: modified `background.js`, `google-api.js`, `manifest.json`, `popup.js`; untracked `docs/CALENDAR_EVENT_FORMAT.md`, `docs/superpowers/plans/2026-04-21-all-day-event-toggle.md`, and this plan file.

- [ ] **Step 2: Syntax-check and run the padding proof test**

Run: `node --check background.js && node --check popup.js && node --check google-api.js`
Expected: no output (success).

- [ ] **Step 3: Commit the bug fix**

```bash
git add background.js
git commit -m "fix: restore base64 padding on Gmail attachments so Drive uploads succeed

Gmail's API returns attachment data as base64url with '=' padding
stripped. The Drive multipart upload parser rejects unpadded base64,
so every 'Send to Pluck' file whose size left the string unpadded
failed with 'Upload failed'. Dragged-in files were unaffected
(FileReader emits padded base64).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Commit the timezone groundwork + error surfacing + doc**

```bash
git add popup.js google-api.js manifest.json docs/CALENDAR_EVENT_FORMAT.md docs/superpowers/plans/2026-04-21-all-day-event-toggle.md
git commit -m "feat: extract IANA timezones from documents; surface Drive upload errors

Groundwork for the timezone picker: TRAVEL_PROMPT emits
startTimeZone/endTimeZone, DETECT_PROMPT emits timeZone, and
createCalendarEvent forwards named zones to the Calendar API.
Travel-card upload failures now show the underlying reason.
Adds the calendar event format contract doc. Bump to 1.6.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Verify clean tree**

Run: `git status --porcelain`
Expected: only this plan file (and nothing else) remains untracked/modified.

---

### Task 2: Create `extraction.js` — shared prompts, Gemini client, and `wallTimeToUTC`

Move extraction logic out of popup.js into a file both contexts load. Everything stays plain global-scope script (no modules — the background worker uses `importScripts`).

**Files:**
- Create: `extraction.js`
- Modify: `popup.js` (delete moved code), `popup.html` (script tag)

**Interfaces:**
- Produces (globals defined by `extraction.js`, relied on by every later task):
  - `TODAY` (string `YYYY-MM-DD`), `TRAVEL_PROMPT` (string), `DETECT_PROMPT` (string)
  - `callGemini(apiKey, parts, onRetry, onFallback) -> Promise<parsedJSON>`
  - `checkMismatches(events) -> Array|null`
  - `mergeFlights(events) -> Array`
  - `extractFromFiles(files, apiKey, onStatus, onRetry, onFallback) -> Promise<{mode: 'travel'|'detect', events: Array}>`
  - `wallTimeToUTC(dateTimeStr, ianaZone) -> Date`
- Consumes: nothing from other tasks.

- [ ] **Step 1: Create `extraction.js`**

Move these VERBATIM from popup.js (current locations noted; cut from popup.js, paste into extraction.js — do not retype):
- `const TODAY = ...` (popup.js line 11)
- `const TRAVEL_PROMPT = ...` (line 14)
- `const DETECT_PROMPT = ...` (lines 16-45)
- `async function callGemini(...)` (lines 722-765)
- `function checkMismatches(...)` (lines 768-783)
- `function mergeFlights(...)` (lines 785-804)

File skeleton with the two NEW functions (add these exactly; the moved code goes where marked):

```js
'use strict';
// Shared extraction logic — loaded by popup.html via <script> and by
// background.js via importScripts(). Plain global scope, no chrome.* APIs
// (so it can also run under Node for one-off tests).

// [PASTE: TODAY, TRAVEL_PROMPT, DETECT_PROMPT here]

// [PASTE: callGemini here]

// [PASTE: checkMismatches, mergeFlights here]

// Routes files to travel or detect extraction. Mirrors the original
// runExtract() routing: travel-only batches use TRAVEL_PROMPT per file,
// anything else runs everything through DETECT_PROMPT.
async function extractFromFiles(files, apiKey, onStatus, onRetry, onFallback) {
  const travelFiles = files.filter(f => f.kind === 'travel');
  const eventFiles  = files.filter(f => f.kind === 'image' || f.kind === 'text' || f.kind === 'event');
  const hasTravelOnly = travelFiles.length > 0 && eventFiles.length === 0;

  const allEvents = [];
  if (hasTravelOnly) {
    if (onStatus) onStatus('Extracting travel events...');
    for (const f of travelFiles) {
      const fIdx = files.indexOf(f);
      const parsed = await callGemini(apiKey, [
        { inline_data: { mime_type: f.mimeType, data: f.base64 } },
        { text: TRAVEL_PROMPT }
      ], onRetry, onFallback);
      (parsed.events || []).forEach(ev => allEvents.push({ ...ev, sourceFileIdx: fIdx }));
    }
    return { mode: 'travel', events: allEvents };
  }

  if (onStatus) onStatus('Detecting events...');
  for (const f of [...travelFiles, ...eventFiles]) {
    const fIdx = f.kind !== 'text' ? files.indexOf(f) : undefined;
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
    const parsed = await callGemini(apiKey, parts, onRetry, onFallback);
    (parsed.events || []).forEach(ev =>
      allEvents.push(fIdx !== undefined ? { ...ev, sourceFileIdx: fIdx } : ev)
    );
  }
  return { mode: 'detect', events: allEvents };
}

// Converts a wall-clock time in a named zone to the real UTC instant,
// DST-correct for the specific date. Input 'YYYY-MM-DDTHH:MM[:SS]' with
// NO offset. Strings with an offset (or unparseable) fall back to new Date().
function _zoneWallClock(utcMs, ianaZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const p = {};
  fmt.formatToParts(new Date(utcMs)).forEach(x => { p[x.type] = x.value; });
  return Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
}

function wallTimeToUTC(dateTimeStr, ianaZone) {
  const m = String(dateTimeStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || !ianaZone) return new Date(dateTimeStr);
  const desired = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  let utc = desired;
  // Two passes converge across DST transitions
  for (let i = 0; i < 2; i++) utc += desired - _zoneWallClock(utc, ianaZone);
  return new Date(utc);
}
```

- [ ] **Step 2: Delete the moved code from popup.js**

Remove from popup.js: the `TODAY` const, `TRAVEL_PROMPT`, `DETECT_PROMPT`, `callGemini`, `checkMismatches`, `mergeFlights` (including the `// ─── Prompts ───` and `// ─── Gemini ───` section comment lines that precede them). Leave `buildTravelDetails`, `gcalUrl`, and everything else.

- [ ] **Step 3: Load extraction.js in popup.html**

In `popup.html`, find the script tags at the bottom (google-api.js and popup.js). Add extraction.js FIRST:

```html
<script src="extraction.js"></script>
<script src="google-api.js"></script>
<script src="popup.js"></script>
```

(If the existing order differs, keep it — just ensure extraction.js comes before popup.js.)

- [ ] **Step 4: Write and run the one-off Node test**

Write to `<scratchpad>/test-extraction.js` (scratchpad path is in your environment info):

```js
'use strict';
const fs = require('fs');
const assert = require('assert');
// extension root: adjust if running from elsewhere
const src = fs.readFileSync(process.argv[2] || 'extraction.js', 'utf8');
(0, eval)(src + '\n;globalThis.__x = { extractFromFiles, wallTimeToUTC, TRAVEL_PROMPT, DETECT_PROMPT, callGemini, mergeFlights, checkMismatches };');
const x = globalThis.__x;

// All globals exist
for (const k of Object.keys(x)) assert.ok(x[k], k + ' missing');

// wallTimeToUTC: DST-correct across seasons and zones
const cases = [
  ['2026-01-15T15:00:00', 'America/New_York',    '2026-01-15T20:00:00.000Z'], // EST -5
  ['2026-07-15T15:00:00', 'America/New_York',    '2026-07-15T19:00:00.000Z'], // EDT -4
  ['2026-01-15T15:00:00', 'Europe/London',       '2026-01-15T15:00:00.000Z'], // GMT
  ['2026-07-15T15:00:00', 'Europe/London',       '2026-07-15T14:00:00.000Z'], // BST +1
  ['2026-07-15T15:00:00', 'Pacific/Honolulu',    '2026-07-16T01:00:00.000Z'], // HST -10, no DST
  ['2026-01-15T15:00:00', 'America/Los_Angeles', '2026-01-15T23:00:00.000Z'], // PST -8
  ['2026-07-15T15:00', 'America/Chicago',        '2026-07-15T20:00:00.000Z'], // CDT -5, no seconds
];
for (const [wall, zone, expect] of cases) {
  const got = x.wallTimeToUTC(wall, zone).toISOString();
  assert.strictEqual(got, expect, wall + ' ' + zone + ' -> ' + got + ' (wanted ' + expect + ')');
}
// Offset-bearing strings pass through untouched
assert.strictEqual(x.wallTimeToUTC('2026-07-15T15:00:00-04:00', 'America/Chicago').toISOString(), '2026-07-15T19:00:00.000Z');

// extractFromFiles routing (stub callGemini via fetch override is overkill —
// verify routing by checking which prompt reaches a stubbed callGemini)
(async () => {
  const calls = [];
  const stubbed = src.replace(/async function callGemini[\s\S]*?\n}\n/, '');
  (0, eval)(stubbed + '\n;globalThis.__r = extractFromFiles;');
  globalThis.callGemini = async (key, parts) => { calls.push(parts); return { events: [{ title: 'stub' }] }; };
  const travel = await globalThis.__r([{ kind: 'travel', mimeType: 'application/pdf', base64: 'AA==' }], 'k');
  assert.strictEqual(travel.mode, 'travel');
  assert.strictEqual(travel.events[0].sourceFileIdx, 0);
  const mixed = await globalThis.__r([
    { kind: 'travel', mimeType: 'application/pdf', base64: 'AA==' },
    { kind: 'text', text: 'dinner at 7' }
  ], 'k');
  assert.strictEqual(mixed.mode, 'detect');
  assert.strictEqual(mixed.events.length, 2);
  console.log('ALL EXTRACTION TESTS PASS');
})().catch(e => { console.error(e); process.exit(1); });
```

Run from the extension root: `node <scratchpad>/test-extraction.js extraction.js`
Expected: `ALL EXTRACTION TESTS PASS`

- [ ] **Step 5: Syntax-check everything**

Run: `node --check extraction.js && node --check popup.js`
Expected: success. (popup.js still references `callGemini`, `TODAY`, etc. — that's fine, they're globals from extraction.js at runtime.)

- [ ] **Step 6: Commit**

```bash
git add extraction.js popup.js popup.html
git commit -m "refactor: move prompts and Gemini client to shared extraction.js

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Background worker runs extraction and owns `pluck_state` results

**Files:**
- Modify: `background.js`

**Interfaces:**
- Consumes: `extractFromFiles`, `checkMismatches`, `mergeFlights` from extraction.js (Task 2).
- Produces: message `{type:'RUN_EXTRACT'}` handler; `pluck_state` session-storage shape all popup tasks rely on:

```js
{
  loadedFiles: [...],          // written by popup (Task 4)
  phase: 'extracting'|'done'|'error',
  statusText: '...',           // live progress line
  mode: 'travel'|'detect',
  travelEvents: [...],         // merged; only when mode 'travel' and no mismatches
  mismatches: [...] | null,    // travel-only conflict list
  detectedEvents: [...],       // only when mode 'detect'
  usedFallback: false,
  error: null | 'message',
  updatedAt: 1234567890
}
```

- [ ] **Step 1: Add importScripts and the state patch helper**

At the top of `background.js`, directly under `'use strict';`:

```js
importScripts('extraction.js');
```

Add near the other helpers (e.g. after `_getToken`):

```js
async function _patchPluckState(patch) {
  const r = await chrome.storage.session.get('pluck_state');
  const state = r.pluck_state || {};
  Object.assign(state, patch, { updatedAt: Date.now() });
  try {
    await chrome.storage.session.set({ pluck_state: state });
  } catch (e) {
    // Storage quota exceeded (huge batch) — popup falls back to in-memory state
    console.error('pluck_state save failed:', e);
  }
  return state;
}
```

- [ ] **Step 2: Add the RUN_EXTRACT message branch**

Inside the existing `chrome.runtime.onMessage.addListener` (after the `FETCH_GMAIL_BODY` branch):

```js
  if (msg.type === 'RUN_EXTRACT') {
    _runBackgroundExtract();   // results flow through pluck_state, not the response
    sendResponse({ ok: true });
    return false;
  }
```

- [ ] **Step 3: Add the extraction runner**

Add after `_fetchGmailBody` (reuses the keep-alive pattern from `_fetchGmailAttachments`):

```js
async function _runBackgroundExtract() {
  // Keep service worker alive during long Gemini calls (MV3 idles out after ~30s)
  const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
  try {
    const r = await chrome.storage.session.get('pluck_state');
    const files = (r.pluck_state && r.pluck_state.loadedFiles) || [];
    const k = await chrome.storage.local.get('gemini_api_key');
    if (!files.length) throw new Error('Please add at least one file.');
    if (!k.gemini_api_key) throw new Error('Please save your Gemini API key first.');

    let usedFallback = false;
    const onStatus = (text) => { _patchPluckState({ statusText: text }); };
    const onRetry = (attempt, total) => {
      _patchPluckState({ statusText: 'Busy — retrying (' + attempt + ' of ' + total + ')...' });
    };
    const result = await extractFromFiles(files, k.gemini_api_key, onStatus, onRetry, () => { usedFallback = true; });

    const patch = { phase: 'done', mode: result.mode, usedFallback, statusText: '', error: null,
                    travelEvents: null, detectedEvents: null, mismatches: null };
    if (result.mode === 'travel') {
      patch.mismatches = checkMismatches(result.events);
      if (!patch.mismatches) patch.travelEvents = mergeFlights(result.events);
    } else {
      patch.detectedEvents = result.events;
    }
    await _patchPluckState(patch);
  } catch (e) {
    await _patchPluckState({ phase: 'error', error: e.message, statusText: '' });
  } finally {
    clearInterval(keepAlive);
    // Badge tells the user results (or an error) are waiting if the popup is closed.
    // The popup clears it when it renders them.
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#D4A830' });
  }
}
```

- [ ] **Step 4: Syntax check**

Run: `node --check background.js`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add background.js
git commit -m "feat: run extraction in the background worker via pluck_state

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Popup delegates extraction to background and persists state

**Files:**
- Modify: `popup.js`

**Interfaces:**
- Consumes: `RUN_EXTRACT` message + `pluck_state` shape (Task 3).
- Produces: popup globals `travelEvents` (array) and helpers `patchPluckState(patch)`, `clearPluckState()`, `renderStoredResults(state)` used by Tasks 5-6.

- [ ] **Step 1: Add globals and state helpers**

At the top of popup.js, after `let autoExtractDebounce = null;`:

```js
let travelEvents = [];    // merged travel events (restored or from background)
let currentPhase = 'idle'; // guards storage.onChanged re-render loops
```

Add these functions near `_pickUpPendingGmailFiles`:

```js
async function patchPluckState(patch) {
  const r = await new Promise(res => chrome.storage.session.get('pluck_state', res));
  const state = r.pluck_state || {};
  Object.assign(state, patch, { updatedAt: Date.now() });
  try {
    await new Promise(res => chrome.storage.session.set({ pluck_state: state }, res));
  } catch (e) { /* quota exceeded — keep working in memory only */ }
}

function clearPluckState() {
  currentPhase = 'idle';
  chrome.storage.session.remove('pluck_state');
}
```

- [ ] **Step 2: Rewrite `runExtract` to delegate**

Replace the ENTIRE body of `runExtract` (popup.js line 546) with:

```js
async function runExtract() {
  if (!loadedFiles.length) { setStatus('Please add at least one file.', 'error'); return; }
  const r = await new Promise(res => chrome.storage.local.get('gemini_api_key', res));
  if (!r.gemini_api_key) { setStatus('Please save your Gemini API key first.', 'error'); return; }

  document.getElementById('extract-btn').disabled = true;
  clearResults();
  currentPhase = 'extracting';
  await patchPluckState({
    loadedFiles: loadedFiles, phase: 'extracting', statusText: 'Reading your files...',
    mode: null, travelEvents: null, detectedEvents: null, mismatches: null,
    usedFallback: false, error: null
  });
  chrome.runtime.sendMessage({ type: 'RUN_EXTRACT' }, () => { void chrome.runtime.lastError; });
  setStatus('Reading your files...', 'loading');
}
```

Note: the mismatch warn-box, travel render, detect render, and fallback banner now happen in `renderStoredResults` (Step 4) driven by storage changes — the old inline logic is gone. The `retryStatus` function (line 1330) and `markFallback` are no longer called from `runExtract`; leave `retryStatus` in place (still referenced nowhere else after this change — delete it if `grep -n retryStatus popup.js` shows no remaining callers).

- [ ] **Step 3: Convert `runScan`'s Gemini call into the shared flow**

In `runScan`, replace the block from `setStatus('Detecting events...', 'loading');` through `if (usedFallback) showFallbackBanner();` (currently lines 702-712) with:

```js
      // Hand the page text to the shared background extraction flow
      const scanEntry = {
        name: 'Scanned: ' + (tab.title || 'page').slice(0, 60),
        base64: null, mimeType: 'text/plain', kind: 'text',
        text: 'Page: ' + url + '\nTitle: ' + tab.title + '\n\n' + pageText
      };
      loadedFiles.push(scanEntry);
      renderFileList();
      document.getElementById('extract-btn').disabled = false;
      await runExtract();
```

(The existing `catch`/`showErrorWithRetry(e.message, runScan)` and the `scan-btn` re-enable line stay.)

- [ ] **Step 4: Add `renderStoredResults` + the storage watcher**

Add near `renderDetectedCards`:

```js
function renderStoredResults(st) {
  setStatus('', '');
  document.getElementById('extract-btn').disabled = false;
  chrome.action.setBadgeText({ text: '' });
  if (st.phase === 'error') {
    showErrorWithRetry(st.error || 'Something went wrong. Please try again.', runExtract);
    return;
  }
  if (st.mode === 'travel') {
    if (st.mismatches) {
      let html = '<div class="warn-box"><strong>⚠ PDFs appear to be for different flights</strong>';
      st.mismatches.forEach(m => { html += escHtml(m.field) + ': ' + escHtml(m.a) + ' vs ' + escHtml(m.b) + '<br>'; });
      showResult(html + '</div>');
      return;
    }
    travelEvents = st.travelEvents || [];
    renderTravelCards(travelEvents);
    tryAutoSelectCalendar(travelEvents);
    collapseDropZone('files');
  } else {
    detectedEvents = st.detectedEvents || [];
    tryAutoSelectCalendar(detectedEvents);
    renderDetectedCards();
    collapseDropZone('files');
  }
  if (st.usedFallback) showFallbackBanner();
}
```

In `DOMContentLoaded`, add:

```js
  // Live updates while extraction runs in the background worker
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'session' || !changes.pluck_state) return;
    const st = changes.pluck_state.newValue;
    if (!st) { currentPhase = 'idle'; return; }
    if (st.phase === 'extracting') {
      currentPhase = 'extracting';
      setStatus(st.statusText || 'Working...', 'loading');
      return;
    }
    // Only render on the transition out of 'extracting' — edits we save
    // ourselves also fire this listener and must not re-render.
    if ((st.phase === 'done' || st.phase === 'error') && currentPhase === 'extracting') {
      currentPhase = st.phase;
      renderStoredResults(st);
    }
  });
```

- [ ] **Step 5: Clear state when files are cleared**

In `DOMContentLoaded`, change the change-files handler (line 63) to:

```js
  document.getElementById('change-files-link').addEventListener('click', () => { expandDropZone(); clearResults(); clearPluckState(); });
```

In `removeFile(idx)` (line 447), inside the existing `if (!loadedFiles.length) {` branch, add `clearPluckState();` as the first line. Also, at the end of `removeFile` for the non-empty case, add `patchPluckState({ loadedFiles: loadedFiles });` so removals persist.

In `loadFile()` — find where the file entry is pushed (`loadedFiles.push(entry);`, line 413) and add `patchPluckState({ loadedFiles: loadedFiles });` on the next line. Do the same after the pasted-text push (line 496) and at the end of `loadGmailFiles` (after `renderFileList();`, line 528).

- [ ] **Step 6: Syntax check and manual smoke test**

Run: `node --check popup.js`
Expected: success.

Manual (requires Chrome): reload extension, drop a PDF → status shows "Extracting travel events..." → close popup mid-parse → icon badge "!" appears when done → reopen → results render, badge cleared. ALSO verify "Scan this page" on a restaurant-confirmation web page produces cards via the new flow.

- [ ] **Step 7: Commit**

```bash
git add popup.js
git commit -m "feat: popup delegates extraction to background and survives closing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Popup restores full state on open

**Files:**
- Modify: `popup.js`

**Interfaces:**
- Consumes: `pluck_state` shape (Task 3), `renderStoredResults` + `patchPluckState` (Task 4).
- Produces: `restorePluckState()` called from `DOMContentLoaded`.

- [ ] **Step 1: Add `restorePluckState`**

Add next to `renderStoredResults`:

```js
async function restorePluckState() {
  const r = await new Promise(res => chrome.storage.session.get('pluck_state', res));
  const st = r.pluck_state;
  if (!st || !st.loadedFiles || !st.loadedFiles.length) return false;
  loadedFiles = st.loadedFiles;
  renderFileList();
  document.getElementById('extract-btn').disabled = false;
  currentPhase = st.phase || 'idle';
  if (st.phase === 'extracting') {
    // Background may have died mid-run (Chrome restarted). If the state is
    // stale (>10 min), offer retry instead of spinning forever.
    if (Date.now() - (st.updatedAt || 0) > 10 * 60 * 1000) {
      showErrorWithRetry('That took too long. Please try again.', runExtract);
    } else {
      setStatus(st.statusText || 'Working...', 'loading');
    }
  } else if (st.phase === 'done' || st.phase === 'error') {
    renderStoredResults(st);
  }
  return true;
}
```

- [ ] **Step 2: Call it during init**

In `DOMContentLoaded`, inside the `chrome.storage.local.get(['google_account', ...])` callback (lines 124-135), replace the bare `_pickUpPendingGmailFiles();` with:

```js
    // Restore any in-flight or finished session, then pick up Gmail files
    await restorePluckState();
    _pickUpPendingGmailFiles();
```

(The enclosing callback is already `async`.)

- [ ] **Step 3: Syntax check + manual test**

Run: `node --check popup.js`
Manual: extract a PDF → close popup → reopen: results still there. Close Chrome-quit is NOT expected to survive (session storage clears) — that's by design.

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: restore files, results, and progress when popup reopens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Persist inline edits, checkboxes, and all-day toggles

Strategy: user edits write back into the `detectedEvents[i]` / `travelEvents[i]` objects (new underscore-prefixed fields for UI state), which are then saved to `pluck_state`. The renderers read those fields, so a restore automatically re-renders edits.

**Files:**
- Modify: `popup.js`

**Interfaces:**
- Consumes: `patchPluckState`, globals `detectedEvents`/`travelEvents`.
- Produces: event-object fields later tasks and renders rely on: `ev._selected` (bool, default true), `ev._allDay` (bool), `ev._editedNotes` (string, travel cards only). Also hoists `parseISOParts(iso) -> {date,time,tz}` to file scope (Task 8 uses it).

- [ ] **Step 1: Hoist the ISO parser**

`renderTravelCards` and `renderDetectedCards` each define a private `_parseISO`. Delete both inner copies and add ONE file-scope function above `renderTravelCards`:

```js
function parseISOParts(iso) {
  if (!iso) return { date: '', time: '', tz: '' };
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?(.*)$/);
  if (!m) return { date: '', time: '', tz: '' };
  return { date: m[1], time: m[2], tz: m[3] || '' };
}
```

Update every `_parseISO(` call inside both renderers to `parseISOParts(`. (`_buildISO` and `_buildDateOnlyISO` stay where they are.)

- [ ] **Step 2: Render from persisted UI state**

In `renderDetectedCards` (line 1073 area), the card HTML currently hard-codes `checked` on the checkbox and `selected` on the card div. Change to honor `ev._selected` (default true) and `ev._allDay`:

```js
    const isSel = ev._selected !== false;
    const isAllDay = ev._allDay === true;
    html += '<div class="detected-card' + (isSel ? ' selected' : '') + '" id="dc-' + i + '"' + (isAllDay ? ' data-allday="1"' : '') + '>'
      + '<div class="detected-card-header" data-i="' + i + '">'
      + '<input type="checkbox" class="detect-checkbox" id="ck-' + i + '"' + (isSel ? ' checked' : '') + ' data-i="' + i + '">'
```

and the all-day checkbox line becomes:

```js
      + '<div class="allday-row"><input type="checkbox" class="allday-cb" id="eallday-' + i + '"' + (isAllDay ? ' checked' : '') + ' data-i="' + i + '">'
```

In `renderTravelCards`, the notes textarea prefill (line 879 `const notesPrefill = buildTravelDetails(ev);`) becomes:

```js
    const notesPrefill = (ev._editedNotes !== undefined) ? ev._editedNotes : buildTravelDetails(ev);
```

- [ ] **Step 3: Delegated edit listener**

In `DOMContentLoaded`, add:

```js
  // Persist inline edits so they survive the popup closing
  const resultsEl = document.getElementById('results');
  let editSaveDebounce = null;
  const persistEdits = () => {
    clearTimeout(editSaveDebounce);
    editSaveDebounce = setTimeout(() => {
      patchPluckState({ detectedEvents: detectedEvents, travelEvents: travelEvents });
    }, 300);
  };
  const applyEdit = (target) => {
    const m = (target.id || '').match(/^(et|esd|est|eet|eed|el|en|etz|eallday|ck|tvt|tvsd|tvst|tvet|tved|tvl|tvn)-(\d+)$/);
    if (!m) return;
    const p = m[1], i = +m[2];
    const dEv = detectedEvents[i], tEv = travelEvents[i];
    if (p === 'et' && dEv) dEv.title = target.value;
    else if (p === 'el' && dEv) dEv.location = target.value;
    else if (p === 'en' && dEv) dEv.notes = target.value;
    else if (p === 'ck' && dEv) dEv._selected = target.checked;
    else if (p === 'eallday' && dEv) dEv._allDay = target.checked;
    else if ((p === 'esd' || p === 'est' || p === 'eet' || p === 'eed') && dEv) {
      const sp = parseISOParts(dEv.startISO), ep = parseISOParts(dEv.endISO);
      const date = (document.getElementById('esd-' + i) || {}).value || sp.date;
      const st = (document.getElementById('est-' + i) || {}).value || sp.time;
      const et = (document.getElementById('eet-' + i) || {}).value || ep.time;
      dEv.startISO = date + 'T' + st + ':00' + sp.tz;
      dEv.endISO = date + 'T' + et + ':00' + ep.tz;
      if (p === 'eed') dEv._endDate = target.value; // all-day end date
    }
    else if (p === 'etz' && dEv) dEv.timeZone = target.value;
    else if (p === 'tvt' && tEv) tEv.title = target.value;
    else if (p === 'tvl' && tEv) tEv.location = target.value;
    else if (p === 'tvn' && tEv) tEv._editedNotes = target.value;
    else if ((p === 'tvsd' || p === 'tvst' || p === 'tvet' || p === 'tved') && tEv) {
      const sp = parseISOParts(tEv.startISO), ep = parseISOParts(tEv.endISO);
      const date = (document.getElementById('tvsd-' + i) || {}).value || sp.date;
      if (tEv.type === 'hotel') {
        const outDate = (document.getElementById('tved-' + i) || {}).value || ep.date;
        tEv.startISO = date + 'T' + (sp.time || '00:00') + ':00' + sp.tz;
        tEv.endISO = outDate + 'T' + (ep.time || '00:00') + ':00' + ep.tz;
      } else {
        const st = (document.getElementById('tvst-' + i) || {}).value || sp.time;
        const et = (document.getElementById('tvet-' + i) || {}).value || ep.time;
        tEv.startISO = date + 'T' + st + ':00' + sp.tz;
        tEv.endISO = date + 'T' + et + ':00' + ep.tz;
      }
    }
    persistEdits();
  };
  resultsEl.addEventListener('input', (e) => applyEdit(e.target));
  resultsEl.addEventListener('change', (e) => applyEdit(e.target));
```

NOTE: `etz` (timezone select) is included here but only exists after Task 7 — harmless until then. The `_endDate` field: on restore, `renderDetectedCards`' end-date input uses `parseISOParts(ev.endISO).date`; when `_allDay` with an edited end date, prefer `ev._endDate`. In the renderer's end-date input value, change `escAttr(ep.date)` to `escAttr(ev._endDate || ep.date)`.

- [ ] **Step 4: Syntax check + manual test**

Run: `node --check popup.js`
Manual: extract events → uncheck one card, retitle another, toggle all-day → close → reopen → all three survive.

- [ ] **Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: inline edits and selections survive popup closing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Timezone dropdown on detected-event cards

**Files:**
- Modify: `popup.js`, `popup.html` (one CSS rule)

**Interfaces:**
- Consumes: `ev.timeZone` (from DETECT_PROMPT, Task 1 groundwork), edit persistence (`etz` branch, Task 6).
- Produces: `<select id="etz-{i}">` whose value Task 8 reads; `TZ_ZONES` const.

- [ ] **Step 1: Add the zones constant**

Top of popup.js, after the globals:

```js
const TZ_ZONES = [
  { id: 'America/New_York',    label: 'Eastern'  },
  { id: 'America/Chicago',     label: 'Central'  },
  { id: 'America/Denver',      label: 'Mountain' },
  { id: 'America/Los_Angeles', label: 'Pacific'  },
  { id: 'America/Anchorage',   label: 'Alaska'   },
  { id: 'Pacific/Honolulu',    label: 'Hawaii'   },
  { id: 'Europe/London',       label: 'London'   }
];
```

- [ ] **Step 2: Render the dropdown**

In `renderDetectedCards`, inside the IIFE that builds the date/time rows (line 1087 area), append a timezone row after the end-date row. The IIFE's return becomes:

```js
      + (function() { var sp = parseISOParts(ev.startISO), ep = parseISOParts(ev.endISO);
         var tz = ev.timeZone || 'America/New_York';
         var opts = TZ_ZONES.map(function(z) { return '<option value="' + z.id + '"' + (z.id === tz ? ' selected' : '') + '>' + z.label + '</option>'; }).join('');
         if (!TZ_ZONES.some(function(z) { return z.id === tz; })) {
           opts += '<option value="' + escAttr(tz) + '" selected>' + escHtml(tz.split('/').pop().replace(/_/g, ' ')) + '</option>';
         }
         return '<div class="edit-row"><div class="edit-label">Date</div><input type="date" class="edit-input" id="esd-' + i + '" value="' + escAttr(sp.date) + '"></div>'
         + '<div class="edit-row-2 edit-times-row"><div><div class="edit-label">Start</div><input type="time" class="edit-input" id="est-' + i + '" value="' + escAttr(sp.time) + '" data-tz="' + escAttr(sp.tz) + '"></div>'
         + '<div><div class="edit-label">End</div><input type="time" class="edit-input" id="eet-' + i + '" value="' + escAttr(ep.time) + '" data-tz="' + escAttr(ep.tz) + '"></div></div>'
         + '<div class="edit-row edit-enddate-row"><div class="edit-label">End date</div><input type="date" class="edit-input" id="eed-' + i + '" value="' + escAttr(ev._endDate || ep.date) + '"></div>'
         + '<div class="edit-row tz-row"><div class="edit-label">Time zone</div><select class="edit-input" id="etz-' + i + '">' + opts + '</select></div>'; })()
```

- [ ] **Step 3: Hide when all-day**

The all-day toggle already sets `data-allday="1"` on the card. Add one CSS rule in `popup.html`'s `<style>` block, next to the existing `.edit-times-row` / all-day rules (search for `data-allday` in the file to find where kindred rules live):

```css
.detected-card[data-allday="1"] .tz-row { display: none; }
```

If `<select>` renders unstyled next to the inputs, add:

```css
select.edit-input { width: 100%; }
```

- [ ] **Step 4: Syntax + manual check**

Run: `node --check popup.js`
Manual: paste "Zoom call Thursday at 3pm" → card shows Time zone dropdown = Eastern → switch to Pacific → toggle all-day → dropdown hides → untoggle → still Pacific → close/reopen popup → still Pacific.

- [ ] **Step 5: Commit**

```bash
git add popup.js popup.html
git commit -m "feat: timezone dropdown on event cards (US zones + London, Eastern default)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Calendar writes use wall-clock time + named zone

**Files:**
- Modify: `popup.js`

**Interfaces:**
- Consumes: `wallTimeToUTC` (Task 2), `etz-{i}` selects (Task 7), `parseISOParts` (Task 6). `createCalendarEvent` in google-api.js already forwards `startTimeZone`/`endTimeZone` — no change there.
- Produces: detected-event Calendar payloads with `dateTime` lacking an offset + `timeZone` present (the new downstream contract Task 9 documents).

- [ ] **Step 1: Build wall-clock ISO strings in `addToCalendar`**

In `addToCalendar` (line 1198), replace the non-all-day `startISO`/`endISO` construction and the returned object's timezone fields:

```js
      const zone = ((document.getElementById('etz-' + i) || {}).value) || ev.timeZone || 'America/New_York';
      let startISO, endISO;
      if (allDay) {
        startISO = (sdEl && sdEl.value) || ev.startISO.slice(0, 10);
        endISO   = (edEl && edEl.value) || startISO;
      } else {
        // Wall-clock time, no offset — Google interprets it in `zone`
        const sp = parseISOParts(ev.startISO), ep = parseISOParts(ev.endISO);
        startISO = ((sdEl && sdEl.value) || sp.date) + 'T' + ((stEl && stEl.value) || sp.time) + ':00';
        endISO   = ((sdEl && sdEl.value) || ep.date) + 'T' + ((etEl && etEl.value) || ep.time) + ':00';
      }
      return {
        title:    document.getElementById('et-' + i).value.trim() || ev.title,
        startISO: startISO,
        endISO:   endISO,
        startTimeZone: allDay ? undefined : zone,
        endTimeZone:   allDay ? undefined : zone,
        timeZone: zone,
        location: document.getElementById('el-' + i).value.trim() || ev.location || '',
        notes:    document.getElementById('en-' + i).value.trim() || ev.notes || '',
        allDay:   allDay,
        sourceFileIdx: ev.sourceFileIdx
      };
```

- [ ] **Step 2: URL fallback honors the zone**

Change `gcalUrl` (line 821) signature and converter:

```js
function gcalUrl(title, startISO, endISO, location, details, allDay, tz) {
  const fmtDT = d => (tz ? wallTimeToUTC(d, tz) : new Date(d)).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
```

and the params object at the bottom:

```js
  const params = {
    action: 'TEMPLATE', text: title,
    dates: dates,
    details: details || '', location: location || ''
  };
  if (tz && !allDay) params.ctz = tz;
  return 'https://calendar.google.com/calendar/render?' + new URLSearchParams(params);
```

Update the two detected-event URL-fallback call sites in `addToCalendar` (lines 1240 and 1254) to pass the zone:

```js
        chrome.tabs.create({ url: gcalUrl(ev.title, ev.startISO, ev.endISO, ev.location, ev.notes, ev.allDay, ev.timeZone), active: false });
```

Travel call sites (`addTravelEventToCalendar`, line 985/995/1014) pass no `tz` argument — unchanged behavior (offset-bearing ISO handled by `new Date`, and `wallTimeToUTC` also falls back safely if ever called with one).

- [ ] **Step 3: Syntax check + one-off round-trip test**

Run: `node --check popup.js`

Write `<scratchpad>/test-gcal-wall.js`:

```js
'use strict';
const fs = require('fs'); const assert = require('assert');
(0, eval)(fs.readFileSync('extraction.js', 'utf8'));
// Simulate Task 8's fmtDT for a detected event: 3pm July 15 Pacific
const d = wallTimeToUTC('2026-07-15T15:00:00', 'America/Los_Angeles');
assert.strictEqual(d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z', '20260715T220000Z');
console.log('WALL-CLOCK URL CONVERSION OK');
```

Run from extension root: `node <scratchpad>/test-gcal-wall.js`
Expected: `WALL-CLOCK URL CONVERSION OK`

- [ ] **Step 4: Manual end-to-end check**

Signed in: add a "3:00 PM, Pacific" event to a test calendar → open it in Google Calendar → shows 3:00 PM Pacific (6:00 PM Eastern viewers). Signed out: same card → the prefilled Google Calendar tab shows the right times.

- [ ] **Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: detected events write wall-clock time in the chosen timezone

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Update the day-sheet contract doc

**Files:**
- Modify: `docs/CALENDAR_EVENT_FORMAT.md`

**Interfaces:**
- Consumes: the payload behavior from Task 8.
- Produces: accurate downstream contract.

- [ ] **Step 1: Update §3 (Calendar API payload)**

Replace the example payload's start/end lines and the all-day note so detected events read:

```json
  "start": { "dateTime": "2026-05-12T19:00:00", "timeZone": "America/New_York" },
  "end":   { "dateTime": "2026-05-12T21:00:00", "timeZone": "America/New_York" },
```

Add below the example: "**Detected events** send wall-clock `dateTime` with **no UTC offset** plus a named `timeZone` — Google resolves the offset, so DST is always correct. **Travel events** still send offset-bearing `dateTime` plus per-end named zones (§6). The URL fallback now appends `&ctz=<zone>` for detected events."

- [ ] **Step 2: Update §6.1/§6.2**

In §6.1, state that detected events now carry a user-visible timezone dropdown (Eastern default; Eastern/Central/Mountain/Pacific/Alaska/Hawaii/London, plus pass-through of any other zone Gemini inferred) and that the user's chosen zone is authoritative. In §6.2, soften the DST caveat: it now applies **only to travel events** (their `dateTime` still carries a prompt-inferred offset); detected events are DST-safe because Google computes the offset from the named zone.

- [ ] **Step 3: Update §11 dinner example**

Change the dinner example's start/end to the no-offset form shown in Step 1.

- [ ] **Step 4: Commit**

```bash
git add docs/CALENDAR_EVENT_FORMAT.md
git commit -m "docs: day-sheet contract — wall-clock + named zone for detected events

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Final verification sweep

**Files:** none created; verification only.

- [ ] **Step 1: Syntax-check every JS file**

Run: `node --check popup.js && node --check background.js && node --check extraction.js && node --check google-api.js && node --check content.js`
Expected: all pass.

- [ ] **Step 2: Re-run both one-off tests**

Run: `node <scratchpad>/test-extraction.js extraction.js && node <scratchpad>/test-gcal-wall.js`
Expected: `ALL EXTRACTION TESTS PASS` and `WALL-CLOCK URL CONVERSION OK`.

- [ ] **Step 3: Grep for regressions**

- `grep -n "TRAVEL_PROMPT\|DETECT_PROMPT\|callGemini\|mergeFlights\|checkMismatches" popup.js` — popup.js must only *reference* these (no definitions).
- `grep -n "importScripts" background.js` — present, first line after `'use strict';`.
- `grep -c "script src" popup.html` — 3 (extraction, google-api, popup).
- `grep -n "_parseISO" popup.js` — zero hits (all hoisted to `parseISOParts`).

- [ ] **Step 4: Manual regression checklist (needs Chrome + reload at chrome://extensions)**

1. Drag flight PDF → travel card → Add to calendar with attachment (regression for the padding fix: also do this via Gmail "Send to Pluck").
2. Extract → close popup mid-parse → badge → reopen → results present.
3. Edit title + uncheck a card + all-day toggle → close → reopen → survives.
4. Timezone dropdown defaults Eastern on a no-zone Zoom paste; switching to Pacific keeps the wall-clock time on the created event.
5. "Scan this page" on a normal website still produces cards.
6. "Change files" clears everything; reopening shows a fresh popup.

- [ ] **Step 5: Report results to Jeremy in plain English**

List what passed, anything skipped (e.g. steps needing his signed-in Chrome), and how to reload the extension.
```
