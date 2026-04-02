'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
let loadedFiles = [];     // { name, base64, mimeType, kind: 'travel'|'event'|'image', previewSrc? }
let detectedEvents = [];
let googleAccount  = null;   // { email, name } or null
let googleCalendars = [];    // [{ id, name, color }]
let selectedCalendarId = null;
let autoExtractDebounce = null;

const TODAY = new Date().toISOString().split('T')[0];

// ─── Prompts ──────────────────────────────────────────────────────────────────
const TRAVEL_PROMPT = 'You are a travel data extractor. Extract all flights, hotel stays, and private/charter flights from the provided document. Return ONLY valid JSON, no markdown, no code fences.\n\nFormat:\n{"events":[{"type":"flight" or "hotel" or "charter","title":"...","startISO":"ISO8601 with tz offset","endISO":"ISO8601 with tz offset","location":"...","flightKey":"...","flightNumber":"...","departureDate":"YYYY-MM-DD","origin":"city","destination":"city","passengers":[...],"baseDetails":"...","isQuote":false}]}\n\n--- COMMERCIAL FLIGHTS (type: "flight") ---\nflightKey: AIRLINECODE+FLIGHTNUMBER+DATE e.g. AA1692-2026-03-27\nflightNumber: e.g. AA1692\nTitle: Fly [ORIGIN] to [DEST] ([2-LETTER AIRLINE CODE] [NUMBER]) — use IATA airline code only, never full airline name. e.g. Fly Newark to Miami (AA 1692)\nbaseDetails (each on its own line, no passengers here):\n[City, State-abbrev-or-2-letter-country-code] ([IATA]) - [City, State-abbrev-or-2-letter-country-code] ([IATA])\ne.g. New York City, NY (JFK) - Buenos Aires, AR (EZE)\n[Depart time]-[Arrive time] local\n[X]hr [Y]min flight\nCabin Class: [CLASS]\npassengers: [{"name":"...","seat":"...","confirmationCode":"..."}]\n\n--- HOTELS (type: "hotel") ---\nTitle: Stay at [HOTEL NAME]\nbaseDetails:\n[Address]\nCheck-In: [DAY], [MONTH] [DATE], [YEAR] at [TIME]\nCheck-Out: [DAY], [MONTH] [DATE], [YEAR] at [TIME]\nConfirmation: [NUMBER]\nRoom: [TYPE]\nGuests: [N] Adults\n\n--- PRIVATE / CHARTER JETS (type: "charter") ---\nIdentified by: tail numbers (N-numbers), FBO names, "leg" numbering, charter company names, no scheduled airline code.\nflightKey: "charter-[tailNumber or referenceId]-[originICAO]-[YYYY-MM-DD]" e.g. "charter-N609RC-KMJX-2025-08-18"\nTitle: Private: [Departure City, State] to [Arrival City, State] ([ORIGIN ICAO] → [DEST ICAO])\ne.g. Private: Toms River, NJ to Monticello, NY (KMJX → KMSV)\nlocation: departure FBO full address\nisQuote: true if document is a quote/estimate/unconfirmed, false if confirmed booking\npassengers: ["First Last", ...] (names only — no seats for charter)\nbaseDetails:\n[Aircraft Type] | [Tail Number or "N/A"]\nProvider: [Charter company name] (Ref: [reference/trip number])\n\nDEPARTURE FBO\n[FBO name]\n[FBO address]\n[FBO phone]\n\nARRIVAL FBO\n[FBO name]\n[FBO address]\n[FBO phone]\n\nPassengers ([N]):\n[numbered list, one per line]\n\nExtract EACH leg as a separate charter event. If no tail number, omit that field.\n\n--- PASSENGER NAME RULES (commercial flights only) ---\nAirline tickets use LASTNAME/GIVEN1 GIVEN2 format. (1) If surname has numeral suffix (II, III, Jr, Sr): use LAST given name, keep suffix: JONAS II/PAUL KEVIN → Kevin Jonas II. (2) Otherwise: use FIRST given name, drop middle names: WEIR/GEORGE CYRIL → George Weir.\n\nTimezones (spring/summer DST): New York=-04:00, LA=-07:00, London=+01:00, Buenos Aires=-03:00, Dubai=+04:00.\nIf nothing found: {"events":[]}';

