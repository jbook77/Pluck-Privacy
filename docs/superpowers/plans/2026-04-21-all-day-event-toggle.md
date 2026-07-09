# All-Day Event Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-card "All-day event" checkbox to event-detection cards only (not travel cards). When toggled on, time fields disappear from the edit panel, an end-date field appears (multi-day support), original extracted times are injected into the Notes field, and the event is sent to Google Calendar as a proper all-day event.

**Architecture:** UI state stored on the card DOM (a `data-allday="1"` attribute on `.detected-card`). The checkbox toggles class + attribute + visibility of time/end-date rows. On save, `addToCalendar` reads the attribute to decide whether to build date-only or datetime-based event data. `gcalUrl` and `createCalendarEvent` both get an `allDay` branch.

**Tech Stack:** Vanilla JS, Chrome MV3, Google Calendar API v3, CSS custom properties.

**Scope boundary:** Touches `popup.js` (`renderDetectedCards`, `addToCalendar`, `gcalUrl`) and `google-api.js` (`createCalendarEvent`) and `popup.html` (CSS for new classes). **Does not touch** `renderTravelCards`, the Gemini prompts, travel-card flows, or any sign-in/Drive logic.

---

### Task 1: Add CSS for all-day toggle and conditional visibility

**Files:**
- Modify: `popup.html` (CSS block near existing `.edit-row-2` style, around line 273)

- [ ] **Step 1:** Add CSS rules for the new all-day checkbox row and conditional visibility of time / end-date rows

```css
.allday-row { display: flex; align-items: center; gap: 6px; padding: 0 12px 10px; font-size: 11px; color: var(--text2); }
.allday-row input[type="checkbox"] { margin: 0; cursor: pointer; }
.allday-row label { cursor: pointer; user-select: none; }
.detected-card[data-allday="1"] .edit-times-row { display: none; }
.detected-card:not([data-allday="1"]) .edit-enddate-row { display: none; }
```

- [ ] **Step 2:** Verify CSS syntax by running: `node --check popup.js` (no-op for CSS but confirms no adjacent JS breakage), and visually inspect in Chrome by loading the extension — cards with `data-allday="1"` should hide times.

- [ ] **Step 3:** Commit

```bash
git add popup.html
git commit -m "feat: add CSS for all-day event toggle row and conditional field visibility"
```

---

### Task 2: Render all-day checkbox and end-date row in `renderDetectedCards`

**Files:**
- Modify: `popup.js` — `renderDetectedCards` function (around lines 1060–1078)

- [ ] **Step 1:** Inside the `detectedEvents.forEach` loop, between the `detected-card-header` div and the `edit-panel` div, inject an all-day row:

```js
+ '<div class="allday-row"><input type="checkbox" class="allday-cb" id="eallday-' + i + '" data-i="' + i + '">'
+ '<label for="eallday-' + i + '">All-day event</label></div>'
```

- [ ] **Step 2:** Wrap the existing time fields (edit-row-2 block with `est-` and `eet-`) in a container with class `edit-times-row`:

```js
// OLD:
+ '<div class="edit-row-2"><div><div class="edit-label">Start</div><input type="time" class="edit-input" id="est-' + i + '" value="' + escAttr(sp.time) + '" data-tz="' + escAttr(sp.tz) + '"></div>'
+ '<div><div class="edit-label">End</div><input type="time" class="edit-input" id="eet-' + i + '" value="' + escAttr(ep.time) + '" data-tz="' + escAttr(ep.tz) + '"></div></div>';

// NEW:
+ '<div class="edit-row-2 edit-times-row"><div><div class="edit-label">Start</div><input type="time" class="edit-input" id="est-' + i + '" value="' + escAttr(sp.time) + '" data-tz="' + escAttr(sp.tz) + '"></div>'
+ '<div><div class="edit-label">End</div><input type="time" class="edit-input" id="eet-' + i + '" value="' + escAttr(ep.time) + '" data-tz="' + escAttr(ep.tz) + '"></div></div>'
+ '<div class="edit-row edit-enddate-row"><div class="edit-label">End date</div><input type="date" class="edit-input" id="eed-' + i + '" value="' + escAttr(ep.date) + '"></div>';
```

- [ ] **Step 3:** After `showResult(html)` and existing event listeners, wire up the all-day checkbox listener:

