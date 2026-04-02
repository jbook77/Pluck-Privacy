'use strict';

// Allow popup to access chrome.storage.session (MV3 requires explicit opt-in)
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SIGN_IN') {
    _doSignIn().then(result => sendResponse({ ok: true, ...result }))
               .catch(e  => sendResponse({ ok: false, error: e.message }));
    return true; // keep channel open for async response
  }

  if (msg.type === 'FETCH_GMAIL_ATTACHMENTS') {
    _fetchGmailAttachments(msg.messageId)
      .then(count => sendResponse({ ok: true, count }))
      .catch(e   => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

async function _doSignIn() {
  // Fully revoke old token at Google's end so Chrome re-prompts with all current scopes
  try {
    const old = await _getToken(false).catch(() => null);
    if (old) {
      await fetch('https://accounts.google.com/o/oauth2/revoke?token=' + old);
      await new Promise(r => chrome.identity.removeCachedAuthToken({ token: old }, r));
    }
  } catch(e) { /* no cached token, fine */ }
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

async function _fetchGmailAttachments(messageId) {
  if (!messageId) throw new Error('No message ID provided');
  // Gmail DOM IDs may have prefixes like "#msg-f:", "msg-f:", or "r-" — strip to get the raw ID
  messageId = messageId.replace(/^#?msg-[a-z]:/, '').replace(/^r-/, '');
  // Gmail DOM stores IDs as decimal but the API expects hex
  if (/^\d+$/.test(messageId)) {
    messageId = BigInt(messageId).toString(16);
  }
  const token = await _getToken(false);

  // Try message ID directly; if 400/404, try as thread ID and get first message
  let msgJson;
  const msgRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    { headers: { 'Authorization': 'Bearer ' + token } }
  );
  if (msgRes.ok) {
    msgJson = await msgRes.json();
  } else {
    // Might be a thread ID — try threads endpoint
    const threadRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(messageId)}?format=full`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    if (!threadRes.ok) throw new Error('Could not fetch Gmail message (status ' + msgRes.status + ', thread status ' + threadRes.status + ', id: ' + messageId + ')');
    const threadJson = await threadRes.json();
    // Use the last message in the thread (the one the user is viewing)
    const msgs = threadJson.messages || [];
    // Find the message with attachments, preferring the last one
    msgJson = msgs.reverse().find(m => {
      const parts = [];
      _collectAttachmentParts(m.payload, parts);
      return parts.length > 0;
    });
    if (!msgJson) throw new Error('No message with attachments found in this thread');
  }

  // Collect all attachment parts recursively from the resolved message
  const attachParts = [];
  _collectAttachmentParts(msgJson.payload, attachParts);
  const resolvedMessageId = msgJson.id;

  const qualifying = attachParts.filter(p => {
    const mt = (p.mimeType || '').toLowerCase();
    const fn = (p.filename || '').toLowerCase();
    // Skip inline images (email signatures, logos) — only keep real attachments
    const headers = p.headers || [];
    const disposition = headers.find(h => h.name.toLowerCase() === 'content-disposition');
    const contentId = headers.find(h => h.name.toLowerCase() === 'content-id');
    if (disposition && disposition.value.toLowerCase().startsWith('inline')) return false;
    if (contentId && mt.startsWith('image/')) return false; // inline embedded image
    return mt === 'application/pdf'
      || mt.startsWith('image/')
      || (mt === 'application/octet-stream' && fn.endsWith('.pdf'));
  });

  if (!qualifying.length) throw new Error('No PDF or image attachments found in this email');

  // Download each attachment
  const files = [];
  for (const part of qualifying) {
    const attRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(resolvedMessageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`,
      { headers: { 'Authorization': 'Bearer ' + token } }
    );
    if (!attRes.ok) throw new Error('Could not fetch attachment: ' + part.filename);
    const attData = await attRes.json();

    // Gmail uses base64url — convert to standard base64
    const base64 = attData.data.replace(/-/g, '+').replace(/_/g, '/');
    const mimeType = (part.mimeType === 'application/octet-stream' && part.filename.toLowerCase().endsWith('.pdf'))
      ? 'application/pdf'
      : part.mimeType;

    files.push({
      name: part.filename,
      base64,
      mimeType,
      kind: mimeType === 'application/pdf' ? 'travel' : 'image'
    });
  }

  // Store for popup to pick up
  await chrome.storage.session.set({ pending_gmail_files: files });

  // Badge the icon so user knows files are waiting
  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#D4A830' });

  // Notify popup if it's already open (ignore error if it's not)
  chrome.runtime.sendMessage({ type: 'GMAIL_FILES_READY' }, () => {
    void chrome.runtime.lastError; // suppress "no receiver" error
  });

  return files.length;
}

function _collectAttachmentParts(part, result) {
  if (!part) return;
  if (part.filename && part.body && part.body.attachmentId) {
    result.push(part);
  }
  if (part.parts) {
    part.parts.forEach(p => _collectAttachmentParts(p, result));
  }
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
