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
  await chrome.storage.local.remove(['google_account', 'google_calendars', 'google_last_calendar', 'google_aliases', 'google_hidden_calendars']);
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
    color: cal.backgroundColor || '#4285f4',
    accessRole: cal.accessRole || 'reader'
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
    // Build match terms: user-defined aliases + calendar name + name derived from email
    const calAliases = (aliases[cal.id] || []).slice();
    // Add the calendar display name (e.g. "Danielle Jonas", "K2 Calendar")
    if (cal.name) calAliases.push(cal.name);
    // Add first name and full name derived from email local part (e.g. "jeremy" from "jeremy@...")
    if (cal.id && cal.id.includes('@')) {
      const local = cal.id.split('@')[0];
      // Split on dots/underscores/plus to get name parts (e.g. "jeremy.book" → "jeremy", "book")
      const parts = local.split(/[._+]/);
      if (parts.length >= 2) calAliases.push(parts.join(' ')); // "jeremy book"
      parts.forEach(p => { if (p.length >= 3) calAliases.push(p); }); // "jeremy", "book"
    }
    // Deduplicate and filter short strings that would false-match
    const uniqueAliases = [...new Set(calAliases.map(a => a.toLowerCase()))].filter(a => a.length >= 3);
    for (const alias of uniqueAliases) {
      const re = new RegExp('\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (re.test(corpus)) {
        matched.add(cal.id);
        break;
      }
    }
  }
  return matched.size === 1 ? [...matched][0] : null;
}