```js
document.querySelectorAll('.allday-cb').forEach(cb => {
  cb.addEventListener('change', (e) => {
    const i = e.target.getAttribute('data-i');
    const card = document.getElementById('dc-' + i);
    const checked = e.target.checked;
    if (checked) {
      card.setAttribute('data-allday', '1');
      // Inject original times into notes if not already injected
      if (!cb.dataset.injected) {
        const notesEl = document.getElementById('en-' + i);
        const ev = detectedEvents[i];
        try {
          const origStart = new Date(ev.startISO).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
          const origEnd = new Date(ev.endISO).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
          const line = 'Original times: ' + origStart + ' – ' + origEnd;
          if (notesEl && !notesEl.value.includes(line)) {
            notesEl.value = line + (notesEl.value ? '\n\n' + notesEl.value : '');
          }
          cb.dataset.injected = '1';
        } catch(_) {}
      }
    } else {
      card.removeAttribute('data-allday');
    }
  });
});
```

- [ ] **Step 4:** Run `node --check popup.js` — expect no errors.

- [ ] **Step 5:** Manual test: reload extension, paste an event-containing image/text, confirm checkbox appears, clicking it hides time fields + reveals end-date field + injects "Original times: ..." into Notes.

- [ ] **Step 6:** Commit

```bash
git add popup.js
git commit -m "feat: render all-day checkbox and end-date field in event cards"
```

---

### Task 3: Send all-day events correctly from `addToCalendar`

**Files:**
- Modify: `popup.js` — `addToCalendar` function (around lines 1128–1201)
- Modify: `popup.js` — `gcalUrl` function (around lines 820–827)

- [ ] **Step 1:** Update `gcalUrl` to accept an `allDay` flag and format `dates=` accordingly (YYYYMMDD/YYYYMMDD, end date +1 day for exclusive end):

```js
function gcalUrl(title, startISO, endISO, location, details, allDay) {
  const fmtDateTime = d => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const fmtDateOnly = d => d.replace(/-/g, ''); // d is 'YYYY-MM-DD'
  let dates;
  if (allDay) {
    // GCal all-day end date is exclusive — add 1 day
    const endPlus = new Date(endISO + 'T00:00:00Z');
    endPlus.setUTCDate(endPlus.getUTCDate() + 1);
    const endStr = endPlus.toISOString().slice(0, 10).replace(/-/g, '');
    dates = fmtDateOnly(startISO) + '/' + endStr;
  } else {
    dates = fmtDateTime(startISO) + '/' + fmtDateTime(endISO);
  }
  return 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
    action: 'TEMPLATE', text: title,
    dates: dates,
    details: details || '', location: location || ''
  });
}
```

- [ ] **Step 2:** In `addToCalendar`, update the `.map` that builds `selectedEvents` to detect all-day state and build the event object accordingly:

```js
.map(({ ev, i }) => {
  const card = document.getElementById('dc-' + i);
  const allDay = card && card.getAttribute('data-allday') === '1';
  const sdEl = document.getElementById('esd-' + i);
  const edEl = document.getElementById('eed-' + i);
  const stEl = document.getElementById('est-' + i);
  const etEl = document.getElementById('eet-' + i);
  let startISO, endISO;
  if (allDay) {
    startISO = (sdEl && sdEl.value) || ev.startISO.slice(0, 10);
    endISO = (edEl && edEl.value) || startISO; // date-only strings 'YYYY-MM-DD'
  } else {
    startISO = sdEl && stEl && sdEl.value && stEl.value
      ? sdEl.value + 'T' + stEl.value + ':00' + (stEl.getAttribute('data-tz') || '')
      : ev.startISO;
    endISO = sdEl && etEl && sdEl.value && etEl.value
      ? sdEl.value + 'T' + etEl.value + ':00' + (etEl.getAttribute('data-tz') || '')
      : ev.endISO;
  }
  return {
    title:    document.getElementById('et-' + i).value.trim() || ev.title,
    startISO: startISO,
    endISO:   endISO,
    location: document.getElementById('el-' + i).value.trim() || ev.location || '',
    notes:    document.getElementById('en-' + i).value.trim() || ev.notes || '',
    allDay:   allDay,
    sourceFileIdx: ev.sourceFileIdx
  };
});
```

- [ ] **Step 3:** Update every call to `gcalUrl(...)` in `addToCalendar` (URL-fallback branches) to pass `ev.allDay`:

```js
selectedEvents.forEach(ev => {
  chrome.tabs.create({ url: gcalUrl(ev.title, ev.startISO, ev.endISO, ev.location, ev.notes, ev.allDay), active: false });
});
```

Apply at both fallback spots (no-auth fallback around line 1147 and auth-failed fallback around line 1161).

- [ ] **Step 4:** Run `node --check popup.js` — expect no errors.

- [ ] **Step 5:** Commit

```bash
git add popup.js
git commit -m "feat: send all-day event payload from addToCalendar and gcalUrl"
```

---

### Task 4: Update `createCalendarEvent` for all-day API payload

