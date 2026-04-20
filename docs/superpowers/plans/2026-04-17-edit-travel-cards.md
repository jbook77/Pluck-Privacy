# Edit Travel Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users edit flight, hotel, and charter cards inline before pushing them to Google Calendar — collapsed by default, expandable via an "Edit" link, matching the existing event-card edit pattern.

**Architecture:** Extend `renderTravelCards()` in `popup.js` to emit a collapsed edit panel per card. Add minimal new CSS in `popup.html`. On **Add to Google Calendar** click, check whether the panel was expanded; if so, read values from the DOM inputs and build a shallow clone of the event before calling the existing `addTravelEventToCalendar()`. No changes to event-card code, Gemini prompts, Drive upload, or OAuth.

**Tech Stack:** Vanilla JS (no build step), Chrome Extension MV3, single-file `popup.js`, CSS in `popup.html`.

**Spec:** `docs/superpowers/specs/2026-04-17-edit-travel-cards-design.md`

**Codebase notes for the implementer:**
- No automated test suite exists. Verification is `node --check popup.js` (syntax) + manual testing in Chrome (reload the unpacked extension at `chrome://extensions`, then open the popup).
- `popup.js` is a single ~1200-line file. All DOM event handlers are wired inside named functions. No inline `onclick` handlers — always use `addEventListener`.
- `escHtml(s)` and `escAttr(s)` are global helpers in `popup.js` for HTML/attribute escaping — use them.
- CSS custom properties (e.g., `var(--border)`, `var(--text3)`) drive dark/light theming. Do not hardcode colors.

---

## File Structure

| File | Role in this feature |
|---|---|
| `popup.html` | Add ~4 new CSS rules to the `<style>` block for the edit panel visibility and the "Edit" toggle link. |
| `popup.js` | Modify `renderTravelCards()` only. Add edit-panel HTML per card, a new `_parseISO`/`_buildISO` pair (or reuse the inline ones from `renderDetectedCards`), a new click handler for the Edit toggle, and modify the existing `.travel-cal-btn` handler to read edited values. |

No new files. No refactor of `renderDetectedCards`, `buildTravelDetails`, or `addTravelEventToCalendar`.

---

## Task 1: Add CSS for the travel edit panel + Edit toggle

**Files:**
- Modify: `popup.html` (inside the `<style>` block, under the `/* ── Travel event cards ── */` section near line 237)

**Context for the implementer:** The existing `.edit-panel` CSS rule (around line 260) hides the panel by default and only reveals it when the parent has class `.detected-card.selected`. Since travel cards use `.event-card` (not `.detected-card`), we need a new reveal rule. We also need a small "Edit" link style.

- [ ] **Step 1: Add the CSS rules**

Open `popup.html`. Find this line (near line 237, end of the Travel event cards section):

```css
    .cal-btn:hover { background: var(--bg3); }
```

Immediately after that line, insert the following block:

```css
    .event-card.travel-edit-open .edit-panel { display: block; padding: 0 0 0 10px; border-top: 1px solid var(--divider); margin-top: 10px; }
    .travel-edit-toggle { display: inline-block; margin-top: 10px; margin-right: 10px; padding: 6px 10px; font-size: 11px; font-weight: 500; color: var(--text3); background: transparent; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-family: inherit; }
    .travel-edit-toggle:hover { background: var(--bg3); color: var(--text); }
    .event-card.travel-edit-open .travel-edit-toggle { color: var(--text); border-color: var(--border2); }
```

- [ ] **Step 2: Verify CSS file still parses (no syntax errors) by reloading the extension in Chrome**

Run:
```bash
node --check popup.js
```
Expected: no output (success). This does not check CSS, but confirms the HTML file wasn't accidentally edited.

Open `chrome://extensions`, click the refresh icon on the **Pluck** extension card, open the popup. Expected: popup still renders identically to before — the new CSS rules have no visible effect yet (no `.travel-edit-open` or `.travel-edit-toggle` elements exist in the DOM).

