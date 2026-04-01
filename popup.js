'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let loadedFiles = [];     // { name, base64, mimeType, kind: 'travel'|'event'|'image', previewSrc? }
let detectedEvents = [];
let googleAccount  = null;   // { email, name } or null
let googleCalendars = [];    // [{ id, name, color }]
let selectedCalendarId = null;

const TODAY = new Date().toISOString().split('T')[0];

// ─── Prompts ──────────────────────────────────────────────────────────────────
const TRAVEL_PROMPT = 'You are a travel data extractor. Extract all flights and hotel stays from the provided confirmation. Return ONLY valid JSON, no markdown, no code fences.\n\nFormat:\n{"events":[{"type":"flight" or "hotel","title":"...","startISO":"ISO8601 with tz offset","endISO":"ISO8601 with tz offset","location":"...","flightKey":"AIRLINECODE+FLIGHTNUMBER+DATE e.g. AA1692-2026-03-27","flightNumber":"e.g. AA1692","departureDate":"YYYY-MM-DD","origin":"city","destination":"city","passengers":[{"name":"...","seat":"...","confirmationCode":"..."}],"baseDetails":"..."}]}\n\nFlight title: Fly [ORIGIN] to [DEST] ([AIRLINE] [NUMBER]) e.g. Fly Newark to Miami (AA 1692)\nFlight baseDetails (each on its own line, no passengers here):\n[Origin airport] ([IATA]) - [Dest airport] ([IATA])\n[Depart time]-[Arrive time] local\n[X]hr [Y]min flight\nCabin Class: [CLASS]\n\nHotel title: Stay at [HOTEL NAME]\nHotel baseDetails:\n[Address]\nCheck-In: [DAY], [MONTH] [DATE], [YEAR] at [TIME]\nCheck-Out: [DAY], [MONTH] [DATE], [YEAR] at [TIME]\nConfirmation: [NUMBER]\nRoom: [TYPE]\nGuests: [N] Adults\n\nPassengers: First Last order. Remove middle names UNLESS name has numeral suffix (II, III, Jr, Sr). No eticket numbers.\nTimezones (spring/summer DST): New York=-04:00, LA=-07:00, London=+01:00, Buenos Aires=-03:00.\nIf nothing found: {"events":[]}';

const DETECT_PROMPT = `You are an event extractor. Today is ${TODAY}. Extract ALL events, appointments, reservations, and meetings from the content. Return ONLY valid JSON, no markdown, no code fences.

Format:
{"events":[{
  "type": "dinner | meeting | appointment | event | other",
  "title": "concise natural title e.g. Dinner at Soho House or Zoom - Copper Cup x Body Brokers",
  "startISO": "ISO8601 with tz offset. Infer tz from location (NY spring=-04:00, LA spring=-07:00). If only day-of-week, use next upcoming date from today.",
  "endISO": "ISO8601. Infer if missing: dinner=2hr, haircut/barber=45min, meeting=1hr, appointment=1hr",
  "location": "full address, Zoom link, or venue name",
  "notes": "confirmation number, party size, zoom passcode, provider name, special notes. One per line.",
  "confidence": "high | medium | low"
}]}

Rules:
- Restaurants: party size in notes. Name +4 = that person PLUS 4 = Party of 5 total
- Zoom: full join URL as location, ID and passcode in notes  
- Schedules/itineraries: you MUST extract EVERY single time-stamped item as its own event. A 8-page press schedule should produce 20-30+ events. Do not summarize or combine. Each interview, TV appearance, taping, ceremony, brunch, grooming session, depart/arrive, afterparty = its own event with its own card.
- Hotel check-in/out = one event
- Stated time ranges like 1PM-5PM: use exactly
- If nothing found: {"events":[]}
- Do NOT invent details`;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get('gemini_api_key', (r) => {
    if (r.gemini_api_key) showMainUI();
  });

  document.getElementById('save-key-btn').addEventListener('click', saveKey);
  document.getElementById('change-key-btn').addEventListener('click', showApiRow);
  document.getElementById('extract-btn').addEventListener('click', runExtract);
  document.getElementById('scan-btn').addEventListener('click', runScan);
  document.getElementById('browse-btn').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', (e) => {
    Array.from(e.target.files || []).forEach(loadFile);
    e.target.value = '';
  });
  document.getElementById('url-btn').addEventListener('click', fetchUrl);
  document.getElementById('url-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') fetchUrl(); });

  const dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    Array.from(e.dataTransfer.files).forEach(loadFile);
  });

  document.addEventListener('paste', handlePaste);

  // Theme toggle
  const savedTheme = localStorage.getItem('tes_theme') || 'dark';
  applyTheme(savedTheme);
  document.getElementById('theme-toggle-input').addEventListener('change', (e) => {
    applyTheme(e.target.checked ? 'light' : 'dark');
  });

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
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('tes_theme', theme);
  const toggle = document.getElementById('theme-toggle-input');
  if (toggle) toggle.checked = (theme === 'light');
  const label = document.getElementById('theme-label');
  if (label) label.textContent = (theme === 'light') ? 'Dark mode' : 'Light mode';
}

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

