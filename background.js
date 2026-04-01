'use strict';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SIGN_IN') {
    _doSignIn().then(result => sendResponse({ ok: true, ...result }))
               .catch(e  => sendResponse({ ok: false, error: e.message }));
    return true; // keep channel open for async response
  }
});

async function _doSignIn() {
  const token = await _getToken(true);
  const userInfo = await _fetchUserInfo(token);
  const calendars = await _fetchCalendarList(token);
  await chrome.storage.local.set({ google_account: userInfo, google_calendars: calendars });
  return { userInfo, calendars };
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

async function _fetchUserInfo(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!res.ok) throw new Error('Could not fetch user info');
  const d = await res.json();
  return { email: d.email, name: d.name };
}

async function _fetchCalendarList(token) {
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