const DETECT_PROMPT = `You are an event extractor. Today is ${TODAY}. Extract ALL events, appointments, reservations, and meetings from the content. Return ONLY valid JSON, no markdown, no code fences.

Format:
{"events":[{
  "type": "dinner | party | pickup | meeting | grooming | styling | performance | photo | interview | appointment | event | other",
  "title": "concise natural title e.g. Dinner at Soho House or Zoom - Copper Cup x Body Brokers",
  "startISO": "ISO8601 with tz offset. Infer tz from location (NY spring=-04:00, LA spring=-07:00). If only day-of-week, use next upcoming date from today.",
  "endISO": "ISO8601. Infer if missing: dinner=2hr, party=3hr, pickup=1hr, meeting=1hr, grooming=45min, styling=1.5hr, performance=2hr, photo=3hr, interview=1hr, appointment=1hr",
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
- Do NOT invent details
- GROOMING: haircuts, barber, nails, facials, skincare, spa treatments
- STYLING: wardrobe fittings, getting dressed, outfit prep, fashion styling sessions
- PERFORMANCE: concerts, live shows, music performances, sets, soundchecks
- PHOTO: photo shoots, press photos, campaign shoots, headshots
- INTERVIEW: magazine interviews, press interviews, podcast guest appearances, Q&As
- PARTY: after-parties, galas, celebrations, receptions, launch events
- PICKUP: car service, driver, airport transfer, ride to/from venue`;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get('gemini_api_key', (r) => {
    if (r.gemini_api_key) showMainUI();
  });

  document.getElementById('save-key-btn').addEventListener('click', saveKey);
  document.getElementById('extract-btn').addEventListener('click', runExtract);
  document.getElementById('scan-btn').addEventListener('click', runScan);
  document.getElementById('browse-btn').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', (e) => {
    Array.from(e.target.files || []).forEach(f => loadFile(f, true));
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
    Array.from(e.dataTransfer.files).forEach(f => loadFile(f, true));
  });

  document.addEventListener('paste', handlePaste);

  // Theme toggle
  const savedTheme = localStorage.getItem('tes_theme') || 'dark';
  applyTheme(savedTheme);
  document.getElementById('theme-toggle-input').addEventListener('change', (e) => {
    applyTheme(e.target.checked ? 'light' : 'dark');
  });

  // Google auth — delegated to background service worker so the flow survives popup closing
  document.getElementById('connect-google-btn').addEventListener('click', () => {
    setStatus('Connecting...', 'loading');
    chrome.runtime.sendMessage({ type: 'SIGN_IN' }, async (result) => {
      setStatus('', '');
      if (chrome.runtime.lastError || !result || !result.ok) {
        const msg = (result && result.error) || (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'Unknown error';
        showResult('<div class="error-box">Could not connect Google: ' + escHtml(msg) + '</div>');
        return;
      }
      googleAccount = result.userInfo;
      googleCalendars = result.calendars;
      renderFooterSignedIn(googleAccount);
      const stored = await new Promise(r => chrome.storage.local.get('google_last_calendar', r));
      await renderCalendarPicker(googleCalendars, stored.google_last_calendar || null);
    });
  });

  document.getElementById('sign-out-btn').addEventListener('click', async () => {
    await signOutGoogle();
    googleAccount = null;
    googleCalendars = [];
    selectedCalendarId = null;
    renderFooterSignedOut();
    hideCalendarPicker();
  });

  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-back-btn').addEventListener('click', closeSettings);

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
  chrome.storage.local.get(['google_account', 'google_calendars', 'google_last_calendar'], async (r) => {
    if (r.google_account) {
      googleAccount = r.google_account;
      googleCalendars = r.google_calendars || [];
      renderFooterSignedIn(googleAccount);
      await renderCalendarPicker(googleCalendars, r.google_last_calendar || null);
    } else {
      renderFooterSignedOut();
    }
    // Pick up any files sent from Gmail while popup was closed
    _pickUpPendingGmailFiles();
  });

  // Also pick up files if popup is already open when Gmail sends them
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'GMAIL_FILES_READY') {
      _pickUpPendingGmailFiles();
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

async function renderCalendarPicker(calendars, selectedId) {
  const row = document.getElementById('cal-picker-row');
  if (!calendars || !calendars.length) { row.style.display = 'none'; return; }

  const hiddenIds = await getHiddenCalendars();
  const visible = calendars.filter(c => !hiddenIds.includes(c.id));
  if (!visible.length) { row.style.display = 'none'; return; }
  row.style.display = '';

  const sel = visible.find(c => c.id === selectedId) || visible[0];
  selectedCalendarId = sel.id;
  document.getElementById('cal-picker-dot').style.background = sel.color;
  document.getElementById('cal-picker-name').textContent = sel.name;

  const dd = document.getElementById('cal-picker-dropdown');
  dd.innerHTML = visible.map(c =>
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
      updateTravelCalBtns();
    });
  });
}