// ─── API key ──────────────────────────────────────────────────────────────────
function showMainUI() {
  document.getElementById('api-row').style.display = 'none';
  document.getElementById('change-key-btn').style.display = 'inline';
}
function showApiRow() {
  chrome.storage.local.remove('gemini_api_key');
  document.getElementById('api-key-input').value = '';
  document.getElementById('api-row').style.display = 'flex';
  document.getElementById('change-key-btn').style.display = 'none';
}
function saveKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) return;
  chrome.storage.local.set({ gemini_api_key: key }, showMainUI);
}

// ─── File loading ─────────────────────────────────────────────────────────────
function loadFile(file) {
  const isImage = file.type.startsWith('image/');
  const isPdf   = file.type === 'application/pdf';
  const isEml   = file.name.endsWith('.eml');

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const base64  = dataUrl.split(',')[1];
    const entry = {
      name:      file.name || (isImage ? 'image' : 'file'),
      base64,
      mimeType:  isImage ? file.type : (isEml ? 'text/plain' : 'application/pdf'),
      kind:      isImage ? 'image' : (isPdf || isEml ? 'travel' : 'event'),
      previewSrc: isImage ? dataUrl : null
    };
    loadedFiles.push(entry);
    renderFileList();
    document.getElementById('extract-btn').disabled = false;
    clearResults();
  };
  reader.readAsDataURL(file);
}

async function fetchUrl() {
  const url = document.getElementById('url-input').value.trim();
  if (!url) return;
  if (url.includes('mail.google.com') || url.includes('outlook')) {
    showResult('<div class="warn-box"><strong>Email links cannot be fetched directly</strong>Download the attachment first, then drop it here.</div>');
    return;
  }
  setStatus('Fetching...', 'loading');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Status ' + res.status);
    const blob = await res.blob();
    const name = url.split('/').pop().split('?')[0] || 'file.pdf';
    loadFile(new File([blob], name, { type: blob.type }));
    document.getElementById('url-input').value = '';
    setStatus('', '');
  } catch(e) {
    setStatus('', '');
    showResult('<div class="error-box">Could not fetch: ' + escHtml(e.message) + '</div>');
  }
}

function removeFile(idx) {
  loadedFiles.splice(idx, 1);
  renderFileList();
  if (!loadedFiles.length) {
    document.getElementById('extract-btn').disabled = true;
    document.getElementById('drop-zone').classList.remove('has-files');
    document.getElementById('drop-label').textContent = 'Drop any file — PDF, email, image, or screenshot';
    clearResults();
  }
}

function renderFileList() {
  document.getElementById('drop-zone').classList.add('has-files');
  document.getElementById('drop-label').textContent = 'Drop more files to add';
  const list = document.getElementById('file-list');
  list.innerHTML = loadedFiles.map((f, i) => {
    const thumb = f.previewSrc
      ? '<img src="' + f.previewSrc + '" />'
      : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3ecf8e" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    return '<div class="file-item">' + thumb
      + '<span class="file-item-name">' + escHtml(f.name) + '</span>'
      + '<button class="file-remove" data-i="' + i + '">&#x2715;</button></div>';
  }).join('');
  list.querySelectorAll('.file-remove').forEach(btn => {
    btn.addEventListener('click', (e) => removeFile(parseInt(e.currentTarget.getAttribute('data-i'))));
  });
}