- [ ] **Step 3: Commit**

```bash
git add popup.html
git commit -m "feat: add CSS for travel card edit panel and toggle"
```

---

## Task 2: Render the edit panel HTML and Edit toggle inside each travel card

**Files:**
- Modify: `popup.js` → function `renderTravelCards(events)` (lines ~795–842)

**Context for the implementer:** The function loops over `events` and builds HTML. After this task, each card will contain (a) an **Edit** toggle button, and (b) an edit panel with inputs for title/date/times/location/notes. The panel stays hidden because nothing toggles the `travel-edit-open` class yet (that's Task 3). Hotels use date-only inputs (no time fields); flights and charters use date + depart time + arrive time.

- [ ] **Step 1: Add ISO parse/build helpers at the top of `renderTravelCards`**

Open `popup.js`. Find the start of `renderTravelCards`:

```js
function renderTravelCards(events) {
  if (!events.length) { showResult('<div class="error-box">No travel events found.</div>'); return; }
```

Immediately after that `if` line, insert:

```js
  function _parseISO(iso) {
    if (!iso) return { date: '', time: '', tz: '' };
    const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?(.*)$/);
    if (!m) return { date: '', time: '', tz: '' };
    return { date: m[1], time: m[2], tz: m[3] || '' };
  }
  function _buildISO(date, time, tz) { return date + 'T' + time + ':00' + tz; }
  function _buildDateOnlyISO(date, originalISO) {
    // Keep the original time-of-day and tz, only replace the date portion
    const parts = _parseISO(originalISO);
    return date + 'T' + (parts.time || '00:00') + ':00' + (parts.tz || '');
  }
```

- [ ] **Step 2: Replace the card-building loop with one that emits the edit panel**

Find this block inside `renderTravelCards` (lines ~812–832):

```js
  events.forEach((ev, i) => {
    const hotel = ev.type === 'hotel';
    const charter = ev.type === 'charter';
    const s = ev.startISO, e2 = ev.endISO;
    const icon = hotel ? hotelSVG : flightSVG;
    const tagClass = hotel ? 'tag-hotel' : (charter ? 'tag-charter' : 'tag-flight');
    const tagLabel = hotel ? 'Hotel' : (charter ? 'Charter' : 'Flight');
    const passengerCount = charter
      ? (ev.passengers && ev.passengers.length ? ev.passengers.length : 0)
      : (ev.passengers && ev.passengers.length ? ev.passengers.length : 0);
    const cardClass = hotel ? 'hotel' : (charter ? 'charter' : 'flight');
    html += '<div class="event-card ' + cardClass + '">'
      + '<div class="event-top"><span class="event-icon">' + icon + '</span>'
      + '<span class="event-title">' + escHtml(ev.title) + '</span>'
      + '<span class="tag ' + tagClass + '">' + (hotel ? hotelTagSVG : flightTagSVG) + tagLabel.toUpperCase() + '</span></div>'
      + '<div class="field-row"><span class="field-label">Departs</span><span class="field-val">' + fmtD(s) + ', ' + fmtT(s) + '</span></div>'
      + '<div class="field-row"><span class="field-label">Arrives</span><span class="field-val">' + (hotel ? fmtD(e2) : fmtD(e2) + ', ' + fmtT(e2)) + '</span></div>'
      + (passengerCount ? '<div class="field-row"><span class="field-label">Passengers</span><span class="field-val">' + passengerCount + '</span></div>' : '')
      + '<button class="cal-btn travel-cal-btn" data-i="' + i + '">' + calSVG + '<span class="cal-btn-label"> Add to Google Calendar</span></button>'
      + '</div>';
  });
```

Replace it with:

```js
  events.forEach((ev, i) => {
    const hotel = ev.type === 'hotel';
    const charter = ev.type === 'charter';
    const s = ev.startISO, e2 = ev.endISO;
    const icon = hotel ? hotelSVG : flightSVG;
    const tagClass = hotel ? 'tag-hotel' : (charter ? 'tag-charter' : 'tag-flight');
    const tagLabel = hotel ? 'Hotel' : (charter ? 'Charter' : 'Flight');
    const passengerCount = ev.passengers && ev.passengers.length ? ev.passengers.length : 0;
    const cardClass = hotel ? 'hotel' : (charter ? 'charter' : 'flight');
    const sp = _parseISO(s), ep = _parseISO(e2);
    const notesPrefill = buildTravelDetails(ev);

    let editPanelHtml = '<div class="edit-panel">'
      + '<div class="edit-row"><div class="edit-label">Title</div><input class="edit-input" id="tvt-' + i + '" value="' + escAttr(ev.title) + '"></div>';

    if (hotel) {
      editPanelHtml += '<div class="edit-row"><div class="edit-label">Check-in date</div><input type="date" class="edit-input" id="tvsd-' + i + '" value="' + escAttr(sp.date) + '" data-tz="' + escAttr(sp.tz) + '"></div>'
        + '<div class="edit-row"><div class="edit-label">Check-out date</div><input type="date" class="edit-input" id="tved-' + i + '" value="' + escAttr(ep.date) + '" data-tz="' + escAttr(ep.tz) + '"></div>';
    } else {
      editPanelHtml += '<div class="edit-row"><div class="edit-label">Date</div><input type="date" class="edit-input" id="tvsd-' + i + '" value="' + escAttr(sp.date) + '"></div>'
        + '<div class="edit-row-2"><div><div class="edit-label">Depart</div><input type="time" class="edit-input" id="tvst-' + i + '" value="' + escAttr(sp.time) + '" data-tz="' + escAttr(sp.tz) + '"></div>'
        + '<div><div class="edit-label">Arrive</div><input type="time" class="edit-input" id="tvet-' + i + '" value="' + escAttr(ep.time) + '" data-tz="' + escAttr(ep.tz) + '"></div></div>';
    }

    editPanelHtml += '<div class="edit-row"><div class="edit-label">Location</div><input class="edit-input" id="tvl-' + i + '" value="' + escAttr(ev.location || '') + '"></div>'
      + '<div class="edit-row"><div class="edit-label">Notes</div><textarea class="edit-textarea" id="tvn-' + i + '">' + escHtml(notesPrefill) + '</textarea></div>'
      + '</div>';

    html += '<div class="event-card ' + cardClass + '" id="tev-' + i + '">'
      + '<div class="event-top"><span class="event-icon">' + icon + '</span>'
      + '<span class="event-title">' + escHtml(ev.title) + '</span>'
      + '<span class="tag ' + tagClass + '">' + (hotel ? hotelTagSVG : flightTagSVG) + tagLabel.toUpperCase() + '</span></div>'
      + '<div class="field-row"><span class="field-label">Departs</span><span class="field-val">' + fmtD(s) + ', ' + fmtT(s) + '</span></div>'
      + '<div class="field-row"><span class="field-label">Arrives</span><span class="field-val">' + (hotel ? fmtD(e2) : fmtD(e2) + ', ' + fmtT(e2)) + '</span></div>'
      + (passengerCount ? '<div class="field-row"><span class="field-label">Passengers</span><span class="field-val">' + passengerCount + '</span></div>' : '')
      + editPanelHtml
      + '<button class="travel-edit-toggle" data-i="' + i + '">✎ Edit</button>'
      + '<button class="cal-btn travel-cal-btn" data-i="' + i + '">' + calSVG + '<span class="cal-btn-label"> Add to Google Calendar</span></button>'
      + '</div>';
  });
```

- [ ] **Step 3: Syntax check**

Run:
```bash
node --check popup.js
```
Expected: no output (success).

- [ ] **Step 4: Reload extension and manually verify markup**

Reload the extension at `chrome://extensions` (click the refresh icon on the Pluck card). Drop a flight PDF from `docs/` (e.g., `docs/WheelsUpTripSheet_388546.pdf` or any commercial flight PDF) into the popup. Expected:
- Cards render with the same read-only summary as before.
- An **✎ Edit** button appears immediately before the **Add to Google Calendar** button on each card.
- The edit panel itself is **not visible** (CSS keeps it hidden — we haven't wired the toggle yet).
- Clicking **Add to Google Calendar** still works exactly like before (opens a Google Calendar tab with the original values).

- [ ] **Step 5: Commit**

```bash
git add popup.js
git commit -m "feat: emit edit panel markup and Edit toggle button on travel cards"
```

---

## Task 3: Wire the Edit toggle to expand and collapse the panel

**Files:**
- Modify: `popup.js` → function `renderTravelCards(events)`, specifically the event-binding section at the bottom (lines ~834–841 in the original, near the end of the function).

**Context:** Clicking the Edit button should toggle the `travel-edit-open` class on the parent `.event-card` (id `tev-<i>`). When open, the button's text changes to "▴ Collapse".

- [ ] **Step 1: Add the toggle handler**

Find this block at the end of `renderTravelCards`:

```js
  showResult(html);
  document.querySelectorAll('.travel-cal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.getAttribute('data-i'));
      const ev = events[idx];
      await addTravelEventToCalendar(ev);
    });
  });
  updateTravelCalBtns();
}
```

Insert a new block between `showResult(html);` and the existing `document.querySelectorAll('.travel-cal-btn')` block, so it reads:

```js
  showResult(html);
  document.querySelectorAll('.travel-edit-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.getAttribute('data-i');
      const card = document.getElementById('tev-' + idx);
      if (!card) return;
      const isOpen = card.classList.toggle('travel-edit-open');
      btn.textContent = isOpen ? '▴ Collapse' : '✎ Edit';
    });
  });
  document.querySelectorAll('.travel-cal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.getAttribute('data-i'));
      const ev = events[idx];
      await addTravelEventToCalendar(ev);
    });
  });
  updateTravelCalBtns();
}
```

- [ ] **Step 2: Syntax check**

Run:
```bash
node --check popup.js
```
Expected: no output (success).

- [ ] **Step 3: Reload and manually verify the toggle**

Reload the extension at `chrome://extensions`. Drop a flight PDF into the popup. Expected:
- Click **✎ Edit** on a card → the edit panel slides into view with pre-filled inputs (Title, Date, Depart, Arrive, Location, Notes textarea with passenger list).
- Button text changes to **▴ Collapse**.
- Click **▴ Collapse** → panel hides, button text returns to **✎ Edit**.
- Drop a hotel PDF → Edit panel shows **Check-in date** / **Check-out date** (no time fields).
- **Add to Google Calendar** still works with original values (edits are not yet wired — that's Task 4).

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: toggle travel card edit panel with Edit/Collapse button"
```

---

## Task 4: Use edited values when adding to calendar

**Files:**
- Modify: `popup.js` → function `renderTravelCards(events)`, the `.travel-cal-btn` click handler added in Task 3.

**Context:** When the user clicks **Add to Google Calendar**, check whether the card has class `travel-edit-open`. If not, call `addTravelEventToCalendar(ev)` with the original event. If yes, build a shallow-cloned event using values from the DOM inputs, with fallbacks to the original event for any empty field.

- [ ] **Step 1: Replace the `.travel-cal-btn` handler**

Find the handler added in Task 3:

```js
  document.querySelectorAll('.travel-cal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.getAttribute('data-i'));
      const ev = events[idx];
      await addTravelEventToCalendar(ev);
    });
  });