function hideCalendarPicker() {
  document.getElementById('cal-picker-row').style.display = 'none';
}

async function tryAutoSelectCalendar(events) {
  if (!googleAccount || !googleCalendars.length) return;
  const aliases = await getAliases();
  const hiddenIds = await getHiddenCalendars();
  const visibleCalendars = googleCalendars.filter(c => !hiddenIds.includes(c.id));
  const matchedId = autoSelectCalendar(events, visibleCalendars, aliases);
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

function getHiddenCalendars() {
  return new Promise(resolve => {
    chrome.storage.local.get('google_hidden_calendars', r => resolve(r.google_hidden_calendars || []));
  });
}

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
  // Gmail button toggle
  const gmailEnabled = await new Promise(r => chrome.storage.local.get('gmail_button_enabled', d => r(d.gmail_button_enabled !== false)));
  const gmailToggleStyle = gmailEnabled ? 'background:var(--accent,#3ecf8e)' : 'background:#444';
  html += '<div class="settings-section-label" style="margin-top:14px">Gmail Integration</div>'
    + '<div class="gmail-toggle-row">'
    + '<span class="gmail-toggle-label">Show "Send to Pluck" button in Gmail</span>'
    + '<button class="cal-vis-toggle ' + (gmailEnabled ? 'on' : 'off') + '" id="gmail-btn-toggle" style="' + gmailToggleStyle + '" title="' + (gmailEnabled ? 'Disable' : 'Enable') + ' Gmail button"></button>'
    + '</div>';

  html += '<div class="settings-section-label" style="margin-top:14px">Gemini API</div>'
    + '<button class="text-btn" id="change-key-btn" style="font-size:12px">Change API key</button>';
  body.innerHTML = html;
  wireAliasEvents(aliases, hiddenIds);
  document.getElementById('gmail-btn-toggle').addEventListener('click', async () => {
    const cur = await new Promise(r => chrome.storage.local.get('gmail_button_enabled', d => r(d.gmail_button_enabled !== false)));
    await chrome.storage.local.set({ gmail_button_enabled: !cur });
    renderSettingsBody();
  });
  document.getElementById('change-key-btn').addEventListener('click', showApiRow);
}

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
    + '<button class="alias-add-pill" data-cal="' + escAttr(cal.id) + '">+ add alias</button>'
    + '</div>'
    + '<div class="alias-input-row" id="alias-input-row-' + escAttr(cal.id) + '" style="display:none">'
    + '<input class="alias-input" id="alias-input-' + escAttr(cal.id) + '" placeholder="Nickname">'
    + '<button class="alias-confirm-btn" data-cal="' + escAttr(cal.id) + '">✓</button>'
    + '</div>'
    + '</div>';
}

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
    btn.addEventListener('click', async () => {
      const calId = btn.getAttribute('data-cal');
      const idx = parseInt(btn.getAttribute('data-i'));
      const current = { ...aliases };
      current[calId] = (current[calId] || []).filter((_, i) => i !== idx);
      await saveAliases(current);
      Object.assign(aliases, current);
      const cal = googleCalendars.find(c => c.id === calId);
      const hids = await getHiddenCalendars();
      document.getElementById('alias-card-' + calId).outerHTML = renderAliasCard(cal, current[calId], hids);
      wireAliasEvents(current, hids);
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
  const hids = await getHiddenCalendars();
  document.getElementById('alias-card-' + calId).outerHTML = renderAliasCard(cal, current[calId], hids);
  wireAliasEvents(current, hids);
}

// ─── API key ──────────────────────────────────────────────────────────────────
function showMainUI() {
  document.getElementById('api-row').style.display = 'none';
}
function showApiRow() {
  chrome.storage.local.remove('gemini_api_key');
  document.getElementById('api-key-input').value = '';
  document.getElementById('api-row').style.display = 'flex';
  closeSettings();
}
function saveKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) return;
  chrome.storage.local.set({ gemini_api_key: key }, showMainUI);
}