// ─── Paste ────────────────────────────────────────────────────────────────────
function handlePaste(e) {
  const items = Array.from((e.clipboardData || {}).items || []);
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      loadFile(item.getAsFile());
      flashDropZone();
      return;
    }
    if (item.kind === 'file') {
      e.preventDefault();
      loadFile(item.getAsFile());
      flashDropZone();
      return;
    }
    if (item.kind === 'string' && item.type === 'text/plain') {
      item.getAsString((text) => {
        if (!text || text.trim().length < 20) return;
        e.preventDefault();
        // Treat pasted text as an event-detection input
        loadedFiles.push({ name: 'Pasted text', base64: null, mimeType: 'text/plain', kind: 'text', text: text.trim() });
        renderFileList();
        document.getElementById('extract-btn').disabled = false;
        clearResults();
        flashDropZone();
      });
      return;
    }
  }
}

function flashDropZone() {
  const dz = document.getElementById('drop-zone');
  dz.classList.add('paste-flash');
  setTimeout(() => dz.classList.remove('paste-flash'), 600);
}

// ─── Main extraction ──────────────────────────────────────────────────────────
async function runExtract() {
  if (!loadedFiles.length) { setStatus('Please add at least one file.', 'error'); return; }
  chrome.storage.local.get('gemini_api_key', async (r) => {
    const apiKey = r.gemini_api_key;
    if (!apiKey) { setStatus('Please save your Gemini API key first.', 'error'); return; }

    document.getElementById('extract-btn').disabled = true;
    clearResults();

    // Split files: travel docs vs images/text (event detection)
    const travelFiles = loadedFiles.filter(f => f.kind === 'travel');
    const eventFiles  = loadedFiles.filter(f => f.kind === 'image' || f.kind === 'text' || f.kind === 'event');

    // If we have a mix, or only event files, run event detection
    // If only travel files, run travel extraction
    const hasTravelOnly = travelFiles.length > 0 && eventFiles.length === 0;

    try {
      if (hasTravelOnly) {
        setStatus('Extracting travel events...', 'loading');
        const allEvents = [];
        for (const f of travelFiles) {
          const fIdx = loadedFiles.indexOf(f);
          const parsed = await callGemini(apiKey, [
            { inline_data: { mime_type: f.mimeType, data: f.base64 } },
            { text: TRAVEL_PROMPT }
          ]);
          const tagged = (parsed.events || []).map(ev => ({ ...ev, sourceFileIdx: fIdx }));
          allEvents.push(...tagged);
        }
        const mismatches = checkMismatches(allEvents);
        if (mismatches) {
          let html = '<div class="warn-box"><strong>⚠ PDFs appear to be for different flights</strong>';
          mismatches.forEach(m => { html += escHtml(m.field) + ': ' + escHtml(m.a) + ' vs ' + escHtml(m.b) + '<br>'; });
          showResult(html + '</div>');
        } else {
          renderTravelCards(mergeFlights(allEvents));
          tryAutoSelectCalendar(allEvents);
        }
      } else {
        // Event detection — process each file separately, combine results
        setStatus('Detecting events...', 'loading');
        const allEvents = [];
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
        detectedEvents = allEvents;
        await tryAutoSelectCalendar(detectedEvents);
        renderDetectedCards();
      }
      setStatus('', '');
    } catch(e) {
      setStatus('', '');
      showResult('<div class="error-box">Error: ' + escHtml(e.message) + '</div>');
    }
    document.getElementById('extract-btn').disabled = false;
  });
}