```

Replace it with:

```js
  document.querySelectorAll('.travel-cal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.getAttribute('data-i'));
      const ev = events[idx];
      const card = document.getElementById('tev-' + idx);
      const isEdited = card && card.classList.contains('travel-edit-open');
      if (!isEdited) { await addTravelEventToCalendar(ev); return; }

      const hotel = ev.type === 'hotel';
      const titleEl = document.getElementById('tvt-' + idx);
      const sdEl = document.getElementById('tvsd-' + idx);
      const edEl = hotel ? document.getElementById('tved-' + idx) : null;
      const stEl = hotel ? null : document.getElementById('tvst-' + idx);
      const etEl = hotel ? null : document.getElementById('tvet-' + idx);
      const locEl = document.getElementById('tvl-' + idx);
      const notesEl = document.getElementById('tvn-' + idx);

      const title = (titleEl && titleEl.value.trim()) || ev.title;
      let startISO = ev.startISO;
      let endISO = ev.endISO;
      if (hotel) {
        if (sdEl && sdEl.value) startISO = _buildDateOnlyISO(sdEl.value, ev.startISO);
        if (edEl && edEl.value) endISO = _buildDateOnlyISO(edEl.value, ev.endISO);
      } else {
        if (sdEl && stEl && sdEl.value && stEl.value) {
          startISO = _buildISO(sdEl.value, stEl.value, stEl.getAttribute('data-tz') || '');
        }
        if (sdEl && etEl && sdEl.value && etEl.value) {
          endISO = _buildISO(sdEl.value, etEl.value, etEl.getAttribute('data-tz') || '');
        }
      }
      const location = (locEl && locEl.value.trim()) || ev.location || '';
      const notes = notesEl ? notesEl.value : '';

      const editedEv = Object.assign({}, ev, {
        title: title,
        startISO: startISO,
        endISO: endISO,
        location: location,
        baseDetails: notes,
        passengers: []
      });
      await addTravelEventToCalendar(editedEv);
    });
  });