// ─── File loading ─────────────────────────────────────────────────────────────
function loadFile(file, autoExtract = false) {
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
    if (autoExtract) {
      clearTimeout(autoExtractDebounce);
      autoExtractDebounce = setTimeout(runExtract, 150);
    }
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

// ─── Gmail file intake ────────────────────────────────────────────────────────
function loadGmailFiles(files) {
  files.forEach(f => {
    loadedFiles.push({
      name:      f.name,
      base64:    f.base64,
      mimeType:  f.mimeType,
      kind:      f.kind,
      previewSrc: null
    });
  });
  renderFileList();
  document.getElementById('extract-btn').disabled = false;
  clearResults();
  flashDropZone();
  clearTimeout(autoExtractDebounce);
  autoExtractDebounce = setTimeout(runExtract, 150);
}

async function _pickUpPendingGmailFiles() {
  const r = await new Promise(resolve => chrome.storage.session.get('pending_gmail_files', resolve));
  if (!r.pending_gmail_files || !r.pending_gmail_files.length) return;
  const files = r.pending_gmail_files;
  await new Promise(resolve => chrome.storage.session.remove('pending_gmail_files', resolve));
  chrome.action.setBadgeText({ text: '' });
  loadGmailFiles(files);
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
  // Group flights by flightKey — only compare flights that claim to be the same leg
  const groups = {};
  events.filter(e => e.type === 'flight' && e.flightKey).forEach(ev => {
    (groups[ev.flightKey] = groups[ev.flightKey] || []).push(ev);
  });
  const mismatches = [];
  Object.values(groups).forEach(group => {
    if (group.length < 2) return;
    const ref = group[0];
    group.slice(1).forEach(ev => {
      if (ev.departureDate !== ref.departureDate) mismatches.push({ field: 'Date conflict for ' + ref.flightNumber, a: ref.departureDate, b: ev.departureDate });
    });
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
        if (ev.sourceFileIdx !== undefined && !map[ev.flightKey].sourceFileIdxs.includes(ev.sourceFileIdx))
          map[ev.flightKey].sourceFileIdxs.push(ev.sourceFileIdx);
      } else {
        const idxs = ev.sourceFileIdx !== undefined ? [ev.sourceFileIdx] : [];
        map[ev.flightKey] = { ...ev, passengers: [...(ev.passengers || [])], sourceFileIdxs: idxs };
      }
    } else { others.push(ev); }
  });
  return [...Object.values(map), ...others];
}