async function runScan() {
  chrome.storage.local.get('gemini_api_key', async (r) => {
    const apiKey = r.gemini_api_key;
    if (!apiKey) { setStatus('Please save your Gemini API key first.', 'error'); return; }

    document.getElementById('scan-btn').disabled = true;
    setStatus('Reading page...', 'loading');
    clearResults();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab found');
      const url = tab.url || '';
      const isGmail   = url.includes('mail.google.com');
      const isOutlook = url.includes('outlook.live.com') || url.includes('outlook.office.com');

      let pageText = '';
      try {
        const resp = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_TEXT' });
        pageText = (resp && resp.text) ? resp.text.trim() : '';
      } catch(e) { pageText = ''; }

      if (!pageText) {
        if (isGmail || isOutlook) {
          setStatus('', '');
          showResult('<div class="info-box"><strong>Tip: paste the email text directly</strong>'
            + 'Gmail and Outlook block page scanning. Copy the email body and press <strong>Ctrl+V / &#8984;V</strong> anywhere in this popup — it\'ll extract events instantly.</div>');
          document.getElementById('scan-btn').disabled = false;
          return;
        }
        throw new Error('Could not read this page. Try refreshing the tab, or paste content with Ctrl+V.');
      }

      setStatus('Detecting events...', 'loading');
      const parsed = await callGemini(apiKey, [
        { text: DETECT_PROMPT + '\n\nPage: ' + url + '\nTitle: ' + tab.title + '\n\n' + pageText }
      ]);
      detectedEvents = parsed.events || [];
      await tryAutoSelectCalendar(detectedEvents);
      setStatus('', '');
      renderDetectedCards();
    } catch(e) {
      setStatus('', '');
      showResult('<div class="error-box">' + escHtml(e.message) + '</div>');
    }
    document.getElementById('scan-btn').disabled = false;
  });
}

// ─── Gemini ───────────────────────────────────────────────────────────────────
async function callGemini(apiKey, parts) {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0, maxOutputTokens: 8192 } }) }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) ? err.error.message : 'Gemini API error ' + res.status);
  }
  const data = await res.json();
  const raw = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}

// ─── Travel helpers ───────────────────────────────────────────────────────────
function checkMismatches(events) {
  const flights = events.filter(e => e.type === 'flight' && e.flightKey);
  if (flights.length < 2) return null;
  const ref = flights[0];
  const mismatches = [];
  flights.slice(1).forEach(ev => {
    if (ev.flightNumber !== ref.flightNumber) mismatches.push({ field: 'Flight', a: ref.flightNumber, b: ev.flightNumber });
    if (ev.departureDate !== ref.departureDate) mismatches.push({ field: 'Date', a: ref.departureDate, b: ev.departureDate });
    if (ev.origin && ref.origin && ev.origin.toLowerCase() !== ref.origin.toLowerCase()) mismatches.push({ field: 'Origin', a: ref.origin, b: ev.origin });
    if (ev.destination && ref.destination && ev.destination.toLowerCase() !== ref.destination.toLowerCase()) mismatches.push({ field: 'Dest', a: ref.destination, b: ev.destination });
  });
  return mismatches.length ? mismatches : null;
}

function mergeFlights(events) {
  const map = {};
  const others = [];
  events.forEach(ev => {
    if (ev.type === 'flight' && ev.flightKey) {
      if (map[ev.flightKey]) {
        (ev.passengers || []).forEach(p => {
          if (!map[ev.flightKey].passengers.some(x => x.name === p.name && x.seat === p.seat))
            map[ev.flightKey].passengers.push(p);
        });
      } else {
        map[ev.flightKey] = { ...ev, passengers: [...(ev.passengers || [])] };
      }
    } else { others.push(ev); }
  });
  return [...Object.values(map), ...others];
}

function buildTravelDetails(ev) {
  let d = ev.baseDetails || '';
  if (ev.passengers && ev.passengers.length) {
    const sorted = [...ev.passengers].sort((a, b) => {
      const v = s => { const m = s && s.match(/^(\d+)([A-Z]?)$/i); return m ? parseInt(m[1]) * 100 + (m[2] ? m[2].charCodeAt(0) : 0) : 0; };
      return v(a.seat) - v(b.seat);
    });
    d += '\n';
    sorted.forEach(p => { d += '\n' + p.name + ' - Seat ' + p.seat + (p.confirmationCode ? ' | Conf: ' + p.confirmationCode : ''); });
  }
  return d.trim();
}