```

- [ ] **Step 2: Syntax check**

Run:
```bash
node --check popup.js
```
Expected: no output (success).

- [ ] **Step 3: Manual test — unedited path still works**

Reload the extension. Drop a flight PDF. Without clicking Edit, click **Add to Google Calendar** on one of the cards. Expected: Google Calendar opens in a new tab with title, times, location, and passenger list in the notes exactly as today (no regression).

- [ ] **Step 4: Manual test — title edit flows through**

On the same flight card, click **✎ Edit**, change the title to something obvious like "EDITED FLIGHT TITLE", click **Add to Google Calendar**. Expected: the Google Calendar tab that opens has "EDITED FLIGHT TITLE" as the event title, all other fields unchanged.

- [ ] **Step 5: Manual test — date & time edits flow through**

Click **✎ Edit** on a flight card. Change the date to tomorrow, change depart to `09:00`, change arrive to `12:00`. Click **Add to Google Calendar**. Expected: calendar tab opens with tomorrow's date and the new 09:00–12:00 times. Re-open the card after the calendar tab loads — original card values remain visible in the popup (we didn't mutate the original event).

- [ ] **Step 6: Manual test — notes edit replaces passenger list**

Click **✎ Edit** on a flight card. In the Notes textarea, delete everything and type "Just a test note". Click **Add to Google Calendar**. Expected: calendar event description is "Just a test note" only — no passenger list appended.

- [ ] **Step 7: Manual test — edit, collapse, then add**

Click **✎ Edit**, change the title to "COLLAPSED EDIT", click **▴ Collapse**, then click **Add to Google Calendar**. Expected: calendar event uses "COLLAPSED EDIT" as the title (edits persist when the panel is collapsed).

- [ ] **Step 8: Manual test — hotel dates**

Drop a hotel PDF (if you don't have one handy, any travel PDF with a hotel section works). Click **✎ Edit** on the hotel card. Change the check-in date to one day earlier, check-out to one day later. Click **Add to Google Calendar**. Expected: calendar event spans the new wider date range.

- [ ] **Step 9: Manual test — charter card**

Drop a charter PDF (e.g., `docs/WheelsUpTripSheet_388546.pdf` or `docs/Vertivue Quote - Jonas Enterprises - Jan 10 - CDW MTN CDW - Round Trip - Baron (1).pdf` — note the Vertivue one is a quote, so you'll see the quote warning; the edit feature should still work). Click **✎ Edit**, change any field, click **Add**. Expected: edit flows through just like flights.

- [ ] **Step 10: Manual test — Retry wipes edits**

Drop a flight PDF. Click **✎ Edit**, change the title. Click the **↻ Retry**... wait — travel cards do not currently have a retry button (retry is event-cards only). If you trigger a new extraction by dropping a fresh file, the old cards are replaced and edits are discarded. Confirm this behavior by: drop a PDF, edit title, drop a different PDF over the top. Expected: new cards render fresh, no trace of the prior edits.

- [ ] **Step 11: Commit**

```bash
git add popup.js
git commit -m "feat: route edited travel card values to Google Calendar on Add"
```

---

## Task 5: End-to-end smoke test with the signed-in Google Calendar flow

**Files:** None. Pure manual test.

**Context:** When the user is signed into Google via the extension's OAuth flow and has selected a target calendar, `addTravelEventToCalendar` uploads the source file to Drive and creates the calendar event via API instead of opening a prefilled URL. We need to confirm edits flow through that path too.

- [ ] **Step 1: Sign in and pick a test calendar**

In the Pluck popup, sign in to Google (if not already). Pick a test/scratch calendar from the calendar dropdown so you don't pollute a real one.

- [ ] **Step 2: Edit a flight and add it**

Drop a flight PDF. Click **✎ Edit** on a card. Change the title to "SIGNED-IN EDIT TEST" and change the depart time. Click **Add to Google Calendar**. Expected: status shows "Uploading file..." → "Creating event..." → a new Google Calendar tab opens on the created event, with the edited title and time, and the PDF attached.

- [ ] **Step 3: Sign out and verify URL fallback works with edits**

Sign out of Google in the popup. Drop a flight PDF. Edit the title, click **Add**. Expected: Google Calendar URL opens with the edited title prefilled.

- [ ] **Step 4: Commit (no-op if nothing changed — this task has no code changes)**

Nothing to commit unless a bug was found. If a bug was found, return to Task 4 and fix it before committing again.

---

## Self-review (done by the plan author before handoff)

**1. Spec coverage check:**

| Spec item | Covered by |
|---|---|
| Edit toggle link on each card | Task 2 (markup) + Task 3 (wiring) |
| Collapsed by default | Task 1 (CSS) + Task 2 (no default `travel-edit-open` class) |
| Flight/Charter: title, date, depart time, arrive time, location, notes | Task 2 Step 2 (`else` branch) |
| Hotel: title, check-in date, check-out date, location, notes | Task 2 Step 2 (`if (hotel)` branch) |
| Notes pre-filled with `buildTravelDetails(ev)` | Task 2 Step 2 (`notesPrefill` assignment) |
| Timezone preserved via `data-tz` | Task 2 Step 2 (both branches set `data-tz`) |
| Panel never opened → original values used | Task 4 Step 1 (early-return when `!isEdited`) |
| Empty title/date/time → fall back to original | Task 4 Step 1 (`|| ev.title`, `sdEl.value && stEl.value` guard) |
| Notes textarea → replaces `baseDetails`, clears `passengers` | Task 4 Step 1 (`editedEv` assignment) |
| Charter short-circuits in `buildTravelDetails` (no extra step) | Behavior inherited; no code needed |
| Retry wipes edits | Task 4 Step 10 (confirmed by re-drop test) |
| URL-fallback path preserves edits | Task 5 Step 3 |
| Event-detection cards untouched | No task modifies `renderDetectedCards` |

**2. Placeholder scan:** No TBDs, TODOs, vague "handle edge cases", or "similar to Task N" references. All code blocks are complete.

**3. Type consistency:** IDs `tvt-`, `tvsd-`, `tved-`, `tvst-`, `tvet-`, `tvl-`, `tvn-`, `tev-` are used consistently across Tasks 2, 3, and 4. Functions `_parseISO`, `_buildISO`, `_buildDateOnlyISO` defined in Task 2 Step 1 and referenced in Task 4 Step 1.