**Files:**
- Modify: `google-api.js` — `createCalendarEvent` (around lines 102–132)

- [ ] **Step 1:** Branch on `eventData.allDay` — use `{ date: 'YYYY-MM-DD' }` fields instead of `{ dateTime: ... }` when all-day, with end date +1 for GCal's exclusive end semantics:

```js
async function createCalendarEvent(token, calendarId, eventData, fileIds) {
  const event = {
    summary: eventData.title,
    location: eventData.location || '',
    description: eventData.notes || eventData.baseDetails || ''
  };
  if (eventData.allDay) {
    const endPlus = new Date(eventData.endISO + 'T00:00:00Z');
    endPlus.setUTCDate(endPlus.getUTCDate() + 1);
    event.start = { date: eventData.startISO };
    event.end = { date: endPlus.toISOString().slice(0, 10) };
  } else {
    event.start = { dateTime: eventData.startISO };
    event.end = { dateTime: eventData.endISO };
  }
  if (fileIds && fileIds.length) {
    event.attachments = fileIds.map(id => ({ fileUrl: 'https://drive.google.com/open?id=' + id }));
  }
  const qs = (fileIds && fileIds.length) ? '?supportsAttachments=true' : '';
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events' + qs,
    { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(event) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) || 'Calendar API error ' + res.status);
  }
  return await res.json();
}
```

- [ ] **Step 2:** Run `node --check google-api.js` — expect no errors.

- [ ] **Step 3:** Commit

```bash
git add google-api.js
git commit -m "feat: send all-day event with date-only payload in createCalendarEvent"
```

---

### Task 5: Update collapsed card meta line when all-day is on

**Files:**
- Modify: `popup.js` — `renderDetectedCards` (where `meta` is built, around line 1062) and the all-day checkbox listener

- [ ] **Step 1:** In the all-day checkbox listener, after setting/clearing `data-allday`, update the visible `.detected-meta` text in place:

```js
const metaEl = card.querySelector('.detected-meta');
if (checked) {
  const ev = detectedEvents[i];
  try {
    const fmtD = d => new Date(d).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    const endDateStr = (document.getElementById('eed-' + i) || {}).value || ev.endISO.slice(0,10);
    const startDateStr = (document.getElementById('esd-' + i) || {}).value || ev.startISO.slice(0,10);
    const sameDay = startDateStr === endDateStr;
    metaEl.textContent = sameDay
      ? fmtD(ev.startISO) + ' · All day'
      : fmtD(startDateStr + 'T12:00:00') + ' → ' + fmtD(endDateStr + 'T12:00:00') + ' · All day';
  } catch(_) {}
} else {
  const ev = detectedEvents[i];
  try {
    const fmtD = d => new Date(d).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    const fmtT = d => new Date(d).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
    metaEl.textContent = fmtD(ev.startISO) + ' · ' + fmtT(ev.startISO) + '–' + fmtT(ev.endISO);
  } catch(_) {}
}
```

- [ ] **Step 2:** Also listen for changes on the end-date input (`#eed-i`) so the meta line stays in sync when the user edits the end date:

```js
document.querySelectorAll('input[id^="eed-"]').forEach(inp => {
  inp.addEventListener('change', () => {
    const i = inp.id.replace('eed-', '');
    const cb = document.getElementById('eallday-' + i);
    if (cb && cb.checked) cb.dispatchEvent(new Event('change'));
  });
});
```

- [ ] **Step 3:** Run `node --check popup.js` — expect no errors.

- [ ] **Step 4:** Commit

```bash
git add popup.js
git commit -m "feat: update card meta line to show 'All day' when toggle is on"
```

---

## Manual Testing (after all tasks)

1. Paste an email/image with a timed event → confirm card renders with unchecked "All-day event" checkbox + normal time fields. **Add to Calendar** works unchanged.
2. Check "All-day event" → confirm: time fields hide, end-date field appears, "Original times: X – Y" appears at top of Notes, meta line changes to "... · All day".
3. Click **Add to Calendar** (signed in) → verify event is all-day in Google Calendar (spans the date, no time block). Description includes the "Original times" line.
4. Two-day conference test: check all-day, change end date to next day → meta line shows "Mon, ... → Tue, ... · All day" → save → confirm event spans both dates (remember GCal all-day end is exclusive, so the API sees end = next-next-day).
5. URL-fallback test (sign out first): check all-day, click Add → confirm Google Calendar opens pre-filled as all-day event.
6. Toggle off/on repeatedly: "Original times" line should only be injected once.
7. Confirm travel cards (flight/hotel/charter) are unaffected — no all-day checkbox anywhere.