function gcalUrl(title, startISO, endISO, location, details) {
  const fmt = d => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
    action: 'TEMPLATE', text: title,
    dates: fmt(startISO) + '/' + fmt(endISO),
    details: details || '', location: location || ''
  });
}

// ─── Render: travel cards ─────────────────────────────────────────────────────
function renderTravelCards(events) {
  if (!events.length) { showResult('<div class="error-box">No travel events found.</div>'); return; }
  const fmtD = d => new Date(d).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
  const fmtT = d => new Date(d).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  const calSVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  const flightSVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>';
  const hotelSVG  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>';
  let html = '<div class="results-label">' + events.length + ' event' + (events.length > 1 ? 's' : '') + ' found</div>';
  events.forEach(ev => {
    const hotel = ev.type === 'hotel';
    const s = ev.startISO, e2 = ev.endISO;
    const details = buildTravelDetails(ev);
    html += '<div class="event-card">'
      + '<div class="event-top"><span class="event-icon">' + (hotel ? hotelSVG : flightSVG) + '</span>'
      + '<span class="event-title">' + escHtml(ev.title) + '</span>'
      + '<span class="tag ' + (hotel ? 'tag-hotel' : 'tag-flight') + '">' + (hotel ? 'Hotel' : 'Flight') + '</span></div>'
      + '<div class="field-row"><span class="field-label">Starts</span><span class="field-val">' + (hotel ? fmtD(s) : fmtD(s) + ', ' + fmtT(s)) + '</span></div>'
      + '<div class="field-row"><span class="field-label">Ends</span><span class="field-val">' + (hotel ? fmtD(e2) : fmtD(e2) + ', ' + fmtT(e2)) + '</span></div>'
      + (ev.location ? '<div class="field-row"><span class="field-label">Route</span><span class="field-val">' + escHtml(ev.location) + '</span></div>' : '')
      + (ev.passengers && ev.passengers.length ? '<div class="field-row"><span class="field-label">Passengers</span><span class="field-val">' + ev.passengers.length + '</span></div>' : '')
      + '<a class="cal-btn" href="' + gcalUrl(ev.title, s, e2, ev.location, details) + '" target="_blank">' + calSVG + ' Add to Google Calendar</a>'
      + '</div>';
  });
  showResult(html);
}