function buildTravelDetails(ev) {
  let d = ev.baseDetails || '';
  // Charter events have passengers already formatted inside baseDetails
  if (ev.type === 'charter') return d.trim();
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

  const hasQuote = events.some(ev => ev.isQuote);
  let html = '';
  if (hasQuote) {
    html += '<div class="warn-box" style="margin-bottom:10px"><strong>⚠ This appears to be a quote, not a confirmed booking.</strong> Proceed only if you have the confirmed flight sheet.</div>';
  }
  html += '<div class="results-label">' + events.length + ' event' + (events.length > 1 ? 's' : '') + ' found</div>';
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
    html += '<div class="event-card">'
      + '<div class="event-top"><span class="event-icon">' + icon + '</span>'
      + '<span class="event-title">' + escHtml(ev.title) + '</span>'
      + '<span class="tag ' + tagClass + '">' + tagLabel + '</span></div>'
      + '<div class="field-row"><span class="field-label">Departs</span><span class="field-val">' + fmtD(s) + ', ' + fmtT(s) + '</span></div>'
      + '<div class="field-row"><span class="field-label">Arrives</span><span class="field-val">' + (hotel ? fmtD(e2) : fmtD(e2) + ', ' + fmtT(e2)) + '</span></div>'
      + (passengerCount ? '<div class="field-row"><span class="field-label">Passengers</span><span class="field-val">' + passengerCount + '</span></div>' : '')
      + '<button class="cal-btn travel-cal-btn" data-i="' + i + '">' + calSVG + '<span class="cal-btn-label"> Add to Google Calendar</span></button>'
      + '</div>';
  });
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

function updateTravelCalBtns() {
  const cal = googleAccount && selectedCalendarId
    ? googleCalendars.find(c => c.id === selectedCalendarId)
    : null;
  const label = cal ? ' Add to ' + cal.name : ' Add to Google Calendar';
  document.querySelectorAll('.travel-cal-btn .cal-btn-label').forEach(span => {
    span.textContent = label;
  });
}

async function addTravelEventToCalendar(ev) {
  const s = ev.startISO, e2 = ev.endISO;
  const details = buildTravelDetails(ev);
  const fileIdxs = ev.sourceFileIdxs && ev.sourceFileIdxs.length ? ev.sourceFileIdxs
    : (ev.sourceFileIdx !== undefined ? [ev.sourceFileIdx] : []);

  // If not signed in or no source files — URL fallback
  if (!googleAccount || !fileIdxs.length) {
    chrome.tabs.create({ url: gcalUrl(ev.title, s, e2, ev.location, details), active: false });
    return;
  }

  setStatus('Uploading file' + (fileIdxs.length > 1 ? 's' : '') + '...', 'loading');
  let token;
  try {
    token = await getAuthToken();
  } catch(e) {
    setStatus('', '');
    chrome.tabs.create({ url: gcalUrl(ev.title, s, e2, ev.location, details), active: false });
    return;
  }

  const fileIds = [];
  try {
    for (const idx of fileIdxs) {
      fileIds.push(await uploadToDrive(token, loadedFiles[idx]));
    }
  } catch(e) {
    setStatus('', '');
    const btn = document.querySelector('.travel-cal-btn[data-i]');
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
    }, fileIds);
    setStatus('', '');
    chrome.tabs.create({ url: created.htmlLink, active: false });
  } catch(e) {
    setStatus('', '');
    showResult('<div class="error-box">Calendar error: ' + escHtml(e.message) + '</div>');
  }
}

// ─── Render: detected event cards ─────────────────────────────────────────────
function renderDetectedCards() {
  if (!detectedEvents.length) {
    showResult('<div class="error-box">No events detected. Try pasting the email text with Ctrl+V / ⌘V, or drop a screenshot above.</div>');
    return;
  }
  const fmtD = d => new Date(d).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
  const fmtT = d => new Date(d).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
  const typeClass = { dinner:'type-dinner', party:'type-party', pickup:'type-pickup', meeting:'type-meeting', grooming:'type-grooming', styling:'type-styling', performance:'type-performance', photo:'type-photo', interview:'type-interview', appointment:'type-appointment', event:'type-event' };
  const typeLabel = { dinner:'Dinner', party:'Party', pickup:'Pickup', meeting:'Meeting', grooming:'Grooming', styling:'Styling', performance:'Performance', photo:'Photo', interview:'Interview', appointment:'Appointment', event:'Event', other:'Other' };
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
      + '<span class="event-type-tag ' + (typeClass[ev.type] || 'type-other') + '">' + (typeIcon[ev.type] || '') + (typeLabel[ev.type] || 'Event') + '</span>'
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