// ─── Render: detected event cards ─────────────────────────────────────────────
function renderDetectedCards() {
  if (!detectedEvents.length) {
    showResult('<div class="error-box">No events detected. Try pasting the email text with Ctrl+V / ⌘V, or drop a screenshot above.</div>');
    return;
  }
  const fmtD = d => new Date(d).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
  const fmtT = d => new Date(d).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  const typeClass = { dinner:'type-dinner', meeting:'type-meeting', appointment:'type-appointment', event:'type-event' };
  const typeLabel = { dinner:'Dinner', meeting:'Meeting', appointment:'Appointment', event:'Event', other:'Other' };

  let html = '<div class="results-label">' + detectedEvents.length + ' event' + (detectedEvents.length > 1 ? 's' : '') + ' detected</div>';
  html += '<div class="detect-actions">'
    + '<button class="select-btn" id="sel-all">Select all</button>'
    + '<button class="select-btn" id="desel-all">Deselect all</button>'
    + '<button class="retry-btn" id="retry-btn"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>Retry</button>'
    + '</div>';

  detectedEvents.forEach((ev, i) => {
    let meta = '';
    try { meta = fmtD(ev.startISO) + ' · ' + fmtT(ev.startISO) + '–' + fmtT(ev.endISO); } catch(e) { meta = ev.startISO || ''; }
    html += '<div class="detected-card selected" id="dc-' + i + '">'
      + '<div class="detected-card-header" data-i="' + i + '">'
      + '<input type="checkbox" class="detect-checkbox" id="ck-' + i + '" checked data-i="' + i + '">'
      + '<div style="flex:1;min-width:0;"><div class="detected-title">' + escHtml(ev.title) + '</div>'
      + '<div class="detected-meta">' + escHtml(meta) + '</div></div>'
      + '<span class="event-type-tag ' + (typeClass[ev.type] || 'type-other') + '">' + (typeLabel[ev.type] || 'Event') + '</span>'
      + '</div>'
      + '<div class="edit-panel">'
      + '<div class="edit-row"><div class="edit-label">Title</div><input class="edit-input" id="et-' + i + '" value="' + escAttr(ev.title) + '"></div>'
      + '<div class="edit-row-2"><div><div class="edit-label">Start</div><input class="edit-input" id="es-' + i + '" value="' + escAttr(ev.startISO || '') + '"></div>'
      + '<div><div class="edit-label">End</div><input class="edit-input" id="ee-' + i + '" value="' + escAttr(ev.endISO || '') + '"></div></div>'
      + '<div class="edit-row"><div class="edit-label">Location</div><input class="edit-input" id="el-' + i + '" value="' + escAttr(ev.location || '') + '"></div>'
      + '<div class="edit-row"><div class="edit-label">Notes</div><textarea class="edit-textarea" id="en-' + i + '">' + escHtml(ev.notes || '') + '</textarea></div>'
      + '</div></div>';
  });

  html += '<button class="add-cal-btn" id="add-cal-btn">Add selected to Google Calendar</button>';
  showResult(html);

  document.querySelectorAll('.detect-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      document.getElementById('dc-' + e.target.getAttribute('data-i')).classList.toggle('selected', e.target.checked);
      updateAddBtn();
    });
  });
  document.querySelectorAll('.detected-card-header').forEach(hdr => {
    hdr.addEventListener('click', (e) => {
      if (e.target.classList.contains('detect-checkbox')) return;
      const i = hdr.getAttribute('data-i');
      const cb = document.getElementById('ck-' + i);
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    });
  });
  document.getElementById('sel-all').addEventListener('click', () => {
    detectedEvents.forEach((_, i) => { document.getElementById('ck-' + i).checked = true; document.getElementById('dc-' + i).classList.add('selected'); });
    updateAddBtn();
  });
  document.getElementById('desel-all').addEventListener('click', () => {
    detectedEvents.forEach((_, i) => { document.getElementById('ck-' + i).checked = false; document.getElementById('dc-' + i).classList.remove('selected'); });
    updateAddBtn();
  });
  document.getElementById('retry-btn').addEventListener('click', () => { loadedFiles.length ? runExtract() : runScan(); });
  document.getElementById('add-cal-btn').addEventListener('click', addToCalendar);
  updateAddBtn();
}

function updateAddBtn() {
  const btn = document.getElementById('add-cal-btn');
  if (!btn) return;
  const n = detectedEvents.filter((_, i) => document.getElementById('ck-' + i) && document.getElementById('ck-' + i).checked).length;
  btn.disabled = n === 0;
  btn.textContent = n === 0 ? 'No events selected' : n === 1 ? 'Add 1 event to Google Calendar' : 'Add ' + n + ' events to Google Calendar';
}

function addToCalendar() {
  detectedEvents.forEach((ev, i) => {
    if (!document.getElementById('ck-' + i) || !document.getElementById('ck-' + i).checked) return;
    const t = document.getElementById('et-' + i).value.trim() || ev.title;
    const s = document.getElementById('es-' + i).value.trim() || ev.startISO;
    const e2 = document.getElementById('ee-' + i).value.trim() || ev.endISO;
    const l = document.getElementById('el-' + i).value.trim() || ev.location || '';
    const n = document.getElementById('en-' + i).value.trim() || ev.notes || '';
    chrome.tabs.create({ url: gcalUrl(t, s, e2, l, n), active: false });
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showResult(html) { document.getElementById('results').innerHTML = html; }
function clearResults() { document.getElementById('results').innerHTML = ''; setStatus('', ''); }
function setStatus(msg, type) {
  const el = document.getElementById('status');
  if (!msg) { el.innerHTML = ''; return; }
  const color = type === 'error' ? '#f87171' : type === 'success' ? '#3ecf8e' : '#555';
  el.innerHTML = (type === 'loading' ? '<div class="spinner"></div>' : '') + '<span style="color:' + color + '">' + escHtml(msg) + '</span>';
}
function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
